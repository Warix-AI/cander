/**
 * In-memory cache of analyzed 21st dependency manifests (per component + content hash).
 */

import type { ComponentDependencyManifest } from "@/lib/ai/build/twenty-first/types";

const globalKey = "__cander_21st_manifest_cache__";

type CacheStore = Map<string, ComponentDependencyManifest>;

function store(): CacheStore {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: CacheStore;
  };
  if (!g[globalKey]) g[globalKey] = new Map();
  return g[globalKey]!;
}

export function manifestCacheKey(componentId: string, contentHash: string): string {
  return `${componentId}:${contentHash}`;
}

export function getCachedManifest(
  componentId: string,
  contentHash: string,
): ComponentDependencyManifest | null {
  return store().get(manifestCacheKey(componentId, contentHash)) ?? null;
}

export function setCachedManifest(manifest: ComponentDependencyManifest): void {
  store().set(
    manifestCacheKey(manifest.componentId, manifest.contentHash),
    manifest,
  );
}
