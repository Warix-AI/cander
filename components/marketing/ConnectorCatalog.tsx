"use client";

import { useMemo, useState } from "react";
import { ConnectorCard } from "@/components/marketing/ConnectorCard";
import { connectors } from "@/lib/data";

export function ConnectorCatalog() {
  const [query, setQuery] = useState("");
  const publicConnectors = useMemo(
    () => connectors.filter((item) => item.scope === "public"),
    [],
  );
  const featured = publicConnectors.filter((item) => item.featured);
  const filtered = publicConnectors.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  });
  const categories = [...new Set(filtered.map((item) => item.category))];

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search connectors"
        className="w-full max-w-md rounded-[10px] border border-foreground/10 bg-background px-4 py-3 text-[14px]"
      />

      {!query ? (
        <div className="mt-8">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Featured
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((connector) => (
              <ConnectorCard key={connector.id} connector={connector} />
            ))}
          </div>
        </div>
      ) : null}

      {categories.map((category) => (
        <div key={category} className="mt-10">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {category}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered
              .filter((item) => item.category === category)
              .map((connector) => (
                <ConnectorCard key={connector.id} connector={connector} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
