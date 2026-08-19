/** User-facing labels for Courier’s two views of the same product. */
export const homeView = {
  label: "Home",
  description: "Spaces, chat, and build",
} as const;

export const developmentView = {
  label: "Development",
  description: "Hosting, APIs, and models",
  kicker: "Development",
} as const;

export const developmentIntegrated =
  "Backend, models, and keys are wired into this project already. Courier provisions what it needs — no copying keys or separate setup.";

export const developmentDeepView =
  "Open the Development view for hosting, model catalogs, usage, and workspace-wide runtime — depth grows with your plan.";

export const limitedDevelopment =
  "Development starts on Pro with APIs, keys, and one model. Max adds the catalog, docs, and team deploys. Ultra unlocks production.";

export const fullDevelopment =
  "Production development — full hosting, models, logs, and infrastructure management.";
