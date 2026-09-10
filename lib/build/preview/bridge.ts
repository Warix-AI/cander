/**
 * Tiny script injected into proxied draft HTML so the Cander shell can talk to
 * the (cross-origin) preview iframe without touching the user's app code:
 *
 *  parent → iframe : { type: "cander:reload" }            → location.reload()
 *                    { type: "cander:navigate", path }    → location.assign(path)
 *  iframe → parent : { type: "cander:navigated", path }   on load / pushState / popstate
 *                    { type: "cander:error", message }    on uncaught runtime errors
 *
 * Pure string helpers — safe for node:test.
 */

export const PREVIEW_BRIDGE_MARK = "data-cander-preview-bridge";

const SCRIPT = `(function(){try{
if(window.__canderBridge)return;window.__canderBridge=1;
var post=function(m){try{window.parent&&window.parent!==window&&window.parent.postMessage(m,"*")}catch(e){}};
var nav=function(){post({type:"cander:navigated",path:location.pathname+location.search+location.hash,title:document.title})};
window.addEventListener("message",function(ev){var d=ev&&ev.data;if(!d||typeof d!=="object")return;
if(d.type==="cander:reload"){location.reload();}
else if(d.type==="cander:navigate"&&typeof d.path==="string"&&d.path.charAt(0)==="/"){location.assign(d.path);}
else if(d.type==="cander:ping"){post({type:"cander:pong"});}});
var ps=history.pushState,rs=history.replaceState;
history.pushState=function(){var r=ps.apply(this,arguments);setTimeout(nav,0);return r};
history.replaceState=function(){var r=rs.apply(this,arguments);setTimeout(nav,0);return r};
window.addEventListener("popstate",nav);window.addEventListener("load",nav);
window.addEventListener("error",function(e){post({type:"cander:error",message:String((e&&e.message)||"error")})});
if(document.readyState!=="loading")nav();
}catch(e){}})();`;

export function previewBridgeScriptTag(): string {
  return `<script ${PREVIEW_BRIDGE_MARK}="1">${SCRIPT}</script>`;
}

/** Insert the bridge once per document (before </head>, else at start of <body>, else prepend). */
export function injectPreviewBridge(html: string): string {
  if (!html || html.includes(PREVIEW_BRIDGE_MARK)) return html;
  const tag = previewBridgeScriptTag();
  const headClose = html.search(/<\/head\s*>/i);
  if (headClose !== -1) return `${html.slice(0, headClose)}${tag}${html.slice(headClose)}`;
  const bodyOpen = html.match(/<body[^>]*>/i);
  if (bodyOpen && bodyOpen.index !== undefined) {
    const at = bodyOpen.index + bodyOpen[0].length;
    return `${html.slice(0, at)}${tag}${html.slice(at)}`;
  }
  return `${tag}${html}`;
}
