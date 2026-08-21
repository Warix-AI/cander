"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/AppProvider";
import {
  DashBtn,
  DashFrame,
  LayoutToggle,
  ScopeToggle,
  SpaceSettingsButton,
} from "@/components/spaces/ItemSet";
import { PreviewGrid } from "@/components/spaces/PreviewCard";
import { projects } from "@/lib/data";
import type { BannerKey } from "@/lib/space-banners";
import type { Project } from "@/lib/types";

type PersonalScope = "today" | "money" | "health" | "goals" | "car";

const scopes: { id: PersonalScope; label: string; empty: string }[] = [
  {
    id: "today",
    label: "Today",
    empty: "Nothing on the list yet. Start a chat about today or what’s due.",
  },
  {
    id: "money",
    label: "Finances",
    empty: "Nothing tracked yet. Ask about invoices, runway, or spend.",
  },
  {
    id: "health",
    label: "Health",
    empty: "Nothing tracked yet. Ask about benefits, care plans, or wellness.",
  },
  {
    id: "goals",
    label: "Goals",
    empty: "No goals yet. Ask Courier to set one or recap the year.",
  },
  {
    id: "car",
    label: "Car",
    empty: "Nothing on the car yet. Ask about service, insurance, or registration.",
  },
];

const areaById: Record<string, PersonalScope> = {
  "weekend-plans": "today",
  subscriptions: "money",
  runway: "money",
  "q3-invoices": "money",
  "infra-spend": "money",
  "ops-close": "money",
  "benefits-review": "health",
  "care-plan": "health",
  "ops-wellness": "health",
  "annual-goals": "goals",
  "car-service": "car",
};

function areaOf(item: Project): PersonalScope {
  if (areaById[item.id]) return areaById[item.id];
  if (item.space === "finances") return "money";
  if (item.space === "health") return "health";
  return "today";
}

function bannerForArea(area: PersonalScope): BannerKey {
  if (area === "money") return "finances";
  if (area === "health") return "health";
  return "personal";
}

export function PersonalDashboard() {
  const {
    spaceId,
    workspaceId,
    newChat,
    sendMessage,
    spaceLayout,
    setSpaceLayout,
  } = useApp();
  const [scope, setScope] = useState<PersonalScope>("today");
  const area = scopes.find((item) => item.id === scope) ?? scopes[0];

  useEffect(() => {
    if (spaceId === "health") setScope("health");
    else if (spaceId === "finances") setScope("money");
  }, [spaceId]);

  const items = useMemo(
    () =>
      projects.filter(
        (item) =>
          item.workspaceId === workspaceId &&
          (item.space === "personal" ||
            item.space === "finances" ||
            item.space === "health") &&
          areaOf(item) === scope,
      ),
    [workspaceId, scope],
  );

  const start = () => {
    newChat("personal");
  };

  const openItem = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    newChat("personal");
    sendMessage(`Help me with ${item.name.toLowerCase()}.`, {
      space: "personal",
    });
  };

  return (
    <DashFrame
      space="personal"
      title="Personal"
      subtitle="Today, finances, health, goals, and the car."
      actions={
        <>
          <DashBtn primary onClick={start}>
            Ask
          </DashBtn>
          <SpaceSettingsButton space="personal" />
        </>
      }
    >
      <div className="flex flex-col gap-3 @min-[420px]:flex-row @min-[420px]:flex-wrap @min-[420px]:items-center @min-[420px]:justify-between">
        <ScopeToggle
          wrap
          value={scope}
          onChange={(value) => setScope(value as PersonalScope)}
          options={scopes.map((item) => ({ id: item.id, label: item.label }))}
        />
        <LayoutToggle layout={spaceLayout} onChange={setSpaceLayout} />
      </div>

      <div className="mt-5">
        <PreviewGrid
          layout={spaceLayout}
          items={items.map((item) => {
            const areaId = areaOf(item);
            return {
              id: item.id,
              name: item.name,
              projectId: item.id,
              meta: `${scopes.find((s) => s.id === areaId)?.label ?? "Personal"} · edited ${item.updatedAt}`,
              detail: item.summary,
              bannerKey: bannerForArea(areaId),
            };
          })}
          onOpen={openItem}
          empty={area.empty}
        />
      </div>
    </DashFrame>
  );
}
