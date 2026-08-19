import { ALL_PLANS, comparisonGroups, planLabel } from "@/lib/billing";
import { CompareCell } from "@/components/marketing/PricingCard";

export function PricingComparison() {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th className="py-3 pr-4 text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Compare
              </th>
              {ALL_PLANS.map((plan) => (
                <th
                  key={plan}
                  className="px-3 py-3 text-center text-[13.5px] font-medium tracking-[-0.01em]"
                >
                  {planLabel(plan)}
                </th>
              ))}
            </tr>
          </thead>
          {comparisonGroups.map((group) => (
            <tbody key={group.id}>
              <tr>
                <th
                  colSpan={5}
                  className="pt-8 pb-2 text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                >
                  {group.label}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.label} className="border-b border-border/70">
                  <th className="py-2.5 pr-4 text-[13.5px] font-medium">
                    {row.label}
                  </th>
                  {ALL_PLANS.map((plan) => (
                    <td key={plan} className="px-3 py-2.5 text-center">
                      <CompareCell value={row.values[plan]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="md:hidden">
        {comparisonGroups.map((group) => (
          <details key={group.id} className="border-b border-border py-3">
            <summary className="cursor-pointer text-[14px] font-medium tracking-[-0.01em]">
              {group.label}
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left">
                <thead>
                  <tr>
                    <th className="pb-2 text-[12px] text-muted-foreground"> </th>
                    {ALL_PLANS.map((plan) => (
                      <th
                        key={plan}
                        className="px-2 pb-2 text-center text-[12px] font-medium"
                      >
                        {planLabel(plan)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.label} className="border-t border-border/70">
                      <th className="py-2 pr-2 text-left text-[12.5px] font-medium">
                        {row.label}
                      </th>
                      {ALL_PLANS.map((plan) => (
                        <td key={plan} className="px-2 py-2 text-center">
                          <CompareCell value={row.values[plan]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
