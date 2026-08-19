import { ConnectorCatalog } from "@/components/marketing/ConnectorCatalog";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/connectors");

export default function ConnectorsPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Connectors"
            title="Courier works with what you already use."
            body="Featured first, then the catalog. Connector policies on Max and Ultra. This machine and Stash stay on your account."
          />
          <div className="mt-10">
            <ConnectorCatalog />
          </div>
          <div className="mt-12">
            <FeatureGrid
              columns={2}
              items={[
                {
                  title: "This machine",
                  body: "Local folders Courier can list and open — private to the device.",
                },
                {
                  title: "Stash",
                  body: "Private notes Courier can cite. Not an org wiki.",
                },
              ]}
            />
          </div>
        </PageWidth>
      </Section>
      <FinalCta />
    </>
  );
}
