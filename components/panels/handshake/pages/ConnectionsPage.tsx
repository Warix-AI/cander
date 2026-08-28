import { Row } from "@/components/panels/Bits";
import {
  HandshakeBadge,
  HandshakeCard,
} from "@/components/panels/handshake/HandshakeCard";
import {
  handshakeConnectionCategories,
  handshakeConnections,
} from "@/lib/handshake";

export function ConnectionsPage() {
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-[14px] font-medium">Connect your business systems</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Where your infrastructure meets the AI ecosystem — commerce, CRM,
          calendars, and MCP servers.
        </p>
      </div>

      <Row
        title="Add Connection"
        meta="New"
        leading={
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted text-[14px]">
            +
          </span>
        }
      />

      <HandshakeCard title="Business Connections">
        {handshakeConnections.length ? (
          handshakeConnections.map((connection) => (
          <div
            key={connection.name}
            className="flex items-center justify-between gap-3 border-b border-border px-1 py-3 last:border-0"
          >
            <div className="min-w-0">
              <p className="text-[14px] font-medium">{connection.name}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {connection.category}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="font-mono text-[11px] text-muted-foreground">
                {connection.capabilities} capabilities
              </span>
              <HandshakeBadge tone="success">{connection.status}</HandshakeBadge>
            </div>
          </div>
          ))
        ) : (
          <p className="px-1 py-3 text-[13px] text-muted-foreground">
            No systems connected yet.
          </p>
        )}
      </HandshakeCard>

      <HandshakeCard title="Categories">
        <div className="mt-2 flex flex-wrap gap-2">
          {handshakeConnectionCategories.map((category) => (
            <span
              key={category}
              className="rounded-full border border-border bg-muted/40 px-3 py-1 text-[12px]"
            >
              {category}
            </span>
          ))}
        </div>
      </HandshakeCard>
    </div>
  );
}
