import { Loader2 } from "lucide-react";

/** Quiet loading state shared by pinned panels and project collections. */
export function PanelLoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-40 flex-1 flex-col items-center justify-center gap-3 px-6 py-12">
      <Loader2 aria-hidden className="h-5 w-5 animate-spin text-muted-foreground/60 motion-reduce:animate-none" strokeWidth={1.5} />
      <span className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">{label}</span>
    </div>
  );
}
