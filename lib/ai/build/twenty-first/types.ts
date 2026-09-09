/**
 * Types for 21st.dev component dependency analysis / normalization.
 */

export type PackageRequirement = {
  name: string;
  version: string;
  reason: string;
};

export type LocalFileRequirement = {
  path: string;
  kind: "ui-primitive" | "helper" | "config" | "style" | "asset";
  reason: string;
};

export type ComponentDependencyManifest = {
  componentId: string;
  componentName: string;
  category: string;
  contentHash: string;
  npmPackages: PackageRequirement[];
  localFiles: LocalFileRequirement[];
  imports: string[];
  needsClientDirective: boolean;
  needsTailwind: boolean;
  needsCnHelper: boolean;
  unresolvedImports: string[];
  notes: string[];
};

export type NormalizedTwentyFirstComponent = {
  id: string;
  name: string;
  category: string;
  source: string;
  codeSnippet: string;
  dependencies: string[];
  path: string;
  manifest: ComponentDependencyManifest;
  normalizationChanges: string[];
};

export type TwentyFirstNormalizeResult = {
  ok: boolean;
  components: NormalizedTwentyFirstComponent[];
  dropped: Array<{ id: string; name: string; reason: string }>;
  files: Array<{ path: string; content: string }>;
  packageDependencies: Record<string, string>;
  logs: string[];
  usedCache: number;
  fallbackToCatalog: boolean;
};
