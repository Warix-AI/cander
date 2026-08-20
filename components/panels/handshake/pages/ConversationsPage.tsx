import { HandshakeBadge, HandshakeCard } from "@/components/panels/handshake/HandshakeCard";
import { handshakeConversations } from "@/lib/handshake";

export function ConversationsPage() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[14px] font-medium">Agent-to-agent conversations</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          See how customer AI agents interact with your business in real time.
        </p>
      </div>

      {handshakeConversations.map((conversation) => (
        <HandshakeCard key={conversation.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] text-muted-foreground">
                Conversation #{conversation.id}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {conversation.time}
              </p>
            </div>
            <HandshakeBadge tone="neutral">{conversation.action}</HandshakeBadge>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                Customer Agent
              </p>
              <p className="mt-1 text-[13px] leading-relaxed">
                &ldquo;{conversation.customerMessage}&rdquo;
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-2.5">
              <p className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                Business Agent
              </p>
              <p className="mt-1 text-[13px] leading-relaxed">
                &ldquo;{conversation.businessMessage}&rdquo;
              </p>
            </div>
          </div>

          <p className="mt-3 text-[12px] text-muted-foreground">
            Action: {conversation.action}
          </p>
        </HandshakeCard>
      ))}
    </div>
  );
}
