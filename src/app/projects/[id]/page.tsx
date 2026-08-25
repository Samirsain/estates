// Project detail page — /projects/[id]
// Full details: overview, plot breakdown, PLC version history with explanations.

import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/security/current-actor";
import { listProjects } from "@/lib/services/project-service";
import { formatIst, formatPercent } from "@/lib/tasks";
import { plcDisplayComponents } from "@/lib/domain/inventory";
import { plcRules } from "@/lib/services/plc-service";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  Building2,
  MapPin,
  ScrollText,
  Layers,
  Info,
  CheckCircle2,
  Clock,
  History,
} from "lucide-react";

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
  MIXED: "Mixed",
};

const PLOT_TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
};

/**
 * PLC Status Explanations shown inline — answers the user's question:
 * "v1 · Superseded — what does this mean?"
 *
 * PUBLISHED  = Currently active. All new Holds and Bookings use this version's charges.
 * DRAFT      = Being prepared. Does not affect any plot price until published.
 * SUPERSEDED = Was published but replaced by a newer version. Holds and Bookings that
 *              were created while it was published still use this version's snapshot —
 *              it is kept for audit but no new deals use it.
 */
const PLC_STATUS: Record<
  string,
  { label: string; variant: "success" | "warning" | "outline"; explanation: string }
> = {
  PUBLISHED: {
    label: "Active",
    variant: "success",
    explanation: "Currently active — new Holds and Bookings use these charges.",
  },
  DRAFT: {
    label: "Draft",
    variant: "warning",
    explanation: "Being prepared. Does not affect any deal until it is published.",
  },
  SUPERSEDED: {
    label: "Superseded",
    variant: "outline",
    explanation:
      "Was active but replaced by a newer version. Deals created while it was active keep their own frozen snapshot of these charges for audit purposes. No new deals use it.",
  },
};

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium">{value}</span>
    </div>
  );
}

function amenityList(amenities: string | null): string[] {
  return (amenities ?? "")
    .split("\n")
    .map((a) => a.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireStaff("REPORT_VIEW");
  const { id } = await params;

  // Reuse listProjects — it already includes all PLC versions, plot counts, etc.
  const projects = await listProjects();
  const project = projects.find((p) => p.id === id);

  if (!project) notFound();

  const publishedVersion = project.plcRuleVersions.find((v) => v.status === "PUBLISHED");
  const amenities = amenityList(project.amenities);

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Back */}
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Projects
        </Link>

        {/* Hero */}
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
                <Badge variant={project.lifecycle === "ACTIVE" ? "success" : "outline"}>
                  {LIFECYCLE_LABEL[project.lifecycle] ?? project.lifecycle}
                </Badge>
              </div>
              <p className="mt-1 font-mono text-sm text-muted-foreground">{project.projectCode}</p>
              <p className="text-xs text-muted-foreground">
                {project.isExternalResaleGroup
                  ? "External Resale Property Group"
                  : (TYPE_LABEL[project.type] ?? project.type)}
              </p>
            </div>
          </div>

          {/* Location / Developer / RERA */}
          {(project.city || project.location || project.developer || project.reraNumber) && (
            <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
              {(project.city || project.location) && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {[project.location, project.city].filter(Boolean).join(", ")}
                </p>
              )}
              {project.developer && (
                <p className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  {project.developer}
                </p>
              )}
              {project.reraNumber && (
                <p className="flex items-center gap-2">
                  <ScrollText className="h-3.5 w-3.5 shrink-0" />
                  RERA {project.reraNumber}
                </p>
              )}
            </div>
          )}
        </Card>

        {!project.isExternalResaleGroup && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Plot Inventory */}
            <Card className="p-5 space-y-4">
              <Section title="Plot Inventory" icon={<Layers className="h-3.5 w-3.5" />}>
                <Row label="Total Plots" value={String(project._count.plots)} />
                {project.plotTypeCounts.map(({ plotType, count }) => (
                  <Row
                    key={plotType}
                    label={PLOT_TYPE_LABEL[plotType] ?? plotType}
                    value={String(count)}
                  />
                ))}
              </Section>
            </Card>

            {/* Current PLC Summary */}
            <Card className="p-5 space-y-4">
              <Section
                title={`Plot Location Charge${publishedVersion ? ` · v${publishedVersion.version}` : ""}`}
                icon={<Info className="h-3.5 w-3.5" />}
              >
                {publishedVersion ? (
                  <ul className="space-y-1 text-xs">
                    {plcDisplayComponents(plcRules(publishedVersion.components)).map((c, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="text-muted-foreground">{c.label}</span>
                        <span className="tabular-nums font-medium">
                          {formatPercent(c.percent)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No published PLC version.</p>
                )}
              </Section>
            </Card>
          </div>
        )}

        {/* Amenities */}
        {amenities.length > 0 && (
          <Card className="p-5 space-y-3">
            <Section title="Amenities" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
              <ul className="flex flex-wrap gap-1.5">
                {amenities.map((a) => (
                  <li
                    key={a}
                    className="rounded-full bg-secondary/80 px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                  >
                    {a}
                  </li>
                ))}
              </ul>
            </Section>
          </Card>
        )}

        {/* PLC Version History */}
        {!project.isExternalResaleGroup && project.plcRuleVersions.length > 0 && (
          <Card className="p-5 space-y-4">
            <Section title="PLC Version History" icon={<History className="h-3.5 w-3.5" />}>
              {/* Explanation box — answers "v1 · Superseded" question */}
              <div className="rounded-xl border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" /> What do these statuses mean?
                </p>
                <ul className="space-y-1 mt-1">
                  {Object.entries(PLC_STATUS).map(([, s]) => (
                    <li key={s.label}>
                      <Badge variant={s.variant} className="mr-2">{s.label}</Badge>
                      {s.explanation}
                    </li>
                  ))}
                </ul>
              </div>

              <ul className="space-y-3">
                {project.plcRuleVersions.map((v) => {
                  const statusInfo = PLC_STATUS[v.status] ?? {
                    label: v.status,
                    variant: "outline" as const,
                    explanation: "",
                  };
                  return (
                    <li
                      key={v.id}
                      className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">v{v.version}</span>
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground text-right">
                          {v.effectiveFrom && (
                            <p>Active from {formatIst(v.effectiveFrom)}</p>
                          )}
                          {v.effectiveTo && (
                            <p>Replaced {formatIst(v.effectiveTo)}</p>
                          )}
                          {v.publishedBy && <p>Published by {v.publishedBy}</p>}
                          {v.createdBy && !v.publishedBy && <p>Created by {v.createdBy}</p>}
                          <p className="text-[10px]">Created {formatIst(v.createdAt)}</p>
                        </div>
                      </div>

                      {v.reason && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Reason: </span>
                          {v.reason}
                        </p>
                      )}

                      {v.components.length > 0 && (
                        <ul className="space-y-1 text-xs border-t border-border/40 pt-2">
                          {plcDisplayComponents(plcRules(v.components)).map((c, i) => (
                            <li key={i} className="flex justify-between gap-3">
                              <span className="text-muted-foreground">{c.label}</span>
                              <span className="tabular-nums font-medium">
                                {formatPercent(c.percent)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
