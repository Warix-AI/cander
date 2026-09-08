/**
 * Path safety for Build sandbox / git commit (shared, no Octokit deps).
 */

export function safeRepoRelativePath(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/^workspace\//, "");
  if (!cleaned || cleaned.includes("..") || cleaned.startsWith("/")) {
    throw new Error(`Unsafe path: ${raw}`);
  }
  if (cleaned.length > 512) {
    throw new Error(`Path too long: ${raw}`);
  }
  return cleaned;
}
