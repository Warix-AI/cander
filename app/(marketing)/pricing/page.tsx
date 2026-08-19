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
      <Section className="pt-10 md:pt-14">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Courier"
            title="Pricing"
            body="Free, Pro, Max, and Ultra. Cloud on every plan. Unlimited Local and On-device on your hardware from Pro."
            center
          />
          <div className="mt-10">
            <PricingCards />
          </div>
        </PageWidth>
      </Section>

      <EnterpriseCTA />

      <Section className="border-t border-border/60 bg-muted/20">
        <PageWidth>
          <SectionHeader title="Compare features" center />
          <div className="mt-8">
            <PricingComparison />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <UltraTeamStory />
        </PageWidth>
      </Section>

      <Section className="border-t border-border/60 bg-muted/20">
        <PageWidth>
          <SectionHeader title="FAQ" center />
          <div className="mx-auto mt-6 max-w-2xl">
            <FaqList />
          </div>
        </PageWidth>
      </Section>

      <FinalCta />
    </>
  );
}
