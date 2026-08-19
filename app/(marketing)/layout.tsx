import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing bg-background text-foreground">
      <MarketingHeader />
      <main className="marketing-mesh relative">{children}</main>
      <MarketingFooter />
    </div>
  );
}
