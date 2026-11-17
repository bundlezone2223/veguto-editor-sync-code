import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";

export function WikiLayout({ children, withNav = false, wide = false }: { children?: ReactNode; withNav?: boolean; wide?: boolean }) {
  return (
    <div dir="rtl" className="flex min-h-screen bg-background">
      <main className={`mx-auto min-w-0 w-full ${wide ? "max-w-7xl" : "max-w-5xl"} flex-1 px-3 md:px-8 pt-3 md:pt-6 ${withNav ? "pb-28" : "pb-8"}`}>
        {children ?? <Outlet />}
      </main>
      {withNav && <BottomNav />}
    </div>
  );
}
