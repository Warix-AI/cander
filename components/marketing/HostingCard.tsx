import { hostingModes } from "@/lib/billing";
import { MediaPanel } from "@/components/marketing/Section";

const mediaFor = {
  cloud: "media-a",
  local: "media-b",
  "on-device": "media-c",
} as const;

export function HostingCard({
  mode,
}: {
  mode: (typeof hostingModes)[number];
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-card">
      <MediaPanel media={mediaFor[mode.id]} className="min-h-[160px]">
        <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-white/70">
          {mode.label}
        </p>
        <h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-white">
          {mode.title}
        </h3>
      </MediaPanel>
      <div className="flex flex-1 flex-col p-6">
        <p className="text-[15px] leading-relaxed">{mode.body}</p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
          {mode.why}
        </p>
        <ul className="mt-5 space-y-1.5 text-[13.5px] text-muted-foreground">
          {mode.traits.map((trait) => (
            <li key={trait}>{trait}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function HostingCards() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {hostingModes.map((mode) => (
        <HostingCard key={mode.id} mode={mode} />
      ))}
    </div>
  );
}
