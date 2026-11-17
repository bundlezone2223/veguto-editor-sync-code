import { Link } from "@tanstack/react-router";
import { FolderKanban, LayoutDashboard } from "lucide-react";

const ITEMS = [
  { to: "/", label: "المشاريع", Icon: FolderKanban },
  { to: "/dashboard", label: "لوحة التحكم", Icon: LayoutDashboard },
] as const;

/** Floating bar at the bottom of the home and dashboard pages. */
export function BottomNav() {
  return (
    <nav aria-label="التنقل الرئيسي" className="fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-border bg-card/95 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur">
        {ITEMS.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            className="flex min-w-28 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-accent-pink data-[status=active]:text-card"
          >
            <Icon size={18} aria-hidden />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
