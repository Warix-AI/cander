import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeTwentyFirstPipeline } from "../lib/ai/build/twenty-first/pipeline.ts";

describe("twenty-first normalize pipeline", () => {
  it("resolves framer-motion + cn helper without @ts-nocheck", () => {
    const stats = `
import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Stats() {
  const ease = { ease: "easeOut", type: "spring" };
  return (
    <motion.div
      className="flex gap-4 bg-slate-900 text-white p-6 rounded-xl"
      transition={ease}
    >
      <div className={cn("text-2xl font-bold")}>42</div>
    </motion.div>
  );
}
`;
    const ok = normalizeTwentyFirstPipeline({
      components: [
        {
          id: "7870",
          name: "Stats",
          category: "stats",
          source: "twenty_first",
          codeSnippet: stats,
          dependencies: ["framer-motion"],
        },
      ],
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.fallbackToCatalog, false);
    assert.ok(ok.packageDependencies["framer-motion"]);
    assert.ok(ok.files.some((f) => f.path === "lib/utils.ts"));
    assert.ok(
      ok.files.some((f) => f.path === "components/twenty-first/stats-7870.tsx"),
    );
    assert.ok(ok.files.some((f) => f.path === "tsconfig.json"));
    assert.ok(!ok.files.some((f) => f.content.includes("@ts-nocheck")));
    assert.ok(
      ok.files.some((f) => f.path === "postcss.config.mjs"),
      "tailwind utilities should pull postcss config",
    );
  });

  it("drops blocked ai SDK components and falls back", () => {
    const blocked = `
import { ToolUIPart } from "ai";
export function Bad({ part }: { part: ToolUIPart }) {
  return <div>{String(part)}</div>;
}
`;
    const bad = normalizeTwentyFirstPipeline({
      components: [
        {
          id: "bad",
          name: "Bad",
          category: "faq",
          source: "twenty_first",
          codeSnippet: blocked,
        },
      ],
    });
    assert.equal(bad.fallbackToCatalog, true);
    assert.ok(bad.dropped.some((d) => d.id === "bad"));
  });

  it("caches manifests across runs", () => {
    const code = `
import { cn } from "@/lib/utils";
export const X = () => <div className={cn("p-2")}>x</div>;
`;
    const first = normalizeTwentyFirstPipeline({
      components: [
        {
          id: "cache-1",
          name: "X",
          category: "cta",
          source: "twenty_first",
          codeSnippet: code,
        },
      ],
    });
    assert.equal(first.ok, true);
    const second = normalizeTwentyFirstPipeline({
      components: [
        {
          id: "cache-1",
          name: "X",
          category: "cta",
          source: "twenty_first",
          codeSnippet: code,
        },
      ],
    });
    assert.ok(second.usedCache >= 1);
  });
});
