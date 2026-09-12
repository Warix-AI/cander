"use client";

import {
  Activity,
  Building2,
  ChartNoAxesColumn,
  CircleUser,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ColorModeToggle } from "@/components/shell/ColorModeToggle";
import { SIDEBAR_FOOTER_ROW } from "@/components/shell/AccountMenu";
import { ShellProductSwitcher } from "@/components/shell/ShellProductSwitcher";
import {
  ShellNavToggleButton,
  ShellWindowChromeBar,
} from "@/components/shell/ShellWindowChromeBar";
import { Dropdown } from "@/components/ui/Controls";
import { ADMIN_SECTION_LABELS, type AdminSection } from "@/lib/admin/sections";
import { useAdmin, ADMIN_SECTIONS } from "@/components/admin/AdminProvider";
import { useDesktopShell } from "@/lib/desktop-shell";
import {
  PRIMARY_NAV_CARD_ACTIVE,
  PRIMARY_NAV_CARD_HOVER,
  PRIMARY_NAV_CARD_RADIUS_FIRST,
  PRIMARY_NAV_CARD_RADIUS_LAST,
} from "@/lib/mobile-menu-styles";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const SECTION_ICONS: Record<AdminSection, LucideIcon> = {
  overview: LayoutDashboard,
  plans: CreditCard,
  pricing: Receipt,
  accounts: Users,
  usage: ChartNoAxesColumn,
  subscriptions: ClipboardList,
  enterprise: Building2,
  audit: Search,
  operations: Activity,
};

/**
 * Left nav — classic Sidebar geometry (same chrome row + product switcher
 * placement as Cander).
 */
export function AdminNavPanel({ className }: { className?: string }) {
  const { section, setSection, setMobileSurface, setNavCollapsed } = useAdmin();
  const desktop = useDesktopShell();
  // Electron classic: chrome shares the traffic-light titlebar row (like Sidebar).
  const macDesktop = desktop;

  const chrome = (opts: { clearTrafficLights?: boolean }) => (
    <ShellWindowChromeBar
      clearTrafficLights={opts.clearTrafficLights}
      className="w-full bg-sidebar text-sidebar-foreground"
      leading={
        <ShellNavToggleButton onClick={() => setNavCollapsed(true)} />
      }
    />
  );

  return (
    <div
      className={cn(
        "flex h-full max-w-[100vw] shrink-0 gap-0",
        macDesktop && "flex-col",
        className,
      )}
    >
      {macDesktop ? chrome({ clearTrafficLights: true }) : null}

      <aside className="flex h-full w-[min(273px,calc(100vw-3.5rem))] shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground lg:w-[273px]">
        {/* Browser classic — desktop chrome sits on the traffic-light row. */}
        {!macDesktop ? (
          <div
            className="w-full shrink-0"
            style={{
              height: `max(0px, var(--desktop-titlebar, 0px))`,
              minHeight: 0,
            }}
            aria-hidden
          />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          {!macDesktop ? chrome({}) : null}

          <nav
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden px-2",
              macDesktop ? "mt-2" : "mt-3.5",
            )}
            aria-label="Admin"
          >
            <div className="mb-2 shrink-0">
              <ShellProductSwitcher active="admin" />
            </div>

            <div className="flex min-h-0 shrink flex-col gap-0 overflow-y-auto">
              <div
                className={cn(
                  "flex flex-col gap-0 p-[3px]",
                  SHELL_G3_RADIUS,
                  "bg-black/[0.03] dark:bg-white/[0.045]",
                )}
              >
                {ADMIN_SECTIONS.map((id, index) => {
                  const Icon = SECTION_ICONS[id];
                  const active = section === id;
                  const edge =
                    index === 0
                      ? "first"
                      : index === ADMIN_SECTIONS.length - 1
                        ? "last"
                        : "middle";
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setSection(id);
                        setMobileSurface("workspace");
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-1.5 text-left text-[15px] transition-colors duration-200",
                        edge === "first" && PRIMARY_NAV_CARD_RADIUS_FIRST,
                        edge === "last" && PRIMARY_NAV_CARD_RADIUS_LAST,
                        active
                          ? PRIMARY_NAV_CARD_ACTIVE
                          : PRIMARY_NAV_CARD_HOVER,
                      )}
                    >
                      <Icon
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        strokeWidth={2}
                      />
                      <span className="min-w-0 flex-1 truncate tracking-[-0.01em]">
                        {ADMIN_SECTION_LABELS[id]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          <div className="shrink-0 px-2 pb-2">
            <Dropdown
              className="w-full"
              placement="top"
              align="start"
              matchTrigger
              menuClassName="!p-1 menu-glass-surface"
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className={cn(
                    SIDEBAR_FOOTER_ROW,
                    open && "bg-sidebar-accent font-medium",
                  )}
                  aria-label="General"
                  aria-expanded={open}
                >
                  <CircleUser
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  General
                </button>
              )}
            >
              {() => (
                <div className="flex flex-col gap-px">
                  <div className="px-2 py-2">
                    <ColorModeToggle />
                  </div>
                </div>
              )}
            </Dropdown>
          </div>
        </div>
      </aside>
    </div>
  );
}
