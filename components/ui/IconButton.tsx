import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { FLOAT_ICON_BUTTON } from "@/lib/shell-chrome";

export function IconButton({
  className,
  active = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        FLOAT_ICON_BUTTON,
        active && "border-chart-2/40 bg-background text-chart-2 dark:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
