import type { ContextPacket } from "../types.ts";
import type { KbFetch } from "./providers/knowledge-base.ts";
import type { ModelAnswerFn } from "./providers/model.ts";
import type { WebFetch, WebRead } from "./providers/web.ts";

export type ExecuteDeps = {
  packet: ContextPacket;
  fetchWeb?: WebFetch;
  readUrl?: WebRead;
  fetchKb?: KbFetch;
  modelAnswer?: ModelAnswerFn;
  /** Force share-price miss for tests */
  forceUnresolvedIds?: string[];
  /** Allow deterministic web stubs (tests / offline). Default false in prod. */
  allowWebStub?: boolean;
};
