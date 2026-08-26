// Project detail page — /projects/[id]
//
// What this page is for: understanding one Project's state without opening
// anything else. It used to answer "what is this Project called" at length and
// "what state is its inventory in" not at all — a total Plot count, then the
// page stopped, so two thirds of it was empty and the question worth opening a
// Project for went unanswered.
//
// The lifecycle breakdown is that answer. It is a grouped count, not a list: a
// Project with five hundred Plots must not cost five hundred rows to say how
// many are available, which is the same reason listProjects counts by type.

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/security/current-actor";
import { listProjects } from "@/lib/services/project-service";
import { db } from "@/lib/db";
import { formatPercent } from "@/lib/tasks";
import { plcDisplayComponents } from "@/lib/domain/inventory";
import { plcRules } from "@/lib/services/plc-service";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ArrowUpRight, FolderOpen, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

const LIFECYCLE_LABEL: Record<string, string> = {
  SETUP_NOT_ACTIVE: "Unreleased",
  ACTIVE: "Active",
  SOLD_OUT: "Sold Out",
  COMPLETED: "Completed",
};

const TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  AGRICULTURAL: "Agricultural",
  MIXED: "Mixed",
};

const PLOT_TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
};

/**
 * Eight Plot lifecycles is too many tiles to read at a glance, and the question
 * is commercial rather than technical: how much is still sellable, how much is
 * in play, how much is gone. Delivered sits under sold because a delivered Plot
 * is finished, not a separate thing to chase.
 */
const SELLABLE = ["AVAILABLE"];
const IN_PLAY = ["HOLD", "WAITING_FOR_BOOKING_APPROVAL"];
const SOLD = ["BOOKED", "PAYMENT_COMPLETED", "DELIVERED"];

function amenityList(amenities: string | null): string[] {
  return (amenities ?? "")
    .split("\n")
    .map((a) => a.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

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
function Stat({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary px-3 py-2">
      <p
        className={`text-lg font-semibold leading-none tabular-nums ${
          muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </p>
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

  const [projects, byLifecycle] = await Promise.all([
    listProjects(),
    db.plot.groupBy({ by: ["lifecycle"], where: { projectId: id }, _count: { _all: true } }),
  ]);
  const project = projects.find((p) => p.id === id);
  if (!project) notFound();

  const countOf = (states: readonly string[]) =>
    byLifecycle.filter((r) => states.includes(r.lifecycle)).reduce((n, r) => n + r._count._all, 0);

  const total = project._count.plots;
  const available = countOf(SELLABLE);
  const inPlay = countOf(IN_PLAY);
  const sold = countOf(SOLD);
  // Whatever is left is unavailable for a reason of its own — a restriction, or
  // a Project not yet activated. Derived rather than listed, so a lifecycle
  // added later can never quietly go uncounted.
  const unavailable = total - available - inPlay - sold;

  const publishedVersion = project.plcRuleVersions.find((v) => v.status === "PUBLISHED");
  const charges = publishedVersion
    ? plcDisplayComponents(plcRules(publishedVersion.components))
    : [];
  const amenities = amenityList(project.amenities);

  const facts = [
    [project.location, project.city].filter(Boolean).join(", "),
    project.isExternalResaleGroup
      ? "External Resale Property Group"
      : (TYPE_LABEL[project.type] ?? project.type),
    project.developer,
    project.reraNumber ? `RERA ${project.reraNumber}` : null,
  ].filter(Boolean);

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <main className="mx-auto max-w-5xl space-y-3">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Projects
        </Link>

        {/* Identity. Four short facts that were four stacked rows, now one line
            of name and one of everything else. */}
        <header>
          <Card className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-xl font-bold tracking-tight">{project.name}</h1>
              <Badge variant={project.lifecycle === "ACTIVE" ? "success" : "outline"}>
                {LIFECYCLE_LABEL[project.lifecycle] ?? project.lifecycle}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">{project.projectCode}</span>
            </div>

            {facts.length > 0 && <p className="text-xs text-foreground">{facts.join(" · ")}</p>}

            {(project.locationUrl || project.driveUrl) && (
              // noreferrer carries noopener; without it the opened tab can reach
              // back through window.opener and navigate this one.
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {project.locationUrl && (
                  <a
                    href={project.locationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Map
                  </a>
                )}
                {project.driveUrl && (
                  <a
                    href={project.driveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <FolderOpen className="h-3.5 w-3.5" /> Structure &amp; layout
                  </a>
                )}
              </div>
            )}
          </Card>
        </header>

        {!project.isExternalResaleGroup && (
          <div className="grid items-start gap-3 lg:grid-cols-2">
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
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Stat value={available} label="Available" />
                      <Stat value={inPlay} label="On hold" />
                      <Stat value={sold} label="Sold" />
                      <Stat value={unavailable} label="Not available" muted />
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
          </div>
        )}

        {amenities.length > 0 && (
          <Card className="p-3">
            <Section title="Amenities">
              <ul className="flex flex-wrap gap-1.5">
                {amenities.map((a) => (
                  <li
                    key={a}
                    className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                  >
                    {a}
                  </li>
                ))}
              </ul>
            </Section>
          </Card>
        )}
      </main>
    </AppShell>
  );
}
