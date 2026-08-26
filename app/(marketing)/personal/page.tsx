import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/personal");

export default function PersonalPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Every plan"
            title="Today, money, health, goals, and the car."
            body="Separate from product work. Organizations can hide Personal. The app still knows the difference."
          />
          <div className="mt-10 hidden sm:block">
            <ProductMockup variant="personal" />
          </div>
          <div className="mt-10">
            <FeatureGrid
              columns={3}
              items={[
                { title: "Today", body: "What needs you, outside the company." },
                { title: "Money", body: "Personal finances, not the workspace ledger." },
                { title: "Health", body: "Routines that stay on your account." },
                { title: "Goals", body: "Private lists, not org OKRs." },
                { title: "Car", body: "The rest of life, still in the app." },
              ]}
            />
          </div>
        </PageWidth>
      </Section>
      <FinalCta />
    </>
  );
}
