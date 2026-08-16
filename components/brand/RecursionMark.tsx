import { cn } from "@/lib/utils";

export function RecursionMark({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 28 28"
      aria-hidden="true"
      className={cn("h-7 w-7", className)}
      fill="none"
    >
      <circle cx="8" cy="8" r="2.15" fill="currentColor" />
      <circle cx="20" cy="8" r="2.15" fill="currentColor" />
      <circle cx="20" cy="20" r="2.15" fill="currentColor" />
      <circle cx="8" cy="20" r="2.15" fill="currentColor" />
      <path
        d="M10.1 8h7.8M20 10.1v7.8M17.9 20H10.1M8 17.9V10.1"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}
