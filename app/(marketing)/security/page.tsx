import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/security");

export default function SecurityPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Security"
            title="Architecture, not badges."
            body="This page describes how Courier isolates work today. We do not claim SOC 2, SSO, or residency as live product features."
          />
          <div className="mt-12">
            <FeatureGrid
              columns={2}
              items={[
                {
                  title: "Locations",
                  body: "Inference runs in Cloud, Local, or On-device. Location is not a plan. Tokens can stay on the LAN or the device.",
                },
                {
                  title: "Roles",
                  body: "Owner, admin, and member. Billing stays with owners. Members work in assigned workspaces.",
                },
                {
                  title: "Connector policies",
                  body: "Max and Ultra can constrain which connectors a workspace may use.",
                },
                {
                  title: "Audit",
                  body: "Organization admin and audit on Max and Ultra. Full logs and usage on Ultra.",
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
