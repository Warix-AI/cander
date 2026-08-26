import { FinalCta } from "@/components/marketing/FinalCta";
import { HostingCards } from "@/components/marketing/HostingCard";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/hosting");

export default function HostingPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Hosting"
            title="Run it where you want."
            body="Hosting is not a subscription plan. Cloud, Local, and On-device are equal compute locations. Production serving is Ultra — not a fourth location."
          />
          <div className="mt-12">
            <HostingCards />
          </div>
        </PageWidth>
      </Section>
      <Section>
        <PageWidth>
          <SectionHeader
            title="Production is a permission."
            body="Ultra can serve production workloads on Cloud, Local, or On-device if the hardware and runtime support it. Hardware is not a plan. Plan is not a device class."
          />
        </PageWidth>
      </Section>
      <FinalCta />
    </>
  );
}
