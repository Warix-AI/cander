import { cn } from "@/lib/utils";

export function FeatureGrid({
  items,
  columns = 3,
}: {
  items: { title: string; body: string }[];
  columns?: 2 | 3 | 4;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
      )}
    >
      {items.map((item) => (
        <article
          key={item.title}
          className="rounded-[10px] border border-border bg-card p-5"
        >
          <h3 className="text-[15px] font-medium tracking-[-0.02em]">{item.title}</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            {item.body}
          </p>
        </article>
      ))}
    </div>
  );
}
