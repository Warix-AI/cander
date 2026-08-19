import { Cta } from "@/components/marketing/Cta";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { ENTERPRISE_MAILTO, marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/enterprise");

export default function EnterprisePage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Enterprise"
            title="Custom when the public plans are not enough."
            body="SSO, residency, SLAs, and mixed Cloud, Local, and On-device compute — request-only. We do not list certifications we have not earned."
          />
          <div className="mt-8">
            <Cta href={ENTERPRISE_MAILTO}>Talk to Recursion AI</Cta>
          </div>
          <div className="mt-12">
            <FeatureGrid
              columns={3}
              items={[
                { title: "Custom plans", body: "Seats, support, and commercial terms that match procurement." },
                { title: "SSO", body: "Available as an enterprise request — not a public-plan toggle." },
                { title: "Residency", body: "Discuss where data and inference may live." },
                { title: "SLA", body: "Uptime and support commitments for production teams." },
                { title: "Private infrastructure", body: "Local and On-device alongside Cloud." },
                { title: "Org controls", body: "Roles, audit, connector policies — Max and Ultra already start here." },
              ]}
            />
          </div>
        </PageWidth>
      </Section>
      <FinalCta title="Or start on a public plan." />
    </>
  );
}
