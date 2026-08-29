// Prepare Inventory — /plots/prepare
//
// This was a dialog floating over the Plot list. Preparing inventory is a
// data-entry session, not a question: twenty rows of plot number, dimensions
// and four boundaries each, typed in one sitting. A dialog gave it a fraction
// of the screen and put the list it is about behind a scrim.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { plcRules } from "@/lib/services/plc-service";
import { AppShell } from "@/components/app-shell";
import PrepareInventoryClient from "./prepare-client";

export const dynamic = "force-dynamic";

export default async function PrepareInventoryPage() {
  const actor = await requireStaff("PLOT_SETUP");

  const projects = await db.project.findMany({
    include: {
      plcRuleVersions: { where: { status: "PUBLISHED" }, include: { components: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <main className="mx-auto max-w-6xl space-y-3">
        <Link
          href="/plots"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Plot Inventory
        </Link>

        <header>
          <h1 className="text-xl font-bold tracking-tight">Prepare Inventory</h1>
        </header>

        <PrepareInventoryClient
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            city: p.city,
            location: p.location,
            status: p.status,
            plcComponents: plcRules(p.plcRuleVersions[0]?.components ?? []).map((c) => ({
              category: c.category,
              threshold: c.threshold == null ? null : String(c.threshold),
              percent: String(c.percent),
            })),
          }))}
        />
      </main>
    </AppShell>
  );
}
