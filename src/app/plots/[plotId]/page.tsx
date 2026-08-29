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
import { PersonLink } from "@/components/person-link";
import { buildPlcSnapshot, humaniseRestriction, isOpenSide, locationChargeLabel, shortSides,
  canEditPlotDetails,
  canSetRestriction,
} from "@/lib/domain/inventory";
import { getPlot } from "@/lib/services/inventory-service";
import { plcRules } from "@/lib/services/plc-service";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { formatIst, formatPercent, formatQuantity } from "@/lib/tasks";
import PlotActions from "./plot-actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  NOT_AVAILABLE: "Not Available",
  AVAILABLE: "Available",
  HOLD: "Hold",
  WAITING_FOR_BOOKING_APPROVAL: "Waiting Approval",
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
  PARK: "Park / Playground",
  PLAYGROUND: "Park / Playground",
  FACILITIES: "Facilities",
  PUBLIC_UTILITY: "Public Utility",
  OTHER: "Other Land",
};

const SIDES = ["NORTH", "EAST", "SOUTH", "WEST"] as const;

function statusVariant(status: string) {
  if (status === "AVAILABLE") return "success" as const;
  if (status === "PAYMENT_COMPLETED") return "purple" as const;
  if (status === "HOLD") return "warning" as const;
  if (status === "NOT_AVAILABLE") return "outline" as const;
  return "info" as const;
}

/**
 * A section is its name and its content under it. The name used to sit in a
 * 9rem margin, which reads well down one wide column and is exactly what stopped
 * these five short sections from sitting two across — 144px of every row spent
 * on a word, and a page 1.7 screens tall for twelve facts.
 */
/** PLOT_MADE_AVAILABLE — read as words, not as a constant. */
const humanise = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 break-inside-avoid space-y-2 border-t border-border/60 pt-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
        {title}
      </h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * Label and value — the description list a record actually is.
 *
 * Label left, value right. A fixed label gutter with the value left-aligned
 * after it left the whole right half of every row empty and put the two columns
 * of this page on two different invisible margins; ending each value at its own
 * column's edge gives the page one, and matches the Location Charge block above
 * and the Booking detail.
 */
function Facts({ rows }: { rows: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 text-xs">
          <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 text-right text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The Plot at its own proportions — 30 × 45 is a rectangle, 20 × 90 is a strip,
 * and that is the thing two numbers in a row hide. Scaled off the longest side.
 *
 * It is read the way a layout sheet is: the Plot names and measures itself in
 * the middle, and what it abuts is written outside the side it abuts.
 */
function PlotShape({
  plotNumber,
  widthFt,
  lengthFt,
  sides,
}: {
  plotNumber: string;
  widthFt: string;
  lengthFt: string;
  sides: Partial<Record<(typeof SIDES)[number], { label: string; open: boolean }>>;
}) {
  const w = Number(widthFt);
  const l = Number(lengthFt);
  if (!(w > 0) || !(l > 0)) return null;

  // The longest side is 96px; the short one keeps the real ratio but never
  // collapses below 38, or a 15 × 120 Plot draws as a line with no room to name
  // the Plot inside it.
  const scale = 96 / Math.max(w, l);
  const bw = Math.max(38, w * scale);
  const bh = Math.max(38, l * scale);
  const x = 46;
  const y = 16;
  const x2 = x + bw;
  const y2 = y + bh;

  const edge = {
    NORTH: { x1: x, y1: y, x2, y2: y },
    SOUTH: { x1: x, y1: y2, x2, y2 },
    WEST: { x1: x, y1: y, x2: x, y2 },
    EAST: { x1: x2, y1: y, x2, y2 },
  } as const;

  return (
    <svg
      viewBox={`0 0 ${bw + 92} ${bh + 32}`}
      width={bw + 92}
      height={bh + 32}
      className="mt-3 max-w-full overflow-visible text-foreground"
      role="img"
      aria-label={`Plot ${plotNumber}, ${widthFt} by ${lengthFt} feet`}
    >
      <rect x={x} y={y} width={bw} height={bh} rx={2} className="fill-secondary stroke-border" />
      {/* An open side is what carries the charge, so it is the only thing in
          the drawing that is emphasised — by weight, not by a second colour. */}
      {SIDES.map((s) => (
        <line
          key={s}
          {...edge[s]}
          strokeWidth={sides[s]?.open ? 1.75 : 1}
          className={sides[s]?.open ? "stroke-foreground" : "stroke-border"}
        />
      ))}

      <text
        x={x + bw / 2}
        y={y + bh / 2 - 5}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-current font-mono text-[11px] font-bold"
      >
        {plotNumber}
      </text>
      <text
        x={x + bw / 2}
        y={y + bh / 2 + 7}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-current text-[8px] font-medium"
      >
        {formatQuantity(widthFt)} × {formatQuantity(lengthFt)} ft
      </text>

      {/* What the Plot abuts, on the side it abuts it. The compass letter sits
          inside the corner, the way a plan sheet marks north. */}
      <text x={x + 3} y={y + 8} className="fill-current text-[7px] font-bold">
        N
      </text>
      <text x={x + bw / 2} y={y - 6} textAnchor="middle" className="fill-current text-[8px] font-semibold uppercase tracking-wide">
        {sides.NORTH?.label}
      </text>
      <text x={x + bw / 2} y={y2 + 11} textAnchor="middle" className="fill-current text-[8px] font-semibold uppercase tracking-wide">
        {sides.SOUTH?.label}
      </text>
      <text
        x={x - 5}
        y={y + bh / 2}
        textAnchor="end"
        dominantBaseline="middle"
        className="fill-current text-[8px] font-semibold uppercase tracking-wide"
      >
        {sides.WEST?.label}
      </text>
      <text
        x={x2 + 5}
        y={y + bh / 2}
        dominantBaseline="middle"
        className="fill-current text-[8px] font-semibold uppercase tracking-wide"
      >
        {sides.EAST?.label}
      </text>
    </svg>
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
  // Stored precision, not a rounded copy. Area is stored to four decimals
  // (PRD §23.1) and a Plot is sold on that number; two of them is a
  // different Plot. Decimal drops its own trailing zeros, so 30 stays "30".
  const num = (value: { toString(): string }) => formatQuantity(value.toString());
  // The two converted units are the same measurement in another unit, and a
  // conversion is never round — 1,350 sq ft is 125.4192 sq m. Four decimals of
  // a number nobody quotes only makes the exact one above harder to read.
  const conv = (value: { toDecimalPlaces(n: number): { toString(): string } }) =>
    formatQuantity(value.toDecimalPlaces(2).toString());

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <main className="mx-auto max-w-5xl space-y-3 pb-6">
        <header className="space-y-3">
          <Link
            href="/plots"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Plot Inventory
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-mono text-2xl font-semibold tracking-tight">{plot.plotNumber}</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {plot.project.name} · {PLOT_TYPE_LABEL[plot.plotType] ?? plot.plotType}
              </p>
              {plot.restriction !== "NONE" && plot.restrictionReason && (
                <p className="mt-1 max-w-prose text-xs text-red-700">{plot.restrictionReason}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(plot.status)}>
                {STATUS_LABEL[plot.status] ?? plot.status}
              </Badge>
              {plot.isResale && <Badge variant="outline">Resale</Badge>}
              {plot.restriction !== "NONE" && (
                <Badge variant="destructive">{humaniseRestriction(plot.restriction)}</Badge>
              )}
              <PlotActions
                plot={{
                  id: plot.id,
                  plotNumber: plot.plotNumber,
                  status: plot.status,
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
                currentRestriction={plot.restriction}
                // The same two rules the services enforce, so the page never
                // offers an action the server is going to refuse.
                canEditDetails={can(actor.role, "PLOT_SETUP") && canEditPlotDetails(plot.status)}
                canRestrict={
                  can(actor.role, "PLOT_RESTRICTION_MANAGE") && canSetRestriction(plot.status)
                }
              />
            </div>
          </div>
        </header>

        {/* Derived, and the Plot's most-asked number — but the Plot is the
            subject of the page, so it no longer outsizes the Plot's own name. */}
        <div className="rounded-xl border border-border/60 bg-secondary p-3">
          {plc ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                  Location Charge (PLC %)
                </span>
                <span className="text-xl font-semibold tabular-nums tracking-tight">
                  {formatPercent(plc.totalPercent.toString())}
                </span>
              </div>

              {plc.components.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  No component applies to this Plot.
                </p>
              ) : (
                <dl className="mt-2 space-y-1 border-t border-border/50 pt-2">
                  {plc.components.map((c) => (
                    <div key={c.category} className="grid grid-cols-[1fr_auto] gap-x-4 text-xs">
                      {/* Park Facing, Corner, Road Facing — these are the
                          charge, not a caption for it. They carry the same
                          weight as the percent they earn; only the sides that
                          evidence them step back. */}
                      <dt className="font-semibold text-foreground">
                        {c.label}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {shortSides(c.evidence)}
                        </span>
                      </dt>
                      <dd className="font-semibold tabular-nums text-foreground">
                        {formatPercent(c.percent)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          ) : (
            <p className="text-xs text-amber-800">{plcIssue}</p>
          )}
        </div>

        {/* Four short sections that were four full-width rows. Columns, not a
            grid: a grid row is as tall as its tallest cell, so a four-side
            Boundaries beside a two-row Status left a hole under the short one.
            These sections are independent records — read down one column, then
            the next. */}
        <div className="columns-1 gap-x-8 sm:columns-2">
        <Section title="Dimensions">
          <Facts
            rows={[
              {
                label: "Width × Length",
                value:
                  plot.widthFt && plot.lengthFt ? (
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {num(plot.widthFt)} × {num(plot.lengthFt)}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">ft</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Irregular Plot</span>
                  ),
              },
              {
                label: plot.exactAreaSqFt ? "Area (exact, overridden)" : "Area",
                value: (
                  // The three areas are one measurement, so all three are read
                  // at full weight; only the unit steps back, as on the list.
                  <span className="tabular-nums">
                    <span className="block text-sm font-semibold text-foreground">
                      {num(plot.areaSqFt)}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        sq ft
                      </span>
                    </span>
                    <span className="block text-xs font-semibold text-foreground">
                      {conv(plot.areaSqYd)}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        sq yd
                      </span>
                    </span>
                    <span className="block text-xs font-semibold text-foreground">
                      {conv(plot.areaSqM)}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        sq m
                      </span>
                    </span>
                  </span>
                ),
              },
              // A Plot can carry both sides and an override — then the Area above
              // is the override, and what the sides multiply to is nowhere on the
              // page unless it is put here. The gap between the two is the reason
              // the override exists.
              ...(plot.exactAreaSqFt && plot.widthFt && plot.lengthFt
                ? [
                    {
                      label: "Width × Length area",
                      value: (
                        <span className="text-xs font-semibold tabular-nums text-foreground">
                          {num(plot.widthFt.mul(plot.lengthFt))}
                          <span className="ml-1 font-normal text-muted-foreground">sq ft</span>
                        </span>
                      ),
                    },
                  ]
                : []),
              ...(plot.exactAreaReason
                ? [{ label: "Override reason", value: plot.exactAreaReason }]
                : []),
            ]}
          />
          {plot.widthFt && plot.lengthFt && (
            <div className="mt-3 flex justify-center rounded-xl border border-border/60 p-3">
              <PlotShape
                plotNumber={plot.plotNumber}
                widthFt={plot.widthFt.toString()}
                lengthFt={plot.lengthFt.toString()}
                sides={Object.fromEntries(
                  SIDES.map((side) => {
                    const b = bySide.get(side);
                    if (!b) return [side, undefined];
                    const kind = BOUNDARY_KIND_LABEL[b.kind] ?? b.kind;
                    // A Road is named by its width — that width is what decides
                    // the band. Anything else is named by what it is next to.
                    const label =
                      b.kind === "ROAD" && b.roadWidthFt
                        ? `${kind} ${num(b.roadWidthFt)} ft`
                        : b.reference
                          ? `${kind} ${b.reference}`
                          : kind;
                    return [side, { label, open: isOpenSide(b.kind) }];
                  })
                )}
              />
            </div>
          )}
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
          {/* The position, in the one vocabulary every screen uses — the list
              and the Booking read it off the same function. */}
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-foreground">
            {locationChargeLabel(boundaries).join(" · ")}
          </p>
        </Section>

        <Section title="Allocation">
          {hold ? (
            <Facts
              rows={[
                {
                  label: "Held for",
                  value: <PersonLink personId={hold.person.id} name={hold.person.fullName} />,
                },
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
                  {
                    label: "Customer",
                    value: (
                      <PersonLink
                        personId={booking.primaryPerson.id}
                        name={booking.primaryPerson.fullName}
                      />
                    ),
                  },
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

        </div>

        <Section title="History">
          {plot.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {plot.events.map((event) => (
                <li key={event.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">
                      {/* PLOT_MADE_AVAILABLE reads as "Plot made available", not
                          as "plot made available" — every other heading on this
                          page starts with a capital. */}
                      {humanise(event.action)}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatIst(event.at)}
                    </span>
                  </div>
                  <span className="block text-xs text-muted-foreground">
                    {event.actorRef}
                    {event.reason ? ` · ${event.reason}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </main>
    </AppShell>
  );
}
