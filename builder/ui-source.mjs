// Website UI-source gate: every meaningful visual surface must originate from
// a 21st template, a 21st component, or a project-derived adaptation of those.
// Glue / engineering code is allowed without provenance.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const UI_MANIFEST_PATH = ".cander/ui-manifest.json";

const VISUAL_BASENAME_RE =
  /^(Hero|Navbar|NavBar|Nav|Header|Footer|Features?|FeatureGrid|Pricing|Faq|FAQ|Contact|Gallery|Testimonials?|CTA|Cta|CallToAction|Sidebar|Team|Stats|StatStrip|LogoCloud|LogoStrip|Marquee|Timeline|Services|About|EmptyState|Dashboard|Settings|Modal|Table|DataTable)([A-Z].*)?$/i;

const GLUE_BASENAME_RE =
  /^(SectionWrapper|AuthGuard|DataProvider|FormController|RouteShell|Providers?|ThemeProvider|QueryProvider|SiteShell|PageShell|Container|ClientOnly|SuspenseBoundary|ErrorBoundary|Analytics|Track)/i;

/**
 * Write the approved UI manifest the coder must respect.
 * @param {string|null|undefined} repoDir
 * @param {Record<string, unknown>} manifest
 */
export function writeUiManifest(repoDir, manifest) {
  if (!repoDir) return null;
  const rel = UI_MANIFEST_PATH;
  const abs = join(repoDir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  const body = {
    version: 1,
    updatedAt: new Date().toISOString(),
    ...manifest,
  };
  writeFileSync(abs, `${JSON.stringify(body, null, 2)}\n`, "utf8");
  return rel;
}

/**
 * @param {string} repoDir
 * @returns {Record<string, unknown>|null}
 */
export function readUiManifest(repoDir) {
  try {
    const abs = join(repoDir, UI_MANIFEST_PATH);
    if (!existsSync(abs)) return null;
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Audit whether website visual UI has approved 21st lineage.
 *
 * @param {{
 *   repoDir: string,
 *   mode?: "create"|"edit",
 *   projectKind?: "site"|"app",
 *   allowNativeSiteUi?: boolean,
 *   selectedTemplate?: Record<string, unknown>|null,
 *   selectedComponents?: Array<Record<string, unknown>>,
 *   designSystem?: Record<string, unknown>|null,
 *   isLegacyNativeSite?: boolean,
 * }} opts
 * @returns {{
 *   ok: boolean,
 *   issues: string[],
 *   metrics: Record<string, unknown>,
 * }}
 */
export function auditUiSource(opts) {
  const issues = [];
  const metrics = {
    templateFetched: false,
    templateInstalled: false,
    templateImported: false,
    templateRendered: false,
    componentFetched: 0,
    componentInstalled: 0,
    componentRendered: 0,
    derivedProjectComponents: 0,
    unauthorizedVisualComponents: [],
    uiSourceAcceptancePassed: false,
    nativeUiUsed: false,
  };

  if (opts.projectKind === "app") {
    metrics.uiSourceAcceptancePassed = true;
    return { ok: true, issues, metrics };
  }
  if (opts.allowNativeSiteUi) {
    metrics.uiSourceAcceptancePassed = true;
    metrics.nativeUiUsed = true;
    return { ok: true, issues, metrics };
  }
  // Legacy sites created before template-first: do not force redesign.
  if (opts.isLegacyNativeSite && opts.mode === "edit") {
    metrics.uiSourceAcceptancePassed = true;
    metrics.nativeUiUsed = true;
    return { ok: true, issues, metrics };
  }

  const repoDir = opts.repoDir;
  const manifest = readUiManifest(repoDir) || {};
  const designSystem = opts.designSystem || {};
  const template =
    opts.selectedTemplate ||
    (manifest.template && typeof manifest.template === "object" ? manifest.template : null) ||
    (designSystem.templateId
      ? {
          componentId: designSystem.templateId,
          name: designSystem.templateName,
          localPath: designSystem.templateRoot,
          files: designSystem.templateFiles,
        }
      : null);

  const templateRoot = String(
    template?.localPath || designSystem.templateRoot || "components/twenty-first/template",
  );
  const templateFiles = Array.isArray(template?.files)
    ? template.files.map(String)
    : Array.isArray(designSystem.templateFiles)
      ? designSystem.templateFiles.map(String)
      : listFilesUnder(repoDir, templateRoot);

  metrics.templateFetched = Boolean(template?.componentId || designSystem.templateId);
  metrics.templateInstalled = templateFiles.some((f) => existsSync(join(repoDir, f))) ||
    existsSync(join(repoDir, templateRoot));

  const selectedComponents = Array.isArray(opts.selectedComponents)
    ? opts.selectedComponents
    : Array.isArray(manifest.approvedComponents)
      ? manifest.approvedComponents
      : [];
  metrics.componentFetched = selectedComponents.length;
  metrics.componentInstalled = selectedComponents.filter((c) => {
    const p = String(c.localPath || "");
    return p && existsSync(join(repoDir, p));
  }).length;

  const sources = collectSourceFiles(repoDir);
  const blob = sources.map((s) => s.content).join("\n");
  const appBlob = sources
    .filter((s) => s.rel.startsWith("app/") || s.rel.startsWith("components/site/"))
    .map((s) => s.content)
    .join("\n");

  // Template rendered = reachable from app routes / site shell.
  const templateMarkers = [
    templateRoot,
    "@/components/twenty-first/template",
    "components/twenty-first/template",
    ...templateFiles
      .map((f) => f.split("/").pop()?.replace(/\.\w+$/, ""))
      .filter((n) => n && n !== "README" && n.length > 2),
  ];
  const templateHit = templateMarkers.some((m) => m && (appBlob.includes(m) || blob.includes(m)));
  metrics.templateImported = templateHit || templateFiles.some((f) => blob.includes(f));
  metrics.templateRendered = Boolean(
    metrics.templateInstalled &&
      (templateHit ||
        /from\s+["']@?\/?components\/twenty-first\/template/i.test(appBlob) ||
        /twenty-first\/template/i.test(appBlob)),
  );

  for (const c of selectedComponents) {
    const local = String(c.localPath || "");
    const base = local.split("/").pop()?.replace(/\.\w+$/, "") || "";
    const hitImport =
      (local &&
        (blob.includes(local) ||
          blob.includes(local.replace(/^components\//, "@/components/")))) ||
      (base && new RegExp(`from\\s+["'][^"']*${escapeReg(base)}["']`).test(blob));
    c.imported = Boolean(hitImport);
    c.usedInRender = Boolean(
      hitImport ||
        (base &&
          (appBlob.includes(base) ||
            new RegExp(`<${escapeReg(base)}\\b`).test(appBlob))),
    );
    if (c.usedInRender) metrics.componentRendered += 1;
  }

  // CREATE must have a rendered 21st template foundation.
  if (opts.mode === "create") {
    if (designSystem.source && designSystem.source !== "21st") {
      issues.push(
        `designSystem.source is "${designSystem.source}" — website CREATE requires source "21st" (no native visual generation).`,
      );
      metrics.nativeUiUsed = designSystem.source === "native";
    }
    if (!metrics.templateInstalled) {
      issues.push("No 21st.dev template files were installed under components/twenty-first/template/.");
    }
    if (!metrics.templateRendered) {
      issues.push(
        "Installed 21st template was never rendered/imported into app routes or site shell — adapt and use the template code.",
      );
    }
    if (!template?.componentId && !designSystem.templateId) {
      issues.push("No templateId recorded in design lineage — website CREATE must select a 21st template.");
    }
  }

  // Selected gap components must actually be used (Truth regression).
  const requiredUnused = selectedComponents.filter(
    (c) => c.required !== false && !c.usedInRender && String(c.localPath || ""),
  );
  if (opts.mode === "create" && requiredUnused.length) {
    for (const c of requiredUnused) {
      issues.push(
        `Selected 21st component "${c.name || c.componentId}" (${c.purpose || "section"}) at ${c.localPath} was never imported/rendered — integrate it or remove it from the approved list after replacing with another 21st component.`,
      );
    }
  }

  // Unauthorized major visual components (no 21st / derived provenance).
  const approvedPaths = new Set(
    [
      ...templateFiles,
      ...selectedComponents.map((c) => String(c.localPath || "")),
      ...(Array.isArray(manifest.approvedComponents)
        ? manifest.approvedComponents.map((c) => String(c.path || c.localPath || ""))
        : []),
      ...(Array.isArray(designSystem.templateFiles) ? designSystem.templateFiles.map(String) : []),
    ].filter(Boolean),
  );
  const provenancePaths = new Set(
    Object.values(designSystem.components || {})
      .map((v) => String(v).split(/\s+/)[0])
      .filter((p) => p.includes("/") || p.endsWith(".tsx")),
  );

  for (const file of sources) {
    if (!isCandidateVisualFile(file.rel)) continue;
    if (/sourceType:\s*["']?derived_project_component/i.test(file.content)) {
      metrics.derivedProjectComponents += 1;
    }
    const base = file.rel.split("/").pop()?.replace(/\.\w+$/, "") || "";
    if (GLUE_BASENAME_RE.test(base)) continue;
    if (!VISUAL_BASENAME_RE.test(base) && !looksLikeMajorVisual(file.content)) continue;

    const hasProvenance =
      /21st\.dev|sourceType:\s*["']?21st_|originalSourceType|derivedFrom|ui-manifest|twenty-first\/template|components\/twenty-first\//i.test(
        file.content,
      ) ||
      approvedPaths.has(file.rel) ||
      provenancePaths.has(file.rel) ||
      /from\s+["'][^"']*twenty-first[^"']*["']/.test(file.content);

    if (!hasProvenance && file.content.length > 400 && countClassNames(file.content) >= 8) {
      metrics.unauthorizedVisualComponents.push(file.rel);
      issues.push(
        `${base} (${file.rel}) has no approved 21st.dev or project-derived UI source. Replace it with the installed template piece, an approved 21st component, or a derivation that records provenance.`,
      );
    }
  }

  if (metrics.unauthorizedVisualComponents.length) {
    metrics.nativeUiUsed = true;
  }

  metrics.uiSourceAcceptancePassed = issues.length === 0;
  return { ok: issues.length === 0, issues, metrics };
}

function isCandidateVisualFile(rel) {
  if (!/\.(tsx|jsx)$/.test(rel)) return false;
  if (rel.startsWith("components/ui/")) return false;
  if (rel.startsWith("components/twenty-first/")) return false;
  if (rel.startsWith("app/api/")) return false;
  if (/\/(actions|schema|types|utils|lib)\./.test(rel)) return false;
  // Page files compose UI — they may invent layout only via imports; skip page.tsx unless huge inline visual.
  if (/\/page\.(tsx|jsx)$/.test(rel)) return false;
  if (/\/layout\.(tsx|jsx)$/.test(rel)) return false;
  if (/\/(loading|error|not-found|template)\.(tsx|jsx)$/.test(rel)) return false;
  return rel.startsWith("components/") || rel.startsWith("app/");
}

function looksLikeMajorVisual(content) {
  const classes = countClassNames(content);
  const hasSections = /<(section|header|footer|nav)\b/i.test(content);
  return classes >= 12 && hasSections && content.length > 600;
}

function countClassNames(content) {
  return (content.match(/className\s*=/g) || []).length;
}

function collectSourceFiles(repoDir) {
  /** @type {Array<{ rel: string, content: string }>} */
  const out = [];
  const walk = (dir, prefix) => {
    let ents = [];
    try {
      ents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (
          e.name === "node_modules" ||
          e.name === ".next" ||
          e.name === ".git" ||
          e.name === "twenty-first"
        ) {
          // Still walk twenty-first for template detection separately — skip deep tree in app walk.
          if (e.name === "twenty-first") continue;
          continue;
        }
        if (e.name.startsWith(".") && e.name !== ".cander") continue;
        walk(abs, rel);
      } else if (/\.(tsx|jsx|ts|js)$/.test(e.name)) {
        try {
          out.push({ rel, content: readFileSync(abs, "utf8") });
        } catch {
          /* skip */
        }
      }
    }
  };
  walk(join(repoDir, "app"), "app");
  walk(join(repoDir, "components"), "components");
  return out;
}

function listFilesUnder(repoDir, root) {
  const abs = join(repoDir, root);
  /** @type {string[]} */
  const out = [];
  const walk = (dir, prefix) => {
    let ents = [];
    try {
      ents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const rel = `${prefix}/${e.name}`;
      if (e.isDirectory()) walk(join(dir, e.name), rel);
      else out.push(rel);
    }
  };
  if (existsSync(abs)) walk(abs, root);
  return out;
}

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Truth-like decision helper used by tests + planner: never choose native when
 * any usable template candidate exists.
 */
export function chooseTemplateOrAbort({ candidates, allowNativeSiteUi }) {
  const usable = (candidates || []).filter(
    (c) => c && (c.artifact?.code || c.artifact?.files?.length || c.code || c.files?.length),
  );
  if (usable.length) {
    return { action: "select", candidate: usable[0] };
  }
  if (allowNativeSiteUi) {
    return { action: "native_override", reason: "allow_native_site_ui" };
  }
  return { action: "abort", reason: "ui_source_unavailable" };
}
