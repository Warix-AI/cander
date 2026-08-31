/**
 * COMMIT — update compact conversation notes.
 */

import { commitSimpleNotes } from "./state-store.ts";
import { mergeCommitNotes } from "./answer.ts";
import type { AnswerPacket, CommitNotes, HydrateResult } from "./types.ts";

export function commitTurnNotes(opts: {
  threadId?: string | null;
  prior: CommitNotes;
  packet: AnswerPacket;
  hydrate: HydrateResult;
}): CommitNotes {
  const next = mergeCommitNotes(opts.prior, opts.packet, opts.hydrate);
  commitSimpleNotes(opts.threadId, next);
  return next;
}
