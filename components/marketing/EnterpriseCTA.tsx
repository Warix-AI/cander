import { Cta } from "@/components/marketing/Cta";
import { PageWidth, Section } from "@/components/marketing/Section";
import { ENTERPRISE_MAILTO } from "@/lib/marketing";

export function EnterpriseCTA() {
  return (
    <Section band className="py-8 md:py-10">
      <PageWidth>
        <div className="relative overflow-hidden rounded-[10px] text-white hero-gradient">
          <div className="grain-layer" />
          <div className="relative max-w-xl px-6 py-10 md:px-8 md:py-12">
            <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-white/70">
              Enterprise
            </p>
            <h2 className="heading-display mt-2 text-2xl md:text-3xl">
              Need something custom?
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-white/80">
              Custom plans, SSO, residency, SLAs, and mixed Cloud, Local, and
              On-device compute. Request-only — talk to Recursion AI.
            </p>
            <Cta href={ENTERPRISE_MAILTO} variant="onDark" className="mt-6">
              Contact Enterprise
            </Cta>
          </div>
        </div>
      </PageWidth>
    </Section>
  );
}
