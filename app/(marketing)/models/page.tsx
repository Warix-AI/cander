import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { ModelCardGrid } from "@/components/marketing/ModelCard";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/models");

export default function ModelsPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Models"
            title="Plan is permission. Hardware is capacity."
            body="A model has requirements. A machine has capacity. A plan decides whether you may choose. Bigger models do not require Ultra."
          />
          <div className="mt-10">
            <FeatureGrid
              columns={3}
              items={[
                {
                  title: "Pro",
                  body: "One shared model. No full catalog picker.",
                },
                {
                  title: "Max",
                  body: "Shared model catalog for the team.",
                },
                {
                  title: "Ultra",
                  body: "Full catalog and production management.",
                },
              ]}
            />
          </div>
          <div className="mt-12">
            <ModelCardGrid />
          </div>
        </PageWidth>
      </Section>
      <FinalCta />
    </>
  );
}
