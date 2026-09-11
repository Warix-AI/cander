"use client";

import type { CSSProperties, ReactNode } from "react";
import type { V2ProjectConfig, V2SectionInstance, V2ThemeTokens } from "@/lib/build/v2/types";

function themeStyle(theme: V2ThemeTokens): CSSProperties {
  return {
    ["--v2-bg" as string]: theme.background,
    ["--v2-fg" as string]: theme.foreground,
    ["--v2-muted" as string]: theme.muted,
    ["--v2-muted-fg" as string]: theme.mutedForeground,
    ["--v2-primary" as string]: theme.primary,
    ["--v2-primary-fg" as string]: theme.primaryForeground,
    ["--v2-accent" as string]: theme.accent,
    ["--v2-border" as string]: theme.border,
    ["--v2-radius" as string]: theme.radius,
    ["--v2-container" as string]: theme.container,
    ["--v2-section-y" as string]: theme.sectionY,
    ["--v2-font-display" as string]: theme.fontDisplay,
    ["--v2-font-body" as string]: theme.fontBody,
    ["--v2-shadow" as string]: theme.shadow,
    background: theme.background,
    color: theme.foreground,
    fontFamily: theme.fontBody,
    minHeight: "100%",
  };
}

function Container({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: "var(--v2-container)",
        margin: "0 auto",
        padding: "0 1.25rem",
      }}
    >
      {children}
    </div>
  );
}

function Btn({ href, children, primary }: { href?: string; children: ReactNode; primary?: boolean }) {
  return (
    <a
      href={href || "#"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.7rem 1.15rem",
        borderRadius: "var(--v2-radius)",
        background: primary ? "var(--v2-primary)" : "transparent",
        color: primary ? "var(--v2-primary-fg)" : "var(--v2-fg)",
        border: primary ? "none" : "1px solid var(--v2-border)",
        textDecoration: "none",
        fontWeight: 600,
        fontSize: "0.95rem",
      }}
    >
      {children}
    </a>
  );
}

function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return [];
}

function HeaderBar({ config }: { config: V2ProjectConfig }) {
  const links = config.pages
    .filter((p) => p.path !== "/")
    .map((p) => ({ href: p.path, label: p.title }));
  const cta = String(config.header.content.cta_label || "Contact");
  const ctaUrl = String(config.header.content.cta_url || "/contact");
  return (
    <header
      style={{
        borderBottom: "1px solid var(--v2-border)",
        background: "var(--v2-bg)",
        position: config.header.config?.sticky ? "sticky" : "relative",
        top: 0,
        zIndex: 20,
      }}
    >
      <Container>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            padding: "1rem 0",
            flexWrap: "wrap",
          }}
        >
          <a href="/" style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, textDecoration: "none", color: "inherit", fontSize: "1.1rem" }}>
            {config.brand.businessName || "Your business"}
          </a>
          <nav style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            {links.map((l) => (
              <a key={l.href} href={l.href} style={{ color: "var(--v2-muted-fg)", textDecoration: "none", fontSize: "0.92rem" }}>
                {l.label}
              </a>
            ))}
            <Btn href={ctaUrl} primary>
              {cta}
            </Btn>
          </nav>
        </div>
      </Container>
    </header>
  );
}

function FooterBar({ config }: { config: V2ProjectConfig }) {
  return (
    <footer style={{ borderTop: "1px solid var(--v2-border)", marginTop: "auto", background: "var(--v2-muted)" }}>
      <Container>
        <div style={{ padding: "2.5rem 0", display: "grid", gap: "0.75rem" }}>
          <div style={{ fontWeight: 700 }}>{config.brand.businessName || "Your business"}</div>
          {config.footer.content.blurb ? (
            <p style={{ color: "var(--v2-muted-fg)", margin: 0, maxWidth: "36rem" }}>
              {String(config.footer.content.blurb)}
            </p>
          ) : null}
          <p style={{ color: "var(--v2-muted-fg)", margin: 0, fontSize: "0.85rem" }}>
            {String(config.footer.content.legal || "")}
          </p>
        </div>
      </Container>
    </footer>
  );
}

function SectionView({ section }: { section: V2SectionInstance }) {
  const c = section.content;
  const id = section.variantId;

  if (id.startsWith("hero_")) {
    const split = id === "hero_split";
    return (
      <section style={{ padding: "var(--v2-section-y) 0", background: id === "hero_editorial" ? "var(--v2-muted)" : undefined }}>
        <Container>
          <div
            style={{
              display: "grid",
              gap: "1.5rem",
              gridTemplateColumns: split ? "repeat(auto-fit, minmax(260px, 1fr))" : "1fr",
              alignItems: "center",
              textAlign: split ? "left" : "center",
            }}
          >
            <div style={{ display: "grid", gap: "1rem", justifyItems: split ? "start" : "center" }}>
              {c.eyebrow ? <div style={{ color: "var(--v2-muted-fg)", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: "0.75rem" }}>{String(c.eyebrow)}</div> : null}
              <h1 style={{ fontFamily: "var(--v2-font-display)", fontSize: "clamp(2rem, 5vw, 3.4rem)", lineHeight: 1.1, margin: 0, maxWidth: "18ch" }}>
                {String(c.headline || "")}
              </h1>
              {c.supporting_text ? <p style={{ color: "var(--v2-muted-fg)", margin: 0, maxWidth: "40rem", fontSize: "1.05rem" }}>{String(c.supporting_text)}</p> : null}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: split ? "flex-start" : "center" }}>
                {c.primary_cta_label ? <Btn href={String(c.primary_cta_url || "#")} primary>{String(c.primary_cta_label)}</Btn> : null}
                {c.secondary_cta_label ? <Btn href={String(c.secondary_cta_url || "#")}>{String(c.secondary_cta_label)}</Btn> : null}
              </div>
            </div>
            {c.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={String(c.image)} alt={String(c.image_alt || "")} style={{ width: "100%", borderRadius: "var(--v2-radius)", aspectRatio: "4/3", objectFit: "cover", background: "var(--v2-accent)" }} />
            ) : (
              <div style={{ width: "100%", borderRadius: "var(--v2-radius)", aspectRatio: "4/3", background: "var(--v2-accent)", boxShadow: "var(--v2-shadow)" }} />
            )}
          </div>
        </Container>
      </section>
    );
  }

  if (id.startsWith("features_")) {
    const items = parseJsonArray(c.items) as Array<{ title?: string; body?: string }>;
    return (
      <section style={{ padding: "var(--v2-section-y) 0" }}>
        <Container>
          <h2 style={{ fontFamily: "var(--v2-font-display)", fontSize: "1.8rem", marginTop: 0 }}>{String(c.headline || "")}</h2>
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: id === "features_list" ? "1fr" : "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {items.map((item, i) => (
              <div key={i} style={{ padding: "1.25rem", border: "1px solid var(--v2-border)", borderRadius: "var(--v2-radius)", background: "var(--v2-muted)" }}>
                <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>{item.title}</div>
                <div style={{ color: "var(--v2-muted-fg)" }}>{item.body}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (id === "image_text_left") {
    return (
      <section style={{ padding: "var(--v2-section-y) 0" }}>
        <Container>
          <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", alignItems: "center" }}>
            <div style={{ aspectRatio: "4/3", borderRadius: "var(--v2-radius)", background: "var(--v2-accent)" }} />
            <div>
              <h2 style={{ fontFamily: "var(--v2-font-display)", marginTop: 0 }}>{String(c.headline || "")}</h2>
              <p style={{ color: "var(--v2-muted-fg)" }}>{String(c.body || "")}</p>
              {c.cta_label ? <Btn href={String(c.cta_url || "#")} primary>{String(c.cta_label)}</Btn> : null}
            </div>
          </div>
        </Container>
      </section>
    );
  }

  if (id.startsWith("testimonials_")) {
    if (id === "testimonials_single") {
      return (
        <section style={{ padding: "var(--v2-section-y) 0", background: "var(--v2-muted)" }}>
          <Container>
            <blockquote style={{ fontSize: "1.4rem", fontFamily: "var(--v2-font-display)", margin: 0 }}>“{String(c.quote || "")}”</blockquote>
            <div style={{ marginTop: "1rem", color: "var(--v2-muted-fg)" }}>{String(c.name || "")}{c.role ? ` — ${String(c.role)}` : ""}</div>
          </Container>
        </section>
      );
    }
    const items = parseJsonArray(c.items) as Array<{ quote?: string; name?: string; role?: string }>;
    return (
      <section style={{ padding: "var(--v2-section-y) 0" }}>
        <Container>
          {c.headline ? <h2 style={{ fontFamily: "var(--v2-font-display)" }}>{String(c.headline)}</h2> : null}
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {items.map((item, i) => (
              <div key={i} style={{ padding: "1.25rem", border: "1px solid var(--v2-border)", borderRadius: "var(--v2-radius)" }}>
                <div>“{item.quote}”</div>
                <div style={{ marginTop: "0.75rem", color: "var(--v2-muted-fg)", fontSize: "0.9rem" }}>{item.name}{item.role ? ` — ${item.role}` : ""}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (id === "gallery_grid") {
    const images = parseJsonArray(c.images);
    return (
      <section style={{ padding: "var(--v2-section-y) 0" }}>
        <Container>
          {c.headline ? <h2 style={{ fontFamily: "var(--v2-font-display)" }}>{String(c.headline)}</h2> : null}
          <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            {(images.length ? images : [1, 2, 3, 4, 5, 6]).map((img, i) => (
              <div key={i} style={{ aspectRatio: "1", borderRadius: "var(--v2-radius)", background: "var(--v2-accent)" }}>
                {typeof img === "string" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--v2-radius)" }} />
                ) : null}
              </div>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (id === "stats_row") {
    const items = parseJsonArray(c.items) as Array<{ value?: string; label?: string }>;
    return (
      <section style={{ padding: "var(--v2-section-y) 0", background: "var(--v2-muted)" }}>
        <Container>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "2rem", justifyContent: "space-between" }}>
            {items.map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: "2rem", fontWeight: 700, fontFamily: "var(--v2-font-display)" }}>{item.value}</div>
                <div style={{ color: "var(--v2-muted-fg)" }}>{item.label}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (id === "faq_accordion") {
    const items = parseJsonArray(c.items) as Array<{ q?: string; a?: string }>;
    return (
      <section style={{ padding: "var(--v2-section-y) 0" }}>
        <Container>
          {c.headline ? <h2 style={{ fontFamily: "var(--v2-font-display)" }}>{String(c.headline)}</h2> : null}
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {items.map((item, i) => (
              <details key={i} style={{ border: "1px solid var(--v2-border)", borderRadius: "var(--v2-radius)", padding: "0.9rem 1rem" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>{item.q}</summary>
                <p style={{ color: "var(--v2-muted-fg)", marginBottom: 0 }}>{item.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (id === "cta_band") {
    return (
      <section style={{ padding: "var(--v2-section-y) 0", background: "var(--v2-primary)", color: "var(--v2-primary-fg)" }}>
        <Container>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ fontFamily: "var(--v2-font-display)", margin: 0 }}>{String(c.headline || "")}</h2>
              {c.body ? <p style={{ opacity: 0.9 }}>{String(c.body)}</p> : null}
            </div>
            {c.primary_cta_label ? (
              <a href={String(c.primary_cta_url || "#")} style={{ background: "var(--v2-bg)", color: "var(--v2-fg)", padding: "0.7rem 1.15rem", borderRadius: "var(--v2-radius)", textDecoration: "none", fontWeight: 700 }}>
                {String(c.primary_cta_label)}
              </a>
            ) : null}
          </div>
        </Container>
      </section>
    );
  }

  if (id === "contact_split" || id === "form_simple" || id === "hours_location") {
    return (
      <section style={{ padding: "var(--v2-section-y) 0" }}>
        <Container>
          <h2 style={{ fontFamily: "var(--v2-font-display)" }}>{String(c.headline || "Contact")}</h2>
          {c.body ? <p style={{ color: "var(--v2-muted-fg)" }}>{String(c.body)}</p> : null}
          <div style={{ display: "grid", gap: "0.35rem", color: "var(--v2-muted-fg)", marginBottom: "1rem" }}>
            {c.address ? <div>{String(c.address)}</div> : null}
            {c.hours ? <div>{String(c.hours)}</div> : null}
            {c.phone ? <div>{String(c.phone)}</div> : null}
            {c.email ? <div>{String(c.email)}</div> : null}
          </div>
          {id !== "hours_location" ? (
            <form style={{ display: "grid", gap: "0.75rem", maxWidth: "28rem" }} onSubmit={(e) => e.preventDefault()}>
              <input placeholder="Name" style={inputStyle} />
              <input placeholder="Email" style={inputStyle} />
              <textarea placeholder="Message" rows={4} style={{ ...inputStyle, resize: "vertical" }} />
              <Btn primary href="#">{String(c.form_cta_label || c.submit_label || "Send")}</Btn>
            </form>
          ) : null}
        </Container>
      </section>
    );
  }

  if (id === "pricing_list" || id === "menu_list") {
    if (id === "menu_list") {
      const groups = parseJsonArray(c.groups) as Array<{ title?: string; items?: Array<{ name?: string; price?: string; desc?: string }> }>;
      return (
        <section style={{ padding: "var(--v2-section-y) 0" }}>
          <Container>
            <h2 style={{ fontFamily: "var(--v2-font-display)" }}>{String(c.headline || "Menu")}</h2>
            {groups.map((g, i) => (
              <div key={i} style={{ marginBottom: "1.5rem" }}>
                <h3>{g.title}</h3>
                {(g.items || []).map((item, j) => (
                  <div key={j} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", borderBottom: "1px solid var(--v2-border)", padding: "0.55rem 0" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      {item.desc ? <div style={{ color: "var(--v2-muted-fg)", fontSize: "0.9rem" }}>{item.desc}</div> : null}
                    </div>
                    <div>{item.price}</div>
                  </div>
                ))}
              </div>
            ))}
          </Container>
        </section>
      );
    }
    const items = parseJsonArray(c.items) as Array<{ name?: string; price?: string; detail?: string }>;
    return (
      <section style={{ padding: "var(--v2-section-y) 0" }}>
        <Container>
          <h2 style={{ fontFamily: "var(--v2-font-display)" }}>{String(c.headline || "")}</h2>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {items.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", border: "1px solid var(--v2-border)", borderRadius: "var(--v2-radius)", padding: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{item.name}</div>
                  <div style={{ color: "var(--v2-muted-fg)" }}>{item.detail}</div>
                </div>
                <div style={{ fontWeight: 600 }}>{item.price}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (id === "process_steps") {
    const items = parseJsonArray(c.items) as Array<{ title?: string; body?: string }>;
    return (
      <section style={{ padding: "var(--v2-section-y) 0" }}>
        <Container>
          {c.headline ? <h2 style={{ fontFamily: "var(--v2-font-display)" }}>{String(c.headline)}</h2> : null}
          <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {items.map((item, i) => (
              <div key={i}>
                <div style={{ fontSize: "0.8rem", color: "var(--v2-muted-fg)" }}>Step {i + 1}</div>
                <div style={{ fontWeight: 700, margin: "0.25rem 0" }}>{item.title}</div>
                <div style={{ color: "var(--v2-muted-fg)" }}>{item.body}</div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section style={{ padding: "2rem 0" }}>
      <Container>
        <div style={{ border: "1px dashed var(--v2-border)", padding: "1rem", borderRadius: "var(--v2-radius)", color: "var(--v2-muted-fg)" }}>
          Unsupported variant in preview: {section.variantId}
        </div>
      </Container>
    </section>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.7rem 0.85rem",
  borderRadius: "var(--v2-radius)",
  border: "1px solid var(--v2-border)",
  background: "var(--v2-bg)",
  color: "var(--v2-fg)",
  font: "inherit",
};

export function BuilderV2SiteRenderer(props: {
  config: V2ProjectConfig;
  path?: string;
}) {
  const path = props.path || "/";
  const page = props.config.pages.find((p) => p.path === path) || props.config.pages[0];
  if (!page) return <div>No pages in configuration.</div>;

  return (
    <div style={{ ...themeStyle(props.config.theme), display: "flex", flexDirection: "column" }}>
      <HeaderBar config={props.config} />
      <main>
        {page.sections.map((section) => (
          <SectionView key={section.id} section={section} />
        ))}
      </main>
      <FooterBar config={props.config} />
    </div>
  );
}
