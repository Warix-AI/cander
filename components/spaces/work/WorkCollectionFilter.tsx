"use client";

import { Check, ListFilter } from "lucide-react";
import { Dropdown } from "@/components/ui/Controls";
import {
  WORK_COLLECTION_CATEGORY_OPTIONS,
  type WorkCollectionCategory,
} from "@/lib/work-screen-data";
import { FLOAT_CONTROL_SHELL, FLOAT_TOGGLE_ACTIVE } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const FILTER_OPTIONS: {
  id: "all" | WorkCollectionCategory;
  label: string;
}[] = [
  { id: "all", label: "All" },
  ...WORK_COLLECTION_CATEGORY_OPTIONS,
];

export function WorkCollectionFilter({
  value,
  onChange,
}: {
  value: "all" | WorkCollectionCategory;
  onChange: (value: "all" | WorkCollectionCategory) => void;
}) {
  const active =
    FILTER_OPTIONS.find((item) => item.id === value) ?? FILTER_OPTIONS[0];
  const filtered = value !== "all";

  return (
    <Dropdown
      align="start"
      matchTrigger={false}
      menuClassName="min-w-[10.5rem]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          aria-label={`Filter: ${active.label}`}
          aria-expanded={open}
          onClick={toggle}
          className={cn(
            "inline-flex items-center justify-center rounded-[10px] p-1 transition-colors duration-200",
            FLOAT_CONTROL_SHELL,
          )}
        >
          <span
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-[8px] transition-colors duration-200",
              filtered || open
                ? FLOAT_TOGGLE_ACTIVE
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ListFilter className="h-3.5 w-3.5" strokeWidth={1.6} />
          </span>
        </button>
      )}
    >
      {(close) => (
        <>
          {FILTER_OPTIONS.map((item) => {
            const selected = value === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(item.id);
                  close();
                }}
                className={cn(
                  "menu-row-hover flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors",
                  selected && "font-medium",
                )}
              >
                <span className="min-w-0 flex-1">{item.label}</span>
                {selected ? (
                  <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                ) : null}
              </button>
            );
          })}
        </>
      )}
    </Dropdown>
  );
}
