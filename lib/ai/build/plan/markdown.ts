/**
 * Render private BuildPlan markdown from JSON (single writer).
 * Never commit this markdown to customer repos by default.
 */

import type { BuildPlanJson } from "./types.ts";

export function renderBuildPlanMarkdown(plan: BuildPlanJson): string {
  const lines: string[] = [
    "# Build plan",
    "",
    "## Sitemap",
    ...plan.sitemap.map(
      (p) => `- \`${p.path}\` — ${p.title}${p.purpose ? ` (${p.purpose})` : ""}`,
    ),
    "",
    "## Navigation",
    ...plan.nav.map((n) => `- [${n.label}](${n.href})`),
    "",
  ];

  if (plan.ctaStrategy?.primary) {
    lines.push(
      "## CTAs",
      `- Primary: ${plan.ctaStrategy.primary.label} → ${plan.ctaStrategy.primary.href}`,
    );
    if (plan.ctaStrategy.secondary) {
      lines.push(
        `- Secondary: ${plan.ctaStrategy.secondary.label} → ${plan.ctaStrategy.secondary.href}`,
      );
    }
    lines.push("");
  }

  if (plan.designSystem) {
    lines.push("## Design system");
    if (plan.designSystem.layoutStyle) {
      lines.push(`- Layout: ${plan.designSystem.layoutStyle}`);
    }
    if (plan.designSystem.typography) {
      lines.push(`- Type: ${plan.designSystem.typography}`);
    }
    if (plan.designSystem.colorMood) {
      lines.push(`- Color: ${plan.designSystem.colorMood}`);
    }
    if (plan.designSystem.notes) {
      lines.push(`- Notes: ${plan.designSystem.notes}`);
    }
    lines.push("");
  }

  lines.push("## Pages");
  for (const page of plan.pages) {
    lines.push(`### ${page.title} (\`${page.path}\`)`);
    if (page.description) lines.push(page.description);
    for (const section of page.sections) {
      lines.push(
        `- **${section.role}**${section.title ? `: ${section.title}` : ""}${
          section.purpose ? ` — ${section.purpose}` : ""
        }`,
      );
    }
    lines.push("");
  }

  if (plan.componentNeeds.length) {
    lines.push("## Component needs");
    for (const need of plan.componentNeeds) {
      lines.push(
        `- **${need.role}**: ${need.designIntent}${
          need.pageId ? ` (page: ${need.pageId})` : ""
        }`,
      );
    }
    lines.push("");
  }

  if (plan.validationChecklist.length) {
    lines.push("## Validation checklist");
    for (const item of plan.validationChecklist) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}
