import { FinalCta } from "@/components/marketing/FinalCta";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { SpaceCardRow } from "@/components/marketing/SpaceCard";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/spaces");

export default function SpacesPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Spaces"
            title="Your work has different shapes. Courier does too."
            body="Work, Build, Studio, Research, and Personal. Enter them directly, or let Courier hand work in from chat."
          />
          <div className="mt-12">
            <SpaceCardRow />
          </div>
        </PageWidth>
      </Section>
      <Section>
        <PageWidth>
          <SectionHeader title="From chat into the right space." />
          <div className="mt-10 hidden sm:block">
            <ProductMockup variant="hero" />
          </div>
        </PageWidth>
      </Section>
      <FinalCta />
    </>
  );
}
