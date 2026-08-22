import { SectionLabel, StatLine } from "@/components/panels/Bits";
import {
  HandshakeBadge,
  HandshakeCard,
} from "@/components/panels/handshake/HandshakeCard";
import { handshakeSecurity } from "@/lib/handshake";

export function SecurityPage() {
  const { permissions } = handshakeSecurity;

  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[14px] font-medium">Trust layer</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Handshake is identity, permission, and audit infrastructure for
          AI-business communication.
        </p>
      </div>

      <HandshakeCard title="Provider Verification">
        {handshakeSecurity.verification.map((item) => (
          <div
            key={item.provider}
            className="flex items-center justify-between border-b border-border py-3 last:border-0"
          >
            <div>
              <p className="text-[14px] font-medium">{item.provider}</p>
              <p className="text-[12px] text-muted-foreground">{item.level}</p>
            </div>
            <HandshakeBadge tone={item.status === "Verified" ? "success" : "warn"}>
              {item.status}
            </HandshakeBadge>
          </div>
        ))}
      </HandshakeCard>

      <HandshakeCard title="Permissions">
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <SectionLabel>User context · allowed</SectionLabel>
            <ul className="space-y-1.5 px-3 text-[13px]">
              {permissions.userContext.allowed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <SectionLabel>User context · restricted</SectionLabel>
            <ul className="space-y-1.5 px-3 text-[13px] text-muted-foreground">
              {permissions.userContext.restricted.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {permissions.actions.map((action) => (
            <div
              key={action.name}
              className="flex items-center justify-between rounded-[10px] border border-border bg-card px-3 py-2 text-[13px]"
            >
              <span>{action.name}</span>
              <span className="text-muted-foreground">{action.mode}</span>
            </div>
          ))}
        </div>
      </HandshakeCard>

      <HandshakeCard title="Access Policies">
        <ul className="mt-2 space-y-2 px-1 text-[13px]">
          {handshakeSecurity.accessPolicies.map((policy) => (
            <li
              key={policy}
              className="rounded-[10px] border border-border bg-card px-3 py-2"
            >
              {policy}
            </li>
          ))}
        </ul>
      </HandshakeCard>

      <HandshakeCard title="Audit Logs">
        <div className="mt-2 space-y-1">
          {handshakeSecurity.auditLogs.map((log) => (
            <StatLine key={log.event} label={log.time} value={log.event} />
          ))}
        </div>
      </HandshakeCard>

      <div className="grid gap-3 sm:grid-cols-2">
        <HandshakeCard title="API Keys">
          {handshakeSecurity.apiKeys.map((key) => (
            <div key={key.name} className="mt-2">
              <p className="text-[13px] font-medium">{key.name}</p>
              <p className="font-mono text-[12px] text-muted-foreground">
                {key.prefix}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Last used {key.lastUsed}
              </p>
            </div>
          ))}
        </HandshakeCard>
        <HandshakeCard title="Encryption & Compliance">
          <p className="mt-2 text-[13px]">{handshakeSecurity.encryption}</p>
          <ul className="mt-3 space-y-1 text-[13px] text-muted-foreground">
            {handshakeSecurity.compliance.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </HandshakeCard>
      </div>
    </div>
  );
}
