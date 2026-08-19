import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { developmentIntegrated, limitedDevelopment } from "@/lib/product-copy";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/development");

export default function DevelopmentPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Development"
            title="Start with an idea. Go all the way to production."
            body="Development is a view inside Courier, not another product. It begins on Pro."
          />
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            {limitedDevelopment}
          </p>
          <div className="mt-10 hidden sm:block">
            <ProductMockup variant="development" />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <FeatureGrid
            columns={3}
            items={[
              {
                title: "Pro · Build personally",
                body: "Development view, APIs, keys, Local, On-device, and one shared model.",
              },
              {
                title: "Max · Build together",
                body: "Shared catalog, team deploys, docs, limited logs and usage, org controls.",
              },
              {
                title: "Ultra · Operate production",
                body: "Production APIs, keys, test and production deploys, serving, full logs, infrastructure management.",
              },
            ]}
          />
          <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Ultra does not mean large models. Ultra means build, deploy, host,
            serve, and operate production AI with Courier.
          </p>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader title="Inside Build" body={developmentIntegrated} />
        </PageWidth>
      </Section>

      <FinalCta />
    </>
  );
}
