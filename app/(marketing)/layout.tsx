import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingScrollUnlock } from "@/components/marketing/MarketingScrollUnlock";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingScrollUnlock />
      <div className="marketing flex min-h-svh flex-col bg-background text-foreground">
        <MarketingHeader />
        <main className="flex-1">{children}</main>
        <MarketingFooter />
      </div>
    </>
  );
}
