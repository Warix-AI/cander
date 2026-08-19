import Link from "next/link";
import { CourierMark } from "@/components/brand/CourierMark";
import { Cta } from "@/components/marketing/Cta";
import { APP_HREF, footerGroups } from "@/lib/marketing";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-[1080px] px-5 py-12 md:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-medium tracking-[-0.03em]">
              Try Courier today
            </h2>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Open the product at the root domain.
            </p>
          </div>
          <Cta href={APP_HREF}>Open Courier</Cta>
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {footerGroups.map((group) => (
            <div key={group.label}>
              <p className="text-[12px] font-medium text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-3 space-y-2">
                {group.links.map((link) => (
                  <li key={link.title}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="text-[13px] text-foreground/75 hover:text-foreground"
                        {...(link.href.startsWith("http")
                          ? { rel: "noreferrer", target: "_blank" }
                          : {})}
                      >
                        {link.title}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-[13px] text-foreground/75 hover:text-foreground"
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

        <div className="mt-10 flex items-center gap-2 border-t border-border pt-6">
          <CourierMark className="h-5 w-5" />
          <span className="text-[13px] text-muted-foreground">Courier</span>
        </div>
      </div>
    </footer>
  );
}
