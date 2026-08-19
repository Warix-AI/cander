export function UltraTeamStory() {
  return (
    <div className="rounded-[10px] border border-border bg-card p-6 md:p-10">
      <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        Ultra
      </p>
      <h2 className="heading-display mt-2 max-w-xl text-3xl md:text-4xl">
        One person can run it. The whole team can use it.
      </h2>
      <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
        Ultra manages. The team uses. Authorized teammates consume shared
        models and deployments without needing Ultra themselves.
      </p>

      <div className="mt-8 grid gap-3 md:grid-cols-4">
        <article className="rounded-[10px] border border-foreground bg-background p-5 md:col-span-1">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Acme · Ultra
          </p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em]">
            Sarah
          </h3>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
            Manages Acme Local LLM, the API gateway, and production
            infrastructure. Authorizes the team.
          </p>
        </article>
        {[
          { name: "John", plan: "Max" },
          { name: "Amy", plan: "Max" },
          { name: "Mike", plan: "Pro" },
        ].map((person) => (
          <article
            key={person.name}
            className="rounded-[10px] border border-border bg-background p-5"
          >
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {person.plan}
            </p>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em]">
              {person.name}
            </h3>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Uses authorized resources through Courier. No Ultra seat required
              to consume.
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
