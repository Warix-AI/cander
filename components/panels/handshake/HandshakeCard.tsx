import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { hs } from "@/components/panels/handshake/handshake-ui";

export function HandshakeCard({
  title,
  children,
  highlight,
  className,
}: {
  title?: string;
  children: ReactNode;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(highlight ? hs.callout : hs.card, "p-4", className)}
    >
      {title ? (
        <p className="text-[13px] font-medium tracking-[-0.01em]">{title}</p>
      ) : null}
      {children}
    </section>
  );
}

export function HandshakeBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "warn" | "neutral";
}) {
  const cls =
    tone === "success"
      ? hs.badgeOk
      : tone === "warn"
        ? hs.badgeWarn
        : hs.badgeNeutral;
  return <span className={cls}>{children}</span>;
}
