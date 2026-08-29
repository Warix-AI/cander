/** Read extractable text from a KB upload (plain/markdown/etc.). */
export async function extractKnowledgeFileText(
  file: File,
): Promise<string | undefined> {
  const name = file.name.toLowerCase();
  const textish =
    file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/xml" ||
    /\.(md|markdown|txt|csv|json|html?|xml|tsv)$/i.test(name);
  if (!textish) return undefined;
  if (file.size > 200_000) return undefined;
  try {
    const text = await file.text();
    const trimmed = text.trim();
    return trimmed ? trimmed.slice(0, 200_000) : undefined;
  } catch {
    return undefined;
  }
}
