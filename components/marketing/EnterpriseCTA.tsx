import { Cta } from "@/components/marketing/Cta";
import { PageWidth, Section } from "@/components/marketing/Section";
import { ENTERPRISE_MAILTO } from "@/lib/marketing";

export function EnterpriseCTA() {
  return (
    <Section>
      <PageWidth>
        <div className="relative overflow-hidden rounded-[10px] text-white hero-gradient">
          <div className="grain-layer" />
          <div className="relative max-w-xl px-6 py-12 md:px-10 md:py-16">
            <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-white/70">
              Enterprise
            </p>
            <h2 className="heading-display mt-3 text-3xl md:text-4xl">
              Need something custom?
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-white/80">
              Custom plans, SSO, residency, SLAs, and mixed Cloud, Local, and
              On-device compute. Request-only — talk to Recursion AI.
            </p>
            <Cta href={ENTERPRISE_MAILTO} variant="onDark" className="mt-8">
              Contact Enterprise
            </Cta>
          </div>
        </div>
      </PageWidth>
    </Section>
  );
}
