/**
 * Normalized tool types for the scalable connector runtime.
 * Model / Runtime / Provider / Result stay separate.
 */

export type CapabilityFamily =
  | "email"
  | "calendar"
  | "CRM"
  | "messaging"
  | "files"
  | "project_management"
  | "commerce"
  | "internal";

export type ToolRisk = "read" | "write" | "destructive";

/** Whether the user must approve before the runtime executes. */
export type ConfirmationPolicy = "never" | "when_ambiguous" | "always";

export type JsonSchemaProperty = {
  type: string | string[];
  description?: string;
  enum?: string[];
  items?: { type: string };
};

export type JsonSchema = {
  type: "object";
  required?: string[];
  properties: Record<string, JsonSchemaProperty>;
};

export type CanderTool = {
  id: string;
  connectorId?: string;
  capabilityFamily: CapabilityFamily;
  category: string;
  label: string;
  description: string;
  inputSchema: JsonSchema;
  risk: ToolRisk;
  confirmationPolicy: ConfirmationPolicy;
  defaultEnabled: boolean;
  /** Provider-specific slug (e.g. Composio GMAIL_SEND_EMAIL). */
  providerTool?: string;
};

export type ToolReference = {
  type: string;
  id: string;
  label?: string;
  metadata?: Record<string, unknown>;
};

export type ToolExecutionResult = {
  status: "success" | "error" | "denied";
  toolId: string;
  connectionId?: string;
  toolCallId: string;
  idempotencyKey: string;
  data?: unknown;
  references?: ToolReference[];
  error?: {
    code: string;
    message: string;
  };
};

export type CapabilityAccountSnapshot = {
  connectionId: string;
  label: string;
  status: "active" | "pending" | "failed" | "disconnected";
  capabilities: Record<string, boolean>;
};

export type CapabilityConnectorSnapshot = {
  connectorId: string;
  label: string;
  capabilityFamily: CapabilityFamily;
  accounts: CapabilityAccountSnapshot[];
};

export type CapabilitySnapshot = {
  connectors: CapabilityConnectorSnapshot[];
  families: Partial<
    Record<
      CapabilityFamily,
      {
        connected: boolean;
        connectorIds: string[];
        accounts: CapabilityAccountSnapshot[];
      }
    >
  >;
};

export type AuthzDenialReason =
  | "skill_disabled"
  | "not_connected"
  | "connector_disabled"
  | "account_ambiguous"
  | "confirmation_required"
  | "not_allowed"
  | "rate_limited";

export type AuthzDenial = {
  ok: false;
  reason: AuthzDenialReason;
  connectorId?: string;
  skillId?: string;
  enableAction?: { connectorId: string; skillId: string };
  candidates?: Array<{ connectionId: string; label: string }>;
  preview?: Record<string, unknown>;
  message: string;
};

export type AuthzOk = { ok: true; connectionId: string };

export type AuthzResult = AuthzOk | AuthzDenial;
