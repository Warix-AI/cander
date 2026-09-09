/**
 * Format publish API errors for the Publish sheet.
 * Distinguishes draft-repair failures from Vercel/platform failures.
 */

export function formatPublishUserError(raw: string): {
  title: string;
  body: string;
  draftNeedsRepair: boolean;
} {
  const text = (raw || "").trim() || "Publish failed.";
  const draftNeedsRepair =
    /draft needs repair|Publish blocked — the draft|preflight|robots|sitemap|package\.json|App Router|Typecheck|next build failed during publish preflight|Missing dependency|Unresolved import|Tell me to repair/i.test(
      text,
    ) && !/VERCEL_TOKEN|GitHub App is not configured|rate limit|503|unavailable/i.test(text);

  if (draftNeedsRepair) {
    const cleaned = text
      .replace(/^Publish blocked — the draft needs repair before it can go live \(this is not a Vercel outage\):\s*/i, "")
      .replace(/^Publish blocked — draft tip failed preflight:\s*/i, "")
      .trim();
    return {
      title: "Draft needs repair",
      body:
        cleaned ||
        "The current draft tip is not publishable yet. Ask Cander to repair the site, then try again.",
      draftNeedsRepair: true,
    };
  }

  return {
    title: "Publish failed",
    body: text,
    draftNeedsRepair: false,
  };
}
