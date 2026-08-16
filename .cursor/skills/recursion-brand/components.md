# Recursion / Courier components

Use Tailwind classes mapped from [tokens.css](tokens.css). Radius token is 10px (`rounded-[10px]` or `rounded-lg` if `--radius-lg` maps to `--radius`).

## Type

| Role | Spec |
|---|---|
| Sans | DM Sans 400/500/600/700 |
| Mono | Geist Mono (marks, kicker uppercase, status) |
| Display / section | `font-semibold`, tracking `-0.04em` / `-0.038em` |
| Body | 14–17px, `leading-relaxed`, `text-muted-foreground` on supporting copy |
| Eyebrow | 13px, medium, tracking `0.08em`, `uppercase`, `text-white/70` on gradients |
| On gradient | white / `white/75` — never black type on `hero-gradient` / `media-*` |

Headings: `heading-display` (hero/page) or `heading-section` (blocks).

## Buttons

Height 40px, **pill**, 13.5px, medium, tracking `-0.01em`. Optional `ArrowUpRight` 14px, stroke 2.25.

```
base: inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium tracking-[-0.01em] transition-colors duration-200

primary:   bg-primary text-primary-foreground hover:bg-foreground
secondary: border border-foreground/15 bg-transparent text-foreground hover:bg-muted
ghost:     bg-transparent text-foreground hover:bg-muted
outline:   border border-foreground/20 bg-transparent text-foreground hover:bg-muted
onDark:    border border-white/25 bg-white text-foreground hover:bg-white/90
```

Icon-only chrome (theme, menu, login): `h-10 w-10 rounded-[10px] border border-foreground/12`. Not pills.

## Cards

**Surface card** (forms, settings, lists):

```
rounded-[10px] border border-border bg-card p-6 md:p-8
```

**Media / product card** (hero panels, tiles, empty states):

```
relative overflow-hidden rounded-[10px] text-white
+ class hero-gradient | media-a | media-b | media-c | media-d
+ child: <div class="grain-layer" />
```

Copy on media cards sits at **bottom-left**. Optional large watermark title at **top-left** (`text-5xl md:text-7xl font-semibold tracking-[-0.06em] text-white/90`).

Gap between sibling media cards: `gap-3`. Do not flush-stack them with `overflow-hidden` grid and zero gap.

Inputs match cards: `rounded-[10px] border border-foreground/10 bg-background px-4 py-3 text-[14px]`.

## Layout chrome (app)

- Page: `bg-background text-foreground`
- Sidebar: `bg-sidebar text-sidebar-foreground border-sidebar-border`
- Header: `bg-background`, optional border after 8px scroll
- Footer / status: `bg-footer text-footer-foreground` (tracks light/dark)
- Menus: `rounded-[10px] border border-border bg-background p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.08)]`
- Menu rows: `rounded-[10px] px-3 py-2.5 hover:bg-muted`

Focus: `outline: 2px solid var(--ring); outline-offset: 2px`.
Selection: `chart-2` at 28% opacity.

## Theme bootstrap

Default **light**. Dark only if stored.

```html
<script>
(function () {
  try {
    if (localStorage.getItem("theme") === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();
</script>
```

Toggle: add/remove `.dark` on `documentElement`, write `localStorage.theme` to `"dark"` | `"light"`.

## Media panel (React)

```tsx
<div className={cn("relative overflow-hidden rounded-[10px]", media, className)}>
  <div className="grain-layer" />
  {children}
</div>
```

`media`: `media-a` | `media-b` | `media-c` | `media-d` (cycle; all blue). Hero bands use `hero-gradient`.

## Icon mark (on color cards)

56×56, never scale down with the card:

```
flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-white/14 text-white
```

Place **top-left** with the label next to it. 1.6px stroke icons, not letters.

## Recursion mark (SVG, 28 viewBox)

Four dots at (8,8) (20,8) (20,20) (8,20) r=2.15, square strokes between them (`currentColor`, stroke 1.35, round caps). Wordmark: mark 21.6px + “RecursionAI” 17px semibold tracking `-0.03em` gap 10px.

## Copy on color

```
kicker: text-[13px] text-white/65
title:  text-[22px] md:text-[28px] tracking-[-0.03em] text-white
body:   text-[14px] leading-relaxed text-white/72
```

## Motion

Transitions `0.2s` colors, `0.55s` cubic-bezier(0.25, 0.1, 0.25, 1) for expanding panels. Honor `prefers-reduced-motion`.
