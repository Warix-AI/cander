/**
 * Known npm package versions for 21st / shadcn-style imports.
 */

export const KNOWN_PACKAGE_VERSIONS: Record<string, string> = {
  clsx: "^2.1.1",
  "tailwind-merge": "^3.3.1",
  "class-variance-authority": "^0.7.1",
  "framer-motion": "^12.23.12",
  "lucide-react": "^0.542.0",
  "classnames": "^2.5.1",
  tailwindcss: "^4.1.12",
  "@tailwindcss/postcss": "^4.1.12",
  postcss: "^8.5.6",
  "@radix-ui/react-accordion": "^1.2.12",
  "@radix-ui/react-dialog": "^1.1.15",
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-label": "^2.1.7",
  "@radix-ui/react-select": "^2.2.6",
  "@radix-ui/react-slot": "^1.2.3",
  "@radix-ui/react-tabs": "^1.1.13",
  "@radix-ui/react-separator": "^1.1.7",
  "@radix-ui/react-navigation-menu": "^1.2.14",
  "@radix-ui/react-popover": "^1.1.15",
  "@radix-ui/react-checkbox": "^1.3.3",
  "@radix-ui/react-switch": "^1.2.6",
  "@radix-ui/react-avatar": "^1.1.10",
  "react-icons": "^5.5.0",
  "date-fns": "^4.1.0",
  zod: "^3.25.76",
  "react-hook-form": "^7.62.0",
  "@hookform/resolvers": "^5.2.1",
  sonner: "^2.0.7",
  "embla-carousel-react": "^8.6.0",
  recharts: "^2.15.4",
  cmdk: "^1.1.1",
  vaul: "^1.1.2",
  "input-otp": "^1.4.2",
  "react-day-picker": "^9.9.0",
};

/** Packages we refuse to install into marketing sites — drop the component instead. */
export const BLOCKED_PACKAGES = new Set([
  "ai",
  "@ai-sdk/react",
  "@ai-sdk/openai",
  "openai",
  "langchain",
  "@langchain/core",
]);

/** Built-ins / framework modules that need no package.json entry. */
export const BUILTIN_MODULES = new Set([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "next",
  "next/link",
  "next/image",
  "next/navigation",
  "next/font",
  "next/font/google",
  "next/font/local",
  "next/headers",
  "next/dynamic",
  "next/script",
]);

export function resolvePackageVersion(name: string): string | null {
  if (KNOWN_PACKAGE_VERSIONS[name]) return KNOWN_PACKAGE_VERSIONS[name]!;
  // Scoped radix catch-all
  if (name.startsWith("@radix-ui/")) return "^1.0.0";
  // Unknown third-party — still install latest-ish caret of major unknown
  if (!name.startsWith(".") && !name.startsWith("@/") && !name.startsWith("#")) {
    return "latest";
  }
  return null;
}
