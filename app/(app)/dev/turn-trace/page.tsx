"use client";

import { TurnTraceViewer } from "@/components/dev/TurnTraceViewer";

export default function TurnTracePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">Turn trace debugger</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          End-to-end structured tracing for local FM and cloud Edge V2 turns. Each chat
          turn gets a <code className="text-zinc-300">traceId</code> (cloud uses{" "}
          <code className="text-zinc-300">turn_id</code>). Cloud traces persist in{" "}
          <code className="text-zinc-300">ai_chat_turns.structured_trace</code> after
          migration <code className="text-zinc-300">20260831123600</code>. Use the
          retrieval chain to see where search facts diverge from the model answer.
        </p>
      </div>
      <TurnTraceViewer />
    </div>
  );
}
