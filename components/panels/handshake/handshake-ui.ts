/** Handshake panel — distinct from chat `bg-background`. */
export const hs = {
  /** Slightly off-gray vs chat canvas; uses sidebar token. */
  panel: "bg-sidebar",
  card: "rounded-[10px] border border-border bg-background",
  cardMuted: "rounded-[10px] border border-border bg-muted/40",
  callout:
    "rounded-[10px] border border-border bg-background text-muted-foreground",
  navActive: "bg-background text-foreground shadow-sm",
  navIdle:
    "text-muted-foreground hover:bg-background/60 hover:text-foreground",
  badgeOk:
    "rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-foreground",
  badgeWarn:
    "rounded-full border border-chart-3/30 bg-chart-3/10 px-2 py-0.5 text-[10px] font-medium text-chart-3",
  badgeNeutral:
    "rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground",
  statusActive:
    "font-mono text-[11px] font-semibold tracking-[0.12em] text-emerald-600 dark:text-emerald-400",
} as const;
