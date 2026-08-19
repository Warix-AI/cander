import { Cta } from "@/components/marketing/Cta";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { developmentIntegrated } from "@/lib/product-copy";
import { APP_HREF, marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/build");

export default function BuildPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Every plan"
            title="Software, sites, and agents."
            body="No build pipeline to manage. Publishing is Courier-hosted. Models follow your plan."
          />
          <div className="mt-8 flex flex-wrap gap-2">
            <Cta href={APP_HREF}>Start free</Cta>
            <Cta href="/development" variant="secondary">
              Development
            </Cta>
          </div>
          <div className="mt-10 hidden sm:block">
            <ProductMockup variant="build" />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            title="Wired in. Not copied over."
            body={developmentIntegrated}
          />
          <div className="mt-10">
            <FeatureGrid
              columns={3}
              items={[
                { title: "Preview", body: "Live surface next to chat." },
                { title: "Files & editor", body: "The project, not a zip of prompts." },
                { title: "Terminal & git", body: "Same workspace as the model." },
                { title: "Deployments", body: "Courier-hosted publishing." },
                { title: "Database & env", body: "Provisioned with the project." },
                { title: "Development", body: "Model, API, and keys already attached." },
              ]}
            />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            title="Library to start from."
            body="SaaS landing, client portal, internal console, documentation site. Themes: Graphite, Paper, Midnight, Aurora."
          />
        </PageWidth>
      </Section>

      <FinalCta />
    </>
  );
}
