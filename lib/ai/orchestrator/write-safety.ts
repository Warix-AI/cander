/**
 * Write safety — operation ids, risk tiers, reconcilability (v4 §8).
 */

export type WriteRiskTier = "low" | "medium" | "high";

export type WriteReconcilability = "RECONCILABLE" | "NON_RECONCILABLE";

export type WriteOperationStatus =
  | "pending"
  | "committed"
  | "unknown"
  | "failed"
  | "blocked";

export type WriteToolPolicy = {
  toolName: string;
  riskTier: WriteRiskTier;
  reconcilability: WriteReconcilability;
  requiresConfirmation: boolean;
};

export type WriteOperation = {
  operationId: string;
  toolName: string;
  riskTier: WriteRiskTier;
  reconcilability: WriteReconcilability;
  requiresConfirmation: boolean;
  status: WriteOperationStatus;
  createdAt: number;
};

const WRITE_POLICIES: Record<string, WriteToolPolicy> = {
  "calendar.create": {
    toolName: "calendar.create",
    riskTier: "medium",
    reconcilability: "RECONCILABLE",
    requiresConfirmation: false,
  },
  "calendar.update": {
    toolName: "calendar.update",
    riskTier: "medium",
    reconcilability: "RECONCILABLE",
    requiresConfirmation: false,
  },
  "email.send": {
    toolName: "email.send",
    riskTier: "high",
    reconcilability: "NON_RECONCILABLE",
    requiresConfirmation: true,
  },
  "email.draft": {
    toolName: "email.draft",
    riskTier: "low",
    reconcilability: "RECONCILABLE",
    requiresConfirmation: false,
  },
  "project.create": {
    toolName: "project.create",
    riskTier: "medium",
    reconcilability: "RECONCILABLE",
    requiresConfirmation: false,
  },
  "deploy.publish": {
    toolName: "deploy.publish",
    riskTier: "high",
    reconcilability: "NON_RECONCILABLE",
    requiresConfirmation: true,
  },
};

let opSeq = 0;

export function classifyWriteTool(toolName: string): WriteToolPolicy | null {
  if (WRITE_POLICIES[toolName]) return WRITE_POLICIES[toolName]!;
  if (
    /^(email\.|calendar\.|deploy\.|crm\.|hubspot\.)/.test(toolName) &&
    /(send|delete|publish|remove|destroy)/i.test(toolName)
  ) {
    return {
      toolName,
      riskTier: "high",
      reconcilability: toolName.startsWith("email.")
        ? "NON_RECONCILABLE"
        : "RECONCILABLE",
      requiresConfirmation: true,
    };
  }
  if (/^(email\.|calendar\.|crm\.|project\.)/.test(toolName)) {
    return {
      toolName,
      riskTier: "medium",
      reconcilability: "RECONCILABLE",
      requiresConfirmation: false,
    };
  }
  return null;
}

export function isWriteTool(toolName: string): boolean {
  return classifyWriteTool(toolName) != null;
}

export function createWriteOperation(toolName: string): WriteOperation | null {
  const policy = classifyWriteTool(toolName);
  if (!policy) return null;
  opSeq += 1;
  return {
    operationId: `wo_${Date.now()}_${opSeq}`,
    toolName: policy.toolName,
    riskTier: policy.riskTier,
    reconcilability: policy.reconcilability,
    requiresConfirmation: policy.requiresConfirmation,
    status: policy.requiresConfirmation ? "blocked" : "pending",
    createdAt: Date.now(),
  };
}

/** NON_RECONCILABLE writes must never auto-retry on UNKNOWN. */
export function retryPolicyForWrite(
  op: WriteOperation,
): "reconcile" | "never_auto_retry" {
  return op.reconcilability === "NON_RECONCILABLE"
    ? "never_auto_retry"
    : "reconcile";
}
