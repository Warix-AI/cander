"use client";

import { CourierMark } from "@/components/brand/CourierMark";
import { appearanceToCss, useAppearance } from "@/lib/appearance";
import { SHELL_G3_RADIUS } from "@/lib/shell-chrome";
import { cn } from "@/lib/utils";

const PREVIEW_NAV = [
  { label: "New Chat", active: true },
  { label: "Work", dot: "bg-blue-500" },
  { label: "Build", dot: "bg-orange-500" },
  { label: "Explore", dot: "bg-green-500" },
  { label: "Connectors" },
  { label: "Recents" },
] as const;

/** Live mini Cander shell that mirrors appearance sliders. */
export function OnboardingCourierPreview() {
  const appearance = useAppearance();
  const css = appearanceToCss(appearance);
  const floating = css.shell === "floating";
  const density = Number(css.density);
  const pad = `${(10 * density).toFixed(1)}px`;
  const gap = `${(6 * density).toFixed(1)}px`;
  const radius = css.radius;
  const floatInset = floating ? 10 : 0;
  const floatRadius = floating
    ? `max(${radius}, 14px)`
    : "0px";

  return (
    <div className="flex h-full w-full items-center justify-center p-4 xl:p-6">
      <div
        className={cn(
          "relative w-full max-w-[34rem] overflow-hidden border border-white/15 bg-background text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.35)]",
          floating ? SHELL_G3_RADIUS : "rounded-[12px]",
        )}
        style={{
          fontFamily: css.fontSans,
          fontSize: css.fontSize,
          letterSpacing: css.letterSpacing,
          ["--radius" as string]: radius,
          borderRadius: floating ? undefined : `calc(${radius} + 2px)`,
        }}
        data-shell={css.shell}
      >
        <div
          className="flex overflow-hidden bg-background"
          style={{
            height: "22rem",
            padding: floating ? floatInset : 0,
            gap: floating ? floatInset : 0,
          }}
        >
          {/* Workspace rail */}
          <div
            className="flex w-11 shrink-0 flex-col items-center border-r border-border bg-muted/40"
            style={{
              gap,
              paddingTop: pad,
              paddingBottom: pad,
              borderRadius: floating ? floatRadius : 0,
            }}
          >
            <span
              className="flex h-7 w-7 items-center justify-center bg-foreground/10"
              style={{ borderRadius: radius }}
            >
              <CourierMark className="h-4 w-4" />
            </span>
            <span
              className="h-6 w-6 bg-chart-2/50"
              style={{ borderRadius: radius }}
            />
            <span
              className="h-6 w-6 bg-foreground/10"
              style={{ borderRadius: radius }}
            />
            <span
              className="mt-auto h-6 w-6 bg-foreground/15"
              style={{ borderRadius: "999px" }}
            />
          </div>

          {/* Sidebar */}
          <div
            className={cn(
              "flex w-[38%] shrink-0 flex-col border-border bg-sidebar",
              floating ? "border" : "border-r",
            )}
            style={{
              borderRadius: floating ? floatRadius : 0,
              padding: pad,
              gap,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] font-medium tracking-[-0.02em]">
                Acme Inc.
              </span>
              <span
                className="h-5 w-5 bg-muted"
                style={{ borderRadius: radius }}
              />
            </div>
            <div
              className="flex items-center gap-2 bg-muted/70 px-2 py-1.5 text-[11px] text-muted-foreground"
              style={{ borderRadius: radius }}
            >
              <span className="h-2 w-2 rounded-full bg-foreground/25" />
              Search
            </div>
            <div className="mt-1 space-y-1">
              {PREVIEW_NAV.map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 text-[11.5px]",
                    "active" in item && item.active
                      ? "bg-sidebar-accent font-medium"
                      : "text-muted-foreground",
                  )}
                  style={{ borderRadius: radius }}
                >
                  {"dot" in item && item.dot ? (
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", item.dot)}
                      aria-hidden
                    />
                  ) : (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-foreground/20"
                      aria-hidden
                    />
                  )}
                  {item.label}
                </div>
              ))}
            </div>
            <p className="px-2 pt-1 text-[10px] text-muted-foreground/80">
              Pinned
            </p>
            <div
              className="mt-auto flex items-center gap-2 px-2 py-1.5"
              style={{ borderRadius: radius }}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-full bg-foreground/15"
                aria-hidden
              />
              <span className="truncate text-[11px] text-muted-foreground">
                Account
              </span>
            </div>
          </div>

          {/* Main */}
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col bg-background",
              floating && "border border-border",
            )}
            style={{
              borderRadius: floating ? floatRadius : 0,
              overflow: "hidden",
            }}
          >
            <div
              className="border-b border-border bg-card/40"
              style={{
                padding: pad,
                borderRadius: floating ? `${radius} ${radius} 0 0` : 0,
              }}
            >
              <div
                className="h-10 w-full bg-blue-500/25"
                style={{ borderRadius: radius }}
              />
            </div>
            <div
              className="flex min-h-0 flex-1 flex-col"
              style={{ padding: pad, gap }}
            >
              <div
                className="max-w-[85%] self-end bg-primary px-3 py-2 text-[11px] text-primary-foreground"
                style={{ borderRadius: radius }}
              >
                Summarize my inbox for today
              </div>
              <div
                className="max-w-[90%] border border-border bg-card px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
                style={{ borderRadius: radius }}
              >
                Three threads need a reply. Calendar is clear after 3pm — want
                me to draft responses?
              </div>
              <div
                className="mt-auto flex items-center gap-2 border border-border bg-muted/50 px-3 py-2"
                style={{ borderRadius: radius }}
              >
                <span className="flex-1 text-[11px] text-muted-foreground">
                  Message…
                </span>
                <span
                  className="h-6 w-6 bg-foreground"
                  style={{ borderRadius: radius }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
