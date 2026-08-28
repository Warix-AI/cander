import type {
  PreviewSession,
  ProjectFile,
  PublishInput,
  WorkspaceCtx,
} from "@/lib/space-entities";
import { localSpaceEntityStore } from "@/lib/api/space-entity-store";
import { previewUrlForProject } from "@/lib/preview-url";

export type BuildRuntimeApi = {
  startPreview(ctx: WorkspaceCtx, projectId: string): Promise<PreviewSession>;
  listProjectFiles(
    ctx: WorkspaceCtx,
    projectId: string,
  ): Promise<ProjectFile[]>;
  publish(
    ctx: WorkspaceCtx,
    projectId: string,
    input: PublishInput,
  ): Promise<{ url: string }>;
};

export function createLocalBuildRuntimeApi(): BuildRuntimeApi {
  return {
    async startPreview(ctx, projectId) {
      const project = localSpaceEntityStore.getProject(ctx, projectId);
      return {
        projectId,
        url: project?.publishedUrl ?? previewUrlForProject(projectId),
      };
    },
    async listProjectFiles(_ctx, _projectId) {
      return [
        { path: "src/App.tsx", label: "App" },
        { path: "src/main.tsx", label: "Entry" },
        { path: "package.json", label: "Package" },
      ];
    },
    async publish(ctx, projectId, input) {
      const url =
        input.url ??
        (input.slug ? `https://${input.slug}.cander.app` : null) ??
        previewUrlForProject(projectId);
      await localSpaceEntityStore.createDeployment(ctx, projectId, { url });
      return { url };
    },
  };
}
