import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { APP_NAME } from "@/lib/app-brand";
import { fetchSharedMarkdownDoc } from "@/lib/shared-markdown-server";
import { markdownShareUrl } from "@/lib/shared-markdown";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const doc = await fetchSharedMarkdownDoc(id);
    if (!doc) return { title: APP_NAME };
    return {
      title: `${doc.title} · ${APP_NAME}`,
      description: doc.markdown.slice(0, 160),
      openGraph: {
        title: doc.title,
        url: markdownShareUrl(doc.id),
      },
    };
  } catch {
    return { title: APP_NAME };
  }
}

export default async function SharedMarkdownPage({ params }: PageProps) {
  const { id } = await params;
  let doc: Awaited<ReturnType<typeof fetchSharedMarkdownDoc>> = null;
  try {
    doc = await fetchSharedMarkdownDoc(id);
  } catch {
    doc = null;
  }
  if (!doc) notFound();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-4">
          <p className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
            {APP_NAME}
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground/80">
            {markdownShareUrl(doc.id).replace(/^https:\/\//, "")}
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.03em]">
          {doc.title}
        </h1>
        <article className="text-[15px] leading-relaxed">
          <MarkdownRenderer content={doc.markdown} />
        </article>
      </main>
    </div>
  );
}
