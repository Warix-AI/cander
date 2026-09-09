/**
 * Deterministic SiteSpec → Next.js App Router file tree.
 */

import type { ScaffoldFile, SiteSection, SiteSpec } from "@/lib/ai/build/site-spec";
import { resolveHeroVariant } from "@/lib/ai/build/site-spec";
import { emitGlobalsCss } from "@/lib/ai/build/design-system/tokens";
import { canonicalSitePackageJsonText } from "@/lib/ai/build/site-package";
import { siteSupportScaffoldFiles } from "@/lib/ai/build/site-support-files";

function esc(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function jsStr(value: string): string {
  return JSON.stringify(value);
}

function emitHeader(spec: SiteSpec): string {
  const links = spec.nav
    .map((n) => `<a href=${jsStr(n.href)}>${esc(n.label)}</a>`)
    .join("\n          ");
  const cta =
    spec.headerVariant === "sticky-minimal"
      ? ""
      : `<a className="btn" href=${jsStr(spec.ctaPrimary.href)}>${esc(spec.ctaPrimary.label)}</a>`;

  if (spec.headerVariant === "centered-brand") {
    return `
    <header className="site-header">
      <div className="container" style={{ paddingTop: 14, paddingBottom: 14, textAlign: "center" }}>
        <a className="brand" href="/">${esc(spec.businessName)}</a>
        <nav className="nav" style={{ justifyContent: "center", marginTop: 12 }}>
          ${links}
        </nav>
        <div style={{ marginTop: 12 }}>${cta || `<span className="nav-mobile-summary">${esc(spec.tagline)}</span>`}</div>
      </div>
    </header>`;
  }

  return `
    <header className="site-header">
      <div className="container site-header-inner">
        <a className="brand" href="/">${esc(spec.businessName)}</a>
        <nav className="nav">
          ${links}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="nav-mobile-summary">${esc(spec.phone || spec.tagline)}</span>
          ${cta}
        </div>
      </div>
    </header>`;
}

function emitHero(spec: SiteSpec, section: SiteSection): string {
  const variant = resolveHeroVariant(section);
  const secondary = spec.ctaSecondary
    ? `<a className="btn btn-secondary" href=${jsStr(spec.ctaSecondary.href)}>${esc(spec.ctaSecondary.label)}</a>`
    : "";
  const primary = `<a className="btn" href=${jsStr(section.ctaHref || spec.ctaPrimary.href)}>${esc(section.ctaLabel || spec.ctaPrimary.label)}</a>`;
  const media = `<div className="media-slot" data-image-slot=${jsStr(section.imageSlot || `hero-${variant}`)} aria-hidden="true" />`;

  if (variant === "centered-bold") {
    return `
    <section className="hero">
      <div className="container" style={{ textAlign: "center" }}>
        ${section.eyebrow ? `<p className="eyebrow">${esc(section.eyebrow)}</p>` : ""}
        <h1 style={{ maxWidth: "16ch", marginInline: "auto" }}>${esc(section.title)}</h1>
        <p style={{ maxWidth: "42ch", marginInline: "auto" }}>${esc(section.body || spec.tagline)}</p>
        <div className="hero-actions" style={{ justifyContent: "center" }}>${primary}${secondary}</div>
        <div style={{ marginTop: 32, maxWidth: 720, marginInline: "auto" }}>${media}</div>
      </div>
    </section>`;
  }

  if (variant === "dark-overlay") {
    return `
    <section className="hero dark">
      <div className="container hero-grid split">
        <div>
          ${section.eyebrow ? `<p className="eyebrow">${esc(section.eyebrow)}</p>` : ""}
          <h1>${esc(section.title)}</h1>
          <p>${esc(section.body || spec.tagline)}</p>
          <div className="hero-actions">${primary}${secondary}</div>
        </div>
        ${media}
      </div>
    </section>`;
  }

  if (variant === "editorial-left") {
    return `
    <section className="hero">
      <div className="container">
        ${section.eyebrow ? `<p className="eyebrow">${esc(section.eyebrow)}</p>` : ""}
        <h1 style={{ maxWidth: "18ch" }}>${esc(section.title)}</h1>
        <div className="hero-grid split" style={{ marginTop: 28 }}>
          <div>
            <p style={{ fontSize: "1.1rem", maxWidth: "40ch" }}>${esc(section.body || spec.tagline)}</p>
            <div className="hero-actions">${primary}${secondary}</div>
          </div>
          ${media}
        </div>
      </div>
    </section>`;
  }

  return `
    <section className="hero">
      <div className="container hero-grid split">
        <div>
          ${section.eyebrow ? `<p className="eyebrow">${esc(section.eyebrow)}</p>` : ""}
          <h1>${esc(section.title)}</h1>
          <p>${esc(section.body || spec.tagline)}</p>
          <div className="hero-actions">${primary}${secondary}</div>
        </div>
        ${media}
      </div>
    </section>`;
}

function emitItemsGrid(section: SiteSection, cols: "grid-2" | "grid-3"): string {
  const items = (section.items || [])
    .map(
      (it) => `
        <article className="card">
          <h3 style={{ fontSize: "1.15rem" }}>${esc(it.title)}</h3>
          ${it.body ? `<p style={{ marginBottom: 0 }}>${esc(it.body)}</p>` : ""}
          ${it.meta ? `<p style={{ margin: "0.75rem 0 0", fontSize: "0.85rem" }}>${esc(it.meta)}</p>` : ""}
        </article>`,
    )
    .join("\n");
  return `<div className="${cols}">${items}</div>`;
}

function emitSection(section: SiteSection, spec: SiteSpec): string {
  // First section is always treated as hero when id/hero-ish
  if (section.id === "hero" || section.imageSlot?.startsWith("hero-")) {
    return emitHero(spec, section);
  }

  if (section.kind === "stats") {
    const stats = (section.items || [])
      .map(
        (it) => `
        <div>
          <strong>${esc(it.title)}</strong>
          <span style={{ color: "var(--c-muted-fg)", fontSize: "0.9rem" }}>${esc(it.body || "")}</span>
        </div>`,
      )
      .join("\n");
    return `
    <section className="section" id=${jsStr(section.id)}>
      <div className="container">
        <h2 className="section-title">${esc(section.title)}</h2>
        <div className="stat-row" style={{ marginTop: 24 }}>${stats}</div>
      </div>
    </section>`;
  }

  if (section.kind === "faq") {
    const faqs = (section.items || [])
      .map(
        (it) => `
        <details className="faq">
          <summary>${esc(it.title)}</summary>
          <p>${esc(it.body || "")}</p>
        </details>`,
      )
      .join("\n");
    return `
    <section className="section" id=${jsStr(section.id)}>
      <div className="container" style={{ maxWidth: 760 }}>
        <h2 className="section-title">${esc(section.title)}</h2>
        <div style={{ marginTop: 20 }}>${faqs}</div>
      </div>
    </section>`;
  }

  if (section.kind === "form") {
    return `
    <section className="section" id=${jsStr(section.id || "contact")}>
      <div className="container hero-grid split">
        <div>
          <h2 className="section-title">${esc(section.title)}</h2>
          <p>${esc(section.body || "")}</p>
          ${spec.phone ? `<p><a href=${jsStr(`tel:${spec.phone.replace(/[^\d+]/g, "")}`)}>${esc(spec.phone)}</a></p>` : ""}
          ${spec.email ? `<p>${esc(spec.email)}</p>` : ""}
          ${spec.location ? `<p>${esc(spec.location)}</p>` : ""}
        </div>
        <form className="card form-card" action="#" method="post">
          <input name="name" placeholder="Name" required />
          <input name="email" type="email" placeholder="Email" required />
          <textarea name="message" rows={4} placeholder="How can we help?" required />
          <button className="btn" type="submit">${esc(section.ctaLabel || spec.ctaPrimary.label)}</button>
        </form>
      </div>
    </section>`;
  }

  if (section.kind === "gallery") {
    const slots = [1, 2, 3]
      .map(
        (i) =>
          `<div className="media-slot" data-image-slot=${jsStr(`${section.id}-${i}`)} style={{ minHeight: 180 }} />`,
      )
      .join("\n");
    return `
    <section className="section" id=${jsStr(section.id)}>
      <div className="container">
        <h2 className="section-title">${esc(section.title)}</h2>
        <div className="grid-3" style={{ marginTop: 24 }}>${slots}</div>
      </div>
    </section>`;
  }

  if (section.kind === "cta") {
    return `
    <section className="section" id=${jsStr(section.id)}>
      <div className="container card" style={{ textAlign: section.variant === "centered" ? "center" : "left", padding: "2rem" }}>
        <h2 className="section-title" style={{ maxWidth: "20ch", marginInline: section.variant === "centered" ? "auto" : undefined }}>${esc(section.title)}</h2>
        ${section.body ? `<p>${esc(section.body)}</p>` : ""}
        <div className="hero-actions" style={{ justifyContent: section.variant === "centered" ? "center" : "flex-start" }}>
          <a className="btn" href=${jsStr(section.ctaHref || spec.ctaPrimary.href)}>${esc(section.ctaLabel || spec.ctaPrimary.label)}</a>
        </div>
      </div>
    </section>`;
  }

  if (section.kind === "trust") {
    const logos = (section.items || [])
      .map((it) => `<div className="card" style={{ textAlign: "center", fontWeight: 600 }}>${esc(it.title)}</div>`)
      .join("\n");
    return `
    <section className="section" id=${jsStr(section.id)}>
      <div className="container">
        <p className="eyebrow">${esc(section.title)}</p>
        <div className="grid-3">${logos}</div>
      </div>
    </section>`;
  }

  const cols = section.variant === "grid-2" ? "grid-2" : "grid-3";
  return `
    <section className="section" id=${jsStr(section.id)}>
      <div className="container">
        ${section.eyebrow ? `<p className="eyebrow">${esc(section.eyebrow)}</p>` : ""}
        <h2 className="section-title">${esc(section.title)}</h2>
        ${section.body ? `<p style={{ maxWidth: "52ch", marginBottom: 24 }}>${esc(section.body)}</p>` : ""}
        ${emitItemsGrid(section, cols)}
      </div>
    </section>`;
}

function emitFooter(spec: SiteSpec): string {
  if (spec.footerVariant === "simple-bar") {
    return `
    <footer className="site-footer">
      <div className="container footer-bottom" style={{ borderTop: "none", marginTop: 0, paddingTop: 0 }}>
        <span>© {new Date().getFullYear()} ${esc(spec.businessName)}</span>
        <span>${esc(spec.tagline)}</span>
      </div>
    </footer>`;
  }

  if (spec.footerVariant === "cta-footer") {
    return `
    <footer className="site-footer">
      <div className="container">
        <div className="card" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "1.6rem" }}>Ready when you are</h2>
            <p style={{ marginBottom: 0 }}>${esc(spec.tagline)}</p>
          </div>
          <a className="btn" href=${jsStr(spec.ctaPrimary.href)}>${esc(spec.ctaPrimary.label)}</a>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} ${esc(spec.businessName)}</span>
          <span>${esc(spec.phone || "")}</span>
        </div>
      </div>
    </footer>`;
  }

  const nav = spec.nav
    .map((n) => `<div><a href=${jsStr(n.href)} style={{ textDecoration: "none" }}>${esc(n.label)}</a></div>`)
    .join("\n");
  return `
    <footer className="site-footer">
      <div className="container footer-grid cols">
        <div>
          <strong className="brand">${esc(spec.businessName)}</strong>
          <p style={{ marginTop: 12 }}>${esc(spec.tagline)}</p>
        </div>
        <div>
          <p className="eyebrow">Explore</p>
          ${nav}
        </div>
        <div>
          <p className="eyebrow">Contact</p>
          ${spec.phone ? `<p>${esc(spec.phone)}</p>` : ""}
          ${spec.email ? `<p>${esc(spec.email)}</p>` : ""}
          ${spec.location ? `<p>${esc(spec.location)}</p>` : ""}
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} ${esc(spec.businessName)}</span>
        <span>Built with Cander</span>
      </div>
    </footer>`;
}

function emitPageComponent(spec: SiteSpec, pageIndex: number): string {
  const page = spec.pages[pageIndex]!;
  const isHome = pageIndex === 0;
  const sections = page.sections
    .map((s, i) => {
      if (isHome && i === 0) return emitHero(spec, { ...s, id: s.id || "hero" });
      return emitSection(s, spec);
    })
    .join("\n");

  return `export default function Page() {
  return (
    <>
      ${emitHeader(spec)}
      <main>
        ${sections}
      </main>
      ${emitFooter(spec)}
    </>
  );
}
`;
}

function pathToAppFile(path: string): string {
  if (path === "/" || path === "") return "app/page.js";
  const clean = path.replace(/^\//, "").replace(/\/$/, "");
  return `app/${clean}/page.js`;
}

export function composeSiteFromSpec(spec: SiteSpec): ScaffoldFile[] {
  const files: ScaffoldFile[] = [
    {
      path: ".gitignore",
      content: ["node_modules", ".next", ".npm", "package-lock.json", ".DS_Store", ""].join(
        "\n",
      ),
    },
    {
      path: "package.json",
      content: canonicalSitePackageJsonText({ name: "cander-site" }),
    },
    {
      path: "next.config.mjs",
      content: "export default {};\n",
    },
    ...siteSupportScaffoldFiles(),
    {
      path: "app/globals.css",
      content: emitGlobalsCss(spec.theme),
    },
    {
      path: "app/layout.js",
      content: `import "./globals.css";

export const metadata = {
  title: ${jsStr(spec.businessName)},
  description: ${jsStr(spec.tagline)},
  openGraph: {
    title: ${jsStr(spec.businessName)},
    description: ${jsStr(spec.tagline)},
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    },
    {
      path: "app/robots.js",
      content: `export default function robots() {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "/sitemap.xml",
  };
}
`,
    },
    {
      path: "app/sitemap.js",
      content: `export default function sitemap() {
  return ${JSON.stringify(
    spec.pages.map((p) => ({
      url: p.path,
      lastModified: new Date().toISOString(),
      changeFrequency: "weekly",
      priority: p.path === "/" ? 1 : 0.7,
    })),
    null,
    2,
  )};
}
`,
    },
  ];

  for (let i = 0; i < spec.pages.length; i++) {
    const page = spec.pages[i]!;
    files.push({
      path: pathToAppFile(page.path),
      content: emitPageComponent(spec, i),
    });
  }

  return files;
}
