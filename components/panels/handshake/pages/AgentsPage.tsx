import { handshakeAgents } from "@/lib/handshake";

export function AgentsPage() {
  return (
    <div className="space-y-4 p-4">
      <section className="rounded-[10px] border border-foreground/15 bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-medium tracking-[-0.02em]">
              {handshakeAgents.active.name}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {handshakeAgents.active.status}
            </p>
          </div>
          <span className="rounded-full border border-chart-2/30 bg-chart-2/10 px-2.5 py-0.5 text-[11px] font-medium text-chart-2">
            Active
          </span>
        </div>
        <p className="mt-4 text-[12px] font-medium text-muted-foreground">
          Capabilities
        </p>
        <ul className="mt-2 space-y-1.5 text-[13px]">
          {handshakeAgents.active.capabilities.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Future AI providers
      </p>
      {handshakeAgents.future.map((provider) => (
        <section
          key={provider.name}
          className="rounded-[10px] border border-border bg-card p-4 opacity-70"
        >
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-medium">{provider.name}</p>
            <span className="text-[11px] text-muted-foreground">
              {provider.status}
            </span>
          </div>
        </section>
      ))}
    </div>
  );
}
