"use client";

import { Check, ChevronDown } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { Dropdown, MenuRow } from "@/components/ui/Controls";

const products = [
  {
    id: "courier" as const,
    label: "Courier",
    description: "Chat, spaces, and projects",
  },
  {
    id: "platform" as const,
    label: "Courier Platform",
    description: "APIs, models, and hosting",
  },
];

export function ProductSwitcher() {
  const { product, setProduct } = useApp();
  const current = products.find((item) => item.id === product) ?? products[0];

  return (
    <Dropdown
      className="w-full"
      menuClassName="w-full min-w-0"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex max-w-full items-center rounded-lg px-2 py-2 text-left transition-colors duration-200 hover:bg-sidebar-accent"
        >
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-[14px] font-semibold tracking-[-0.03em]">
              {current.label}
            </span>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              strokeWidth={1.6}
            />
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          {products.map((item) => (
            <div key={item.id} className="relative">
              <MenuRow
                active={item.id === product}
                title={item.label}
                body={item.description}
                onClick={() => {
                  setProduct(item.id);
                  close();
                }}
              />
              {item.id === product ? (
                <Check
                  className="pointer-events-none absolute top-3 right-3 h-3.5 w-3.5"
                  strokeWidth={1.75}
                />
              ) : null}
            </div>
          ))}
        </>
      )}
    </Dropdown>
  );
}
