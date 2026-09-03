import {
  defaultProjectBrowserSession,
  getProjectBrowserSession,
  makeStudioMediaTab,
  setProjectBrowserSession,
  type ProjectBrowserKey,
} from "@/lib/project-browser-session";
import { publishMarkdownShare } from "@/lib/shared-markdown-client";
import {
  markdownShareUrl,
  newMarkdownShareId,
  summarizeMarkdownTitle,
} from "@/lib/shared-markdown";
import type { SpaceId } from "@/lib/types";

/** Build a data URL for a markdown document tab. */
export function markdownDocumentDataUrl(markdown: string): string {
  // Prefer base64 so large Unicode replies stay compact and URI-safe.
  if (typeof btoa === "function") {
    const bytes = new TextEncoder().encode(markdown);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return `data:text/markdown;charset=utf-8;base64,${btoa(binary)}`;
  }
  return `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`;
}

/** Decode a markdown / plain-text data URL back to source text. */
export function decodeTextDataUrl(src: string): string | null {
  const match = src.match(
    /^data:(text\/(?:markdown|plain)|application\/octet-stream)(;charset=[^;,]+)?(;base64)?,(.*)$/i,
  );
  if (!match) return null;
  const isBase64 = Boolean(match[3]);
  const payload = match[4] ?? "";
  try {
    if (isBase64) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

/** Open an assistant reply as a markdown document tab in a project browser. */
export async function openProjectMarkdownDocumentTab(opts: {
  profileId: string;
  workspaceId: string;
  spaceId: SpaceId;
  projectId: string;
  projectTitle: string;
  markdown: string;
  title?: string;
}): Promise<{ shareId: string; shareUrl: string; title: string } | null> {
  if (!opts.markdown.trim() || !opts.projectId) return null;
  const key: ProjectBrowserKey = {
    profileId: opts.profileId,
    workspaceId: opts.workspaceId,
    spaceId: opts.spaceId,
    projectId: opts.projectId,
  };
  const fallback = defaultProjectBrowserSession({
    projectId: opts.projectId,
    title: opts.projectTitle,
  });
  const session = getProjectBrowserSession(key, fallback);
  const title =
    opts.title?.trim() || summarizeMarkdownTitle(opts.markdown) || "Document";
  const shareId = newMarkdownShareId();
  const tab = makeStudioMediaTab("studio-document", title);
  tab.url = markdownDocumentDataUrl(opts.markdown);
  tab.history = [tab.url];
  tab.historyIndex = 0;
  tab.shareId = shareId;

  setProjectBrowserSession(key, {
    tabs: [...session.tabs, tab],
    activeTabId: tab.id,
  });

  // Best-effort public publish — tab still works offline if this fails.
  try {
    const published = await publishMarkdownShare({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      title,
      markdown: opts.markdown,
      shareId,
    });
    if (published.id !== shareId) {
      const latest = getProjectBrowserSession(key, fallback);
      setProjectBrowserSession(key, {
        tabs: latest.tabs.map((row) =>
          row.id === tab.id ? { ...row, shareId: published.id } : row,
        ),
        activeTabId: latest.activeTabId,
      });
    }
    return {
      shareId: published.id,
      shareUrl: published.url,
      title: published.title || title,
    };
  } catch {
    return {
      shareId,
      shareUrl: markdownShareUrl(shareId),
      title,
    };
  }
}
