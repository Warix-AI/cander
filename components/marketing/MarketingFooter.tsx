import Link from "next/link";
import { CourierMark } from "@/components/brand/CourierMark";
import { RecursionMark } from "@/components/brand/RecursionMark";
import { Cta } from "@/components/marketing/Cta";
import { APP_HREF, footerGroups } from "@/lib/marketing";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-footer text-footer-foreground">
      <div className="mx-auto max-w-[1120px] px-5 py-10 md:px-8 md:py-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="heading-section text-xl tracking-[-0.04em] md:text-2xl">
              Open Courier at the root domain.
            </p>
            <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
              The website explains what Courier can do. getcourier.ai is the
              product.
            </p>
          </div>
          <Cta href={APP_HREF}>Open Courier</Cta>
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {footerGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.title}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="text-[13.5px] text-foreground/80 hover:text-foreground"
                        {...(link.href.startsWith("http")
                          ? { rel: "noreferrer", target: "_blank" }
                          : {})}
                      >
                        {link.title}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-[13.5px] text-foreground/80 hover:text-foreground"
                      >
                        {link.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
          <Link href="/home" className="flex items-center gap-2">
            <CourierMark className="h-5 w-5" />
            <span className="text-[13px] font-medium tracking-[-0.02em]">
              Courier
            </span>
          </Link>
          <a
            href="https://thinkrecursion.ai"
            className="flex items-center gap-2 text-[12.5px] text-muted-foreground hover:text-foreground"
            rel="noreferrer"
            target="_blank"
          >
            <RecursionMark className="h-4 w-4" />
            Recursion AI
          </a>
        </div>
      </div>
    </footer>
  );
}
