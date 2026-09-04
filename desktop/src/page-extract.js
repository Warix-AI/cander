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

/** Install helpers used by in-app video Picture-in-Picture. */
const VIDEO_PIP_INSTALL_SCRIPT = `(() => {
  if (window.__canderVideoPipInstalled) return true;
  window.__canderVideoPipInstalled = true;
  const STYLE_ID = 'cander-video-pip-style';
  const findVideo = () => {
    const videos = Array.from(document.querySelectorAll('video'));
    const playing = videos.find((v) => !v.paused && !v.ended && v.readyState > 1);
    if (playing) return playing;
    return videos
      .slice()
      .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0] || null;
  };
  window.__canderEnterVideoPip = () => {
    const v = findVideo();
    if (!v) return false;
    document.querySelectorAll('[data-cander-pip-video]').forEach((el) => {
      el.removeAttribute('data-cander-pip-video');
    });
    v.setAttribute('data-cander-pip-video', '1');
    try { void v.play(); } catch (_) {}
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = [
      'html.cander-video-pip, html.cander-video-pip body {',
      '  background:#000!important; overflow:hidden!important;',
      '}',
      'html.cander-video-pip body * { visibility:hidden!important; }',
      'html.cander-video-pip video[data-cander-pip-video="1"],',
      'html.cander-video-pip video[data-cander-pip-video="1"] * {',
      '  visibility:visible!important;',
      '}',
      'html.cander-video-pip video[data-cander-pip-video="1"] {',
      '  position:fixed!important; inset:0!important;',
      '  width:100vw!important; height:100vh!important;',
      '  max-width:none!important; max-height:none!important;',
      '  object-fit:contain!important; z-index:2147483647!important;',
      '  background:#000!important;',
      '}',
    ].join('\\n');
    document.documentElement.classList.add('cander-video-pip');
    return true;
  };
  window.__canderExitVideoPip = () => {
    document.documentElement.classList.remove('cander-video-pip');
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    document.querySelectorAll('[data-cander-pip-video]').forEach((el) => {
      el.removeAttribute('data-cander-pip-video');
    });
    return true;
  };
  window.__canderHasPlayingVideo = () => {
    return Array.from(document.querySelectorAll('video')).some(
      (v) => !v.paused && !v.ended && v.readyState > 1,
    );
  };
  return true;
})()`;

const VIDEO_PIP_ENTER_SCRIPT = `(() => {
  try {
    if (typeof window.__canderEnterVideoPip === 'function') {
      return window.__canderEnterVideoPip();
    }
  } catch (_) {}
  return false;
})()`;

const VIDEO_PIP_EXIT_SCRIPT = `(() => {
  try {
    if (typeof window.__canderExitVideoPip === 'function') {
      return window.__canderExitVideoPip();
    }
  } catch (_) {}
  return false;
})()`;

module.exports = {
  PAGE_EXTRACT_SCRIPT,
  SELECTION_SCRIPT,
  VIDEO_PIP_INSTALL_SCRIPT,
  VIDEO_PIP_ENTER_SCRIPT,
  VIDEO_PIP_EXIT_SCRIPT,
};
