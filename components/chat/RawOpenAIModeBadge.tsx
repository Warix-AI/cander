"use client";

import { useEffect, useState } from "react";
import { isRawOpenAIModeEnabled } from "@/lib/ai/raw-openai/flags";

/** Dev/benchmark banner when raw OpenAI bypass is active. */
export function RawOpenAIModeBadge() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(isRawOpenAIModeEnabled());
  }, []);
  if (!on) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-3 left-3 z-[80] rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-[11px] font-medium tracking-wide text-amber-800 shadow-sm backdrop-blur dark:text-amber-200"
      title="Cander orchestration bypassed — conversation goes straight to OpenAI"
    >
      RAW OPENAI
    </div>
  );
}
