import { SectionLabel, StatLine } from "@/components/panels/Bits";
import { HandshakeCard } from "@/components/panels/handshake/HandshakeCard";
import { handshakeContextData } from "@/lib/handshake";

export function ContextPage() {
  const { user, business, rules } = handshakeContextData;

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[14px] font-medium">The memory bridge</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Your AI&apos;s understanding of this business — what agents can know
          and how they can use it.
        </p>
      </div>

      <HandshakeCard title="User Context">
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          What information can agents access?
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <SectionLabel>Allowed</SectionLabel>
            <ul className="space-y-1.5 px-3 text-[13px]">
              {user.allowed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <SectionLabel>Restricted</SectionLabel>
            <ul className="space-y-1.5 px-3 text-[13px] text-muted-foreground">
              {user.restricted.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
          <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            Live example
          </p>
          <div className="mt-2 space-y-1">
            <StatLine label="Intent" value={user.live.intent} />
            <StatLine label="Preferences" value={user.live.preferences} />
            <StatLine label="History" value={user.live.history} />
          </div>
        </div>
      </HandshakeCard>

      <HandshakeCard title="Business Context">
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          What the business tells agents.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {business.knowledge.map((item) => (
            <span
              key={item}
              className="rounded-full border border-border bg-muted/40 px-3 py-1 text-[12px]"
            >
              {item}
            </span>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {business.items.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-border bg-muted/30 px-3 py-2.5"
            >
              <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                {item.label}
              </p>
              <p className="mt-1 text-[13px]">{item.value}</p>
            </div>
          ))}
        </div>
      </HandshakeCard>

      <HandshakeCard title="Rules">
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <SectionLabel>What agents can say</SectionLabel>
            <ul className="mt-1 space-y-1.5 px-3 text-[13px]">
              {rules.canSay.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <SectionLabel>What agents cannot do</SectionLabel>
            <ul className="mt-1 space-y-1.5 px-3 text-[13px] text-muted-foreground">
              {rules.cannotDo.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </HandshakeCard>
    </div>
  );
}
