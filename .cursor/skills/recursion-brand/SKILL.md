---
name: recursion-brand
description: >-
  Applies RecursionAI / Courier visual design: Graphite oklch tokens, DM Sans +
  Geist Mono, 10px cards, pill CTAs, light-first canvas, and grainy blue mesh
  gradients. Use when building Courier, Courier Platform, RecursionAI, Scout,
  Enclave, or MCP Store UI; matching thinkrecursion.ai; or the user mentions
  Recursion brand, Courier design system, Graphite theme, or this marketing
  site's look.
---

# RecursionAI / Courier brand

Source of truth: the RecursionAI marketing site (`warix-website`). Apply this look to Courier and other Recursion products — do not invent a parallel palette.

## Always read first

1. [tokens.css](tokens.css) — copy these variables, `@theme` mappings, and gradient classes.
2. [components.md](components.md) — buttons, cards, media panels, type, chrome.

## How to apply in a new app

1. Install **DM Sans** (400/500/600/700) and **Geist Mono**. Expose `--font-dm-sans` and `--font-geist-mono`.
2. Paste [tokens.css](tokens.css) into global CSS (Tailwind v4 `@import "tailwindcss"` then this file, or merge `:root` / `.dark` / `@theme inline`).
3. Default **light**. Dark is `.dark` on `<html>`, stored in `localStorage.theme === "dark"`. Hydrate with a blocking script before paint. `html` needs `suppressHydrationWarning`.
4. Body: `bg-background text-foreground font-sans antialiased`.
5. Card / control radius is **10px**. CTA buttons are **pills** (`rounded-full`). Do not mix these up.
6. Color fields (heroes, product tiles, empty media) use **blue mesh + grain** from [tokens.css](tokens.css). Never orange, peach, gold, or purple blobs.

## Design rules

- White (or near-white) canvas. OpenAI-like marketing chrome: quiet type, tight tracking, lots of negative space.
- Primary action is black fill in light mode, inverted in dark.
- Accent / charts / gradients are the `--chart-*` blues (`hue ~252–266`).
- Grain overlay is **subtle** (`opacity: 0.18`, `mix-blend-mode: overlay`). Do not crank it.
- Theme-aware chrome: footer, section fills, and wordmarks use `--footer` / `--foreground` tokens — never hardcode white-on-white.
- Icon marks on color cards: 56×56, `rounded-[10px]`, `bg-white/14`, never squashed two-letter ligatures.

## Do not

- Warm mesh (ember/gold/peach) or high-frequency heavy grain.
- Card radius other than 10px (no 5px, no 16px+ on cards).
- Pill-shaped cards or fully rounded media tiles.
- Centered hero copy. App chrome can be denser, but marketing heroes stay **left / bottom-left**.
- Defaulting dark. Light is the brand default.
