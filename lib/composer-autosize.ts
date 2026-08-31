/**
 * Composer textarea autosize helpers — pure so mobile growth can be tested.
 */

export const COMPOSER_MOBILE_MAX_LINES = 6;
export const COMPOSER_DESKTOP_MAX_LINES = 10;
export const COMPOSER_FALLBACK_LINE_HEIGHT = 20;
export const COMPOSER_FALLBACK_MIN_HEIGHT = 32;

export type ComposerAutosizeMetrics = {
  lineHeight: number;
  paddingY: number;
  minHeight: number;
  maxHeight: number;
  maxLines: number;
};

export function resolveComposerAutosizeMetrics(opts: {
  mobile: boolean;
  /** Computed style line-height in px; NaN/0 → fallback. */
  lineHeight?: number;
  /** Combined vertical padding in px. */
  paddingY?: number;
}): ComposerAutosizeMetrics {
  const maxLines = opts.mobile
    ? COMPOSER_MOBILE_MAX_LINES
    : COMPOSER_DESKTOP_MAX_LINES;
  const lineHeight =
    opts.lineHeight && opts.lineHeight > 0
      ? opts.lineHeight
      : COMPOSER_FALLBACK_LINE_HEIGHT;
  const paddingY = Math.max(0, opts.paddingY ?? 0);
  const minHeight = Math.max(
    COMPOSER_FALLBACK_MIN_HEIGHT,
    Math.round(lineHeight + paddingY),
  );
  const maxHeight = Math.round(lineHeight * maxLines + paddingY);
  return { lineHeight, paddingY, minHeight, maxHeight, maxLines };
}

export type ComposerTextareaSize = {
  height: number;
  overflowY: "hidden" | "auto";
};

/** Map scrollHeight into the clamped composer height + overflow mode. */
export function nextComposerTextareaSize(
  scrollHeight: number,
  metrics: Pick<ComposerAutosizeMetrics, "minHeight" | "maxHeight">,
  opts?: { empty?: boolean },
): ComposerTextareaSize {
  if (opts?.empty) {
    return { height: metrics.minHeight, overflowY: "hidden" };
  }
  const height = Math.min(
    Math.max(Math.ceil(scrollHeight), metrics.minHeight),
    metrics.maxHeight,
  );
  return {
    height,
    overflowY: scrollHeight > metrics.maxHeight ? "auto" : "hidden",
  };
}

/** Apply size onto a textarea element. */
export function applyComposerTextareaSize(
  el: HTMLTextAreaElement,
  size: ComposerTextareaSize,
) {
  el.style.height = `${size.height}px`;
  el.style.overflowY = size.overflowY;
}

export function readTextareaVerticalMetrics(el: HTMLTextAreaElement): {
  lineHeight: number;
  paddingY: number;
} {
  const style = window.getComputedStyle(el);
  const lineHeight = Number.parseFloat(style.lineHeight);
  const paddingY =
    Number.parseFloat(style.paddingTop || "0") +
    Number.parseFloat(style.paddingBottom || "0");
  return {
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : 0,
    paddingY: Number.isFinite(paddingY) ? paddingY : 0,
  };
}
