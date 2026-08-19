import { Cta } from "@/components/marketing/Cta";
import { PageWidth, Section } from "@/components/marketing/Section";
import { APP_HREF } from "@/lib/marketing";

export function FinalCta({
  title = "Open Courier.",
  body = "Start free. Chat, Spaces, and Cloud are ready. Development opens on Pro.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <Section className="pb-24">
      <PageWidth>
        <div className="max-w-xl">
          <h2 className="heading-display text-3xl md:text-5xl">{title}</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-muted-foreground">
            {body}
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Cta href={APP_HREF}>Start free</Cta>
            <Cta href={APP_HREF} variant="secondary">
              Sign in
            </Cta>
          </div>
        </div>
      </PageWidth>
    </Section>
  );
}
