const hostingModes = [
  {
    id: "cloud",
    label: "Cloud",
    title: "Cloud",
    body: "Recursion AI operates the models.",
  },
  {
    id: "local",
    label: "Local",
    title: "Local",
    body: "Your network, your machines.",
  },
  {
    id: "on-device",
    label: "On-Device",
    title: "On-Device",
    body: "Inference on each person's device.",
  },
] as const;

export function HostingCard({
  mode,
}: {
  mode: (typeof hostingModes)[number];
}) {
  return (
    <article className="rounded-[10px] border border-border bg-card p-6">
      <h3 className="text-lg font-medium tracking-[-0.02em]">{mode.title}</h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        {mode.body}
      </p>
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
