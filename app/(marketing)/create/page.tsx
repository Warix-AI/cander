import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/create");

export default function CreatePage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Every plan"
            title="Make apps, sites, automations, and images."
            body="Create unifies software and media in one space — live preview for apps and sites, image playground for stills, chat beside the work."
          />
          <div className="mt-10 hidden sm:block">
            <ProductMockup variant="studio" />
          </div>
          <div className="mt-10">
            <FeatureGrid
              columns={4}
              items={[
                { title: "Apps & sites", body: "Ship with preview beside chat." },
                { title: "Automations", body: "Scheduled and triggered workflows." },
                { title: "Images", body: "Generate, edit, and library." },
                { title: "One Create space", body: "Former Build and Studio, together." },
              ]}
            />
          </div>
        </PageWidth>
      </Section>
      <FinalCta />
    </>
  );
}
