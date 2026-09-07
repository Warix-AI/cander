"use client";

import { CONNECTOR_CONTROL_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

/** G3-styled toggle for connector skill rows. */
export function ConnectorSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[28px] w-[51px] shrink-0 items-center transition-colors duration-200",
        CONNECTOR_CONTROL_RADIUS,
        checked ? "bg-[#0b4fc4]" : "bg-muted",
        disabled && "opacity-40",
      )}
    >
      <span
        className={cn(
          "inline-block h-[22px] w-[22px] bg-white shadow-sm transition-transform duration-200",
          CONNECTOR_CONTROL_RADIUS,
          checked ? "translate-x-[26px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}
