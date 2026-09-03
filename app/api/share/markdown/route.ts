/**
 * POST /api/share/markdown — create or update a public markdown doc.
 * PATCH /api/share/markdown — rename title.
 * GET /api/share/markdown?id=… — public fetch (also used by /d/[id]).
 */

import { NextResponse } from "next/server";
import { requireBearerUser } from "@/lib/ai/raw-openai/auth";
import {
  assertProjectInWorkspace,
  assertWorkspaceMember,
} from "@/lib/studio-assets-server";
import {
  fetchSharedMarkdownDoc,
  renameSharedMarkdownDoc,
  upsertSharedMarkdownDoc,
} from "@/lib/shared-markdown-server";
import { markdownShareUrl } from "@/lib/shared-markdown";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  try {
    const doc = await fetchSharedMarkdownDoc(id);
    if (!doc) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({
      id: doc.id,
      title: doc.title,
      markdown: doc.markdown,
      url: markdownShareUrl(doc.id),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load document.",
      },
      { status: 500 },
    );
  }
}

type PostBody = {
  workspaceId?: string;
  projectId?: string;
  title?: string;
  markdown?: string;
  shareId?: string | null;
};

export async function POST(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const workspaceId = body.workspaceId?.trim();
  const projectId = body.projectId?.trim();
  const markdown = body.markdown ?? "";
  const title = body.title?.trim() || "Document";
  if (!workspaceId || !projectId || !markdown.trim()) {
    return NextResponse.json(
      { error: "workspaceId, projectId, and markdown are required." },
      { status: 400 },
    );
  }

  const member = await assertWorkspaceMember(workspaceId, auth.user.id);
  if (!member) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const projectOk = await assertProjectInWorkspace(projectId, workspaceId);
  if (!projectOk) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  try {
    const doc = await upsertSharedMarkdownDoc({
      userId: auth.user.id,
      workspaceId,
      projectId,
      title,
      markdown,
      shareId: body.shareId,
    });
    return NextResponse.json({
      id: doc.id,
      title: doc.title,
      url: markdownShareUrl(doc.id),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not share document.",
      },
      { status: 500 },
    );
  }
}

type PatchBody = {
  shareId?: string;
  title?: string;
};

export async function PATCH(request: Request) {
  const auth = await requireBearerUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const shareId = body.shareId?.trim();
  const title = body.title?.trim();
  if (!shareId || !title) {
    return NextResponse.json(
      { error: "shareId and title are required." },
      { status: 400 },
    );
  }

  try {
    const ok = await renameSharedMarkdownDoc({
      userId: auth.user.id,
      shareId,
      title,
    });
    if (!ok) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ id: shareId, title, url: markdownShareUrl(shareId) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not rename document.",
      },
      { status: 500 },
    );
  }
}
