"use client";

import { useState } from "react";
import { useApp } from "@/components/app/AppProvider";

export function ChangeTimeline() {
  const { checkpoints, restoreCheckpoint } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const items = checkpoints.length
    ? checkpoints
    : [
        {
          id: "seed",
          title: "Created initial project",
          at: "7:18 PM",
          day: "Today",
          summary: "First Preview of this product.",
          files: ["app/page.tsx"],
          diff: "+ landing shell",
        },
      ];

  return (
    <div className="px-4 py-4">
      <p className="font-mono text-[10.5px] tracking-[0.08em] text-muted-foreground uppercase">
        Today
      </p>
      <ol className="mt-4 space-y-5">
        {items.map((item) => {
          const open = openId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : item.id)}
                className="w-full text-left"
              >
                <p className="font-mono text-[11px] text-muted-foreground">{item.at}</p>
                <p className="mt-0.5 text-[14px] font-medium tracking-[-0.02em]">
                  {item.title}
                </p>
              </button>
              {open ? (
                <div className="mt-2 rounded-[10px] border border-border bg-card p-3">
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {item.summary}
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    {item.files.join(" · ")}
                  </p>
                  {item.diff ? (
                    <pre className="mt-2 overflow-x-auto font-mono text-[11px] text-muted-foreground">
                      {item.diff}
                    </pre>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => restoreCheckpoint(item.id)}
                    className="mt-3 rounded-full bg-muted px-3 py-1.5 text-[12.5px] font-medium hover:bg-accent"
                  >
                    Restore
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
