"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { cn } from "@/lib/utils";

export function PublishSheet() {
  const { overlay, closeOverlay, publishApp, liveUrl, project } = useApp();
  const slug = (project?.name ?? "app").toLowerCase().replace(/\s+/g, "-");
  const hostedUrl = `https://${slug}.app`;
  const domains = project?.domains ?? [];
  const options = useMemo(
    () => [
      { id: "courier", url: hostedUrl, label: `${slug}.app`, hint: "Verified subdomain" },
      ...domains.map((domain) => ({
        id: domain,
        url: domain.startsWith("http") ? domain : `https://${domain}`,
        label: domain.replace(/^https?:\/\//, ""),
        hint: "From this Build project",
      })),
    ],
    [hostedUrl, domains, slug],
  );
  const [selected, setSelected] = useState(options[0]?.id ?? "courier");

  if (overlay !== "publish") return null;
  const chosen = options.find((item) => item.id === selected) ?? options[0];
  const url = liveUrl && selected === "courier" ? liveUrl : chosen.url;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[10px] border border-border bg-background p-6 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
              Publish
            </p>
            <h2 className="heading-display mt-2 text-[1.45rem]">Publish your app</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={closeOverlay}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" strokeWidth={1.6} />
          </button>
        </div>
        <p className="mt-4 text-[13px] font-medium">Domain</p>
        <div className="mt-2 space-y-2">
          {options.map((item) => {
            const on = selected === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[10px] border px-3 py-2.5 text-left",
                  on ? "border-foreground/25 bg-muted" : "border-border",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    on
                      ? "border-foreground bg-primary text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {on ? <Check className="h-2.5 w-2.5" strokeWidth={2.4} /> : null}
                </span>
                <span>
                  <span className="block font-mono text-[13px]">{item.label}</span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {item.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-[13px] font-medium">Environment</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Production</p>
        <button
          type="button"
          onClick={() => publishApp(url)}
          className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-primary text-[13.5px] font-medium text-primary-foreground hover:bg-foreground"
        >
          Publish
        </button>
      </div>
    </div>
  );
}
