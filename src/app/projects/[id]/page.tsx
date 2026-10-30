// Project detail page — /projects/[id]
//
// What this page is for: understanding one Project's state without opening
// anything else. It used to answer "what is this Project called" at length and
// "what state is its inventory in" not at all — a total Plot count, then the
// page stopped, so two thirds of it was empty and the question worth opening a
// Project for went unanswered.
//
// The status breakdown is that answer. It is a grouped count, not a list: a
// Project with five hundred Plots must not cost five hundred rows to say how
// many are available, which is the same reason listProjects counts by type.

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/security/current-actor";
import { listProjects } from "@/lib/services/project-service";
import CommissionSettings from "./commission-settings";
import ProjectActions from "./project-actions";
import { projectRowView } from "../row-view";
import { ProjectIdentity } from "../project-identity";
import { can } from "@/lib/security/permissions";
import { db } from "@/lib/db";
import { formatPercent } from "@/lib/tasks";
import { plcDisplayComponents } from "@/lib/domain/inventory";
import { plcRules } from "@/lib/services/plc-service";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

export const dynamic = "force-dynamic";

const PLOT_TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
};

/**
 * Eight Plot statuss is too many tiles to read at a glance, and the question
 * is commercial rather than technical: how much is still sellable, how much is
 * in play, how much is gone. Delivered sits under sold because a delivered Plot
 * is finished, not a separate thing to chase.
 */
const SELLABLE = ["AVAILABLE"];
const IN_PLAY = ["HOLD", "WAITING_FOR_BOOKING_APPROVAL"];
const SOLD = ["BOOKED", "PAYMENT_COMPLETED", "DELIVERED"];

/**
 * A heading and its content. Sentence case, not the uppercase tracking every
 * panel used to carry — six shouted labels on one page is six things competing
 * to be read first.
 */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A number and what it counts. The number is the point, so it carries the weight. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary px-3 py-2">
      <p className="text-lg font-semibold leading-none tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-1.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-xs font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireStaff("REPORT_VIEW");
  const { id } = await params;

  const [projects, byStatus, commissionVersions, plotOptions] = await Promise.all([
    listProjects(),
    db.plot.groupBy({ by: ["status"], where: { projectId: id }, _count: { _all: true } }),
    // CP §9 — each version with its Trip inventory rules.
    db.projectCommissionVersion.findMany({
      where: { projectId: id },
      orderBy: { version: "desc" },
      include: { tripInventoryRules: true },
    }),
    db.plot.findMany({ where: { projectId: id }, select: { id: true, plotNumber: true }, orderBy: { plotNumber: "asc" } }),
  ]);
  const project = projects.find((p) => p.id === id);
  if (!project) notFound();

  const countOf = (states: readonly string[]) =>
    byStatus.filter((r) => states.includes(r.status)).reduce((n, r) => n + r._count._all, 0);

  const total = project._count.plots;
  const available = countOf(SELLABLE);
  const inPlay = countOf(IN_PLAY);
  const sold = countOf(SOLD);

  const publishedVersion = project.plcRuleVersions.find((v) => v.status === "PUBLISHED");
  const charges = publishedVersion
    ? plcDisplayComponents(plcRules(publishedVersion.components))
    : [];

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <main className="mx-auto max-w-5xl space-y-3">
        {/* Back on the left; Edit Project and Update on the right, as on the
            Plot and Booking pages (owner, 28 Oct 2026). */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Projects
          </Link>
          {can(actor.role, "PROJECT_SETUP", actor.extraPermissions) && (
            <ProjectActions project={projectRowView(project)} canEditCommission={actor.role === "MD"} />
          )}
        </div>

        <header>
          <Card className="p-4">
            <ProjectIdentity project={project} />
          </Card>
        </header>

        {!project.isExternalResaleGroup && (
          // Inventory · PLC · Commission and Rewards, three boxes on one row
          // (owner, 28 Oct 2026). An External Resale Property Group sells
          // nothing of its own, so it has none of the three.
          <div className="grid items-start gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Card className="p-3">
              <Section
                title="Inventory"
                action={
                  total > 0 ? (
                    <Link
                      href={`/plots?project=${project.id}`}
                      className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                    >
                      Open in Plot Inventory <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  ) : null
                }
              >
                {total === 0 ? (
                  <Empty>No Plots yet. Prepare inventory to add them.</Empty>
                ) : (
                  <>
                    {/* Not available is not shown (owner, 28 Oct 2026). */}
                    <div className="grid grid-cols-3 gap-2">
                      <Stat value={available} label="Available" />
                      <Stat value={inPlay} label="On hold" />
                      <Stat value={sold} label="Sold" />
                    </div>
                    <dl className="mt-3">
                      <Fact label="Total Plots" value={total} />
                      {project.plotTypeCounts.map(({ plotType, count }) => (
                        <Fact
                          key={plotType}
                          label={PLOT_TYPE_LABEL[plotType] ?? plotType}
                          value={count}
                        />
                      ))}
                    </dl>
                  </>
                )}
              </Section>
            </Card>

            <Card className="p-3">
              <Section
                title={`Plot Location Charge${publishedVersion ? ` · v${publishedVersion.version}` : ""}`}
              >
                {charges.length === 0 ? (
                  <Empty>
                    {publishedVersion
                      ? "This version configures no charge."
                      : "No published PLC version — every Plot here charges zero."}
                  </Empty>
                ) : (
                  <dl>
                    {charges.map((c, i) => (
                      <Fact key={i} label={c.label} value={formatPercent(c.percent)} />
                    ))}
                  </dl>
                )}
              </Section>
            </Card>

            <div id="commission" className="scroll-mt-28">
            <CommissionSettings
              projectId={project.id}
              role={actor.role}
              versions={commissionVersions.map((v) => ({
                id: v.id,
                version: v.version,
                status: v.status,
                directEnabled: v.directEnabled,
                directPercent: v.directPercent?.toString() ?? null,
                loyaltyEnabled: v.loyaltyEnabled,
                loyaltyPercent: v.loyaltyPercent?.toString() ?? null,
                loyaltyExceptionReason: v.loyaltyExceptionReason,
                reason: v.reason,
                decisionNote: v.decisionNote,
                preparedByRef: v.preparedByRef,
                decidedByRef: v.decidedByRef,
                decidedAt: v.decidedAt?.toISOString() ?? null,
                effectiveFrom: v.effectiveFrom?.toISOString() ?? null,
                effectiveTo: v.effectiveTo?.toISOString() ?? null,
                trip: v.tripEnabled
                  ? {
                      target: v.tripTotalTarget!,
                      minOwn: v.tripMinOwnCredits!,
                      maxRef: v.tripMaxReferenceCredits!,
                      code: v.tripProgrammeCode!,
                      versionRef: v.tripProgrammeVersionRef!,
                      termsRef: v.tripTermsVersionRef!,
                      cutOffAt: v.tripCutOffAt?.toISOString() ?? null,
                      windDownAt: v.tripWindDownAt?.toISOString() ?? null,
                      excludedPlotIds: v.tripInventoryRules.filter((r) => !r.eligible).map((r) => r.plotId),
                      sharedPools: v.tripInventoryRules
                        .filter((r) => r.parentCreditPoolPlotId)
                        .map((r) => ({ plotId: r.plotId, parentPlotId: r.parentCreditPoolPlotId! })),
                    }
                  : null,
                economicsReviewedAt: v.economicsReviewedAt?.toISOString() ?? null,
                economicsReviewedByRef: v.economicsReviewedByRef,
                royaltyTokensPerAward: v.royaltyTokensPerAward,
              }))}
              plots={plotOptions}
            />
            </div>
          </div>
        )}


      </main>
    </AppShell>
  );
}
