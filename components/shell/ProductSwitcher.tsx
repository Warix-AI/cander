"use client";

import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { Dropdown, MenuRow } from "@/components/ui/Controls";
import { developmentView, homeView } from "@/lib/product-copy";
import type { ProductId } from "@/lib/types";

const views: {
  id: ProductId;
  label: string;
  description: string;
}[] = [
  { id: "courier", ...homeView },
  { id: "platform", ...developmentView },
];

export function ProductSwitcher() {
  const {
    product,
    setProduct,
    entitlements,
    view,
    canGoBack,
    goBack,
    newChat,
  } = useApp();

  if (view === "settings") {
    return (
      <button
        type="button"
        onClick={() => {
          if (canGoBack) goBack();
          else newChat();
        }}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-2.5 text-left transition-colors duration-200 hover:bg-sidebar-accent"
        aria-label="Back"
      >
        <ArrowLeft
          className="h-4 w-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
        <span className="truncate text-[15.4px] font-semibold tracking-[-0.03em]">
          Back
        </span>
      </button>
    );
  }

  const current = views.find((item) => item.id === product) ?? views[0];
  const options = views.filter(
    (item) => item.id === "courier" || entitlements.canAccessDevelopment,
  );

  return (
    <Dropdown
      className="w-full"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex w-full items-center rounded-lg px-2 py-2.5 text-left transition-colors duration-200 hover:bg-sidebar-accent"
        >
          <span className="inline-flex min-w-0 items-center gap-0.5">
            <span className="truncate text-[15.4px] font-semibold tracking-[-0.03em]">
              {current.label}
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground"
              strokeWidth={1.6}
            />
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          {options.map((item) => (
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
