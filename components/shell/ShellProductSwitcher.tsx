"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { Dropdown } from "@/components/ui/Controls";
import { APP_NAME } from "@/lib/app-brand";
import {
  PRIMARY_NAV_CARD_ACTIVE,
  PRIMARY_NAV_CARD_HOVER,
  PRIMARY_NAV_CARD_RADIUS_SOLO,
} from "@/lib/mobile-menu-styles";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export type ShellProductId = "app" | "admin";

const PRODUCTS: {
  id: ShellProductId;
  title: string;
  body: string;
  href: string;
}[] = [
  {
    id: "app",
    title: APP_NAME,
    body: "Create, learn, and explore",
    href: "/",
  },
  {
    id: "admin",
    title: "Admin",
    body: "Plans, usage, and platform ops",
    href: "/admin",
  },
];

/**
 * Product switcher — same inset card width/hover as New / Canvas.
 * Sits under WindowChrome on both Cander and Admin sidebars.
 */
export function ShellProductSwitcher({
  active,
  className,
}: {
  active: ShellProductId;
  className?: string;
}) {
  const router = useRouter();
  const current = PRODUCTS.find((p) => p.id === active) ?? PRODUCTS[0];

  return (
    <Dropdown
      className={cn("w-full", className)}
      placement="bottom"
      align="start"
      matchTrigger
      keepSidebarPeek
      menuClassName="!p-1.5 menu-glass-surface min-w-[14rem]"
      trigger={({ open, toggle }) => (
        <div
          className={cn(
            "flex w-full flex-col gap-0 p-[3px]",
            SHELL_G3_RADIUS,
            "bg-black/[0.03] dark:bg-white/[0.045]",
          )}
        >
          <button
            type="button"
            onClick={toggle}
            aria-label="Switch product"
            aria-expanded={open}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[15px] transition-colors duration-200",
              PRIMARY_NAV_CARD_RADIUS_SOLO,
              // Idle = gray card (like New); hover / open = white lift.
              PRIMARY_NAV_CARD_HOVER,
              open && PRIMARY_NAV_CARD_ACTIVE,
            )}
          >
            <span className="min-w-0 flex-1 truncate tracking-[-0.01em]">
              {current.title}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
              strokeWidth={2}
            />
          </button>
        </div>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-0.5">
          {PRODUCTS.map((product) => {
            const selected = product.id === active;
            return (
              <button
                key={product.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  if (product.id === active) return;
                  router.push(product.href);
                }}
                className={cn(
                  "flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors duration-200",
                  "hover:bg-muted/80",
                  selected && "bg-muted/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium leading-5 tracking-[-0.01em]">
                    {product.title}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
                    {product.body}
                  </span>
                </span>
                {selected ? (
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-foreground"
                    strokeWidth={2.25}
                  />
                ) : (
                  <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Dropdown>
  );
}
