import { handshakeCapabilities } from "@/lib/handshake";
import { cn } from "@/lib/utils";

export function CapabilitiesPage() {
  return (
    <div className="space-y-4 p-4">
      <p className="rounded-[10px] border border-border bg-muted/40 px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
        {handshakeCapabilities.disclaimer}
      </p>
      {handshakeCapabilities.items.map((item) => (
        <section
          key={item.name}
          className="flex items-center justify-between rounded-[10px] border border-border bg-card px-4 py-3"
        >
          <p className="text-[14px] font-medium tracking-[-0.01em]">{item.name}</p>
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
              item.status === "Active"
                ? "border-chart-2/30 bg-chart-2/10 text-chart-2"
                : "border-chart-3/30 bg-chart-3/10 text-chart-3",
            )}
          >
            {item.status}
          </span>
        </section>
      ))}
    </div>
  );
}
