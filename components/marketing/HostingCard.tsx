import { hostingModes } from "@/lib/billing";

export function HostingCard({
  mode,
}: {
  mode: (typeof hostingModes)[number];
}) {
  return (
    <article className="rounded-[10px] border border-border bg-card p-6">
      <p className="text-[13px] font-medium">{mode.label}</p>
      <h3 className="mt-1 text-lg font-medium tracking-[-0.02em]">{mode.title}</h3>
      <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">{mode.body}</p>
      <p className="mt-3 text-[13px] leading-relaxed text-foreground/80">{mode.why}</p>
      <ul className="mt-4 space-y-1.5 text-[13px] text-muted-foreground">
        {mode.traits.map((trait) => (
          <li key={trait}>{trait}</li>
        ))}
      </ul>
    </article>
  );
}

export function HostingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {hostingModes.map((mode) => (
        <HostingCard key={mode.id} mode={mode} />
      ))}
    </div>
  );
}
