import { StatLine } from "@/components/panels/Bits";
import {
  HandshakeBadge,
  HandshakeCard,
} from "@/components/panels/handshake/HandshakeCard";
import { handshakeSettings } from "@/lib/handshake";

export function SettingsPage() {
  return (
    <div className="space-y-4 p-4">
      <p className="text-[13px] text-muted-foreground">
        Account and notification preferences for your Handshake workspace.
      </p>

      <HandshakeCard title="Account">
        <div className="mt-2 space-y-1">
          <StatLine label="Business" value={handshakeSettings.account} />
          <StatLine label="Status" value={handshakeSettings.status} />
          <StatLine
            label="Connected since"
            value={handshakeSettings.connectedSince}
          />
        </div>
        <div className="mt-3">
          <HandshakeBadge tone="neutral">{handshakeSettings.status}</HandshakeBadge>
        </div>
      </HandshakeCard>

      <HandshakeCard title="Preferences">
        <div className="mt-2 space-y-1">
          <StatLine
            label="Notifications"
            value={handshakeSettings.notifications ? "On" : "Off"}
          />
          <StatLine
            label="Auto-approve recommendations"
            value={
              handshakeSettings.autoApproveRecommendations ? "On" : "Off"
            }
          />
        </div>
      </HandshakeCard>

      <HandshakeCard title="Webhook">
        <p className="mt-2 font-mono text-[12px] text-muted-foreground">
          {handshakeSettings.webhookUrl}
        </p>
      </HandshakeCard>
    </div>
  );
}
