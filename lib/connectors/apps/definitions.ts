/**
 * Non-Google app connectors (Composio) — shared definitions for OAuth, adapters, and panels.
 * Tool slugs / args must match live Composio schemas (validated against API).
 */

export type AppListItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  openUrl?: string;
  /** Optional thumbnail (product images, avatars, etc.). */
  imageUrl?: string;
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
  /**
   * When set, non-empty UI search uses this tool instead of listProvider
   * (e.g. Linear list vs search).
   */
  searchProvider?: string;
  /** Optional query field name when searching via listProvider/searchProvider. */
  searchArg?: string;
  /** Map free-text search into provider-safe args (JQL, SOQL, email-only, etc.). */
  mapSearchQuery?: (query: string) => Record<string, unknown>;
  /** Search field placeholder in the browse chrome. */
  searchPlaceholder?: string;
  /**
   * When true and there is no searchProvider/searchArg, filter list results
   * client-side by title/subtitle (Slack channels, Teams, etc.).
   */
  clientSearch?: boolean;
  /** Optional detail fetch tool. */
  getProvider?: string;
  getIdArg?: string;
  /**
   * Extra agent tools beyond list/search/get (e.g. Stripe invoices, charges).
   * Args are passed through to Composio with light cleanup.
   */
  extraTools?: Array<{
    id: string;
    label: string;
    description: string;
    providerTool: string;
    risk?: "read" | "write" | "destructive";
    confirmationPolicy?: "never" | "when_ambiguous" | "always";
    inputSchema: {
      type: "object";
      required?: string[];
      properties: Record<
        string,
        { type: string | string[]; description?: string; enum?: string[] }
      >;
    };
  }>;
  /**
   * When false, Connect OAuth is hidden until custom auth config is ready
   * (Shopify). Adapters/UI can still be wired.
   */
  oauthReady?: boolean;
};

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "boolean") return value ? "Private" : "Public";
  }
  return undefined;
}

function formatMeta(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
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

function digMeta(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  const nested = [row, asRecord(row.properties), asRecord(row.fields)].filter(
    Boolean,
  ) as Record<string, unknown>[];
  for (const source of nested) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "number") return formatMeta(value);
      if (typeof value === "string") return formatMeta(value);
    }
  }
  return undefined;
}

function notionPageTitle(row: Record<string, unknown>): string | undefined {
  const direct = pickString(row.title, row.name);
  if (direct) return direct;
  const props = asRecord(row.properties);
  if (!props) return undefined;
  for (const value of Object.values(props)) {
    const prop = asRecord(value);
    if (!prop) continue;
    if (prop.type === "title" && Array.isArray(prop.title)) {
      const parts = prop.title
        .map((part) => {
          const item = asRecord(part);
          return pickString(item?.plain_text, asRecord(item?.text)?.content);
        })
        .filter(Boolean);
      if (parts.length) return parts.join("");
    }
    if (Array.isArray(prop.title)) {
      const parts = prop.title
        .map((part) => {
          const item = asRecord(part);
          return pickString(item?.plain_text, asRecord(item?.text)?.content);
        })
        .filter(Boolean);
      if (parts.length) return parts.join("");
    }
  }
  return undefined;
}

function hubspotContactTitle(row: Record<string, unknown>): string | undefined {
  const props = asRecord(row.properties) ?? row;
  const email = pickString(props.email);
  const first = pickString(props.firstname, props.firstName);
  const last = pickString(props.lastname, props.lastName);
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || email || pickString(props.name);
}

function escapeSoqlLike(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeJqlPhrase(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function looksLikeJql(query: string) {
  return /\b(order by|and|or|=|~|IN|WAS|CHANGED)\b/i.test(query);
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
  const meta = opts.metaKeys ? digMeta(row, opts.metaKeys) : undefined;
  const openUrl = opts.openUrlKeys
    ? digString(row, opts.openUrlKeys)
    : undefined;
  return {
    id,
    title,
    subtitle,
    meta,
    openUrl,
    raw: row,
  };
}

const HUBSPOT_CONTACT_PROPERTIES = [
  "email",
  "firstname",
  "lastname",
  "company",
  "jobtitle",
  "phone",
  "lastmodifieddate",
  "createdate",
];

const SALESFORCE_CONTACT_SOQL =
  "SELECT Id, Name, Email, Title, LastModifiedDate FROM Contact ORDER BY LastModifiedDate DESC LIMIT 40";

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
    searchPlaceholder: "Search mail",
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
    listArgs: { limit: 100, exclude_archived: true, types: "public_channel,private_channel" },
    clientSearch: true,
    searchPlaceholder: "Filter channels",
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
    listArgs: { page_size: 40 },
    searchArg: "query",
    searchPlaceholder: "Search pages",
    getProvider: "NOTION_GET_PAGE_MARKDOWN",
    getIdArg: "page_id",
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
    listArgs: {
      limit: 40,
      properties: HUBSPOT_CONTACT_PROPERTIES,
    },
    clientSearch: true,
    searchPlaceholder: "Filter contacts",
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
    listArgs: { per_page: 40, sort: "updated", direction: "desc" },
    clientSearch: true,
    searchPlaceholder: "Filter repositories",
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
    listArgs: { top: 40 },
    clientSearch: true,
    searchPlaceholder: "Filter teams",
    getProvider: "MICROSOFT_TEAMS_TEAMS_LIST_CHANNELS",
    getIdArg: "team_id",
  },
  {
    id: "stripe",
    name: "Stripe",
    toolkit: "stripe",
    authConfigEnv: "COMPOSIO_STRIPE_AUTH_CONFIG_ID",
    category: "Commerce",
    description: "Customers, invoices, charges, and balance",
    actions: [
      "Customers",
      "Invoices",
      "Charges",
      "Payments",
      "Subscriptions",
      "Products",
      "Balance",
    ],
    displayOrder: 26,
    itemNoun: "customers",
    listProvider: "STRIPE_LIST_CUSTOMERS",
    listArgs: { limit: 40 },
    searchArg: "email",
    searchPlaceholder: "Search by email",
    mapSearchQuery: (query) => {
      const q = query.trim();
      if (!q.includes("@")) return {};
      return { email: q };
    },
    getProvider: "STRIPE_RETRIEVE_CUSTOMER",
    getIdArg: "customer_id",
    extraTools: [
      {
        id: "createCustomer",
        label: "Create customer",
        description: "Create a Stripe customer (name, email, phone, description).",
        providerTool: "STRIPE_CREATE_CUSTOMER",
        risk: "write",
        confirmationPolicy: "when_ambiguous",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Customer name." },
            email: { type: "string", description: "Customer email." },
            phone: { type: "string", description: "Customer phone." },
            description: {
              type: "string",
              description: "Optional description / notes.",
            },
          },
        },
      },
      {
        id: "listInvoices",
        label: "List invoices",
        description: "List Stripe invoices, optionally filtered by customer or status.",
        providerTool: "STRIPE_LIST_INVOICES",
        inputSchema: {
          type: "object",
          properties: {
            customer: { type: "string", description: "Stripe customer id (cus_…)." },
            status: {
              type: "string",
              description: "Invoice status filter (draft, open, paid, uncollectible, void).",
            },
            limit: { type: "number", description: "Max results (default 40)." },
          },
        },
      },
      {
        id: "listCharges",
        label: "List charges",
        description: "List Stripe charges, optionally for a customer.",
        providerTool: "STRIPE_LIST_CHARGES",
        inputSchema: {
          type: "object",
          properties: {
            customer: { type: "string", description: "Stripe customer id (cus_…)." },
            limit: { type: "number", description: "Max results (default 40)." },
          },
        },
      },
      {
        id: "listPaymentIntents",
        label: "List payment intents",
        description: "List Stripe PaymentIntents, optionally for a customer.",
        providerTool: "STRIPE_LIST_PAYMENT_INTENTS",
        inputSchema: {
          type: "object",
          properties: {
            customer: { type: "string", description: "Stripe customer id (cus_…)." },
            limit: { type: "number", description: "Max results (default 40)." },
          },
        },
      },
      {
        id: "listSubscriptions",
        label: "List customer subscriptions",
        description: "List active subscriptions for a Stripe customer.",
        providerTool: "STRIPE_LIST_CUSTOMER_SUBSCRIPTIONS",
        inputSchema: {
          type: "object",
          required: ["customer"],
          properties: {
            customer: {
              type: "string",
              description: "Stripe customer id (cus_…).",
            },
            limit: { type: "number", description: "Max results (default 40)." },
          },
        },
      },
      {
        id: "listProducts",
        label: "List products",
        description: "List Stripe products in the catalog.",
        providerTool: "STRIPE_LIST_PRODUCTS",
        inputSchema: {
          type: "object",
          properties: {
            active: {
              type: "boolean",
              description: "If set, only active or inactive products.",
            },
            limit: { type: "number", description: "Max results (default 40)." },
          },
        },
      },
      {
        id: "listPrices",
        label: "List prices",
        description: "List Stripe prices, optionally for a product.",
        providerTool: "STRIPE_LIST_PRICES",
        inputSchema: {
          type: "object",
          properties: {
            product: { type: "string", description: "Stripe product id (prod_…)." },
            active: {
              type: "boolean",
              description: "If set, only active or inactive prices.",
            },
            limit: { type: "number", description: "Max results (default 40)." },
          },
        },
      },
      {
        id: "retrieveBalance",
        label: "Retrieve balance",
        description: "Get the current Stripe account balance.",
        providerTool: "STRIPE_RETRIEVE_BALANCE",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
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
    listArgs: { query: SALESFORCE_CONTACT_SOQL },
    searchArg: "query",
    searchPlaceholder: "Search contacts",
    mapSearchQuery: (query) => {
      const q = query.trim();
      if (!q) return { query: SALESFORCE_CONTACT_SOQL };
      if (/^\s*select\b/i.test(q)) return { query: q };
      const like = escapeSoqlLike(q);
      return {
        query: `SELECT Id, Name, Email, Title, LastModifiedDate FROM Contact WHERE Name LIKE '%${like}%' OR Email LIKE '%${like}%' ORDER BY LastModifiedDate DESC LIMIT 40`,
      };
    },
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
    listArgs: { first: 40 },
    searchProvider: "LINEAR_SEARCH_ISSUES",
    searchArg: "query",
    searchPlaceholder: "Search issues",
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
    listArgs: {
      max_results: 40,
      jql: "order by updated DESC",
      fields: ["summary", "status", "issuetype", "project", "updated", "created"],
    },
    searchArg: "jql",
    searchPlaceholder: "Search issues",
    mapSearchQuery: (query) => {
      const q = query.trim();
      if (!q) return { jql: "order by updated DESC" };
      if (looksLikeJql(q)) return { jql: q };
      return {
        jql: `text ~ "${escapeJqlPhrase(q)}" ORDER BY updated DESC`,
      };
    },
    getProvider: "JIRA_GET_ISSUE",
    getIdArg: "issue_key",
  },
  {
    id: "shopify",
    name: "Shopify",
    toolkit: "shopify",
    authConfigEnv: "COMPOSIO_SHOPIFY_AUTH_CONFIG_ID",
    category: "Commerce",
    description: "Orders, products, and customers",
    actions: ["Orders", "Products", "Customers"],
    displayOrder: 30,
    itemNoun: "products",
    listProvider: "SHOPIFY_GET_PRODUCTS",
    listArgs: { limit: 40 },
    clientSearch: true,
    searchPlaceholder: "Filter products",
    /** Needs custom Composio OAuth client before Connect works. */
    oauthReady: false,
  },
];

export function appConnectorById(
  id: string,
): AppConnectorDefinition | undefined {
  return APP_CONNECTOR_DEFINITIONS.find((item) => item.id === id);
}

export const APP_OAUTH_CONNECTOR_IDS = APP_CONNECTOR_DEFINITIONS.filter(
  (item) => item.oauthReady !== false,
).map((item) => item.id);

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
      case "shopify":
        return extractGenericItems(payload, ["products", "orders", "items", "data"]);
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
        case "slack": {
          const base = normalizeGenericItem(raw, {
            idKeys: ["id", "channel_id", "channel"],
            titleKeys: ["name", "name_normalized"],
            metaKeys: ["updated", "created"],
          });
          if (!base) return null;
          const row = asRecord(raw);
          const topic = asRecord(row?.topic);
          const purpose = asRecord(row?.purpose);
          return {
            ...base,
            title: base.title.startsWith("#") ? base.title : `#${base.title}`,
            subtitle:
              pickString(topic?.value, purpose?.value) ||
              (row?.is_private ? "Private channel" : "Channel"),
          };
        }
        case "notion": {
          const row = asRecord(raw);
          if (!row) return null;
          const id = digString(row, ["id"]);
          if (!id) return null;
          return {
            id,
            title: notionPageTitle(row) || id,
            subtitle: pickString(row.object) || "page",
            meta: formatMeta(
              pickString(
                typeof row.last_edited_time === "string"
                  ? row.last_edited_time
                  : null,
                typeof row.created_time === "string" ? row.created_time : null,
              ),
            ),
            openUrl: pickString(row.url),
            raw: row,
          };
        }
        case "hubspot": {
          const row = asRecord(raw);
          if (!row) return null;
          const id = digString(row, ["id", "contact_id"]);
          if (!id) return null;
          const props = asRecord(row.properties) ?? row;
          return {
            id,
            title: hubspotContactTitle(row) || id,
            subtitle: pickString(props.company, props.jobtitle, props.phone),
            meta: digMeta(row, ["lastmodifieddate", "createdate"]),
            raw: row,
          };
        }
        case "github":
          return normalizeGenericItem(raw, {
            idKeys: ["id", "full_name", "name"],
            titleKeys: ["full_name", "name"],
            subtitleKeys: ["description", "language"],
            metaKeys: ["updated_at", "pushed_at"],
            openUrlKeys: ["html_url"],
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
        case "linear": {
          const base = normalizeGenericItem(raw, {
            idKeys: ["id", "identifier"],
            titleKeys: ["title", "name", "identifier"],
            metaKeys: ["updatedAt", "createdAt"],
            openUrlKeys: ["url"],
          });
          if (!base) return null;
          const row = asRecord(raw);
          const state = asRecord(row?.state);
          const team = asRecord(row?.team);
          return {
            ...base,
            subtitle:
              pickString(state?.name, team?.name, row?.identifier) ||
              base.subtitle,
          };
        }
        case "jira": {
          const row = asRecord(raw);
          const fields = asRecord(row?.fields);
          const status = asRecord(fields?.status);
          const issuetype = asRecord(fields?.issuetype);
          const project = asRecord(fields?.project);
          const key = digString(row ?? {}, ["key", "id"]);
          if (!key) return null;
          const summary =
            (typeof fields?.summary === "string" && fields.summary) ||
            digString(row ?? {}, ["summary"]) ||
            key;
          return {
            id: key,
            title: summary,
            subtitle: pickString(status?.name, issuetype?.name, project?.name),
            meta: formatMeta(
              pickString(
                typeof fields?.updated === "string" ? fields.updated : null,
                typeof fields?.created === "string" ? fields.created : null,
              ),
            ),
            raw: row ?? undefined,
          };
        }
        case "shopify":
          return normalizeGenericItem(raw, {
            idKeys: ["id"],
            titleKeys: ["title", "name"],
            subtitleKeys: ["vendor", "product_type", "status"],
            metaKeys: ["updated_at", "created_at"],
          });
        default:
          return normalizeGenericItem(raw, {
            idKeys: ["id"],
            titleKeys: ["name", "title"],
          });
      }
    })
    .filter((item): item is AppListItem => Boolean(item));
}
