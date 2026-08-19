import { cn } from "@/lib/utils";

export function PageWidth({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1120px] px-5 md:px-8", className)}>
      {children}
    </div>
  );
}

export function Section({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("py-16 md:py-24", className)}>
      {children}
    </section>
  );
}

export function SectionHeader({
  kicker,
  title,
  body,
  as = "h2",
}: {
  kicker?: string;
  title: string;
  body?: string;
  as?: "h1" | "h2";
}) {
  const Title = as;
  return (
    <div className="max-w-2xl">
      {kicker ? (
        <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {kicker}
        </p>
      ) : null}
      <Title
        className={cn(
          "heading-display text-foreground",
          as === "h1"
            ? "mt-3 text-4xl md:text-6xl"
            : "mt-2 text-3xl md:text-4xl",
        )}
      >
        {title}
      </Title>
      {body ? (
        <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground md:text-[17px]">
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function MediaPanel({
  media,
  children,
  className,
  watermark,
}: {
  media: string;
  children?: React.ReactNode;
  className?: string;
  watermark?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[10px] text-white",
        media,
        className,
      )}
    >
      <div className="grain-layer" />
      {watermark ? (
        <p className="relative px-6 pt-6 text-5xl font-semibold tracking-[-0.06em] text-white/90 md:text-7xl">
          {watermark}
        </p>
      ) : null}
      {children ? (
        <div className="relative mt-auto px-6 pb-6 pt-16">{children}</div>
      ) : null}
    </div>
  );
}
