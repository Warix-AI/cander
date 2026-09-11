/**
 * Node test loader: resolve `@/*` to the repo root (matches tsconfig paths).
 * Usage: node --import ./scripts/ts-alias-loader.mjs --experimental-strip-types --test …
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

register("./ts-alias-hooks.mjs", pathToFileURL(join(root, "scripts/")), {
  data: { root },
});
