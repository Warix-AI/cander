import { InviteAcceptFlow } from "@/components/onboarding/InviteAcceptFlow";
import { cn } from "@/lib/utils";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-10">
      <div
        className={cn(
          "w-full max-w-lg border border-border bg-card p-8 shell-g3-radius",
        )}
      >
        <InviteAcceptFlow token={token} />
      </div>
    </div>
  );
}
