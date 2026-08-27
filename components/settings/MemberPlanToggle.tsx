"use client";

import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

export function MemberPlanToggle({
  value,
  onChange,
  disabled = false,
  label,
}: {
  value: "pro" | "max";
  onChange: (plan: "pro" | "max") => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label ?? "Seat plan"}
      className={cn(
        "inline-flex h-9 shrink-0 border border-border bg-muted/50 p-0.5",
        SHELL_G3_RADIUS,
        disabled && "opacity-50",
      )}
    >
      {(["pro", "max"] as const).map((plan) => (
        <button
          key={plan}
          type="button"
          disabled={disabled}
          aria-pressed={value === plan}
          onClick={() => onChange(plan)}
          className={cn(
            "inline-flex h-full min-w-[3.5rem] items-center justify-center px-3.5 text-[12.5px] font-medium tracking-[-0.01em] transition-colors duration-200",
            SHELL_G3_RADIUS,
            value === plan
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {plan === "pro" ? "Pro" : "Max"}
        </button>
      ))}
    </div>
  );
}
