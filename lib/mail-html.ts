/**
 * Prepare email HTML for sandboxed iframe display.
 * Strips scripts/handlers, keeps remote images + style blocks, bridges link clicks.
 */

const EVENT_HANDLER_RE = /\son[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi;
const JS_URL_RE = /\bhref\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi;
/** JSON-LD / schema.org blobs that sometimes leak as visible text after bad stripping. */
const SCHEMA_JSON_RE =
  /\[\s*\{\s*"@context"\s*:\s*"https?:\/\/schema\.org\/?"[\s\S]*?\}\s*\]/gi;

export function sanitizeMailHtml(html: string): string {
  return html
    // Remove whole elements (content included) — bare tag stripping leaves JSON-LD visible.
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<\/?(?:iframe|object|embed|form|link|meta|base)(?:\s[^>]*)?>/gi, "")
    .replace(EVENT_HANDLER_RE, "")
    .replace(JS_URL_RE, 'href="#"')
    .replace(/\starget\s*=\s*(["'])[\s\S]*?\1/gi, "")
    .replace(SCHEMA_JSON_RE, "")
    // Tracking pixels / 1x1 spacers still load; leave images alone.
    .trim();
}

export function buildMailSrcDoc(html: string): string {
  const safe = sanitizeMailHtml(html);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    overflow-x: hidden;
    overflow-y: hidden;
  }
  img, video { max-width: 100% !important; height: auto !important; }
  a { color: #0b57d0; }
  table { max-width: 100% !important; }
</style>
</head>
<body>
${safe}
<script>
(function () {
  function reportHeight() {
    var root = document.documentElement;
    var body = document.body;
    var h = 0;
    if (body) {
      h = Math.max(h, body.scrollHeight, body.offsetHeight);
      var last = body.lastElementChild;
      if (last) {
        var rect = last.getBoundingClientRect();
        h = Math.max(h, Math.ceil(rect.bottom + (window.scrollY || 0)));
      }
    }
    if (root) h = Math.max(h, root.scrollHeight, root.offsetHeight);
    parent.postMessage({ type: "cander-mail-height", height: h }, "*");
  }
  document.addEventListener("click", function (event) {
    var node = event.target;
    while (node && node.tagName !== "A") node = node.parentElement;
    if (!node || !node.href) return;
    var href = String(node.href);
    if (!/^https?:/i.test(href)) return;
    event.preventDefault();
    event.stopPropagation();
    parent.postMessage({ type: "cander-mail-link", href: href }, "*");
  }, true);
  window.addEventListener("load", reportHeight);
  [].forEach.call(document.images || [], function (img) {
    if (img.complete) return;
    img.addEventListener("load", reportHeight);
    img.addEventListener("error", reportHeight);
  });
  setTimeout(reportHeight, 50);
  setTimeout(reportHeight, 300);
  setTimeout(reportHeight, 1200);
  if (window.ResizeObserver) {
    new ResizeObserver(reportHeight).observe(document.body);
  }
})();
</script>
</body>
</html>`;
}

/** Plain-text fallback: drop invisible spacer entities used by HTML marketing mail. */
export function stripMailSpacerNoise(text: string): string {
  return text
    .replace(/(?:&#847;|&#x0*34[fF];|&zwnj;|&zwj;|\u034F|\u200B|\u200C|\u200D)+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
