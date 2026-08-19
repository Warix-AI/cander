import { EnterpriseCTA } from "@/components/marketing/EnterpriseCTA";
import { FaqList } from "@/components/marketing/FaqList";
import { FinalCta } from "@/components/marketing/FinalCta";
import { PricingCards } from "@/components/marketing/PricingCard";
import { PricingComparison } from "@/components/marketing/PricingComparison";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { UltraTeamStory } from "@/components/marketing/UltraTeamStory";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/pricing");

export default function PricingPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Pricing"
            title="Free, Pro, Max & Ultra."
            body="Per user, per month. Cloud on every plan. Development starts on Pro. Ultra is a full plan — not an add-on."
          />
          <div className="mt-12">
            <PricingCards />
          </div>
        </PageWidth>
      </Section>

      <EnterpriseCTA />

      <Section>
        <PageWidth>
          <SectionHeader
            title="Compare plans"
            body="Checkmarks only. Pro is included in Max. Max is included in Ultra."
          />
          <div className="mt-10">
            <PricingComparison />
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
          <SectionHeader title="FAQ" />
          <div className="mt-8">
            <FaqList />
          </div>
        </PageWidth>
      </Section>

      <FinalCta />
    </>
  );
}
