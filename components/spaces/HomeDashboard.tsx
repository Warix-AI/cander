"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { useApp } from "@/components/app/AppProvider";
import { DashFrame } from "@/components/spaces/ItemSet";
import {
  HOME_RECOMMENDED,
  HOME_UPDATES,
  HOME_USAGE_TONES,
  buildHomeUsageCards,
  homePromoForPlan,
  type HomeUsageCardModel,
  type HomeUsageCardId,
} from "@/lib/home-dashboard";
import { usePinnedItems } from "@/lib/use-pinned-items";
import { useUsageSnapshot } from "@/lib/use-usage-status";
import { cn } from "@/lib/utils";

export function HomeDashboard() {
  const {
    workspaceId,
    billingPlan,
    threads,
    openSpace,
    openThread,
    openProject,
    openConnector,
    newChat,
    openSettings,
  } = useApp();
  const { pinnedItems } = usePinnedItems();
  const { snapshot } = useUsageSnapshot();

  const usageCards = useMemo(
    () =>
      buildHomeUsageCards({
        plan: billingPlan,
        workspaceId,
        features: snapshot?.features,
      }),
    [billingPlan, workspaceId, snapshot?.features],
  );

  const promo = homePromoForPlan(billingPlan);

  const recentThreads = useMemo(() => {
    return threads
      .filter(
        (thread) =>
          thread.workspaceId === workspaceId &&
          thread.messages.some(
            (message) => message.role === "user" || message.role === "assistant",
          ),
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 3);
  }, [threads, workspaceId]);

  const inProgress = pinnedItems.slice(0, 4);
  const hasProgress = inProgress.length > 0 || recentThreads.length > 0;

  const openRecommended = (space: (typeof HOME_RECOMMENDED)[number]["space"]) => {
    if (space === "new_chat") newChat();
    else openSpace(space);
  };

  return (
    <DashFrame
      title="Home"
      subtitle="Usage, recommendations, and what's in motion."
      banner={false}
    >
      <HomePromoBanner
        promo={promo}
        onCta={() => openSettings("plans")}
      />

      <div className="mt-6 grid grid-cols-1 gap-3 @min-[720px]:grid-cols-3">
        {usageCards.map((card) => (
          <UsageStatCard key={card.id} card={card} />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 @min-[960px]:grid-cols-[minmax(0,1fr)_17.5rem]">
        <div className="min-w-0 space-y-8">
          <section>
            <SectionHeading title="Recommended" />
            <div className="mt-3 grid grid-cols-1 gap-2 @min-[520px]:grid-cols-2">
              {HOME_RECOMMENDED.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openRecommended(item.space)}
                  className="group flex flex-col rounded-[10px] border border-border bg-background p-4 text-left transition-colors hover:bg-muted/30"
                >
                  <span className="text-[14px] font-medium tracking-[-0.02em]">
                    {item.title}
                  </span>
                  <span className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground group-hover:text-foreground">
                    Open
                    <ArrowRight className="h-3 w-3" strokeWidth={2} />
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <SectionHeading title="In progress" />
            {hasProgress ? (
              <div className="mt-3 divide-y divide-border rounded-[10px] border border-border bg-background">
                {inProgress.map((item) => (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    onClick={() => {
                      if (item.kind === "thread") openThread(item.id);
                      else if (item.kind === "connector") openConnector(item.id);
                      else openProject(item.id);
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium tracking-[-0.02em]">
                      {item.title}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
                {recentThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => openThread(thread.id)}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium tracking-[-0.02em]">
                        {thread.title}
                      </p>
                      {thread.snippet ? (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {thread.snippet}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                Nothing pinned or recent yet — try a recommendation above.
              </p>
            )}
          </section>
        </div>

        <aside>
          <SectionHeading title="Updates" />
          <div className="mt-3 space-y-3">
            {HOME_UPDATES.map((item) => (
              <article
                key={item.id}
                className="rounded-[10px] border border-border bg-background p-3.5"
              >
                <p className="text-[11px] font-medium tracking-[0.02em] text-muted-foreground">
                  {item.when}
                </p>
                <h3 className="mt-1 text-[13px] font-medium tracking-[-0.02em]">
                  {item.title}
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </DashFrame>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-[13px] font-medium tracking-[-0.01em] text-muted-foreground">
      {title}
    </h2>
  );
}

function HomePromoBanner({
  promo,
  onCta,
}: {
  promo: ReturnType<typeof homePromoForPlan>;
  onCta: () => void;
}) {
  return (
    <div className="panel-wash-dusk relative overflow-hidden rounded-[12px] text-white">
      <div className="relative flex flex-col gap-4 p-5 @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:justify-between @min-[640px]:p-6">
        <div className="min-w-0 max-w-xl">
          <p className="text-[11px] font-medium tracking-[0.06em] text-white/60 uppercase">
            {promo.eyebrow}
          </p>
          <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.03em] @min-[640px]:text-[20px]">
            {promo.title}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-white/72">
            {promo.body}
          </p>
        </div>
        <button
          type="button"
          onClick={onCta}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-white px-4 text-[13px] font-medium text-neutral-950 transition-colors hover:bg-white/90"
        >
          {promo.cta}
        </button>
      </div>
    </div>
  );
}

function UsageStatCard({ card }: { card: HomeUsageCardModel }) {
  return (
    <div className="flex flex-col rounded-[10px] border border-border bg-background p-4">
      <p className="text-[13px] font-medium tracking-[-0.02em]">{card.title}</p>
      {!card.enabled ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">Not on plan</p>
      ) : card.status === "limited" ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Monthly limit reached
        </p>
      ) : null}

      <UsageMeter
        tone={card.id}
        label="This hour"
        percent={card.hourPercent}
        detail={`${card.hourPercent}%`}
        muted={!card.enabled}
        className="mt-3"
      />
      <UsageMeter
        tone={card.id}
        label="This month"
        percent={card.monthPercent}
        detail={card.monthDetail}
        muted={!card.enabled}
        className="mt-4"
      />
    </div>
  );
}

function UsageMeter({
  tone,
  label,
  percent,
  detail,
  muted,
  className,
}: {
  tone: HomeUsageCardId;
  label: string;
  percent: number;
  detail: string;
  muted?: boolean;
  className?: string;
}) {
  const colors = HOME_USAGE_TONES[tone];
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span
          className={cn(
            "text-[12px] font-medium tabular-nums tracking-[-0.02em]",
            muted && "text-muted-foreground",
          )}
        >
          {detail}
        </span>
      </div>
      <div
        className={cn(
          "mt-1.5 h-1.5 overflow-hidden rounded-full",
          muted ? "bg-muted/70" : colors.track,
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            muted ? "bg-muted-foreground/25" : colors.bar,
          )}
          style={{ width: `${muted ? 0 : clamped}%` }}
        />
      </div>
    </div>
  );
}
