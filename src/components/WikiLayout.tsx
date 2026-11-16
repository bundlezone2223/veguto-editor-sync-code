import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function WikiLayout({ children }: { children?: ReactNode }) {
  return (
    <div dir="rtl" className="flex min-h-screen bg-background">
      <main className="mx-auto min-w-0 w-full max-w-5xl flex-1 px-3 md:px-8 pb-8 pt-3 md:pt-6">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
