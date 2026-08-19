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
      <Section className="pt-8 md:pt-12">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Pricing"
            title="Free, Pro, Max & Ultra."
            body="Per user, per month. Cloud on every plan with usage limits. Local and On-device are unlimited on your hardware from Pro."
          />
          <div className="mt-8">
            <PricingCards />
          </div>
        </PageWidth>
      </Section>

      <EnterpriseCTA />

      <Section band>
        <PageWidth>
          <SectionHeader
            title="Compare plans"
            body="Pro ⊂ Max ⊂ Ultra. Checkmarks only."
            compact
          />
          <div className="mt-6">
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
          <SectionHeader title="FAQ" compact />
          <div className="mt-5">
            <FaqList />
          </div>
        </PageWidth>
      </Section>

      <FinalCta />
    </>
  );
}
