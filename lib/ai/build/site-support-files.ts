/**
 * Support files every generated site needs when 21st.dev (or Codex) drops
 * shadcn-style imports: `@/lib/utils`, framer-motion, lucide-react, UI stubs.
 */

import type { ScaffoldFile } from "@/lib/ai/build/site-spec";

export const SITE_COMMON_DEPENDENCIES: Record<string, string> = {
  clsx: "^2.1.1",
  "tailwind-merge": "^3.3.1",
  "class-variance-authority": "^0.7.1",
  "framer-motion": "^12.23.12",
  "lucide-react": "^0.542.0",
};

export const SITE_TSCONFIG_JSON = `${JSON.stringify(
  {
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: { "@/*": ["./*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules", "components/twenty-first"],
  },
  null,
  2,
)}\n`;

export const SITE_LIB_UTILS_TS = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

/** Minimal stubs so unused 21st vendor files typecheck before Codex adapts them. */
const UI_STUBS: Record<string, string> = {
  "components/ui/button.tsx": `import * as React from "react";
import { cn } from "@/lib/utils";

export function buttonVariants(_opts?: Record<string, unknown>) {
  return "";
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }
>(function Button({ className, ...props }, ref) {
  return <button ref={ref} className={cn(className)} {...props} />;
});
`,
  "components/ui/input.tsx": `import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(className)} {...props} />;
});
`,
  "components/ui/label.tsx": `import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn(className)} {...props} />;
}
`,
  "components/ui/textarea.tsx": `import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(className)} {...props} />;
});
`,
  "components/ui/card.tsx": `import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(className)} {...props} />;
}
export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}
export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...props} />;
}
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} />;
}
`,
  "components/ui/select.tsx": `import * as React from "react";

export function Select({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { value?: string; onValueChange?: (v: string) => void }) {
  return <div {...props}>{children}</div>;
}
export function SelectTrigger({ children, ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props}>{children}</button>;
}
export function SelectValue(_props: { placeholder?: string }) {
  return null;
}
export function SelectContent({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}
export function SelectItem({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  return <div {...props}>{children}</div>;
}
`,
  "components/ui/accordion.tsx": `import * as React from "react";

export function Accordion({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { type?: string; collapsible?: boolean }) {
  return <div {...props}>{children}</div>;
}
export function AccordionItem({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  return <div {...props}>{children}</div>;
}
export function AccordionTrigger({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props}>{children}</button>;
}
export function AccordionContent({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}
`,
  "components/ui/sheet.tsx": `import * as React from "react";

export function Sheet({ children }: { children?: React.ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  return <>{children}</>;
}
export function SheetContent({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}
export function SheetFooter({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}
export function SheetHeader({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}
export function SheetTitle({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props}>{children}</h2>;
}
`,
  "components/ui/search-modal.tsx": `import * as React from "react";

export type CommandItem = { id?: string; label?: string; [key: string]: unknown };

export function SearchModal(_props: {
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  items?: CommandItem[];
  children?: React.ReactNode;
}) {
  return null;
}
`,
  "components/ui/play-store-button.tsx": `export function PlayStoreButton(_props: Record<string, unknown>) {
  return null;
}
`,
  "components/ui/app-store-button.tsx": `export function AppStoreButton(_props: Record<string, unknown>) {
  return null;
}
`,
};

/** Strip hard deps that break marketing-site builds (e.g. `ai` SDK types). */
export function sanitizeTwentyFirstVendorSource(source: string): string {
  let out = source;
  // Drop Vercel AI SDK type imports — not needed for static marketing UI.
  out = out.replace(
    /^\s*import\s+type\s+\{[^}]+\}\s+from\s+["']ai["'];?\s*$/gm,
    "",
  );
  out = out.replace(
    /^\s*import\s+\{[^}]*\b(?:DynamicToolUIPart|ToolUIPart)\b[^}]*\}\s+from\s+["']ai["'];?\s*$/gm,
    "",
  );
  out = out.replace(/\bDynamicToolUIPart\b/g, "unknown");
  out = out.replace(/\bToolUIPart\b/g, "unknown");
  // Vendor pastes are rarely type-clean; keep them out of next build failures
  // until Codex adapts them into real pages.
  if (!/^\s*\/\/\s*@ts-nocheck/m.test(out)) {
    out = `// @ts-nocheck\n${out}`;
  }
  return out;
}

export function siteSupportScaffoldFiles(): ScaffoldFile[] {
  const files: ScaffoldFile[] = [
    { path: "tsconfig.json", content: SITE_TSCONFIG_JSON },
    { path: "lib/utils.ts", content: SITE_LIB_UTILS_TS },
  ];
  for (const [path, content] of Object.entries(UI_STUBS)) {
    files.push({ path, content });
  }
  return files;
}
