/**
 * Pure helpers for git:{sha} revision pointers.
 */

export function gitStoragePointer(sha: string): string {
  const cleaned = sha.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(cleaned)) {
    throw new Error(`Invalid git SHA: ${sha}`);
  }
  return `git:${cleaned}`;
}

export function parseGitStoragePointer(
  pointer: string | null | undefined,
): string | null {
  if (!pointer) return null;
  const m = /^git:([0-9a-f]{7,40})$/i.exec(pointer.trim());
  return m ? m[1].toLowerCase() : null;
}

export function shortSha(sha: string, len = 7): string {
  return sha.trim().toLowerCase().slice(0, len);
}

export function isGitSha(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value.trim());
}
