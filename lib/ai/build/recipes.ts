/**
 * Versioned Build recipes — scaffold definitions.
 * Do not silently reapply a newer version onto an existing project.
 */

export type BuildRecipe = {
  recipeId: string;
  recipeVersion: number;
  projectType: "site" | "app" | "dashboard" | "automation";
  title: string;
  pages: Array<{ route: string; title: string; roles: string[] }>;
  sections: string[];
  dependencies: string[];
  seoDefaults?: { sitemap: boolean; structuredData: boolean };
  backend?: string[];
};

export const BUILD_RECIPES: Record<string, BuildRecipe> = {
  "local-business-site": {
    recipeId: "local-business-site",
    recipeVersion: 1,
    projectType: "site",
    title: "Local business site",
    pages: [
      {
        route: "/",
        title: "Home",
        roles: [
          "nav",
          "hero",
          "services",
          "reviews",
          "service_area",
          "cta",
          "contact",
          "footer",
        ],
      },
    ],
    sections: [
      "nav",
      "hero",
      "services",
      "reviews",
      "service_area",
      "cta",
      "contact",
      "footer",
    ],
    dependencies: ["next", "react", "react-dom"],
    seoDefaults: { sitemap: true, structuredData: true },
  },
  "saas-marketing-site": {
    recipeId: "saas-marketing-site",
    recipeVersion: 1,
    projectType: "site",
    title: "SaaS marketing site",
    pages: [
      { route: "/", title: "Home", roles: ["nav", "hero", "features", "cta", "footer"] },
      { route: "/pricing", title: "Pricing", roles: ["nav", "pricing", "footer"] },
    ],
    sections: ["nav", "hero", "features", "pricing", "cta", "footer"],
    dependencies: ["next", "react", "react-dom"],
    seoDefaults: { sitemap: true, structuredData: true },
  },
  "dashboard-app": {
    recipeId: "dashboard-app",
    recipeVersion: 1,
    projectType: "dashboard",
    title: "Dashboard app",
    pages: [
      { route: "/", title: "Overview", roles: ["sidebar", "header", "stats"] },
    ],
    sections: ["sidebar", "header", "stats"],
    dependencies: ["next", "react", "react-dom"],
    backend: ["auth", "profiles"],
  },
  blog: {
    recipeId: "blog",
    recipeVersion: 1,
    projectType: "site",
    title: "Blog",
    pages: [
      { route: "/", title: "Posts", roles: ["nav", "post_list", "footer"] },
    ],
    sections: ["nav", "post_list", "footer"],
    dependencies: ["next", "react", "react-dom"],
    seoDefaults: { sitemap: true, structuredData: true },
  },
  portfolio: {
    recipeId: "portfolio",
    recipeVersion: 1,
    projectType: "site",
    title: "Portfolio",
    pages: [
      { route: "/", title: "Work", roles: ["nav", "hero", "projects", "footer"] },
    ],
    sections: ["nav", "hero", "projects", "footer"],
    dependencies: ["next", "react", "react-dom"],
  },
  "authenticated-saas": {
    recipeId: "authenticated-saas",
    recipeVersion: 1,
    projectType: "app",
    title: "Authenticated SaaS",
    pages: [
      { route: "/", title: "Home", roles: ["nav", "hero", "cta"] },
      { route: "/app", title: "App", roles: ["sidebar", "header"] },
    ],
    sections: ["nav", "hero", "cta", "sidebar", "header"],
    dependencies: ["next", "react", "react-dom", "@supabase/supabase-js"],
    backend: ["auth", "profiles", "rls"],
  },
};

export type BackendRecipe = {
  recipeId: string;
  recipeVersion: number;
  securityChecks: string[];
};

export const BACKEND_RECIPES: Record<string, BackendRecipe> = {
  auth: {
    recipeId: "auth",
    recipeVersion: 1,
    securityChecks: [
      "auth_enabled",
      "no_service_role_in_client",
      "session_cookie_http_only",
    ],
  },
  "auth-google": {
    recipeId: "auth-google",
    recipeVersion: 1,
    securityChecks: [
      "auth_enabled",
      "google_provider_configured",
      "no_service_role_in_client",
    ],
  },
  profiles: {
    recipeId: "profiles",
    recipeVersion: 1,
    securityChecks: ["rls_enabled", "profiles_select_own", "profiles_update_own"],
  },
  roles: {
    recipeId: "roles",
    recipeVersion: 1,
    securityChecks: ["rls_enabled", "role_policies_exist"],
  },
  rls: {
    recipeId: "rls",
    recipeVersion: 1,
    securityChecks: ["rls_enabled", "policies_exist", "anon_matches_intent"],
  },
  crud: {
    recipeId: "crud",
    recipeVersion: 1,
    securityChecks: ["rls_enabled", "policies_exist"],
  },
  storage: {
    recipeId: "storage",
    recipeVersion: 1,
    securityChecks: [
      "storage_policies_exist",
      "no_public_bucket_unless_intended",
    ],
  },
};

export function getBuildRecipe(recipeId: string): BuildRecipe | null {
  return BUILD_RECIPES[recipeId] ?? null;
}

export function getBackendRecipe(recipeId: string): BackendRecipe | null {
  return BACKEND_RECIPES[recipeId] ?? null;
}

/** Refuse silent upgrades when project already pinned to an older version. */
export function canApplyRecipe(
  current: { recipeId?: string; recipeVersion?: number } | null,
  next: BuildRecipe,
): { ok: true } | { ok: false; reason: string } {
  if (!current?.recipeId) return { ok: true };
  if (current.recipeId !== next.recipeId) return { ok: true };
  if ((current.recipeVersion ?? 0) === next.recipeVersion) return { ok: true };
  if ((current.recipeVersion ?? 0) < next.recipeVersion) {
    return {
      ok: false,
      reason: `recipe_version_pinned:${current.recipeVersion}->${next.recipeVersion}`,
    };
  }
  return { ok: true };
}

export function applyRecipeToSpecFields(recipe: BuildRecipe): {
  pages: Array<{ id: string; route: string; title: string; sectionIds: string[] }>;
  sections: Array<{ id: string; role: string; pageId?: string; content?: Record<string, unknown> }>;
  dependencies: string[];
  projectType: BuildRecipe["projectType"];
  recipeId: string;
  recipeVersion: number;
  seo?: { sitemap: boolean; structuredData: boolean };
} {
  const pages = recipe.pages.map((p) => {
    const id = `page_${p.route.replace(/^\//, "") || "home"}`;
    return {
      id,
      route: p.route,
      title: p.title,
      sectionIds: p.roles.map((r) => `sec_${r}`),
    };
  });
  const sections = recipe.sections.map((role) => ({
    id: `sec_${role}`,
    role,
    pageId: pages[0]?.id,
    content:
      role === "nav"
        ? { links: pages.map((p) => p.route) }
        : role === "pricing"
          ? {
              plans: [
                { id: "basic", name: "Basic" },
                { id: "pro", name: "Pro" },
                { id: "enterprise", name: "Enterprise" },
              ],
            }
          : {},
  }));
  return {
    pages,
    sections,
    dependencies: recipe.dependencies,
    projectType: recipe.projectType,
    recipeId: recipe.recipeId,
    recipeVersion: recipe.recipeVersion,
    seo: recipe.seoDefaults,
  };
}

/**
 * Deterministic backend security validation — build success ≠ security proof.
 */
export function validateBackendRecipeSecurity(
  recipeId: string,
  evidence: Record<string, boolean>,
): { ok: boolean; missing: string[] } {
  const recipe = getBackendRecipe(recipeId);
  if (!recipe) return { ok: false, missing: ["unknown_recipe"] };
  const missing = recipe.securityChecks.filter((c) => evidence[c] !== true);
  return { ok: missing.length === 0, missing };
}
