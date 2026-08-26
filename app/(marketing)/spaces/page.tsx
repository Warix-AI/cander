import { FinalCta } from "@/components/marketing/FinalCta";
import { ProductShowcase } from "@/components/marketing/ProductShowcase";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { SpaceLinks } from "@/components/marketing/SpaceLinks";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/spaces");

export default function SpacesPage() {
  return (
    <>
      <Section className="pt-10 md:pt-14">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="One AI"
            title="Spaces"
            body="Work, Build, Studio, Research, and Personal — one product, different shapes."
          />
          <div className="mt-8">
            <SpaceLinks />
          </div>
        </PageWidth>
      </Section>
      <Section className="border-t border-border/60 bg-muted/20">
        <PageWidth>
          <ProductShowcase />
        </PageWidth>
      </Section>
      <FinalCta />
    </>
  );
}
