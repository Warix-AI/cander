/**
 * Shared Cander connector chrome — shell, lists, empty states, floating nav.
 * Product-specific screens stay in each connector view; reuse these for the frame.
 */

export {
  WorkspacePanelFrame,
  WorkspaceEmptyState,
  WorkspaceListRow,
  WorkspaceField,
  type WorkspaceToolbarState,
} from "@/components/connectors/views/WorkspaceViewChrome";

export {
  CONNECTOR_FLOATING_NAV_PAD,
  ConnectorFloatingNav,
  ConnectorFloatingNavItem,
} from "@/components/connectors/chrome/ConnectorFloatingNav";

export {
  ConnectorSectionNavLayout,
  type ConnectorSectionNavItem,
} from "@/components/connectors/chrome/ConnectorSectionNav";
