/**
 * Ordered composer blocks: text ↔ connector chips ↔ dismissed trigger words.
 */

export type ComposerConnectorScope = {
  connectionId: string;
  connectorId: string;
  label: string;
};

export type ComposerTextBlock = {
  key: string;
  type: "text";
  value: string;
};

export type ComposerConnectorBlock = {
  key: string;
  type: "connector";
  scope: ComposerConnectorScope;
  /** Trigger token this chip replaced inline (restored when the chip is dismissed). */
  replacedText?: string;
};

/** Dismissed connector — clickable plain word that can re-add this or related apps. */
export type ComposerTriggerBlock = {
  key: string;
  type: "trigger";
  matched: string;
  preferredConnectorId: string;
  preferredConnectionId?: string;
};

export type ComposerBlock =
  | ComposerTextBlock
  | ComposerConnectorBlock
  | ComposerTriggerBlock;

function newKey(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyComposerBlocks(): ComposerBlock[] {
  return [{ key: newKey("t"), type: "text", value: "" }];
}

export function blocksFromText(text: string): ComposerBlock[] {
  return [{ key: newKey("t"), type: "text", value: text }];
}

function blockPlainText(block: ComposerBlock): string {
  if (block.type === "text") return block.value;
  if (block.type === "trigger") return block.matched;
  return "";
}

export function textFromBlocks(blocks: ComposerBlock[]): string {
  return blocks.map(blockPlainText).join("");
}

/** Plain send/display string with connector labels in chip positions. */
export function serializeComposerBlocks(blocks: ComposerBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "text") return b.value;
      if (b.type === "trigger") return b.matched;
      return b.scope.label;
    })
    .join("");
}

/** Snapshot of inline connectors for the sent user bubble + AI scope. */
export function composerConnectorsForSend(
  blocks: ComposerBlock[],
): ComposerConnectorScope[] {
  return connectorsFromBlocks(blocks);
}

export function connectorsFromBlocks(
  blocks: ComposerBlock[],
): ComposerConnectorScope[] {
  return blocks
    .filter((b): b is ComposerConnectorBlock => b.type === "connector")
    .map((b) => b.scope);
}

export function triggersFromBlocks(
  blocks: ComposerBlock[],
): ComposerTriggerBlock[] {
  return blocks.filter((b): b is ComposerTriggerBlock => b.type === "trigger");
}

/** Ensure text · atomic · text · … · text with no adjacent text merged. */
export function normalizeComposerBlocks(blocks: ComposerBlock[]): ComposerBlock[] {
  const out: ComposerBlock[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      const prev = out[out.length - 1];
      if (prev?.type === "text") {
        out[out.length - 1] = { ...prev, value: prev.value + block.value };
      } else {
        out.push(block);
      }
      continue;
    }

    if (out.length === 0 || out[out.length - 1]!.type !== "text") {
      out.push({ key: newKey("t"), type: "text", value: "" });
    }

    if (block.type === "connector") {
      const filtered = out.filter(
        (b) =>
          !(
            b.type === "connector" &&
            b.scope.connectorId === block.scope.connectorId
          ),
      );
      out.length = 0;
      out.push(...filtered);
      if (out.length === 0 || out[out.length - 1]!.type !== "text") {
        out.push({ key: newKey("t"), type: "text", value: "" });
      }
      out.push(block);
      continue;
    }

    // trigger — one per preferred connector id
    const filtered = out.filter(
      (b) =>
        !(
          b.type === "trigger" &&
          b.preferredConnectorId === block.preferredConnectorId
        ),
    );
    out.length = 0;
    out.push(...filtered);
    if (out.length === 0 || out[out.length - 1]!.type !== "text") {
      out.push({ key: newKey("t"), type: "text", value: "" });
    }
    out.push(block);
  }
  if (out.length === 0 || out[out.length - 1]!.type !== "text") {
    out.push({ key: newKey("t"), type: "text", value: "" });
  }
  if (out[0]?.type !== "text") {
    out.unshift({ key: newKey("t"), type: "text", value: "" });
  }
  return out;
}

export function insertConnectorAtTextCursor(
  blocks: ComposerBlock[],
  textKey: string,
  cursor: number,
  scope: ComposerConnectorScope,
): { blocks: ComposerBlock[]; focusKey: string } {
  const normalized = normalizeComposerBlocks(blocks);
  const idx = normalized.findIndex((b) => b.type === "text" && b.key === textKey);
  if (idx < 0) {
    const focusKey = newKey("t");
    return {
      blocks: normalizeComposerBlocks([
        ...normalized,
        { key: newKey("c"), type: "connector", scope },
        { key: focusKey, type: "text", value: "" },
      ]),
      focusKey,
    };
  }
  const textBlock = normalized[idx] as ComposerTextBlock;
  const left = textBlock.value.slice(0, Math.max(0, cursor));
  const right = textBlock.value.slice(Math.max(0, cursor));
  const focusKey = newKey("t");
  const next: ComposerBlock[] = [
    ...normalized.slice(0, idx),
    { key: textBlock.key, type: "text", value: left },
    { key: newKey("c"), type: "connector", scope },
    { key: focusKey, type: "text", value: right },
    ...normalized.slice(idx + 1),
  ];
  return { blocks: normalizeComposerBlocks(next), focusKey };
}

export function toggleConnectorInBlocks(
  blocks: ComposerBlock[],
  scope: ComposerConnectorScope,
  textKey: string | null,
  cursor: number,
): { blocks: ComposerBlock[]; focusKey: string | null } {
  const existing = blocks.find(
    (b) =>
      b.type === "connector" && b.scope.connectionId === scope.connectionId,
  );
  if (existing) {
    const without = blocks.filter((b) => b.key !== existing.key);
    const normalized = normalizeComposerBlocks(without);
    const lastText = [...normalized].reverse().find((b) => b.type === "text");
    return { blocks: normalized, focusKey: lastText?.key ?? null };
  }
  const targetKey =
    textKey && blocks.some((b) => b.type === "text" && b.key === textKey)
      ? textKey
      : ([...blocks].reverse().find((b) => b.type === "text") as
          | ComposerTextBlock
          | undefined)?.key ?? null;
  if (!targetKey) {
    const inserted = insertConnectorAtTextCursor(
      emptyComposerBlocks(),
      emptyComposerBlocks()[0]!.key,
      0,
      scope,
    );
    return inserted;
  }
  return insertConnectorAtTextCursor(blocks, targetKey, cursor, scope);
}

export function removeConnectorBlock(
  blocks: ComposerBlock[],
  connectionId: string,
): ComposerBlock[] {
  return normalizeComposerBlocks(
    blocks.filter(
      (b) => !(b.type === "connector" && b.scope.connectionId === connectionId),
    ),
  );
}

/**
 * Turn a connector chip into a clickable trigger word (dismiss without ghost pill).
 */
export function dismissConnectorToTrigger(
  blocks: ComposerBlock[],
  connectionId: string,
): ComposerBlock[] {
  const idx = blocks.findIndex(
    (b) => b.type === "connector" && b.scope.connectionId === connectionId,
  );
  if (idx < 0) return blocks;
  const chip = blocks[idx] as ComposerConnectorBlock;
  const matched = chip.replacedText ?? chip.scope.label;
  const next: ComposerBlock[] = [
    ...blocks.slice(0, idx),
    {
      key: newKey("tr"),
      type: "trigger",
      matched,
      preferredConnectorId: chip.scope.connectorId,
      preferredConnectionId: chip.scope.connectionId,
    } satisfies ComposerTriggerBlock,
    ...blocks.slice(idx + 1),
  ];
  return normalizeComposerBlocks(next);
}

/**
 * Remove a connector chip and put its replaced trigger word back as plain text.
 * Prefer dismissConnectorToTrigger for clickable restore.
 */
export function removeConnectorBlockRestoringText(
  blocks: ComposerBlock[],
  connectionId: string,
): ComposerBlock[] {
  return dismissConnectorToTrigger(blocks, connectionId);
}

/** Promote a dismissed trigger word into a connector chip. */
export function promoteTriggerToConnector(
  blocks: ComposerBlock[],
  triggerKey: string,
  scope: ComposerConnectorScope,
): { blocks: ComposerBlock[]; focusKey: string | null } {
  const idx = blocks.findIndex(
    (b) => b.type === "trigger" && b.key === triggerKey,
  );
  if (idx < 0) return { blocks, focusKey: null };
  const trigger = blocks[idx] as ComposerTriggerBlock;
  const focusKey = newKey("t");
  const next: ComposerBlock[] = [
    ...blocks.slice(0, idx),
    {
      key: newKey("c"),
      type: "connector",
      scope,
      replacedText: trigger.matched,
    },
    { key: focusKey, type: "text", value: "" },
    ...blocks.slice(idx + 1),
  ];
  return {
    blocks: normalizeComposerBlocks(next),
    focusKey,
  };
}

/** Merge a trigger word back into editable plain text (e.g. backspace). */
export function dissolveTriggerToText(
  blocks: ComposerBlock[],
  triggerKey: string,
): { blocks: ComposerBlock[]; focusKey: string | null; cursor: number } {
  const idx = blocks.findIndex(
    (b) => b.type === "trigger" && b.key === triggerKey,
  );
  if (idx < 0) return { blocks, focusKey: null, cursor: 0 };
  const trigger = blocks[idx] as ComposerTriggerBlock;
  const next: ComposerBlock[] = [
    ...blocks.slice(0, idx),
    { key: newKey("t"), type: "text", value: trigger.matched },
    ...blocks.slice(idx + 1),
  ];
  const normalized = normalizeComposerBlocks(next);
  let offset = 0;
  let focusKey: string | null = null;
  let cursor = 0;
  for (const block of normalized) {
    if (block.type !== "text") {
      offset += blockPlainText(block).length;
      continue;
    }
    const wordAt = block.value.indexOf(trigger.matched);
    if (wordAt >= 0) {
      focusKey = block.key;
      cursor = wordAt + trigger.matched.length;
      break;
    }
    offset += block.value.length;
  }
  const lastText = [...normalized].reverse().find((b) => b.type === "text");
  return {
    blocks: normalized,
    focusKey: focusKey ?? lastText?.key ?? null,
    cursor,
  };
}

export function updateTextBlock(
  blocks: ComposerBlock[],
  key: string,
  value: string,
): ComposerBlock[] {
  return blocks.map((b) =>
    b.type === "text" && b.key === key ? { ...b, value } : b,
  );
}

export function backspaceRemoveConnector(
  blocks: ComposerBlock[],
  textKey: string,
): { blocks: ComposerBlock[]; focusKey: string | null } | null {
  const idx = blocks.findIndex((b) => b.type === "text" && b.key === textKey);
  if (idx <= 0) return null;
  const text = blocks[idx] as ComposerTextBlock;
  if (text.value.length > 0) return null;
  const prev = blocks[idx - 1];
  if (prev?.type === "connector") {
    const next = blocks.filter((b) => b.key !== prev.key && b.key !== text.key);
    const normalized = normalizeComposerBlocks(next);
    const focus =
      normalized.find(
        (b) => b.type === "text" && b.key === blocks[idx - 2]?.key,
      ) ?? [...normalized].reverse().find((b) => b.type === "text");
    return { blocks: normalized, focusKey: focus?.key ?? null };
  }
  if (prev?.type === "trigger") {
    const dissolved = dissolveTriggerToText(
      blocks.filter((b) => b.key !== text.key),
      prev.key,
    );
    return {
      blocks: dissolved.blocks,
      focusKey: dissolved.focusKey,
    };
  }
  return null;
}
