import Link from "next/link";
import { cn } from "@/lib/utils";

const base =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200";

const variants = {
  primary: "bg-primary text-primary-foreground hover:bg-foreground",
  secondary:
    "border border-foreground/15 bg-transparent text-foreground hover:bg-muted",
  ghost: "bg-transparent text-foreground hover:bg-muted",
  onDark: "border border-white/25 bg-white text-foreground hover:bg-white/90",
} as const;

export function Cta({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(base, variants[variant], className)}>
      {children}
    </Link>
  );
}
