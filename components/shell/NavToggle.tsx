"use client";

import { PanelLeft } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function NavToggle({ className }: { className?: string }) {
  const { sidebarOpen, setSidebarOpen, mobileNav, setMobileNav } = useApp();

  return (
    <button
      type="button"
      aria-label={sidebarOpen || mobileNav ? "Close left panel" : "Open left panel"}
      onClick={() => {
        if (window.matchMedia("(min-width: 1024px)").matches) {
          setSidebarOpen(!sidebarOpen);
        } else {
          setMobileNav(!mobileNav);
        }
      }}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/75 transition-colors duration-200 hover:bg-sidebar-accent hover:text-foreground",
        className,
      )}
    >
      <PanelLeft className="h-4 w-4" strokeWidth={1.6} />
    </button>
  );
}
