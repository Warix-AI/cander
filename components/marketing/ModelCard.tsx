import { platformModels } from "@/lib/data";

export function ModelCard({
  model,
}: {
  model: (typeof platformModels)[number];
}) {
  return (
    <article className="rounded-[10px] border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-medium tracking-[-0.02em]">{model.name}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {model.status}
        </span>
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">
        {model.runtime} · {model.memory}
      </p>
    </article>
  );
}

export function ModelCardGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {platformModels.map((model) => (
        <ModelCard key={model.name} model={model} />
      ))}
    </div>
  );
}
