/**
 * Non-Google app connectors (Composio) — shared definitions for OAuth, adapters, and panels.
 */

export type AppListItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  openUrl?: string;
  raw?: Record<string, unknown>;
};

export type AppConnectorDefinition = {
  id: string;
  name: string;
  toolkit: string;
  /** Env var holding Composio auth config id (ac_…). */
  authConfigEnv: string;
  category: string;
  description: string;
  actions: string[];
  displayOrder: number;
  /** Plural noun for empty states, e.g. "channels". */
  itemNoun: string;
  /** Composio tool used for browse list. */
  listProvider: string;
  /** Default args for listProvider. */
  listArgs?: Record<string, unknown>;
  /** Optional query field name when searching. */
  searchArg?: string;
  /** Optional detail fetch tool. */
  getProvider?: string;
  getIdArg?: string;
  /** Build deep-link when possible. */
  openUrlFromItem?: (item: AppListItem) => string | undefined;
};

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function formatMeta(value: string | null | undefined) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

function unwrapList(payload: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }
  const data = asRecord(payload.data);
  if (data) {
    for (const key of keys) {
      const value = data[key];
      if (Array.isArray(value)) return value;
      const nested = asRecord(value);
      if (nested && Array.isArray(nested.nodes)) return nested.nodes;
      if (nested && Array.isArray(nested.items)) return nested.items;
    }
  }
  const results = asRecord(payload.results);
  if (results) {
    for (const key of keys) {
      const value = results[key];
      if (Array.isArray(value)) return value;
    }
  }
  // Linear-style { issues: { nodes: [...] } }
  for (const key of keys) {
    const nested = asRecord(payload[key]);
    if (nested && Array.isArray(nested.nodes)) return nested.nodes;
    if (nested && Array.isArray(nested.items)) return nested.items;
  }
  return [];
}

export function extractGenericItems(
  payload: Record<string, unknown>,
  keys: string[],
): unknown[] {
  return unwrapList(payload, keys);
}

function digString(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const nested = [row, asRecord(row.properties), asRecord(row.fields)].filter(
    Boolean,
  ) as Record<string, unknown>[];
  for (const source of nested) {
    const direct = pickString(...keys.map((k) => source[k]));
    if (direct) return direct;
    // HubSpot / Graph nested objects (e.g. from.emailAddress.name)
    for (const key of keys) {
      const value = source[key];
      const obj = asRecord(value);
      if (!obj) continue;
      const nestedPick = pickString(
        obj.name,
        obj.address,
        obj.email,
        obj.displayName,
        obj.text,
        asRecord(obj.emailAddress)?.name,
        asRecord(obj.emailAddress)?.address,
      );
      if (nestedPick) return nestedPick;
    }
  }
  return undefined;
}

export function normalizeGenericItem(
  raw: unknown,
  opts: {
    idKeys: string[];
    titleKeys: string[];
    subtitleKeys?: string[];
    metaKeys?: string[];
    openUrlKeys?: string[];
  },
): AppListItem | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = digString(row, opts.idKeys);
  if (!id) return null;
  const title =
    digString(row, opts.titleKeys) ||
    pickString(row.summary, row.text, row.body)?.slice(0, 80) ||
    id;
  const subtitle = opts.subtitleKeys
    ? digString(row, opts.subtitleKeys)
    : undefined;
  const metaRaw = opts.metaKeys ? digString(row, opts.metaKeys) : undefined;
  const openUrl = opts.openUrlKeys
    ? digString(row, opts.openUrlKeys)
    : undefined;
  return {
    id,
    title,
    subtitle,
    meta: formatMeta(metaRaw),
    openUrl,
    raw: row,
  };
}

export const APP_CONNECTOR_DEFINITIONS: AppConnectorDefinition[] = [
  {
    id: "outlook",
    name: "Outlook",
    toolkit: "outlook",
    authConfigEnv: "COMPOSIO_OUTLOOK_AUTH_CONFIG_ID",
    category: "Communication",
    description: "Mail, calendar, and contacts for Microsoft 365",
    actions: ["Inbox", "Calendar", "Contacts"],
    displayOrder: 20,
    itemNoun: "messages",
    listProvider: "OUTLOOK_LIST_MESSAGES",
    listArgs: { top: 40 },
    searchArg: "search",
    getProvider: "OUTLOOK_GET_MESSAGE",
    getIdArg: "message_id",
  },
  {
    id: "slack",
    name: "Slack",
    toolkit: "slack",
    authConfigEnv: "COMPOSIO_SLACK_AUTH_CONFIG_ID",
    category: "Communication",
    description: "Search and post in channels",
    actions: ["Channels", "Search", "Post"],
    displayOrder: 21,
    itemNoun: "channels",
    listProvider: "SLACK_LIST_ALL_CHANNELS",
    listArgs: { limit: 100, exclude_archived: true },
    getProvider: "SLACK_FETCH_CONVERSATION_HISTORY",
    getIdArg: "channel",
  },
  {
    id: "notion",
    name: "Notion",
    toolkit: "notion",
    authConfigEnv: "COMPOSIO_NOTION_AUTH_CONFIG_ID",
    category: "Productivity",
    description: "Search pages and databases",
    actions: ["Pages", "Search", "Database"],
    displayOrder: 22,
    itemNoun: "pages",
    listProvider: "NOTION_SEARCH_NOTION_PAGE",
    searchArg: "query",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    toolkit: "hubspot",
    authConfigEnv: "COMPOSIO_HUBSPOT_AUTH_CONFIG_ID",
    category: "Commerce",
    description: "Contacts, deals, and companies",
    actions: ["Contacts", "Deals", "Companies"],
    displayOrder: 23,
    itemNoun: "contacts",
    listProvider: "HUBSPOT_LIST_CONTACTS",
    listArgs: { limit: 40 },
    getProvider: "HUBSPOT_READ_CONTACT",
    getIdArg: "contactId",
  },
  {
    id: "github",
    name: "GitHub",
    toolkit: "github",
    authConfigEnv: "COMPOSIO_GITHUB_AUTH_CONFIG_ID",
    category: "Engineering",
    description: "Repos, pull requests, and issues",
    actions: ["Repos", "PRs", "Issues"],
    displayOrder: 24,
    itemNoun: "repositories",
    listProvider: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
    listArgs: { per_page: 40, sort: "updated" },
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    toolkit: "microsoft_teams",
    authConfigEnv: "COMPOSIO_TEAMS_AUTH_CONFIG_ID",
    category: "Communication",
    description: "Teams, channels, and chat",
    actions: ["Teams", "Channels", "Chat"],
    displayOrder: 25,
    itemNoun: "teams",
    listProvider: "MICROSOFT_TEAMS_TEAMS_LIST",
    getProvider: "MICROSOFT_TEAMS_TEAMS_LIST_CHANNELS",
    getIdArg: "team_id",
  },
  {
    id: "stripe",
    name: "Stripe",
    toolkit: "stripe",
    authConfigEnv: "COMPOSIO_STRIPE_AUTH_CONFIG_ID",
    category: "Commerce",
    description: "Customers, invoices, and balance",
    actions: ["Customers", "Invoices", "Subscriptions"],
    displayOrder: 26,
    itemNoun: "customers",
    listProvider: "STRIPE_LIST_CUSTOMERS",
    listArgs: { limit: 40 },
    searchArg: "email",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    toolkit: "salesforce",
    authConfigEnv: "COMPOSIO_SALESFORCE_AUTH_CONFIG_ID",
    category: "Commerce",
    description: "Accounts, contacts, and opportunities",
    actions: ["Accounts", "Contacts", "Opportunities"],
    displayOrder: 27,
    itemNoun: "contacts",
    listProvider: "SALESFORCE_LIST_CONTACTS",
    getProvider: "SALESFORCE_GET_CONTACT",
    getIdArg: "contact_id",
  },
  {
    id: "linear",
    name: "Linear",
    toolkit: "linear",
    authConfigEnv: "COMPOSIO_LINEAR_AUTH_CONFIG_ID",
    category: "Engineering",
    description: "Issues, projects, and teams",
    actions: ["Issues", "Projects", "Teams"],
    displayOrder: 28,
    itemNoun: "issues",
    listProvider: "LINEAR_LIST_LINEAR_ISSUES",
    getProvider: "LINEAR_GET_LINEAR_ISSUE",
    getIdArg: "issue_id",
  },
  {
    id: "jira",
    name: "Jira",
    toolkit: "jira",
    authConfigEnv: "COMPOSIO_JIRA_AUTH_CONFIG_ID",
    category: "Engineering",
    description: "Projects and issues",
    actions: ["Issues", "Projects", "Search"],
    displayOrder: 29,
    itemNoun: "issues",
    listProvider: "JIRA_SEARCH_FOR_ISSUES_USING_JQL_GET",
    listArgs: { max_results: 40, jql: "order by updated DESC" },
    searchArg: "jql",
    getProvider: "JIRA_GET_ISSUE",
    getIdArg: "issue_key",
  },
];

/** Shopify needs custom Composio OAuth credentials — catalog only until configured. */
export const SHOPIFY_CONNECTOR_STUB = {
  id: "shopify",
  name: "Shopify",
  toolkit: "shopify",
  category: "Commerce",
  description: "Orders, products, and customers",
  actions: ["Orders", "Products", "Customers"],
  displayOrder: 30,
} as const;

export function appConnectorById(
  id: string,
): AppConnectorDefinition | undefined {
  return APP_CONNECTOR_DEFINITIONS.find((item) => item.id === id);
}

export const APP_OAUTH_CONNECTOR_IDS = APP_CONNECTOR_DEFINITIONS.map(
  (item) => item.id,
);

export function normalizeItemsForConnector(
  connectorId: string,
  payload: Record<string, unknown>,
): AppListItem[] {
  const items = (() => {
    switch (connectorId) {
      case "outlook":
        return extractGenericItems(payload, ["value", "messages", "items"]);
      case "slack":
        return extractGenericItems(payload, [
          "channels",
          "conversations",
          "items",
        ]);
      case "notion":
        return extractGenericItems(payload, ["results", "pages", "items"]);
      case "hubspot":
        return extractGenericItems(payload, ["results", "contacts", "items"]);
      case "github":
        return extractGenericItems(payload, ["repositories", "items", "data"]);
      case "teams":
        return extractGenericItems(payload, ["value", "teams", "items"]);
      case "stripe":
        return extractGenericItems(payload, ["data", "customers", "items"]);
      case "salesforce":
        return extractGenericItems(payload, [
          "records",
          "contacts",
          "items",
          "data",
        ]);
      case "linear":
        return extractGenericItems(payload, ["issues", "nodes", "items"]);
      case "jira":
        return extractGenericItems(payload, ["issues", "values", "items"]);
      default:
        return extractGenericItems(payload, ["items", "data", "results"]);
    }
  })();

  return items
    .map((raw) => {
      switch (connectorId) {
        case "outlook":
          return normalizeGenericItem(raw, {
            idKeys: ["id"],
            titleKeys: ["subject"],
            subtitleKeys: ["from", "sender", "bodyPreview"],
            metaKeys: ["receivedDateTime", "sentDateTime"],
            openUrlKeys: ["webLink"],
          });
        case "slack":
          return normalizeGenericItem(raw, {
            idKeys: ["id", "channel_id", "channel"],
            titleKeys: ["name", "name_normalized"],
            subtitleKeys: ["topic", "purpose", "is_private"],
            metaKeys: ["updated", "created"],
          });
        case "notion":
          return normalizeGenericItem(raw, {
            idKeys: ["id"],
            titleKeys: ["title", "name"],
            subtitleKeys: ["object", "url"],
            metaKeys: ["last_edited_time", "created_time"],
            openUrlKeys: ["url"],
          });
        case "hubspot":
          return normalizeGenericItem(raw, {
            idKeys: ["id", "contact_id"],
            titleKeys: ["email", "firstname", "lastname", "name"],
            subtitleKeys: ["company", "jobtitle", "phone"],
            metaKeys: ["lastmodifieddate", "createdate"],
          });
        case "github":
          return normalizeGenericItem(raw, {
            idKeys: ["id", "full_name", "name"],
            titleKeys: ["full_name", "name"],
            subtitleKeys: ["description", "language"],
            metaKeys: ["updated_at", "pushed_at"],
            openUrlKeys: ["html_url", "url"],
          });
        case "teams":
          return normalizeGenericItem(raw, {
            idKeys: ["id"],
            titleKeys: ["displayName", "name"],
            subtitleKeys: ["description"],
            metaKeys: ["createdDateTime"],
          });
        case "stripe":
          return normalizeGenericItem(raw, {
            idKeys: ["id"],
            titleKeys: ["name", "email", "description"],
            subtitleKeys: ["email", "description"],
            metaKeys: ["created"],
          });
        case "salesforce":
          return normalizeGenericItem(raw, {
            idKeys: ["Id", "id"],
            titleKeys: ["Name", "name", "Email"],
            subtitleKeys: ["Email", "Title", "AccountId"],
            metaKeys: ["LastModifiedDate", "CreatedDate"],
          });
        case "linear":
          return normalizeGenericItem(raw, {
            idKeys: ["id", "identifier"],
            titleKeys: ["title", "name", "identifier"],
            subtitleKeys: ["description", "state", "team"],
            metaKeys: ["updatedAt", "createdAt"],
            openUrlKeys: ["url"],
          });
        case "jira": {
          const row = asRecord(raw);
          const fields = asRecord(row?.fields);
          const status = asRecord(fields?.status);
          const issuetype = asRecord(fields?.issuetype);
          const project = asRecord(fields?.project);
          const base = normalizeGenericItem(raw, {
            idKeys: ["key", "id"],
            titleKeys: ["summary", "key", "name"],
            subtitleKeys: ["status", "issuetype", "project"],
            metaKeys: ["updated", "created"],
          });
          if (!base) return null;
          return {
            ...base,
            title:
              digString(row ?? {}, ["summary"]) ||
              (typeof fields?.summary === "string" ? fields.summary : null) ||
              base.title,
            subtitle:
              pickString(status?.name, issuetype?.name, project?.name) ||
              base.subtitle,
            meta:
              formatMeta(
                pickString(
                  typeof fields?.updated === "string" ? fields.updated : null,
                  typeof fields?.created === "string" ? fields.created : null,
                ),
              ) || base.meta,
          };
        }
        default:
          return normalizeGenericItem(raw, {
            idKeys: ["id"],
            titleKeys: ["name", "title"],
          });
      }
    })
    .filter((item): item is AppListItem => Boolean(item));
}
