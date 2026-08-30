/** Shared in-page extraction — keep in sync with lib/browser-context/extract-script.ts */

const PAGE_EXTRACT_SCRIPT = `(() => {
  const MAX = 12000;
  const isHidden = (el) => {
    if (!el || el.nodeType !== 1) return true;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'password' || type === 'hidden') return true;
    if (el.closest('script,style,noscript,template')) return true;
    return false;
  };
  const blockSensitive = (el) => {
    const name = ((el.getAttribute('name') || '') + ' ' + (el.getAttribute('autocomplete') || '') + ' ' + (el.getAttribute('id') || '')).toLowerCase();
    return /password|passwd|credit|card|cvv|ssn|secret|token|otp/.test(name);
  };
  const clone = document.body ? document.body.cloneNode(true) : null;
  if (clone) {
    clone.querySelectorAll('script,style,noscript,template,iframe').forEach((n) => n.remove());
    clone.querySelectorAll('input,textarea').forEach((n) => {
      if (blockSensitive(n) || (n.getAttribute('type') || '').toLowerCase() === 'password') {
        n.value = '';
        n.setAttribute('value', '');
      }
    });
  }
  const root = clone || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || isHidden(parent)) return NodeFilter.FILTER_REJECT;
      const t = (node.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!t) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const parts = [];
  let truncated = false;
  while (walker.nextNode()) {
    const t = (walker.currentNode.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!t) continue;
    if (parts.join(' ').length + t.length > MAX) {
      truncated = true;
      break;
    }
    parts.push(t);
  }
  const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
    .filter((el) => !isHidden(el))
    .slice(0, 40)
    .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim())
    .filter(Boolean);
  const links = Array.from(document.querySelectorAll('a[href]'))
    .filter((el) => !isHidden(el))
    .slice(0, 40)
    .map((el) => ({
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
      href: el.href || '',
    }))
    .filter((l) => l.href && l.text);
  const main =
    document.querySelector('main,article,[role="main"]') ||
    document.body;
  let mainContent = '';
  if (main) {
    mainContent = (main.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, MAX);
  }
  const sel = (window.getSelection && window.getSelection().toString()) || '';
  return {
    url: location.href,
    title: document.title || '',
    visibleText: parts.join(' ').slice(0, MAX),
    mainContent: mainContent || undefined,
    headings,
    links,
    selectedText: sel.trim().slice(0, 4000) || undefined,
    viewport: {
      width: window.innerWidth || 0,
      height: window.innerHeight || 0,
      scrollX: window.scrollX || 0,
      scrollY: window.scrollY || 0,
    },
    truncated,
  };
})()`;

const SELECTION_SCRIPT = `(() => {
  const sel = (window.getSelection && window.getSelection().toString()) || '';
  return { text: sel.trim().slice(0, 4000), url: location.href };
})()`;

module.exports = { PAGE_EXTRACT_SCRIPT, SELECTION_SCRIPT };
