import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function IconButton({
  className,
  active = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-foreground/12 text-foreground transition-colors duration-200 hover:bg-muted",
        active && "border-chart-2/40 bg-muted text-chart-2",
        className,
      )}
      {...props}
    />
  );
}
