// Plot detail page — DESIGN.md §7.2.
//
// One record, read top to bottom. Sections are separated by a hairline and by
// whitespace rather than boxed: six equal cards on a single record communicate
// no hierarchy, they only add chrome. The Location Charge leads because it is
// the figure the page exists to explain; everything under it is the evidence.
//
// Payment progress and commission summary are not rendered here. Both belong to
// the Booking and its screen already shows them; this page links there instead
// of growing a second copy that would have to be kept in step.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { buildPlcSnapshot, derivedFacing, humaniseRestriction } from "@/lib/domain/inventory";
import { getPlot } from "@/lib/services/inventory-service";
import { plcRules } from "@/lib/services/plc-service";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { formatIst, formatPercent, formatQuantity } from "@/lib/tasks";
import EditPlotDetailsLauncher from "./edit-launcher";

export const dynamic = "force-dynamic";

const LIFECYCLE_LABEL: Record<string, string> = {
  NOT_AVAILABLE: "Not Available",
  AVAILABLE: "Available",
  HOLD: "Hold",
  WAITING_FOR_BOOKING_APPROVAL: "Waiting for Booking Approval",
  BOOKED: "Booked",
  PAYMENT_COMPLETED: "Payment Completed",
  REFUND_PENDING: "Refund Pending",
  DELIVERED: "Delivered",
};

const PLOT_TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
};

const BOUNDARY_KIND_LABEL: Record<string, string> = {
  ROAD: "Road",
  PLOT: "Plot",
  COMMERCIAL: "Commercial",
  INFORMAL_SECTOR: "Informal Sector",
  PARK: "Park",
  PLAYGROUND: "Playground",
  FACILITIES: "Facilities",
  PUBLIC_UTILITY: "Public Utility",
  OTHER: "Other",
};

const SIDES = ["NORTH", "EAST", "SOUTH", "WEST"] as const;

function lifecycleVariant(lifecycle: string) {
  if (lifecycle === "AVAILABLE") return "success" as const;
  if (lifecycle === "HOLD") return "warning" as const;
  if (lifecycle === "NOT_AVAILABLE") return "outline" as const;
  return "info" as const;
}

/**
 * A section is its name in the margin and its content beside it. No border and
 * no background of its own — the hairline above and the space around do the
 * separating that a card was doing badly.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-8 gap-y-3 border-t border-border/60 pt-6 sm:grid-cols-[9rem_1fr]">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Label and value — the description list a record actually is. */
function Facts({ rows }: { rows: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[7rem_1fr] gap-3 text-sm">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function PlotDetailPage({
  params,
}: {
  params: Promise<{ plotId: string }>;
}) {
  const actor = await requireStaff();
  const { plotId } = await params;
  const plot = await getPlot(plotId);
  if (!plot) notFound();

  const boundaries = plot.boundaries.map((b) => ({
    side: b.side,
    kind: b.kind,
    roadWidthFt: b.roadWidthFt?.toString(),
  }));

  const version = plot.project.plcRuleVersions[0] ?? null;
  let plc: ReturnType<typeof buildPlcSnapshot> | null = null;
  let plcIssue: string | null = version
    ? null
    : "No published Location Charge version for this Project";
  if (version) {
    try {
      plc = buildPlcSnapshot(boundaries, plcRules(version.components));
    } catch (error) {
      plcIssue = error instanceof Error ? error.message : "Location Charge could not be evaluated";
    }
  }

  const hold = plot.holds[0] ?? null;
  const booking = plot.bookings[0] ?? null;
  const bySide = new Map(plot.boundaries.map((b) => [b.side, b]));
  const num = (value: { toDecimalPlaces(n: number): { toString(): string } }) =>
    formatQuantity(value.toDecimalPlaces(2).toString());

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-3xl space-y-8 pb-12">
        <header className="space-y-4">
          <Link
            href="/plots"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Plot Inventory
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-mono text-3xl font-semibold tracking-tight">{plot.plotNumber}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {plot.project.name} · {PLOT_TYPE_LABEL[plot.plotType] ?? plot.plotType}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={lifecycleVariant(plot.lifecycle)}>
                {LIFECYCLE_LABEL[plot.lifecycle] ?? plot.lifecycle}
              </Badge>
              {plot.isResale && <Badge variant="outline">Resale</Badge>}
              {can(actor.role, "PLOT_SETUP") && (
                <EditPlotDetailsLauncher
                  plot={{
                    id: plot.id,
                    plotNumber: plot.plotNumber,
                    lifecycle: plot.lifecycle,
                    widthFt: plot.widthFt?.toString() ?? "",
                    lengthFt: plot.lengthFt?.toString() ?? "",
                    exactAreaSqFt: plot.exactAreaSqFt?.toString() ?? "",
                    exactAreaReason: plot.exactAreaReason ?? "",
                    boundaries: plot.boundaries.map((b) => ({
                      side: b.side,
                      kind: b.kind,
                      roadWidthFt: b.roadWidthFt?.toString() ?? "",
                      reference: b.reference ?? "",
                    })),
                  }}
                  components={
                    version
                      ? plcRules(version.components).map((c) => ({
                          category: c.category,
                          threshold: c.threshold == null ? null : String(c.threshold),
                          percent: String(c.percent),
                        }))
                      : []
                  }
                />
              )}
            </div>
          </div>
        </header>

        {/* The subject of the page, given the room to say so. */}
        <div className="space-y-4">
          {plc ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-4xl font-semibold tabular-nums tracking-tight">
                  {formatPercent(plc.totalPercent.toString())}
                </span>
                <span className="text-sm text-muted-foreground">
                  Location Charge (PLC %) · version {version!.version}
                </span>
              </div>

              {plc.components.length === 0 ? (
                <p className="text-sm text-muted-foreground">No component applies to this Plot.</p>
              ) : (
                <dl className="space-y-2.5">
                  {plc.components.map((c) => (
                    <div key={c.category} className="grid grid-cols-[1fr_auto] gap-x-4 text-sm">
                      <dt>{c.label}</dt>
                      <dd className="tabular-nums font-medium">{formatPercent(c.percent)}</dd>
                      <p className="col-span-2 text-xs text-muted-foreground">{c.evidence}</p>
                    </div>
                  ))}
                </dl>
              )}

              <p className="text-xs text-muted-foreground">
                Read from the boundaries below each time this page loads, never stored. Correct a
                side and the Charge follows.
              </p>
            </>
          ) : (
            <p className="text-sm text-amber-800">{plcIssue}</p>
          )}
        </div>

        <Section title="Dimensions">
          <Facts
            rows={[
              {
                label: "Width × Length",
                value:
                  plot.widthFt && plot.lengthFt ? (
                    <span className="tabular-nums">
                      {num(plot.widthFt)} × {num(plot.lengthFt)} ft
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Irregular Plot</span>
                  ),
              },
              {
                label: "Area",
                value: (
                  <span className="tabular-nums">
                    {num(plot.areaSqFt)} sq ft
                    <span className="block text-xs text-muted-foreground">
                      {num(plot.areaSqYd)} sq yd · {num(plot.areaSqM)} sq m
                    </span>
                  </span>
                ),
              },
              ...(plot.exactAreaReason
                ? [{ label: "Area reason", value: plot.exactAreaReason }]
                : []),
            ]}
          />
        </Section>

        <Section title="Boundaries">
          <Facts
            rows={SIDES.map((side) => {
              const b = bySide.get(side);
              return {
                label: side.charAt(0) + side.slice(1).toLowerCase(),
                value: b ? (
                  <>
                    {BOUNDARY_KIND_LABEL[b.kind] ?? b.kind}
                    {b.kind === "ROAD" && b.roadWidthFt ? (
                      <span className="tabular-nums"> · {num(b.roadWidthFt)} ft</span>
                    ) : b.reference ? (
                      <span className="text-muted-foreground"> · {b.reference}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-muted-foreground">Not recorded</span>
                ),
              };
            })}
          />
          <p className="mt-3 text-xs text-muted-foreground">{derivedFacing(boundaries)}</p>
        </Section>

        <Section title="Status">
          <Facts
            rows={[
              { label: "Lifecycle", value: LIFECYCLE_LABEL[plot.lifecycle] ?? plot.lifecycle },
              {
                label: "Restriction",
                value:
                  plot.restriction === "NONE" ? (
                    <span className="text-muted-foreground">None</span>
                  ) : (
                    <>
                      {humaniseRestriction(plot.restriction)}
                      {plot.restrictionReason && (
                        <span className="block text-xs text-muted-foreground">
                          {plot.restrictionReason}
                        </span>
                      )}
                    </>
                  ),
              },
            ]}
          />
        </Section>

        <Section title="Allocation">
          {hold ? (
            <Facts
              rows={[
                { label: "Held for", value: hold.person.fullName },
                {
                  label: "Expires",
                  value:
                    hold.status === "FROZEN" ? (
                      <>
                        {formatIst(hold.expiresAt)}
                        <span className="block text-xs text-muted-foreground">
                          Timer frozen — a Booking Request is under review.
                        </span>
                      </>
                    ) : (
                      formatIst(hold.expiresAt)
                    ),
                },
                {
                  label: "Extensions",
                  value: <span className="tabular-nums">{hold.extensionCount}</span>,
                },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No active Hold.</p>
          )}

          {booking && (
            <div className="mt-4">
              <Facts
                rows={[
                  {
                    label: "Booking",
                    value: (
                      <Link href="/bookings" className="text-primary hover:underline">
                        {booking.bookingNumber ?? booking.requestNo}
                      </Link>
                    ),
                  },
                  { label: "Customer", value: booking.primaryPerson.fullName },
                  {
                    label: "Received",
                    value: (
                      <span className="tabular-nums">
                        {formatPercent(booking.paymentReceivedPercent.toString())}
                      </span>
                    ),
                  },
                ]}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                The payment schedule and the commission summary are on the Booking.
              </p>
            </div>
          )}
        </Section>

        <Section title="History">
          {plot.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {plot.events.map((event) => (
                <li key={event.id} className="text-sm">
                  <span className="font-medium">
                    {event.action.replaceAll("_", " ").toLowerCase()}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {formatIst(event.at)} · {event.actorRef}
                    {event.reason ? ` · ${event.reason}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
