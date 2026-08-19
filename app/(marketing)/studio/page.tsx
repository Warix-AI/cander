import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FinalCta } from "@/components/marketing/FinalCta";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { marketingMetadata } from "@/lib/marketing";

export const metadata = marketingMetadata("/studio");

export default function StudioPage() {
  return (
    <>
      <Section className="pt-10 md:pt-16">
        <PageWidth>
          <SectionHeader
            as="h1"
            kicker="Every plan"
            title="Create images and video without leaving Courier."
            body="Generate, canvas, retouch, timeline, library, and export — in the same product as chat and Build."
          />
          <div className="mt-10 hidden sm:block">
            <ProductMockup variant="studio" />
          </div>
          <div className="mt-10">
            <FeatureGrid
              columns={4}
              items={[
                { title: "Generate", body: "Stills and motion from the thread." },
                { title: "Canvas", body: "Compose without exporting first." },
                { title: "Library", body: "Projects, photos, videos, files." },
                { title: "Presets", body: "Product stills, social crops, campaign assets." },
              ]}
            />
          </div>
        </PageWidth>
      </Section>
      <FinalCta />
    </>
  );
}
