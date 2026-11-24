// Where requireStaff sends a page the account has no tick for — it names the
// missing tick so the person knows what to ask MD for (owner, 24 Nov 2026).

import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/security/current-actor";
import { ACTION_LABELS, isAction } from "@/lib/security/permissions";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string }>;
}) {
  const actor = await currentStaff();
  if (!actor) redirect("/login");
  const { need } = await searchParams;
  const tick = need && isAction(need) ? ACTION_LABELS[need] : null;

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <main className="mx-auto max-w-lg">
        <Card className="space-y-2 p-4">
          <h1 className="text-sm font-semibold">You do not have permission to open this page</h1>
          <p className="text-xs text-muted-foreground">
            {tick
              ? `Ask MD to tick "${tick}" for you under Administration, then open the page again.`
              : "Ask MD to give you this permission under Administration, then open the page again."}
          </p>
          <Link href="/dashboard" className="inline-block text-xs text-primary hover:underline">
            Back to Task List
          </Link>
        </Card>
      </main>
    </AppShell>
  );
}
