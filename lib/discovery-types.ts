import type { BillingPlan, PlatformNav, SpaceId } from "./types";

export type DiscoveryCategory =
  | "connector"
  | "automation"
  | "feature"
  | "workflow"
  | "space"
  | "development"
  | "hosting"
  | "collaboration"
  | "tip"
  | "new_feature";

export type DiscoverySection =
  | "recommended"
  | "get-things-done"
  | "connect"
  | "automate"
  | "explore"
  | "private-ai";

export type DiscoveryStatus =
  | "unseen"
  | "shown"
  | "opened"
  | "dismissed"
  | "tried"
  | "completed"
  | "already_used";

export type DiscoveryCtaKind =
  | "openSpace"
  | "openConnector"
  | "openBrowser"
  | "openPlatform"
  | "newChat"
  | "openDiscovery"
  | "prompt";

export type DiscoveryAction = {
  kind: DiscoveryCtaKind;
  /** Space, connector, platform nav, or prompt text depending on kind. */
  target?: string;
  label: string;
};

export type DiscoveryStep = {
  title: string;
  body: string;
  action?: DiscoveryAction;
};

export type DiscoveryItem = {
  id: string;
  category: DiscoveryCategory;
  sections: DiscoverySection[];
  /** Full title for cards / modal. */
  title: string;
  /** 3–6 word sidebar line. */
  shortLabel: string;
  description: string;
  /** Lucide key or connector id when iconKind is connector. */
  icon: string;
  iconKind: "lucide" | "connector";
  priority: number;
  tags: string[];
  badge?: string;
  requiredPlan?: BillingPlan[];
  requiredConnector?: string;
  requiredSpace?: SpaceId;
  completionKey?: string;
  cooldownDays?: number;
  examplePrompt?: string;
  cta: DiscoveryAction;
  steps?: DiscoveryStep[];
};

export type DiscoveryHistoryEntry = {
  id: string;
  status: DiscoveryStatus;
  updatedAt: string;
};

export type DiscoveryState = {
  dailyDiscoveryItem: string | null;
  dailyDiscoveryDate: string | null;
  /** Whether today's full-screen modal was already offered. */
  dailyModalShownDate: string | null;
  history: Record<string, DiscoveryHistoryEntry>;
  completedKeys: string[];
};

export type DiscoveryContext = {
  billingPlan: BillingPlan;
  installedConnectors: string[];
  visitedSpaces: SpaceId[];
  product: "courier" | "platform";
  platformNavAllowed: (id: PlatformNav) => boolean;
};
