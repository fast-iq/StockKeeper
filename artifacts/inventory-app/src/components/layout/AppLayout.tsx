import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-[100dvh] min-w-0 overflow-hidden pb-20 md:pb-0">
        {children}
      </main>
    </div>
  );
}
