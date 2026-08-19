import { cn } from "@/lib/utils";

export function PageWidth({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1080px] px-5 md:px-6", className)}>
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
    <section id={id} className={cn("py-12 md:py-16", className)}>
      {children}
    </section>
  );
}

export function SectionHeader({
  kicker,
  title,
  body,
  as = "h2",
  center,
}: {
  kicker?: string;
  title: string;
  body?: string;
  as?: "h1" | "h2";
  center?: boolean;
}) {
  const Title = as;
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {kicker ? (
        <p className="text-[13px] text-muted-foreground">{kicker}</p>
      ) : null}
      <Title
        className={cn(
          "heading-display text-foreground",
          as === "h1"
            ? "mt-1 text-[2.5rem] leading-[1.1] md:text-[3.25rem]"
            : "mt-1 text-2xl md:text-[2rem]",
        )}
      >
        {title}
      </Title>
      {body ? (
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground md:text-base">
          {body}
        </p>
      ) : null}
    </div>
  );
}
