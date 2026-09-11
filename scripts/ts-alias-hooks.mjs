/**
 * Resolve hooks for `@/` → repo root.
 */
import { pathToFileURL } from "node:url";
import { join } from "node:path";

/** @type {string} */
let root = process.cwd();

export async function initialize(data) {
  if (data?.root) root = data.root;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const abs = join(root, specifier.slice(2));
    const candidates = [abs, `${abs}.ts`, `${abs}.tsx`, `${abs}.js`, `${abs}.mjs`, join(abs, "index.ts")];
    const { existsSync } = await import("node:fs");
    for (const c of candidates) {
      if (existsSync(c) && !c.endsWith("/")) {
        return nextResolve(pathToFileURL(c).href, context);
      }
    }
    return nextResolve(pathToFileURL(abs).href, context);
  }
  return nextResolve(specifier, context);
}
