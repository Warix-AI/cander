/** Resolve light/dark from the same keys as app/layout themeScript. */
export type BootstrapTheme = "light" | "dark";

export function resolveBootstrapTheme(
  storage?: Pick<Storage, "getItem"> | null,
): BootstrapTheme {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!store) return "light";

    let theme: BootstrapTheme | null = null;
    const appearance = store.getItem("courier-appearance-v2");
    if (appearance) {
      try {
        const parsed = JSON.parse(appearance) as {
          colorMode?: string;
          color?: number;
        };
        if (
          parsed.colorMode === "dark" ||
          parsed.colorMode === "dark-charcoal" ||
          parsed.colorMode === "dark-blue"
        ) {
          theme = "dark";
        } else if (
          parsed.colorMode === "light" ||
          parsed.colorMode === "light-blue"
        ) {
          theme = "light";
        } else if (typeof parsed.color === "number") {
          theme = parsed.color < 45 ? "light" : "dark";
        }
      } catch {
        // ignore malformed appearance
      }
    }

    if (!theme) {
      const legacy = store.getItem("theme");
      theme =
        legacy === "dark" ? "dark" : legacy === "light" ? "light" : null;
    }

    if (!theme && typeof window !== "undefined") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    return theme ?? "light";
  } catch {
    return "light";
  }
}

export function bootstrapThemeBackground(theme: BootstrapTheme) {
  return theme === "dark" ? "#2e2e30" : "#ffffff";
}

/** Inline script for beforeInteractive — keep in sync with resolveBootstrapTheme. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var a=localStorage.getItem('courier-appearance-v2');var theme=null;if(a){try{var j=JSON.parse(a);if(j.colorMode==='dark'||j.colorMode==='dark-charcoal'||j.colorMode==='dark-blue'){theme='dark'}else if(j.colorMode==='light'||j.colorMode==='light-blue'){theme='light'}else if(typeof j.color==='number'){theme=j.color<45?'light':'dark'}}catch(e){}}if(!theme){var t=localStorage.getItem('theme');theme=t==='dark'?'dark':t==='light'?'light':null}if(!theme){theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var root=document.documentElement;var bg=theme==='dark'?'#2e2e30':'#ffffff';if(theme==='dark'){root.classList.add('dark')}else{root.classList.remove('dark')}root.style.colorScheme=theme;root.style.backgroundColor=bg;if(document.body){document.body.style.backgroundColor=bg}var meta=document.querySelector('meta[name="color-scheme"]');if(!meta){meta=document.createElement('meta');meta.setAttribute('name','color-scheme');document.head.appendChild(meta)}meta.setAttribute('content',theme);var color=bg;var tags=document.querySelectorAll('meta[name="theme-color"]');if(tags.length){tags.forEach(function(tag){tag.removeAttribute('media');tag.setAttribute('content',color)})}else{var tc=document.createElement('meta');tc.setAttribute('name','theme-color');tc.setAttribute('content',color);document.head.appendChild(tc)}}catch(e){document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';document.documentElement.style.backgroundColor='#ffffff'}})();`;
