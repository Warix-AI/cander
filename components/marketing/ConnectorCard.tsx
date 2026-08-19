import { ConnectorMark } from "@/components/brand/ConnectorMarks";
import type { Connector } from "@/lib/types";

export function ConnectorCard({ connector }: { connector: Connector }) {
  return (
    <article className="flex items-start gap-3 rounded-[10px] border border-border bg-card p-4">
      <ConnectorMark id={connector.icon} size="sm" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[14px] font-medium tracking-[-0.01em]">
            {connector.name}
          </h3>
          {connector.featured ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Featured
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {connector.description}
        </p>
      </div>
    </article>
  );
}
