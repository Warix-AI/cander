"use client";

import { type ReactNode } from "react";
import { Globe } from "lucide-react";
import { connectorInfoFor } from "@/lib/connectors/connector-info";
import type { Connector } from "@/lib/types";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

function InfoLink({
  href,
  label,
}: {
  href?: string;
  label: string;
}) {
  if (!href) {
    return <span className="text-[13px] text-muted-foreground">—</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-[13px] text-foreground hover:underline"
    >
      <Globe className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.6} />
      {label}
    </a>
  );
}

export function ConnectorInfoSection({
  item,
  className,
}: {
  item: Connector;
  className?: string;
}) {
  const info = connectorInfoFor(item);

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Capabilities", value: info.capabilities },
    { label: "Developer", value: info.developer },
    { label: "Category", value: info.category },
    { label: "Version", value: info.version },
    {
      label: "Website",
      value: <InfoLink href={info.websiteUrl} label="Open website" />,
    },
    {
      label: "Privacy Policy",
      value: <InfoLink href={info.privacyPolicyUrl} label="View policy" />,
    },
    {
      label: "Terms of Service",
      value: <InfoLink href={info.termsUrl} label="View terms" />,
    },
  ];

  return (
    <div className={cn(className)}>
      <div
        className={cn(
          "divide-y divide-border/70 border border-border/70 dark:divide-white/15 dark:border-white/15",
          SHELL_G3_RADIUS,
        )}
      >
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-4 px-3 py-2.5"
          >
            <span className="shrink-0 text-[13px] text-muted-foreground">
              {row.label}
            </span>
            <span className="min-w-0 text-right text-[13px]">{row.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
        {info.dataNotice}
      </p>
    </div>
  );
}
