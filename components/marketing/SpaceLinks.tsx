import Link from "next/link";
import { marketingSpaces } from "@/lib/marketing";

export function SpaceLinks() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {marketingSpaces.map((space) => (
        <Link
          key={space.id}
          href={space.href}
          className="group rounded-[10px] border border-border bg-card p-5 transition-colors hover:border-foreground/20"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-medium tracking-[-0.02em]">
              {space.title}
            </h3>
            <span className="text-[11px] text-muted-foreground">{space.kicker}</span>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            {space.blurb}
          </p>
        </Link>
      ))}
    </div>
  );
}
