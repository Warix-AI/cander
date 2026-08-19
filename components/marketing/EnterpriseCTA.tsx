import { Cta } from "@/components/marketing/Cta";
import { PageWidth, Section } from "@/components/marketing/Section";
import { ENTERPRISE_MAILTO } from "@/lib/marketing";

export function EnterpriseCTA() {
  return (
    <Section className="border-t border-border/60 py-10">
      <PageWidth>
        <div className="rounded-[10px] border border-border bg-card p-8 md:p-10">
          <p className="text-[13px] text-muted-foreground">Enterprise</p>
          <h2 className="heading-display mt-1 text-2xl md:text-3xl">
            Need something custom?
          </h2>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
            SSO, residency, SLAs, and mixed compute — request-only.
          </p>
          <Cta href={ENTERPRISE_MAILTO} className="mt-6">
            Contact Enterprise
          </Cta>
        </div>
      </PageWidth>
    </Section>
  );
}
