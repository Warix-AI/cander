"use client";

import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  normalizeComposerBlocks,
  type ComposerBlock,
  type ComposerConnectorBlock,
  type ComposerTriggerBlock,
} from "@/lib/composer-blocks";

const ZWSP = "\u200b";

function newKey(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function fingerprint(blocks: ComposerBlock[]) {
  return blocks
    .map((b) => {
      if (b.type === "text") return `t:${b.key}:${b.value}`;
      if (b.type === "connector") {
        return `c:${b.key}:${b.scope.connectionId}:${b.scope.label}`;
      }
      return `tr:${b.key}:${b.matched}`;
    })
    .join("|");
}

export function composerPlainOffsetForTextKey(
  blocks: ComposerBlock[],
  textKey: string,
  cursor = 0,
) {
  let offset = 0;
  for (const block of blocks) {
    if (block.type === "text") {
      if (block.key === textKey) return offset + Math.max(0, cursor);
      offset += block.value.length;
      continue;
    }
    if (block.type === "connector") offset += block.scope.label.length;
    else offset += block.matched.length;
  }
  return offset;
}

function parseEditableDom(root: HTMLElement): ComposerBlock[] {
  const out: ComposerBlock[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push({
        key: newKey("t"),
        type: "text",
        value: (node.textContent ?? "").replaceAll(ZWSP, ""),
      });
      continue;
    }
    if (!(node instanceof HTMLElement)) continue;
    if (node.dataset.composerConnector === "1") {
      try {
        const scope = JSON.parse(node.dataset.scope ?? "{}") as {
          connectionId?: string;
          connectorId?: string;
          label?: string;
        };
        if (scope.connectionId && scope.connectorId) {
          out.push({
            key: node.dataset.key || newKey("c"),
            type: "connector",
            scope: {
              connectionId: scope.connectionId,
              connectorId: scope.connectorId,
              label: scope.label || scope.connectorId,
            },
            replacedText: node.dataset.replaced || undefined,
          });
        }
      } catch {
        /* ignore */
      }
      continue;
    }
    if (node.dataset.composerTrigger === "1") {
      out.push({
        key: node.dataset.key || newKey("tr"),
        type: "trigger",
        matched: node.dataset.matched || node.textContent || "",
        preferredConnectorId: node.dataset.preferredConnectorId || "",
        preferredConnectionId: node.dataset.preferredConnectionId || undefined,
      });
      continue;
    }
    out.push({
      key: newKey("t"),
      type: "text",
      value: (node.textContent ?? "").replaceAll(ZWSP, ""),
    });
  }
  return normalizeComposerBlocks(out);
}

export function caretPlainOffset(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return 0;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().replaceAll(ZWSP, "").length;
}

export function setCaretPlainOffset(root: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  root.focus({ preventScroll: true });
  let remaining = Math.max(0, offset);
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walk.nextNode();
  while (node) {
    const raw = node.textContent ?? "";
    let logical = 0;
    for (let i = 0; i < raw.length; i += 1) {
      if (raw[i] === ZWSP) continue;
      if (logical === remaining) {
        const range = document.createRange();
        range.setStart(node, i);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      logical += 1;
    }
    remaining -= logical;
    const next = walk.nextNode();
    if (!next) {
      const range = document.createRange();
      range.setStart(node, raw.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    node = next;
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * One full-width contentEditable surface so wrapping + hit targets behave like
 * a normal text field. Chips/triggers are non-editable inline nodes.
 */
export function ComposerEditableSurface({
  blocks,
  placeholder,
  className,
  style,
  autoFocus,
  disabled,
  renderConnector,
  renderTrigger,
  onBlocksChange,
  onCursorChange,
  onFocus,
  onKeyDown,
  onRemoveConnector,
  onTriggerClick,
}: {
  blocks: ComposerBlock[];
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  autoFocus?: boolean;
  disabled?: boolean;
  renderConnector: (block: ComposerConnectorBlock) => ReactNode;
  renderTrigger: (block: ComposerTriggerBlock) => ReactNode;
  onBlocksChange: (blocks: ComposerBlock[], cursor: number) => void;
  onCursorChange?: (cursor: number) => void;
  onFocus?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRemoveConnector?: (connectionId: string) => void;
  onTriggerClick?: (triggerKey: string, anchor: HTMLElement) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const lastFp = useRef("");
  const skipInput = useRef(false);
  const empty =
    blocks.length === 1 &&
    blocks[0]?.type === "text" &&
    !blocks[0].value;

  useLayoutEffect(() => {
    const root = rootRef.current;
    const mirror = mirrorRef.current;
    if (!root || !mirror) return;
    const fp = fingerprint(blocks);
    if (fp === lastFp.current && root.childNodes.length) return;
    const offset =
      document.activeElement === root ? caretPlainOffset(root) : null;
    skipInput.current = true;
    root.replaceChildren();
    for (const child of Array.from(mirror.childNodes)) {
      root.appendChild(child.cloneNode(true));
    }
    if (!root.textContent) {
      root.appendChild(document.createTextNode(ZWSP));
    } else if (root.lastChild?.nodeType !== Node.TEXT_NODE) {
      root.appendChild(document.createTextNode(ZWSP));
    }
    lastFp.current = fp;
    if (offset != null) setCaretPlainOffset(root, offset);
    queueMicrotask(() => {
      skipInput.current = false;
    });
  }, [blocks]);

  useLayoutEffect(() => {
    if (!autoFocus || disabled) return;
    const root = rootRef.current;
    if (!root) return;
    setCaretPlainOffset(root, 10_000);
  }, [autoFocus, disabled]);

  return (
    <div
      className={cn("relative min-h-5 min-w-0 flex-1 cursor-text", className)}
      style={style}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        const root = rootRef.current;
        if (root) setCaretPlainOffset(root, 10_000);
      }}
    >
      <div ref={mirrorRef} className="hidden" aria-hidden>
        {blocks.map((block) => {
          if (block.type === "text") {
            return block.value ? (
              <span key={block.key}>{block.value}</span>
            ) : (
              <span key={block.key}>{ZWSP}</span>
            );
          }
          if (block.type === "connector") {
            return (
              <span
                key={block.key}
                data-composer-connector="1"
                data-key={block.key}
                data-scope={JSON.stringify(block.scope)}
                data-replaced={block.replacedText ?? ""}
                contentEditable={false}
              >
                {renderConnector(block)}
              </span>
            );
          }
          return (
            <span
              key={block.key}
              data-composer-trigger="1"
              data-key={block.key}
              data-matched={block.matched}
              data-preferred-connector-id={block.preferredConnectorId}
              data-preferred-connection-id={block.preferredConnectionId ?? ""}
              data-composer-trigger-word={block.key}
              contentEditable={false}
            >
              {renderTrigger(block)}
            </span>
          );
        })}
      </div>

      {empty && placeholder ? (
        <span className="pointer-events-none absolute top-0 left-0 text-muted-foreground">
          {placeholder}
        </span>
      ) : null}

      <div
        ref={rootRef}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={cn(
          "min-h-5 w-full whitespace-pre-wrap break-words outline-none",
          "caret-foreground [&_*]:outline-none",
        )}
        onFocus={() => onFocus?.()}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          const remove = target.closest(
            "[data-remove-connection]",
          ) as HTMLElement | null;
          if (remove?.dataset.removeConnection) {
            event.preventDefault();
            onRemoveConnector?.(remove.dataset.removeConnection);
            return;
          }
          const trigger = target.closest(
            "[data-composer-trigger-word]",
          ) as HTMLElement | null;
          if (trigger?.dataset.composerTriggerWord) {
            event.preventDefault();
            onTriggerClick?.(trigger.dataset.composerTriggerWord, trigger);
          }
        }}
        onMouseUp={() => {
          const root = rootRef.current;
          if (root) onCursorChange?.(caretPlainOffset(root));
        }}
        onKeyUp={() => {
          const root = rootRef.current;
          if (root) onCursorChange?.(caretPlainOffset(root));
        }}
        onInput={() => {
          if (skipInput.current) return;
          const root = rootRef.current;
          if (!root) return;
          const next = parseEditableDom(root);
          const cursor = caretPlainOffset(root);
          lastFp.current = fingerprint(next);
          onBlocksChange(next, cursor);
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

export function getComposerEditableRoot(
  container: HTMLElement | null,
): HTMLElement | null {
  return container?.querySelector('[role="textbox"][contenteditable]') ?? null;
}
