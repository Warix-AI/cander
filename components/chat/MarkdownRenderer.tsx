"use client";

import { useMemo, type MouseEvent, type ReactNode } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/chat/CodeBlock";
import { QuoteBlock } from "@/components/chat/QuoteBlock";
import { TableBlock } from "@/components/chat/TableBlock";
import { cn } from "@/lib/utils";

const baseComponents: Components = {
  p: ({ children }) => (
    <p className="my-1.5 text-[14.5px] leading-relaxed tracking-[-0.01em] first:mt-0 last:mb-0">
      {children}
    </p>
  ),
  h1: ({ children }) => (
    <h3 className="mb-1 mt-2.5 text-[15.5px] font-semibold tracking-[-0.02em] first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-1 mt-2.5 text-[15px] font-semibold tracking-[-0.02em] first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mb-0.5 mt-2 text-[14.5px] font-semibold tracking-[-0.02em] first:mt-0">
      {children}
    </h4>
  ),
  h4: ({ children }) => (
    <h4 className="mb-0.5 mt-2 text-[14.5px] font-medium tracking-[-0.02em] first:mt-0">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-0.5 mt-1.5 text-[14px] font-medium first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-0.5 mt-1.5 text-[14px] font-medium text-muted-foreground first:mt-0">
      {children}
    </h6>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-0.5 pl-5 text-[14.5px] leading-relaxed first:mt-0 last:mb-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-0.5 pl-5 text-[14.5px] leading-relaxed first:mt-0 last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed pl-0.5">{children}</li>,
  blockquote: ({ children }) => <QuoteBlock>{children}</QuoteBlock>,
  hr: () => <hr className="my-3 border-border" />,
  code: ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "");
    const text = String(children).replace(/\n$/, "");
    const inline = !match && !text.includes("\n");
    if (inline) {
      return (
        <code
          className="rounded-md bg-muted px-1 py-0.5 font-mono text-[12.5px]"
          {...props}
        >
          {children}
        </code>
      );
    }
    return <CodeBlock code={text} language={match?.[1]} />;
  },
  pre: ({ children }) => <>{children}</>,
  table: ({ children }) => <TableBlock>{children}</TableBlock>,
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-2.5 py-1.5 font-medium whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-2.5 py-1.5 align-top whitespace-nowrap">{children}</td>
  ),
};

function MarkdownLink({
  href,
  children,
  onLinkClick,
}: {
  href?: string;
  children?: ReactNode;
  onLinkClick?: (href: string) => void;
}) {
  const className =
    "text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground";

  if (!onLinkClick) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <a
      href={href}
      className={className}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (!href) return;
        // In-doc anchors + special schemes keep native behavior.
        if (
          href.startsWith("#") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:")
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onLinkClick(href);
      }}
    >
      {children}
    </a>
  );
}

export function MarkdownRenderer({
  content,
  className,
  onLinkClick,
}: {
  content: string;
  className?: string;
  /** Open http(s) links in-app instead of leaving to an external browser. */
  onLinkClick?: (href: string) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      ...baseComponents,
      a: ({ href, children }) => (
        <MarkdownLink href={href} onLinkClick={onLinkClick}>
          {children}
        </MarkdownLink>
      ),
    }),
    [onLinkClick],
  );

  if (!content.trim()) return null;
  return (
    <div className={cn("min-w-0 max-w-full break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
