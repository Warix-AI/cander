import type { SiteTheme } from "@/lib/ai/build/site-spec";

export function emitGlobalsCss(theme: SiteTheme): string {
  const sectionY =
    theme.spacingScale === "airy"
      ? "5.5rem"
      : theme.spacingScale === "compact"
        ? "3.25rem"
        : "4.5rem";
  return `@import "tailwindcss";

/* Cander site tokens — generated from SiteSpec */
:root {
  --c-primary: ${theme.primary};
  --c-primary-fg: ${theme.primaryForeground};
  --c-accent: ${theme.accent};
  --c-bg: ${theme.background};
  --c-fg: ${theme.foreground};
  --c-muted: ${theme.muted};
  --c-muted-fg: ${theme.mutedForeground};
  --c-border: ${theme.border};
  --c-radius: ${theme.radius};
  --c-font-display: ${theme.fontDisplay};
  --c-font-body: ${theme.fontBody};
  --c-section-y: ${sectionY};
  --c-max: 1120px;
}

*,
*::before,
*::after { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  font-family: var(--c-font-body);
  color: var(--c-fg);
  background: var(--c-bg);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; }

img { max-width: 100%; display: block; }

h1, h2, h3 {
  font-family: var(--c-font-display);
  line-height: 1.12;
  letter-spacing: -0.03em;
  margin: 0 0 0.6rem;
}

p { margin: 0 0 1rem; color: var(--c-muted-fg); }

.container {
  width: min(100% - 2rem, var(--c-max));
  margin-inline: auto;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.75rem;
  padding: 0.7rem 1.25rem;
  border-radius: var(--c-radius);
  background: var(--c-primary);
  color: var(--c-primary-fg);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  border: none;
  cursor: pointer;
}

.btn-secondary {
  background: transparent;
  color: var(--c-fg);
  border: 1px solid var(--c-border);
}

.section {
  padding: var(--c-section-y) 0;
  border-top: 1px solid var(--c-border);
}

.section-title {
  font-size: clamp(1.6rem, 3vw, 2.35rem);
  max-width: 18ch;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--c-muted-fg);
  margin-bottom: 0.75rem;
}

.grid-3 {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: 1fr;
}
@media (min-width: 768px) {
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
}

.grid-2 {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: 1fr;
}

.card {
  background: var(--c-muted);
  border: 1px solid var(--c-border);
  border-radius: calc(var(--c-radius) + 4px);
  padding: 1.25rem;
}

.media-slot {
  min-height: 280px;
  border-radius: calc(var(--c-radius) + 6px);
  background:
    radial-gradient(circle at 20% 20%, color-mix(in oklab, var(--c-accent) 35%, transparent), transparent 50%),
    radial-gradient(circle at 80% 60%, color-mix(in oklab, var(--c-primary) 28%, transparent), transparent 45%),
    linear-gradient(145deg, var(--c-muted), color-mix(in oklab, var(--c-primary) 12%, var(--c-bg)));
  border: 1px solid var(--c-border);
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 40;
  backdrop-filter: blur(10px);
  background: color-mix(in oklab, var(--c-bg) 86%, transparent);
  border-bottom: 1px solid var(--c-border);
}

.site-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 4rem;
}

.brand {
  font-family: var(--c-font-display);
  font-weight: 700;
  letter-spacing: -0.03em;
  text-decoration: none;
  font-size: 1.05rem;
}

.nav {
  display: none;
  gap: 1.25rem;
  align-items: center;
}
.nav a {
  text-decoration: none;
  color: var(--c-muted-fg);
  font-size: 0.92rem;
}
.nav a:hover { color: var(--c-fg); }

@media (min-width: 860px) {
  .nav { display: flex; }
  .nav-mobile-summary { display: none; }
}

.nav-mobile-summary {
  font-size: 0.85rem;
  color: var(--c-muted-fg);
}

.hero {
  padding: clamp(3rem, 8vw, 6rem) 0 calc(var(--c-section-y) * 0.85);
}

.hero-grid {
  display: grid;
  gap: 2rem;
  align-items: center;
}
@media (min-width: 900px) {
  .hero-grid.split { grid-template-columns: 1.05fr 0.95fr; }
}

.hero h1 {
  font-size: clamp(2.4rem, 6vw, 4.2rem);
  max-width: 14ch;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.hero.dark {
  background: #0c0f0e;
  color: #f4f7f5;
}
.hero.dark p { color: #b7c2bc; }

.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}
.stat-row strong {
  display: block;
  font-size: clamp(1.4rem, 3vw, 2rem);
  font-family: var(--c-font-display);
}

.site-footer {
  border-top: 1px solid var(--c-border);
  padding: 3rem 0 2rem;
  background: var(--c-muted);
}

.footer-grid {
  display: grid;
  gap: 1.5rem;
}
@media (min-width: 800px) {
  .footer-grid.cols { grid-template-columns: 1.4fr 1fr 1fr; }
}

.footer-bottom {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--c-border);
  color: var(--c-muted-fg);
  font-size: 0.85rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

details.faq {
  border: 1px solid var(--c-border);
  border-radius: calc(var(--c-radius) + 2px);
  padding: 0.9rem 1rem;
  background: var(--c-bg);
}
details.faq + details.faq { margin-top: 0.65rem; }
details.faq summary {
  cursor: pointer;
  font-weight: 600;
}
details.faq p { margin: 0.75rem 0 0; }

.form-card {
  display: grid;
  gap: 0.75rem;
}
.form-card input,
.form-card textarea {
  width: 100%;
  border: 1px solid var(--c-border);
  border-radius: calc(var(--c-radius) + 2px);
  padding: 0.8rem 0.9rem;
  font: inherit;
  background: var(--c-bg);
  color: var(--c-fg);
}
`;
}
