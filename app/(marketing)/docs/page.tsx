import { Cta } from "@/components/marketing/Cta";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { APP_HREF, marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/docs");

export default function DocsPage() {
  return (
    <Section className="pt-10 md:pt-16 pb-24">
      <PageWidth>
        <SectionHeader
          as="h1"
          kicker="Docs"
          title="Docs live in Development."
          body="APIs, keys, models, and hosting are documented next to the work — inside Courier. Open the product to read them in context."
        />
        <div className="mt-8 flex flex-wrap gap-2">
          <Cta href={APP_HREF}>Open Courier</Cta>
          <Cta href="/development" variant="secondary">
            About Development
          </Cta>
        </div>
      </PageWidth>
    </Section>
  );
}
