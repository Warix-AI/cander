"use client";

import { getRawOpenAIAuthHeaders } from "@/lib/ai/raw-openai/upload-client";

export async function completeWithOpenAI(opts: {
  prompt: string;
  system?: string;
}): Promise<string> {
  const headers = await getRawOpenAIAuthHeaders();
  if (!headers.Authorization) {
    throw new Error("Sign in to use cloud AI.");
  }

  const res = await fetch("/api/ai/openai/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      system: opts.system,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
  };

  if (!res.ok || data.error) {
    throw new Error(data.error || `OpenAI request failed (${res.status})`);
  }

  return (data.text || "").trim();
}
