import Link from "next/link";
import { CourierMark } from "@/components/brand/CourierMark";
import { RecursionMark } from "@/components/brand/RecursionMark";
import { Cta } from "@/components/marketing/Cta";
import { APP_HREF, footerGroups } from "@/lib/marketing";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-footer text-footer-foreground">
      <div className="mx-auto max-w-[1120px] px-5 py-14 md:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="heading-section text-2xl tracking-[-0.04em] md:text-3xl">
              The website explains Courier.
              <br />
              The root domain is Courier.
            </p>
            <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">
              Start in chat. Hand work into Spaces. Open Development when you
              are ready to host, serve, and operate.
            </p>
          </div>
          <Cta href={APP_HREF}>Open Courier</Cta>
        </div>

        <div className="mt-14 grid gap-10 sm:grid-cols-3">
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

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <Link href="/home" className="flex items-center gap-2">
            <CourierMark className="h-6 w-6" />
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
