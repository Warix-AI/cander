"use client";

import { useAdmin } from "@/components/admin/AdminProvider";
import { AdminPanelChrome } from "@/components/admin/AdminPanelChrome";
import { OverviewSection } from "@/components/admin/sections/OverviewSection";
import { PlansSection } from "@/components/admin/sections/PlansSection";
import { PricingSection } from "@/components/admin/sections/PricingSection";
import { AccountsSection } from "@/components/admin/sections/AccountsSection";
import { UsageSection } from "@/components/admin/sections/UsageSection";
import { SubscriptionsSection } from "@/components/admin/sections/SubscriptionsSection";
import { EnterpriseSection } from "@/components/admin/sections/EnterpriseSection";
import { AuditSection } from "@/components/admin/sections/AuditSection";
import { OperationsSection } from "@/components/admin/sections/OperationsSection";
import { cn } from "@/lib/utils";

/** Right workspace — ContextPanel surface (white / space-canvas). */
export function AdminWorkspace({ className }: { className?: string }) {
  const { section } = useAdmin();

  return (
    <aside
      className={cn(
        "@container flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-white shadow-none dark:bg-space-canvas",
        className,
      )}
    >
      <div className="shell-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <AdminPanelChrome />
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
          {section === "overview" && <OverviewSection />}
          {section === "plans" && <PlansSection />}
          {section === "pricing" && <PricingSection />}
          {section === "accounts" && <AccountsSection />}
          {section === "usage" && <UsageSection />}
          {section === "subscriptions" && <SubscriptionsSection />}
          {section === "enterprise" && <EnterpriseSection />}
          {section === "audit" && <AuditSection />}
          {section === "operations" && <OperationsSection />}
        </div>
      </div>
    </aside>
  );
}
