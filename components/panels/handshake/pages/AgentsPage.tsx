import { Row, SectionLabel } from "@/components/panels/Bits";
import {
  HandshakeBadge,
  HandshakeCard,
} from "@/components/panels/handshake/HandshakeCard";
import { handshakeProviders } from "@/lib/handshake";
import { cn } from "@/lib/utils";

function providerTone(
  status: (typeof handshakeProviders)[number]["status"],
): "success" | "warn" | "neutral" {
  if (status === "Verified") return "success";
  if (status === "Pending Approval") return "warn";
  return "neutral";
}

export function AgentsPage() {
  return (
    <div className="space-y-4 p-4">
      <p className="px-1 text-[13px] text-muted-foreground">
        Connected AI identities — who can talk to your business through Handshake.
      </p>

      <HandshakeCard title="AI Providers">
        <SectionLabel>Providers</SectionLabel>
        {handshakeProviders.map((provider) => (
          <div
            key={provider.name}
            className="border-b border-border px-3 py-3 last:border-0"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium">{provider.name}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {provider.permissions}
                </p>
              </div>
              <HandshakeBadge tone={providerTone(provider.status)}>
                {provider.status}
              </HandshakeBadge>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
              <span className="text-muted-foreground">
                Requests{" "}
                <span className="font-mono text-foreground">
                  {provider.requests}
                </span>
              </span>
              <span className="text-muted-foreground">
                Trust{" "}
                <span className={cn(provider.trust === "Active" && "text-foreground")}>
                  {provider.trust}
                </span>
              </span>
            </div>
          </div>
        ))}
      </HandshakeCard>

      <Row
        title="Add AI provider"
        meta="Request access"
        leading={
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted text-[14px]">
            +
          </span>
        }
      />
    </div>
  );
}
