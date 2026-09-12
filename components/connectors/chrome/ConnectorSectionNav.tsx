"use client";

import {
  CONNECTOR_FLOATING_NAV_PAD,
  ConnectorFloatingNav,
  ConnectorFloatingNavItem,
} from "@/components/connectors/chrome/ConnectorFloatingNav";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type ConnectorSectionNavItem = {
  id: string;
  label: string;
};

/**
 * Multi-section connector layout: content + shared floating bottom nav.
 * Only use when the connector has multiple primary destinations.
 */
export function ConnectorSectionNavLayout({
  items,
  activeId,
  onChange,
  label = "Sections",
  children,
  className,
}: {
  items: ConnectorSectionNavItem[];
  activeId: string;
  onChange: (id: string) => void;
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col",
        CONNECTOR_FLOATING_NAV_PAD,
        className,
      )}
    >
      <ConnectorFloatingNav activeId={activeId} label={label}>
        {items.map((item) => (
          <ConnectorFloatingNavItem
            key={item.id}
            id={item.id}
            label={item.label}
            active={activeId === item.id}
            onClick={() => {
              if (item.id !== activeId) onChange(item.id);
            }}
          />
        ))}
      </ConnectorFloatingNav>
      {children}
    </div>
  );
}
