import { Cta } from "@/components/marketing/Cta";
import { PageWidth, Section } from "@/components/marketing/Section";
import { APP_HREF } from "@/lib/marketing";

export function FinalCta({
  title = "Get started",
  body = "Start free at the root domain — the product, not a separate site.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <Section className="border-t border-border/60 pb-16 pt-10">
      <PageWidth>
        <div className="mx-auto max-w-lg text-center">
          <h2 className="heading-display text-3xl md:text-4xl">{title}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            {body}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Cta href={APP_HREF}>Sign up for free</Cta>
            <Cta href={APP_HREF} variant="secondary">
              Log in
            </Cta>
          </div>
        </div>
      </PageWidth>
    </Section>
  );
}
