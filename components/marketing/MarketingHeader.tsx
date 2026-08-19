"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { CourierMark } from "@/components/brand/CourierMark";
import { Dropdown } from "@/components/ui/Controls";
import { Cta } from "@/components/marketing/Cta";
import { MarketingThemeToggle } from "@/components/marketing/MarketingThemeToggle";
import {
  APP_HREF,
  developmentNav,
  headerLinks,
  spacesNav,
} from "@/lib/marketing";
import { cn } from "@/lib/utils";

export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-2 px-5 md:px-8">
        <Link href="/home" className="flex items-center gap-2 pr-2">
          <CourierMark />
          <span className="text-[15px] font-semibold tracking-[-0.03em]">
            Courier
          </span>
        </Link>

        <nav className="ml-3 hidden items-center gap-0.5 lg:flex">
          <NavDropdown label="Spaces" items={spacesNav} />
          <NavDropdown label="Development" items={developmentNav} />
          {headerLinks.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.title}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-1.5 lg:flex">
          <MarketingThemeToggle />
          <Cta href={APP_HREF} variant="ghost">
            Sign in
          </Cta>
          <Cta href={APP_HREF}>Start free</Cta>
        </div>

        <div className="ml-auto flex items-center gap-1.5 lg:hidden">
          <MarketingThemeToggle />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-foreground/12"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <X className="h-4 w-4" strokeWidth={1.8} />
            ) : (
              <Menu className="h-4 w-4" strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border bg-background px-5 py-4 lg:hidden">
          <div className="flex flex-col gap-1">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Spaces
            </p>
            {spacesNav.map((item) => (
              <MobileLink key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.title}
              </MobileLink>
            ))}
            <p className="mt-3 px-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Development
            </p>
            {developmentNav.map((item) => (
              <MobileLink key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.title}
              </MobileLink>
            ))}
            {headerLinks.map((link) => (
              <MobileLink key={link.href} href={link.href} onClick={() => setOpen(false)}>
                {link.title}
              </MobileLink>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Cta href={APP_HREF} variant="secondary" className="flex-1">
              Sign in
            </Cta>
            <Cta href={APP_HREF} className="flex-1">
              Start free
            </Cta>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-2 text-[13.5px] font-medium tracking-[-0.01em] text-foreground/80 hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function NavDropdown({
  label,
  items,
}: {
  label: string;
  items: readonly { href: string; title: string; body: string }[];
}) {
  return (
    <Dropdown
      matchTrigger={false}
      menuClassName="w-[240px]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-2 text-[13.5px] font-medium tracking-[-0.01em] text-foreground/80 hover:bg-muted hover:text-foreground",
            open && "bg-muted text-foreground",
          )}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.8} />
        </button>
      )}
    >
      {(close) => (
        <>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={close}
              className="flex w-full flex-col rounded-[10px] px-3 py-2.5 text-left hover:bg-muted"
            >
              <span className="text-[13.5px] font-medium tracking-[-0.01em]">
                {item.title}
              </span>
              <span className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                {item.body}
              </span>
            </Link>
          ))}
        </>
      )}
    </Dropdown>
  );
}

function MobileLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="rounded-[10px] px-3 py-2.5 text-[14px] font-medium tracking-[-0.01em] hover:bg-muted"
    >
      {children}
    </Link>
  );
}
