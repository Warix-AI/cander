"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Check, Ellipsis, FileText, FolderOpen } from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { useSpaceData } from "@/components/app/SpaceDataProvider";
import { openProjectMarkdownDocumentTab } from "@/lib/chat-document-attach";
import {
  getSpaceEntityStoreServerSnapshot,
  getSpaceEntityStoreSnapshot,
  localSpaceEntityStore,
  subscribeSpaceEntityStore,
} from "@/lib/api/space-entity-store";
import { PRIMARY_NAV_SPACES } from "@/lib/spaces";
import { navLabel } from "@/lib/use-main-nav-items";
import type { Message, SpaceId } from "@/lib/types";
import { cn } from "@/lib/utils";

function messageMarkdown(message: Message, visibleContent: string): string {
  const parts = [
    visibleContent,
    ...(message.blocks ?? []).flatMap((block) => {
      if (block.type === "text") return [block.text];
      if (block.type === "plan") return [`## ${block.title}`, ...block.steps.map((s, i) => `${i + 1}. ${s}`)];
      if (block.type === "build")
        return [
          `## ${block.title}`,
          ...block.items.map((item) => `- ${item.label}`),
        ];
      if (block.type === "process") {
        return [
          block.title ? `## ${block.title}` : "## Process",
          ...block.steps.map(
            (step, i) =>
              `${i + 1}. **${step.label}**${step.description ? ` — ${step.description}` : ""}`,
          ),
        ];
      }
      if (block.type === "ranking") {
        return [
          block.title ? `## ${block.title}` : "## Ranking",
          ...block.items.map(
            (item) =>
              `${item.rank}. ${item.label}${item.reason ? ` — ${item.reason}` : ""}`,
          ),
        ];
      }
      if (block.type === "faq") {
        return [
          block.title ? `## ${block.title}` : "## FAQ",
          ...block.items.map(
            (item) => `**Q:** ${item.question}\n\n**A:** ${item.answer}`,
          ),
        ];
      }
      if (block.type === "pros_cons") {
        return [
          block.title ? `## ${block.title}` : "## Pros & cons",
          "### Pros",
          ...block.pros.map((p) => `- ${p}`),
          "### Cons",
          ...block.cons.map((c) => `- ${c}`),
          block.conclusion ?? "",
        ];
      }
      return [];
    }),
  ].filter(Boolean);
  return parts.join("\n\n").trim();
}

function titleFromMarkdown(markdown: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 72);
  const firstLine = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "Analysis";
  return firstLine.replace(/^[*#\-\d.]+\s*/, "").slice(0, 72) || "Analysis";
}

/** Copy-adjacent menu: save this assistant reply into a project as a markdown tab. */
export function AddReplyToProjectMenu({
  message,
  visibleContent,
}: {
  message: Message;
  visibleContent: string;
}) {
  const { openProject, workspaceId, actor } = useApp();
  const { ctx } = useSpaceData();
  const revision = useSyncExternalStore(
    subscribeSpaceEntityStore,
    getSpaceEntityStoreSnapshot,
    getSpaceEntityStoreServerSnapshot,
  );
  const [open, setOpen] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const markdown = useMemo(
    () => messageMarkdown(message, visibleContent),
    [message, visibleContent],
  );

  const projects = useMemo(() => {
    void revision;
    return localSpaceEntityStore
      .listAllProjects(ctx)
      .filter((project) =>
        (PRIMARY_NAV_SPACES as readonly string[]).includes(project.space),
      )
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [ctx, revision]);

  if (!markdown.trim()) return null;

  const saveTo = (project: {
    id: string;
    title: string;
    space: SpaceId;
  }) => {
    const title = titleFromMarkdown(markdown);
    openProjectMarkdownDocumentTab({
      profileId: actor.id,
      workspaceId,
      spaceId: project.space,
      projectId: project.id,
      projectTitle: project.title,
      markdown,
      title,
    });
    openProject(project.id, { landOnPanel: true });
    setSavedId(project.id);
    window.setTimeout(() => {
      setOpen(false);
      setSavedId(null);
    }, 700);
  };

  return (
    <div className="relative">
      <button
        type="button"
        title="Add to project"
        aria-label="Add to project"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
      >
        <Ellipsis className="h-3.5 w-3.5" strokeWidth={1.8} />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label="Dismiss"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-[calc(100%+0.35rem)] left-0 z-50 w-[15.5rem] overflow-hidden rounded-[12px] border border-border/70 bg-background/95 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-md dark:bg-neutral-900/95">
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
              <FolderOpen className="h-3 w-3" strokeWidth={1.8} />
              Add to project
            </div>
            {projects.length === 0 ? (
              <p className="px-2.5 py-2 text-[12.5px] text-muted-foreground">
                No projects yet. Create one in Home, Build, or Studio first.
              </p>
            ) : (
              <ul className="max-h-56 overflow-y-auto">
                {projects.map((project) => {
                  const space = navLabel(project.space as SpaceId) ?? project.space;
                  const justSaved = savedId === project.id;
                  return (
                    <li key={project.id}>
                      <button
                        type="button"
                        onClick={() => saveTo(project)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-[8px] px-2.5 py-1.5 text-left transition-colors hover:bg-muted",
                          justSaved && "bg-muted",
                        )}
                      >
                        <FileText
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          strokeWidth={1.7}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium tracking-[-0.01em] text-foreground/90">
                            {project.title}
                          </span>
                          <span className="block truncate text-[11.5px] text-muted-foreground">
                            {space}
                          </span>
                        </span>
                        {justSaved ? (
                          <Check
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground"
                            strokeWidth={1.8}
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
