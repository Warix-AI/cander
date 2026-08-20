import { cn } from "@/lib/utils";

type IconSize = "xs" | "sm" | "md" | "lg";

const sizeClass: Record<IconSize, string> = {
  xs: "h-6 w-6 rounded-[8px]",
  sm: "h-8 w-8 rounded-[10px]",
  md: "h-10 w-10 rounded-[12px]",
  lg: "h-12 w-12 rounded-[14px]",
};

const svgClass: Record<IconSize, string> = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function HandshakeIcon({
  size = "md",
  className,
}: {
  size?: IconSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-[#FACC15] shadow-[0_2px_8px_rgba(250,204,21,0.35)]",
        sizeClass[size],
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        className={cn(svgClass[size], "text-[#1a1400]")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label="Handshake"
      >
        <path d="M7 11v-1a2 2 0 0 1 2-2h1" />
        <path d="M17 11v-1a2 2 0 0 0-2-2h-1" />
        <path d="M11 11.5 13 13.5 16 10.5" />
        <path d="M9 14.5c1.5-1.2 3.2-1.8 5-1.8s3.5.6 5 1.8" />
        <path d="M8 8.5 6.5 10M16 8.5 17.5 10" />
      </svg>
    </span>
  );
}
