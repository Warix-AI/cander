"use client";

import type { ReactNode } from "react";
import type { ChatBlock } from "@/lib/types";
import { cn } from "@/lib/utils";

function BlockTitle({ title }: { title?: string }) {
  if (!title?.trim()) return null;
  return (
    <p className="text-[14.5px] font-medium tracking-[-0.02em] text-foreground">
      {title}
    </p>
  );
}

function Shell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "my-1 space-y-2 rounded-[10px] border border-border/70 bg-muted/25 px-3 py-2.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StructuredResponseBlock({
  block,
}: {
  block: Extract<
    ChatBlock,
    | { type: "process" }
    | { type: "hierarchy" }
    | { type: "decision_matrix" }
    | { type: "pros_cons" }
    | { type: "ranking" }
    | { type: "status" }
    | { type: "before_after" }
    | { type: "faq" }
    | { type: "comparison_card" }
  >;
}) {
  switch (block.type) {
    case "process":
      return (
        <Shell>
          <BlockTitle title={block.title ?? "Process"} />
          <ol className="space-y-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
            {block.steps.map((step, index) => (
              <li key={step.id} className="flex gap-2">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background text-[11px] font-medium text-foreground">
                  {index + 1}
                </span>
                <span>
                  <span className="font-medium text-foreground/90">
                    {step.label}
                  </span>
                  {step.description ? (
                    <span className="block text-[13.5px]">{step.description}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </Shell>
      );
    case "hierarchy": {
      const byId = new Map(block.nodes.map((node) => [node.id, node]));
      const depthOf = (nodeId: string, seen = new Set<string>()): number => {
        if (seen.has(nodeId)) return 0;
        seen.add(nodeId);
        const node = byId.get(nodeId);
        if (!node?.parentId || !byId.has(node.parentId)) return 0;
        return 1 + depthOf(node.parentId, seen);
      };
      return (
        <Shell>
          <BlockTitle title={block.title ?? "Hierarchy"} />
          <ul className="space-y-1 text-[14.5px] leading-relaxed text-muted-foreground">
            {block.nodes.map((node) => (
              <li
                key={node.id}
                style={{ paddingLeft: `${depthOf(node.id) * 0.9}rem` }}
              >
                <span className="font-medium text-foreground/90">
                  {node.label}
                </span>
                {node.description ? (
                  <span className="text-muted-foreground">
                    {" "}
                    — {node.description}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Shell>
      );
    }
    case "decision_matrix": {
      const header = ["Option", ...block.criteria.map((c) => c.name)];
      return (
        <Shell>
          <BlockTitle title={block.title ?? "Decision"} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[16rem] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border/70 text-foreground/80">
                  {header.map((col) => (
                    <th key={col} className="px-2 py-1.5 font-medium">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.options.map((option) => (
                  <tr key={option} className="border-b border-border/40">
                    <td className="px-2 py-1.5 font-medium text-foreground/90">
                      {option}
                    </td>
                    {block.criteria.map((criterion) => {
                      const hit = block.scores.find(
                        (score) =>
                          score.option === option &&
                          score.criterion === criterion.name,
                      );
                      return (
                        <td
                          key={`${option}-${criterion.name}`}
                          className="px-2 py-1.5 text-muted-foreground"
                        >
                          {hit ? hit.score : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.recommendation ? (
            <p className="text-[14px] leading-relaxed text-foreground/85">
              {block.recommendation}
            </p>
          ) : null}
        </Shell>
      );
    }
    case "pros_cons":
      return (
        <Shell>
          <BlockTitle title={block.title ?? "Pros & cons"} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[12.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                Pros
              </p>
              <ul className="space-y-1 text-[14px] leading-relaxed text-muted-foreground">
                {block.pros.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[12.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                Cons
              </p>
              <ul className="space-y-1 text-[14px] leading-relaxed text-muted-foreground">
                {block.cons.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
          {block.conclusion ? (
            <p className="text-[14px] leading-relaxed text-foreground/85">
              {block.conclusion}
            </p>
          ) : null}
        </Shell>
      );
    case "ranking":
      return (
        <Shell>
          <BlockTitle title={block.title ?? "Ranking"} />
          <ol className="space-y-1.5 text-[14.5px] leading-relaxed text-muted-foreground">
            {block.items.map((item) => (
              <li key={`${item.rank}-${item.label}`} className="flex gap-2">
                <span className="mt-0.5 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-background px-1 text-[11px] font-medium text-foreground">
                  {item.rank}
                </span>
                <span>
                  <span className="font-medium text-foreground/90">
                    {item.label}
                  </span>
                  {item.score != null ? (
                    <span className="text-muted-foreground/80">
                      {" "}
                      ({item.score})
                    </span>
                  ) : null}
                  {item.reason ? (
                    <span className="block text-[13.5px]">{item.reason}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </Shell>
      );
    case "status":
      return (
        <Shell>
          <BlockTitle title={block.title ?? "Status"} />
          <ul className="space-y-1.5 text-[14px] leading-relaxed">
            {block.items.map((item) => (
              <li key={item.label} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    item.status === "complete" && "bg-emerald-500",
                    item.status === "in_progress" && "bg-amber-500",
                    item.status === "blocked" && "bg-rose-500",
                    item.status === "pending" && "bg-muted-foreground/40",
                  )}
                />
                <span>
                  <span className="font-medium text-foreground/90">
                    {item.label}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {item.status.replace("_", " ")}
                  </span>
                  {item.detail ? (
                    <span className="block text-[13.5px] text-muted-foreground">
                      {item.detail}
                    </span>
                  ) : null}
                  {item.blocker ? (
                    <span className="block text-[13.5px] text-rose-500/90">
                      Blocker: {item.blocker}
                    </span>
                  ) : null}
                  {item.nextAction ? (
                    <span className="block text-[13.5px] text-muted-foreground">
                      Next: {item.nextAction}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Shell>
      );
    case "before_after":
      return (
        <Shell>
          <BlockTitle title={block.title ?? "Before & after"} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[12.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                {block.before.title || "Before"}
              </p>
              <ul className="space-y-1 text-[14px] leading-relaxed text-muted-foreground">
                {block.before.items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[12.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                {block.after.title || "After"}
              </p>
              <ul className="space-y-1 text-[14px] leading-relaxed text-muted-foreground">
                {block.after.items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </Shell>
      );
    case "faq":
      return (
        <Shell>
          <BlockTitle title={block.title ?? "FAQ"} />
          <div className="space-y-2.5">
            {block.items.map((item) => (
              <div key={item.question}>
                <p className="text-[14px] font-medium tracking-[-0.01em] text-foreground/90">
                  {item.question}
                </p>
                <p className="mt-0.5 text-[14px] leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </Shell>
      );
    case "comparison_card":
      return (
        <Shell>
          <BlockTitle title={block.title ?? "Comparison"} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[16rem] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border/70 text-foreground/80">
                  <th className="px-2 py-1.5 font-medium" />
                  {block.columns.map((col) => (
                    <th key={col} className="px-2 py-1.5 font-medium">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row) => (
                  <tr key={row.label} className="border-b border-border/40">
                    <td className="px-2 py-1.5 font-medium text-foreground/90">
                      {row.label}
                    </td>
                    {row.values.map((value, index) => (
                      <td
                        key={`${row.label}-${index}`}
                        className="px-2 py-1.5 text-muted-foreground"
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Shell>
      );
  }
}
