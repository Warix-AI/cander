import { Cta } from "@/components/marketing/Cta";
import { EnterpriseCTA } from "@/components/marketing/EnterpriseCTA";
import { FaqList } from "@/components/marketing/FaqList";
import { FinalCta } from "@/components/marketing/FinalCta";
import { HostingCards } from "@/components/marketing/HostingCard";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import {
  PageWidth,
  Section,
  SectionHeader,
} from "@/components/marketing/Section";
import { SpaceCardRow } from "@/components/marketing/SpaceCard";
import { APP_HREF } from "@/lib/marketing";
import { developmentView, homeView } from "@/lib/product-copy";

export function HomePage() {
  return (
    <>
      <Section className="pb-8 pt-8 md:pt-12">
        <PageWidth>
          <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
            <div className="max-w-xl">
              <h1 className="heading-display text-4xl md:text-[3.25rem]">
                One place to do anything with AI.
              </h1>
              <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
                Talk to Courier. Build, work, research, create, and run
                production AI from one product — in the cloud, on your network,
                or on your device.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Cta href={APP_HREF}>Start free</Cta>
                <Cta href="/pricing" variant="secondary">
                  View pricing
                </Cta>
              </div>
            </div>
            <div className="hidden sm:block">
              <ProductMockup variant="hero" />
            </div>
          </div>
        </PageWidth>
      </Section>

      <Section band>
        <PageWidth>
          <SectionHeader
            kicker="Courier"
            title="One product. Two views."
            body="Home is for everyday work. Development is for hosting, models, and production — same app, not a separate platform."
            compact
          />
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <article className="rounded-[10px] border border-border bg-card p-5">
              <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {homeView.label}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed">
                {homeView.description}
              </p>
            </article>
            <article className="rounded-[10px] border border-border bg-card p-5">
              <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {developmentView.label}
              </p>
              <p className="mt-2 text-[15px] leading-relaxed">
                {developmentView.description}
              </p>
            </article>
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            kicker="Spaces"
            title="Different work, different shape."
            body="Work, Build, Studio, Research, and Personal — enter directly or let Courier route from chat."
            compact
          />
          <div className="mt-6">
            <SpaceCardRow />
          </div>
        </PageWidth>
      </Section>

      <Section band>
        <PageWidth>
          <SectionHeader
            kicker="Hosting"
            title="Run AI where it fits."
            body="Cloud is metered on every plan. Local and On-device are effectively unlimited — your hardware is the compute. Production serving is Ultra."
            compact
          />
          <div className="mt-6">
            <HostingCards />
          </div>
          <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            <Cta href="/hosting" variant="ghost" className="inline-flex h-auto px-0 py-0">
              Learn about hosting →
            </Cta>
          </p>
        </PageWidth>
      </Section>

      <EnterpriseCTA />

      <Section>
        <PageWidth>
          <SectionHeader kicker="FAQ" title="Common questions." compact />
          <div className="mt-5">
            <FaqList />
          </div>
        </PageWidth>
      </Section>

      <FinalCta
        title="Ready when you are."
        body="Open Courier at the root domain. Sign in with a demo account or start free."
      />
    </>
  );
}
