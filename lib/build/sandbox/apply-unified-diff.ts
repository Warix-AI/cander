/**
 * Minimal unified-diff applier for single-file computer.files.patch.
 * Supports @@ hunks with context/add/remove lines. Not a full git apply.
 */

export type ApplyUnifiedDiffResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

export function applyUnifiedDiff(
  original: string,
  patchText: string,
): ApplyUnifiedDiffResult {
  const patch = patchText.replace(/\r\n/g, "\n");
  if (!/^@@ /m.test(patch)) {
    return { ok: false, error: "Not a unified diff (missing @@ hunks)." };
  }

  const origLines = original.replace(/\r\n/g, "\n").split("\n");
  // Preserve whether the original ended with a trailing newline.
  if (origLines.length && origLines[origLines.length - 1] === "") {
    origLines.pop();
  }

  const result: string[] = [];
  let cursor = 0;
  const hunkRe = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s@@/;
  const lines = patch.split("\n");
  let i = 0;
  let sawHunk = false;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.startsWith("@@")) {
      i += 1;
      continue;
    }
    const m = line.match(hunkRe);
    if (!m) {
      return { ok: false, error: `Invalid hunk header: ${line}` };
    }
    sawHunk = true;
    const oldStart = Number(m[1]);
    const copyUntil = Math.max(0, oldStart - 1);
    while (cursor < copyUntil && cursor < origLines.length) {
      result.push(origLines[cursor]!);
      cursor += 1;
    }
    i += 1;
    while (i < lines.length && !lines[i]!.startsWith("@@")) {
      const hl = lines[i]!;
      if (
        hl.startsWith("diff ") ||
        hl.startsWith("---") ||
        hl.startsWith("+++") ||
        hl.startsWith("index ")
      ) {
        break;
      }
      if (hl.startsWith("\\")) {
        i += 1;
        continue;
      }
      const tag = hl[0];
      const body = hl.slice(1);
      if (tag === " ") {
        result.push(body);
        cursor += 1;
      } else if (tag === "-") {
        cursor += 1;
      } else if (tag === "+") {
        result.push(body);
      } else if (hl === "") {
        // Empty line without tag — treat as blank context.
        result.push("");
        cursor += 1;
      } else {
        return { ok: false, error: `Unrecognized hunk line: ${hl.slice(0, 40)}` };
      }
      i += 1;
    }
  }

  if (!sawHunk) {
    return { ok: false, error: "No hunks found in patch." };
  }

  while (cursor < origLines.length) {
    result.push(origLines[cursor]!);
    cursor += 1;
  }

  let content = result.join("\n");
  if (original.endsWith("\n") && !content.endsWith("\n")) {
    content += "\n";
  }
  return { ok: true, content };
}
