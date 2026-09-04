/**
 * Prepare email HTML for sandboxed iframe display.
 * Strips scripts/handlers, keeps remote images, bridges link clicks to the host.
 */

const DANGEROUS_TAGS_RE =
  /<\/?(?:script|iframe|object|embed|form|link|meta|base)[^>]*>/gi;
const EVENT_HANDLER_RE = /\son[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi;
const JS_URL_RE = /\bhref\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi;

export function sanitizeMailHtml(html: string): string {
  return html
    .replace(DANGEROUS_TAGS_RE, "")
    .replace(EVENT_HANDLER_RE, "")
    .replace(JS_URL_RE, 'href="#"')
    .replace(/\starget\s*=\s*(["'])[\s\S]*?\1/gi, "");
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
    overflow-x: auto;
  }
  img, video { max-width: 100%; height: auto; }
  a { color: #0b57d0; }
  table { max-width: 100%; }
</style>
</head>
<body>
${safe}
<script>
(function () {
  function reportHeight() {
    var h = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    );
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
  setTimeout(reportHeight, 50);
  setTimeout(reportHeight, 300);
  setTimeout(reportHeight, 1000);
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
