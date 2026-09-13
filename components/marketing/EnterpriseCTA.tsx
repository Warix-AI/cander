import { Cta } from "@/components/marketing/Cta";
import { PageWidth, Section } from "@/components/marketing/Section";
import { ENTERPRISE_MAILTO } from "@/lib/marketing";

export function EnterpriseCTA() {
  return (
    <Section className="border-t border-border/60">
      <PageWidth>
        <div className="flex flex-col gap-4 rounded-[10px] border border-border bg-card px-6 py-8 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[13px] text-muted-foreground">Limitless</p>
            <h2 className="mt-1 text-xl font-medium tracking-[-0.02em]">
              Custom Active AI Minutes
            </h2>
            <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted-foreground">
              Need more than Heavy? Limitless is negotiated capacity, pricing,
              and support.
            </p>
          </div>
          <Cta href={ENTERPRISE_MAILTO} variant="secondary">
            Contact us
          </Cta>
        </div>
      </PageWidth>
    </Section>
  );
}
