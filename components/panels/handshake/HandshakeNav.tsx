"use client";

import {
  ConnectorFloatingNav,
  ConnectorFloatingNavItem,
} from "@/components/connectors/chrome/ConnectorFloatingNav";
import { handshakeNav, type HandshakeNavId } from "@/lib/handshake";

export function HandshakeNav({
  active,
  onChange,
}: {
  active: HandshakeNavId;
  onChange: (id: HandshakeNavId) => void;
}) {
  return (
    <ConnectorFloatingNav activeId={active} label="Handshake">
      {handshakeNav.map((item) => (
        <ConnectorFloatingNavItem
          key={item.id}
          id={item.id}
          label={item.label}
          active={active === item.id}
          onClick={() => onChange(item.id)}
        />
      ))}
    </ConnectorFloatingNav>
  );
}
