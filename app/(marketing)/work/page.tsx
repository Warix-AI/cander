import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/work");

export default function WorkPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Max & Ultra"
            title="Inbox, calendar, customers."
            body="Work is Courier for day-to-day operations — not another app. Connected mail, Slack, calendar, and accounts, operated from chat."
          />
          <div className="mt-10 hidden sm:block">
            <ProductMockup variant="work" />
          </div>
          <div className="mt-10">
            <FeatureGrid
              columns={3}
              items={[
                { title: "Inbox", body: "Mail and Slack in one place. Draft replies in Courier." },
                { title: "Calendar", body: "Meetings next to the work they belong to." },
                { title: "Customers", body: "Accounts and context without leaving the thread." },
              ]}
            />
          </div>
        </PageWidth>
      </Section>
      <FinalCta />
    </>
  );
}
