import { ChevronDown, ChevronUp } from "lucide-react";
import type { KeyboardEvent } from "react";

const MAX = 999;
const LABELS = ["رئيسي", "فرعي", "إصلاح"];

/** Three big numbers (1 . 4 . 2), each with an arrow above (raise) and below (lower). */
export function VersionPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const set = (i: number, n: number) => onChange(value.map((x, j) => (j === i ? Math.max(0, Math.min(MAX, n)) : x)));
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === "ArrowUp") { e.preventDefault(); set(i, (value[i] ?? 0) + 1); }
    if (e.key === "ArrowDown") { e.preventDefault(); set(i, (value[i] ?? 0) - 1); }
  };
  return (
    <div dir="ltr" className="flex items-center justify-center gap-1 sm:gap-2">
      {value.map((n, i) => (
        <div key={i} className="flex items-center gap-1 sm:gap-2">
          {i > 0 && <span className="version-dot" aria-hidden>.</span>}
          <div
            role="spinbutton"
            tabIndex={0}
            aria-label={LABELS[i]}
            aria-valuenow={n}
            aria-valuemin={0}
            aria-valuemax={MAX}
            onKeyDown={onKey(i)}
            className="version-wheel"
          >
            <button type="button" className="version-arrow" aria-label={`زيادة ${LABELS[i]}`} onClick={() => set(i, n + 1)} disabled={n >= MAX}>
              <ChevronUp size={26} strokeWidth={2.5} />
            </button>
            <span key={n} className="version-digit">{n}</span>
            <button type="button" className="version-arrow" aria-label={`إنقاص ${LABELS[i]}`} onClick={() => set(i, n - 1)} disabled={n <= 0}>
              <ChevronDown size={26} strokeWidth={2.5} />
            </button>
            <span className="text-[10px] font-medium text-muted-foreground">{LABELS[i]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
