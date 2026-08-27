import { Cta } from "@/components/marketing/Cta";
import { FaqList } from "@/components/marketing/FaqList";
import { FinalCta } from "@/components/marketing/FinalCta";
import { HostingCards } from "@/components/marketing/HostingCard";
import { ProductShowcase } from "@/components/marketing/ProductShowcase";
import { PageWidth, Section, SectionHeader } from "@/components/marketing/Section";
import { SpaceLinks } from "@/components/marketing/SpaceLinks";
import { APP_HREF } from "@/lib/marketing";

export function HomePage() {
  return (
    <>
      <Section className="pb-4 pt-10 md:pt-14">
        <PageWidth>
          <div className="max-w-3xl">
            <p className="text-[13px] text-muted-foreground">One AI</p>
            <h1 className="heading-display mt-2 text-[2.5rem] leading-[1.08] tracking-[-0.03em] md:text-[3.5rem]">
              Now you can chat, work, and build — all in one place.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-muted-foreground md:text-[17px]">
              One AI product for everyday work, software, research, and
              production. Run it in the cloud, on your network, or on your
              device.
            </p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Cta href={APP_HREF}>Try it now</Cta>
              <Cta href="/pricing" variant="secondary">
                See pricing
              </Cta>
            </div>
          </div>
          <ProductShowcase />
        </PageWidth>
      </Section>

      <Section className="border-t border-border/60 bg-muted/20">
        <PageWidth>
          <SectionHeader
            title="Spaces for every kind of work"
            body="Enter directly or route from chat."
          />
          <div className="mt-8">
            <SpaceLinks />
          </div>
        </PageWidth>
      </Section>

      <Section>
        <PageWidth>
          <SectionHeader
            title="Run AI where it fits"
            body="Cloud is included on every plan with usage limits. Local and On-device give you unlimited inference on your hardware — Pro and above."
          />
          <div className="mt-8">
            <HostingCards />
          </div>
        </PageWidth>
      </Section>

      <Section className="border-t border-border/60">
        <PageWidth>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <SectionHeader
              title="Plans and pricing"
              body="Free, Pro, and Max — per month."
            />
            <Cta href="/pricing" variant="secondary">
              Compare plans
            </Cta>
          </div>
        </PageWidth>
      </Section>

      <Section className="border-t border-border/60 bg-muted/20">
        <PageWidth>
          <SectionHeader title="FAQ" />
          <div className="mt-6 max-w-2xl">
            <FaqList />
          </div>
        </PageWidth>
      </Section>

      <FinalCta />
    </>
  );
}
