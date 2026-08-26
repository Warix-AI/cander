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
          title="Docs for hosting, models, and APIs."
          body="Read product docs next to the work — in the app. Open the app for hosting, models, and API context."
        />
        <div className="mt-8 flex flex-wrap gap-2">
          <Cta href={APP_HREF}>Open app</Cta>
          <Cta href="/hosting" variant="secondary">
            Hosting
          </Cta>
        </div>
      </PageWidth>
    </Section>
  );
}
