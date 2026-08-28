import { SectionLabel, StatLine } from "@/components/panels/Bits";
import { HandshakeCard } from "@/components/panels/handshake/HandshakeCard";
import { handshakeTransactions } from "@/lib/handshake";

export function TransactionsPage() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[14px] font-medium">{handshakeTransactions.headline}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Why businesses pay for Handshake — measurable AI-driven outcomes.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {handshakeTransactions.stats.map((stat) => (
          <HandshakeCard key={stat.label} className="p-4">
            <p className="text-[12px] text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.03em]">
              {stat.value}
            </p>
          </HandshakeCard>
        ))}
      </div>

      <HandshakeCard title="Completed Actions">
        <div className="mt-2 space-y-1">
          {handshakeTransactions.completedActions.length ? (
            handshakeTransactions.completedActions.map((action) => (
            <StatLine key={action.name} label={action.name} value={action.value} />
            ))
          ) : (
            <p className="px-3 py-2 text-[13px] text-muted-foreground">
              No completed actions yet.
            </p>
          )}
        </div>
      </HandshakeCard>

      <HandshakeCard title="Top AI Interactions">
        {handshakeTransactions.topInteractions.length ? (
          <ol className="mt-2 space-y-2 px-3">
            {handshakeTransactions.topInteractions.map((item, index) => (
              <li key={item} className="flex items-center gap-3 text-[13px]">
                <span className="font-mono text-[11px] text-muted-foreground">
                  {index + 1}.
                </span>
                {item}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 px-3 py-2 text-[13px] text-muted-foreground">
            No interactions yet.
          </p>
        )}
      </HandshakeCard>

      <HandshakeCard>
        <SectionLabel>Conversion insight</SectionLabel>
        <p className="mt-2 px-3 text-[13px] leading-relaxed text-muted-foreground">
          Completed business actions will show here once Handshake is connected.
        </p>
      </HandshakeCard>
    </div>
  );
}
