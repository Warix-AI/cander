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
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/90 backdrop-blur-lg">
      <div className="mx-auto flex h-[52px] max-w-[1080px] items-center gap-4 px-5 md:px-6">
        <Link href="/home" className="flex items-center gap-2">
          <CourierMark />
          <span className="text-[14px] font-semibold tracking-[-0.02em]">
            Courier
          </span>
        </Link>

        <nav className="ml-2 hidden flex-1 items-center gap-1 lg:flex">
          <NavDropdown label="Spaces" items={spacesNav} />
          <NavDropdown label="Development" items={developmentNav} />
          {headerLinks.map((link) => (
            <NavLink key={link.href} href={link.href}>
              {link.title}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <MarketingThemeToggle />
          <Cta href={APP_HREF} variant="secondary">
            Log in
          </Cta>
          <Cta href={APP_HREF}>Sign up for free</Cta>
        </div>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <MarketingThemeToggle />
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-border"
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
            <MobileGroup label="Spaces" items={spacesNav} onNavigate={() => setOpen(false)} />
            <MobileGroup
              label="Development"
              items={developmentNav}
              onNavigate={() => setOpen(false)}
            />
            {headerLinks.map((link) => (
              <MobileLink key={link.href} href={link.href} onClick={() => setOpen(false)}>
                {link.title}
              </MobileLink>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Cta href={APP_HREF} variant="secondary" className="flex-1">
              Log in
            </Cta>
            <Cta href={APP_HREF} className="flex-1">
              Sign up
            </Cta>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
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
      menuClassName="w-[220px]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground",
            open && "text-foreground",
          )}
        >
          {label}
          <ChevronDown className="h-3 w-3" strokeWidth={2} />
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
              className="block rounded-[10px] px-3 py-2 hover:bg-muted"
            >
              <span className="text-[13px] font-medium">{item.title}</span>
              <span className="mt-0.5 block text-[12px] text-muted-foreground">
                {item.body}
              </span>
            </Link>
          ))}
        </>
      )}
    </Dropdown>
  );
}

function MobileGroup({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: readonly { href: string; title: string }[];
  onNavigate: () => void;
}) {
  return (
    <>
      <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      {items.map((item) => (
        <MobileLink key={item.href} href={item.href} onClick={onNavigate}>
          {item.title}
        </MobileLink>
      ))}
    </>
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
      className="rounded-[10px] px-3 py-2 text-[14px] font-medium hover:bg-muted"
    >
      {children}
    </Link>
  );
}
