import Link from "next/link";
import { marketingSpaces } from "@/lib/marketing";
import { MediaPanel } from "@/components/marketing/Section";

export function SpaceCard({
  href,
  title,
  kicker,
  blurb,
  media,
}: (typeof marketingSpaces)[number]) {
  return (
    <Link href={href} className="min-w-[240px] flex-1 snap-start">
      <MediaPanel media={media} watermark={title} className="flex min-h-[280px] flex-col">
        <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-white/70">
          {kicker}
        </p>
        <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-white/85">
          {blurb}
        </p>
      </MediaPanel>
    </Link>
  );
}

export function SpaceCardRow() {
  return (
    <div className="flex snap-x gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible">
      {marketingSpaces.map((space) => (
        <SpaceCard key={space.id} {...space} />
      ))}
    </div>
  );
}
