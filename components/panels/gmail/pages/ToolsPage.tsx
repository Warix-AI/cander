import { gmailMcpTools } from "@/lib/gmail";
import { cn } from "@/lib/utils";

export function ToolsPage() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[14px] font-medium">Gmail MCP tools</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          What Gmail exposes to agents via MCP — search, read, draft,
          send, labels, and filters.
        </p>
      </div>

      <div className="space-y-2">
        {gmailMcpTools.map((tool) => (
          <article
            key={tool.id}
            className="rounded-[10px] border border-border bg-card p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-[12.5px] font-medium">{tool.id}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium",
                  tool.tier === "Core"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {tool.tier}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {tool.description}
            </p>
            {tool.params.length ? (
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                {tool.params.join(" · ")}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
