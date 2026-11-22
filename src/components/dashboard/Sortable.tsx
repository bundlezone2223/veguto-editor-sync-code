import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, pointerWithin,
  useSensor, useSensors, type DragEndEvent, type Modifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, type SortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type HandleProps = { label: string; className?: string };
const HandleContext = createContext<((p: HandleProps) => ReactNode) | null>(null);

/** The ⠿ grip. Only this grip starts a drag, so inputs inside the card keep working. */
export function DragHandle({ label, className = "" }: HandleProps) {
  const render = useContext(HandleContext);
  return render ? <>{render({ label, className })}</> : null;
}

function Item({ id, children, className, style: extra }: { id: string; children: ReactNode; className?: string | undefined; style?: CSSProperties | undefined }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    ...extra,
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 30 : undefined,
  };
  const handle = ({ label, className: cls = "" }: HandleProps) => (
    <button
      type="button"
      ref={setActivatorNodeRef}
      aria-label={label}
      title="اسحب لتغيير الترتيب"
      {...attributes}
      {...listeners}
      onClick={(e) => e.stopPropagation()}
      className={`drag-handle ${cls}`}
    >
      ⠿
    </button>
  );
  return (
    <div ref={setNodeRef} style={style} data-dragging={isDragging || undefined} className={`${className ?? ""} ${isDragging ? "is-dragging" : ""}`}>
      <HandleContext.Provider value={handle}>{children}</HandleContext.Provider>
    </div>
  );
}

/**
 * A vertical list you reorder by dragging each item's ⠿ grip (mouse, touch or keyboard).
 * `zoom` is the CSS zoom of the list's container, so the dragged item follows the pointer
 * inside a scaled preview too.
 */
export function SortableList<T>({ items, getId, onReorder, children, zoom = 1, className, itemClassName, itemStyle }: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (from: number, to: number) => void;
  children: (item: T, index: number) => ReactNode;
  zoom?: number;
  className?: string;
  itemClassName?: string | ((item: T) => string);
  itemStyle?: (item: T) => CSSProperties | undefined;
}) {
  const ids = items.map(getId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const modifiers = useMemo<Modifier[]>(() => [({ transform }) => ({ ...transform, x: 0, y: transform.y / zoom })], [zoom]);
  const strategy = useMemo<SortingStrategy>(() => (args) => {
    const t = verticalListSortingStrategy(args);
    return t && zoom !== 1 ? { ...t, x: t.x / zoom, y: t.y / zoom } : t;
  }, [zoom]);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id)), to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onReorder(from, to);
  };
  return (
    <DndContext sensors={sensors} collisionDetection={zoom === 1 ? closestCenter : pointerWithin} modifiers={modifiers} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={strategy}>
        <div className={className}>
          {items.map((item, i) => (
            <Item key={ids[i]} id={ids[i]!} className={typeof itemClassName === "function" ? itemClassName(item) : itemClassName} style={itemStyle?.(item)}>
              {children(item, i)}
            </Item>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
