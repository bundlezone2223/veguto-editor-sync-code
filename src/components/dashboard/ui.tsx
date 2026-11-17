import type { ReactNode } from "react";

export function Panel({ title, desc, children, actions }: { title: string; desc?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--card-shadow)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">{title}</h3>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-accent-pink" : "bg-border"}`}
    >
      <span className={`inline-block size-5 rounded-full bg-card shadow transition-transform ${checked ? "-translate-x-5" : "-translate-x-0.5"}`} />
    </button>
  );
}

export function Field({ label, value, onChange, placeholder, dir = "ltr", multiline = false, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; dir?: "ltr" | "rtl" | "auto"; multiline?: boolean; type?: string;
}) {
  const cls = "mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent-pink";
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      {multiline
        ? <textarea dir={dir} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={3} className={`${cls} resize-y text-foreground`} />
        : <input dir={dir} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${cls} text-foreground`} />}
    </label>
  );
}

export function SmallInput({ value, onChange, placeholder, className = "", ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; ariaLabel: string }) {
  return (
    <input
      dir="ltr"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-accent-pink ${className}`}
    />
  );
}

export function PrimaryButton({ children, onClick, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="inline-flex items-center gap-2 rounded-md bg-accent-pink px-3 py-1.5 text-sm font-medium text-card hover:opacity-90 disabled:opacity-50">
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, disabled, ariaLabel }: { children: ReactNode; onClick?: () => void; disabled?: boolean; ariaLabel?: string }) {
  return (
    <button type="button" aria-label={ariaLabel} onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm hover:bg-muted disabled:opacity-40">
      {children}
    </button>
  );
}
