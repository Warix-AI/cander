import { handshakeContext } from "@/lib/handshake";

export function ContextPage() {
  return (
    <div className="space-y-4 p-4">
      <section className="rounded-[10px] border border-border bg-card p-5">
        <Row label="User Intent" value={handshakeContext.intent} />
        <Row label="Preferences" value={handshakeContext.preferences} />
        <Row label="History" value={handshakeContext.history} />
      </section>
      <p className="rounded-[10px] border border-border bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
        {handshakeContext.note}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border/70 py-3 last:border-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-[14px] leading-relaxed">{value}</p>
    </div>
  );
}
