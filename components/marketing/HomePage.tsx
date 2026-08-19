import dynamic from "next/dynamic";
import { Cta } from "@/components/marketing/Cta";
import { EnterpriseCTA } from "@/components/marketing/EnterpriseCTA";
import { FaqList } from "@/components/marketing/FaqList";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { HostingCards } from "@/components/marketing/HostingCard";
import { ModelCardGrid } from "@/components/marketing/ModelCard";
import { PricingCards } from "@/components/marketing/PricingCard";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import {
  PageWidth,
  Section,
  SectionHeader,
} from "@/components/marketing/Section";
import { SpaceCardRow } from "@/components/marketing/SpaceCard";
import { UltraTeamStory } from "@/components/marketing/UltraTeamStory";
import { APP_HREF } from "@/lib/marketing";
import { developmentView, homeView } from "@/lib/product-copy";

const LazyMockup = dynamic(
  () =>
    import("@/components/marketing/ProductMockup").then((mod) => mod.ProductMockup),
  { ssr: true },
);

export function HomePage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <div className="max-w-2xl">
            <h1 className="heading-display text-4xl md:text-6xl">
              One place to do anything with AI.
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-muted-foreground md:text-[18px]">
              Talk to Courier. Build software, run your work, research, create,
              and deploy production AI from one product. Run it in the cloud,
              locally, or directly on your device.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Cta href={APP_HREF}>Start free</Cta>
              <Cta href="/pricing" variant="secondary">
                Explore Courier
              </Cta>
            </div>
          </div>
          <div className="mt-10 hidden sm:block">
            <ProductMockup variant="hero" />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            kicker="Product"
            title="One product. Different ways to work."
            body="Home is for using Courier. Development is for building and operating AI. Two views of the same application — not two products."
          />
          <div className="mt-10 grid gap-3 md:grid-cols-2">
            <article className="rounded-[10px] border border-border bg-card p-6">
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {homeView.label}
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                {homeView.description}
              </h3>
              <ul className="mt-5 space-y-1.5 text-[14px] text-muted-foreground">
                <li>Chat</li>
                <li>Spaces</li>
                <li>Recents</li>
                <li>Connectors</li>
              </ul>
            </article>
            <article className="rounded-[10px] border border-border bg-card p-6">
              <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {developmentView.label}
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
                {developmentView.description}
              </h3>
              <ul className="mt-5 space-y-1.5 text-[14px] text-muted-foreground">
                <li>Hosting</li>
                <li>Models</li>
                <li>APIs & keys</li>
                <li>Deployments, logs, usage, docs</li>
              </ul>
            </article>
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            kicker="Spaces"
            title="Your work has different shapes. Courier does too."
            body="Enter a space directly, or tell Courier what you need and it hands work into the right environment."
          />
          <div className="mt-10">
            <SpaceCardRow />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            kicker="Build"
            title="Software, sites, and agents."
            body="No build pipeline to manage. Backend, models, and keys are wired into this project already."
          />
          <div className="mt-10 hidden sm:block">
            <LazyMockup variant="build" />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            kicker="Development"
            title="Start with an idea. Go all the way to production."
            body="Development lives inside Courier. Pro to build, Max to collaborate, Ultra to operate."
          />
          <div className="mt-10 hidden sm:block">
            <LazyMockup variant="development" />
          </div>
          <div className="mt-8">
            <FeatureGrid
              columns={3}
              items={[
                {
                  title: "Pro · Build personally",
                  body: "APIs, keys, Local, On-device, and one shared model.",
                },
                {
                  title: "Max · Build together",
                  body: "Catalog, team deploys, docs, and limited logs.",
                },
                {
                  title: "Ultra · Operate production",
                  body: "Serve, deploy, and manage infrastructure the team can use.",
                },
              ]}
            />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            kicker="Hosting"
            title="Run Courier where you want."
            body="Cloud, Local, and On-device are compute locations — not plans. Production serving is Ultra, on whatever hardware can run it."
          />
          <div className="mt-10">
            <HostingCards />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            kicker="Models"
            title="Plan is permission. Hardware is capacity."
            body="Pro has one shared model. Max opens the catalog. Ultra manages production. Bigger models do not require a bigger plan."
          />
          <div className="mt-10">
            <ModelCardGrid />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            kicker="Connectors"
            title="Courier works with what you already use."
            body="Gmail, Slack, GitHub, Stripe, and the rest of the catalog. Connector policies on Max and Ultra."
          />
          <div className="mt-8">
            <Cta href="/connectors" variant="secondary">
              Browse connectors
            </Cta>
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <UltraTeamStory />
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            kicker="Pricing"
            title="Free, Pro, Max, Ultra."
            body="Four plans. Enterprise is request-only — not a fifth card."
          />
          <div className="mt-10">
            <PricingCards />
          </div>
          <div className="mt-6">
            <Cta href="/pricing" variant="ghost">
              Compare plans
            </Cta>
          </div>
        </PageWidth>
      </Section>

      <EnterpriseCTA />

      <Section>
        <PageWidth>
          <SectionHeader kicker="FAQ" title="Questions, answered." />
          <div className="mt-8">
            <FaqList />
          </div>
        </PageWidth>
      </Section>

      <FinalCta />
    </>
  );
}
