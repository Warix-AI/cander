import { handshakeAnalytics } from "@/lib/handshake";

export function AnalyticsPage() {
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2">
      {handshakeAnalytics.map((stat) => (
        <section
          key={stat.label}
          className="rounded-[10px] border border-border bg-card p-5"
        >
          <p className="text-[12px] text-muted-foreground">{stat.label}</p>
          <p className="mt-2 text-2xl font-medium tracking-[-0.03em]">
            {stat.value}
          </p>
        </section>
      ))}
    </div>
  );
}
