import type { ChatBlock, Thread } from "./types";

function threadHasTurns(thread: Thread | null | undefined) {
  return Boolean(
    thread?.messages.some(
      (message) => message.role === "user" || message.role === "assistant",
    ),
  );
}

function messageHasPendingAi(message: Thread["messages"][number]) {
  if (message.role !== "assistant") return false;
  if (
    message.status === "pending" ||
    message.status === "streaming" ||
    message.content === "Thinking…" ||
    message.content === "Thinking..."
  ) {
    return true;
  }
  return false;
}

function hasPendingAiInThread(thread: Thread) {
  return thread.messages.some((message) => messageHasPendingAi(message));
}

function blocksMatch(a: ChatBlock, b: ChatBlock): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "image_generation" && b.type === "image_generation") {
    return a.generationId === b.generationId;
  }
  if (a.type === "image" && b.type === "image") {
    return (
      Boolean(a.attachmentId && a.attachmentId === b.attachmentId) ||
      Boolean(a.url && a.url === b.url)
    );
  }
  if (a.type === "user_connector" && b.type === "user_connector") {
    return a.connectionId === b.connectionId;
  }
  return false;
}

function mergeMessageBlocks(
  localBlocks: ChatBlock[] | undefined,
  remoteBlocks: ChatBlock[] | undefined,
): ChatBlock[] | undefined {
  // Light listThreads omits the blocks column — keep whatever side still has them.
  if (!remoteBlocks?.length) return localBlocks;
  if (!localBlocks?.length) return remoteBlocks;

  const merged = remoteBlocks.map((remoteBlock, index) => {
    const localBlock =
      localBlocks[index]?.type === remoteBlock.type
        ? localBlocks[index]
        : localBlocks.find((candidate) => blocksMatch(candidate, remoteBlock));
    if (!localBlock || localBlock.type !== remoteBlock.type) return remoteBlock;
    if (remoteBlock.type === "image" && localBlock.type === "image") {
      if (!remoteBlock.url?.trim() && localBlock.url?.trim()) {
        return { ...remoteBlock, url: localBlock.url };
      }
    }
    if (
      remoteBlock.type === "image_generation" &&
      localBlock.type === "image_generation"
    ) {
      if (localBlock.status === "generating") return localBlock;
      if (
        localBlock.status === "completed" &&
        localBlock.imageUrl?.trim() &&
        (!remoteBlock.imageUrl?.trim() ||
          remoteBlock.status !== "completed")
      ) {
        return localBlock;
      }
    }
    return remoteBlock;
  });

  for (const localBlock of localBlocks) {
    if (
      localBlock.type === "image_generation" &&
      (localBlock.status === "generating" ||
        (localBlock.status === "completed" && localBlock.imageUrl?.trim())) &&
      !merged.some((block) => blocksMatch(block, localBlock))
    ) {
      merged.push(localBlock);
    }
    // Connector chips are small JSON — keep local chips if remote light-load dropped them.
    if (
      localBlock.type === "user_connector" &&
      !merged.some((block) => blocksMatch(block, localBlock))
    ) {
      merged.push(localBlock);
    }
  }
  return merged;
}

function withMergedBlocks(
  base: Thread["messages"][number],
  other: Thread["messages"][number] | undefined,
  preferRemoteStructure: boolean,
): Thread["messages"][number] {
  if (!other) return base;
  const blocks = preferRemoteStructure
    ? mergeMessageBlocks(other.blocks, base.blocks)
    : mergeMessageBlocks(base.blocks, other.blocks);
  if (blocks === base.blocks) return base;
  return { ...base, blocks };
}

/** Merge a remote thread hydrate with the in-memory copy to avoid image flicker. */
export function mergeHydratedThread(
  local: Thread | undefined,
  remote: Thread,
): Thread {
  if (!local || local.id !== remote.id) return remote;
  if (hasPendingAiInThread(local)) return local;

  const localAt = Date.parse(local.updatedAt || "") || 0;
  const remoteAt = Date.parse(remote.updatedAt || "") || 0;
  const localLonger =
    threadHasTurns(local) && local.messages.length > remote.messages.length;
  // Strict `>` so equal timestamps still pick up blocks from getThread
  // after a light listThreads hydrate (no blocks column).
  const localFresher = localAt > remoteAt && threadHasTurns(local);

  if (localLonger || localFresher) {
    return {
      ...local,
      messages: local.messages.map((localMsg) => {
        const remoteMsg = remote.messages.find((m) => m.id === localMsg.id);
        return withMergedBlocks(localMsg, remoteMsg, false);
      }),
    };
  }

  // Remote is ahead or same age. Take remote turns; re-attach local-only
  // image / connector payloads that light listThreads omitted.
  const messages = remote.messages.map((remoteMsg) => {
    const localMsg = local.messages.find((m) => m.id === remoteMsg.id);
    return withMergedBlocks(remoteMsg, localMsg, true);
  });

  return { ...remote, messages };
}
