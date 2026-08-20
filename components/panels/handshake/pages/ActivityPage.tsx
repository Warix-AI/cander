import { handshakeActivity } from "@/lib/handshake";

export function ActivityPage() {
  return (
    <div className="p-4">
      <ol className="relative space-y-0 border-l border-border pl-4">
        {handshakeActivity.map((event) => (
          <li key={`${event.time}-${event.title}`} className="pb-6 last:pb-0">
            <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-foreground/30" />
            <p className="font-mono text-[11px] text-muted-foreground">{event.time}</p>
            <p className="mt-1 text-[13.5px] leading-relaxed">{event.title}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
