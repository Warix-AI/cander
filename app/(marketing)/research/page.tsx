import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/research");

export default function ResearchPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Every plan"
            title="Research that becomes usable work."
            body="A working environment — not web search inside chat. Browser, sources, notes, and reports live in the same space."
          />
          <div className="mt-10 hidden sm:block">
            <ProductMockup variant="research" />
          </div>
          <div className="mt-10">
            <FeatureGrid
              columns={4}
              items={[
                { title: "Browser", body: "Open pages beside the notes." },
                { title: "Sources", body: "Save and cite what you used." },
                { title: "Reports", body: "Briefs, scans, and market sizing." },
                { title: "Citations", body: "Styles that survive the export." },
              ]}
            />
          </div>
        </PageWidth>
      </Section>
      <FinalCta />
    </>
  );
}
