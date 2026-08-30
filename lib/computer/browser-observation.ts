import type { BrowserObservation } from "@/lib/computer/computer-provider";

const MAX_SNAPSHOT_CHARS = 12_000;

export function truncateObservation(observation: BrowserObservation): BrowserObservation {
  return {
    ...observation,
    snapshot: observation.snapshot.slice(0, MAX_SNAPSHOT_CHARS),
  };
}

export function formatObservationForModel(observation: BrowserObservation): string {
  const lines = [
    `URL: ${observation.url}`,
    `Title: ${observation.title}`,
    "",
    "Accessibility snapshot (use @eN refs for actions):",
    observation.snapshot.slice(0, MAX_SNAPSHOT_CHARS),
  ];
  return lines.join("\n");
}

export function extractInteractiveRefs(snapshot: string): string[] {
  const atRefs = snapshot.match(/@e\d+/g) ?? [];
  const bracketRefs = [...snapshot.matchAll(/\[ref=(e\d+)\]/g)].map(
    (match) => `@${match[1]}`,
  );
  return [...new Set([...atRefs, ...bracketRefs])];
}

export function parseBrowserObservationPayload(payload: {
  url?: string;
  title?: string;
  snapshot?: string;
  sessionId?: string;
}): BrowserObservation {
  return {
    url: payload.url ?? "",
    title: payload.title ?? "",
    snapshot: payload.snapshot ?? "",
    sessionId: payload.sessionId,
  };
}
