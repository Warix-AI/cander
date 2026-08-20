import { handshakePermissions } from "@/lib/handshake";

export function PermissionsPage() {
  return (
    <div className="space-y-5 p-4">
      <section className="rounded-[10px] border border-border bg-card p-4">
        <p className="text-[13px] font-medium">User Context Permissions</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-chart-2">
              Allowed
            </p>
            <ul className="mt-2 space-y-1 text-[13px]">
              {handshakePermissions.userContext.allowed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-chart-3">
              Restricted
            </p>
            <ul className="mt-2 space-y-1 text-[13px] text-muted-foreground">
              {handshakePermissions.userContext.restricted.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-[10px] border border-border bg-card p-4">
        <p className="text-[13px] font-medium">Action Permissions</p>
        <ul className="mt-3 space-y-2">
          {handshakePermissions.actions.map((action) => (
            <li
              key={action.name}
              className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2.5 text-[13px]"
            >
              <span className="font-medium">{action.name}</span>
              <span className="text-muted-foreground">{action.mode}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
