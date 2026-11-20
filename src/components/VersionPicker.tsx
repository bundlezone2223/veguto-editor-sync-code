import { ChevronDown, ChevronUp } from "lucide-react";
import type { KeyboardEvent } from "react";
import { compareVersions } from "@/lib/app-update";

const MAX = 999;
const LABELS = ["رئيسي", "فرعي", "إصلاح"];

/** True when lowering number `i` by one keeps the version at or above `min`. */
export function canLower(value: number[], i: number, min?: string): boolean {
  if ((value[i] ?? 0) <= 0) return false;
  if (!min) return true;
  const lowered = value.map((x, j) => (j === i ? x - 1 : x)).join(".");
  return compareVersions(lowered, min) >= 0;
}

/** Three big numbers (1 . 4 . 2), each with an arrow above (raise) and below (lower); never below `min`. */
export function VersionPicker({ value, onChange, min }: { value: number[]; onChange: (v: number[]) => void; min?: string }) {
  const set = (i: number, n: number) => onChange(value.map((x, j) => (j === i ? Math.max(0, Math.min(MAX, n)) : x)));
  const lower = (i: number) => { if (canLower(value, i, min)) set(i, (value[i] ?? 0) - 1); };
  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === "ArrowUp") { e.preventDefault(); set(i, (value[i] ?? 0) + 1); }
    if (e.key === "ArrowDown") { e.preventDefault(); lower(i); }
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
            <button type="button" className="version-arrow" aria-label={`إنقاص ${LABELS[i]}`} onClick={() => lower(i)} disabled={!canLower(value, i, min)}>
              <ChevronDown size={26} strokeWidth={2.5} />
            </button>
            <span className="text-[10px] font-medium text-muted-foreground">{LABELS[i]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
