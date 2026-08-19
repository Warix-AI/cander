import { cn } from "@/lib/utils";

export function CourierMark({
  className,
}: {
  className?: string;
}) {
  return (
    <img
      src="/courier-mark.png"
      alt=""
      aria-hidden="true"
      width={40}
      height={38}
      className={cn("h-[29.7px] w-[31px] object-contain", className)}
    />
  );
}
