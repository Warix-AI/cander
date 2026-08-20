import { StatLine } from "@/components/panels/Bits";
import {
  HandshakeBadge,
  HandshakeCard,
} from "@/components/panels/handshake/HandshakeCard";
import { handshakeCapabilities } from "@/lib/handshake";

export function CapabilitiesPage() {
  return (
    <div className="space-y-3 p-4">
      <p className="text-[13px] text-muted-foreground">
        {handshakeCapabilities.intro}
      </p>

      {handshakeCapabilities.items.map((item) => (
        <HandshakeCard key={item.name}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{item.name}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
            <HandshakeBadge
              tone={item.status === "Enabled" ? "success" : "warn"}
            >
              {item.status === "Enabled" ? "✓ Enabled" : item.status}
            </HandshakeBadge>
          </div>
          <div className="mt-3 space-y-1 border-t border-border pt-3">
            <StatLine label="Used" value={`${item.usage} times`} />
            <StatLine label="Connected to" value={item.connectedSystem} />
            <StatLine label="Permissions" value={item.permissions} />
          </div>
        </HandshakeCard>
      ))}
    </div>
  );
}
