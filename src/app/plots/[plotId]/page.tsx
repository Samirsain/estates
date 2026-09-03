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
import {
  buildPlcSnapshot, humaniseRestriction, isOpenSide, locationChargeLabel, shortSides,
  canEditPlotDetails,
  canSetRestriction,
} from "@/lib/domain/inventory";
import { getPlot } from "@/lib/services/inventory-service";
import { plcRules } from "@/lib/services/plc-service";
import { requireStaff } from "@/lib/security/current-actor";
import { maskMobile } from "@/lib/security/identity";
import { can } from "@/lib/security/permissions";
import { formatIst, formatPercent, formatPlotSize, formatQuantity } from "@/lib/tasks";
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
 * What it draws is the reason the Location Charge exists: which sides are open,
 * and onto what. So each side carries the compass letter at its edge and what
 * it abuts outside that — a Plot with two roads is a Corner Plot, and here that
 * is something you see rather than something you read.
 *
 * Drawn, not boxed: no fill behind it and no frame around it, only the four
 * sides. An open side is the single emphasis, by weight rather than by a second
 * colour, and everything inherits `currentColor` so it holds up wherever the
 * page puts it.
 *
 * Sized by its viewBox and scaled by CSS, so the same drawing serves a phone
 * and a wide column without a second set of numbers.
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

  // User units, not pixels — the viewBox is scaled to the column it lands in.
  // The longest side is 200; the short one keeps the real ratio but never
  // collapses below 76, or a 15 × 120 Plot draws as a line with no room to
  // name the Plot inside it.
  const scale = 200 / Math.max(w, l);
  const bw = Math.max(76, w * scale);
  const bh = Math.max(76, l * scale);
  // Room outside the shape for a compass letter and, beyond it, what that side
  // abuts. Wider left and right, where the label runs along the text baseline
  // instead of across it.
  const padX = 92;
  const padY = 46;
  const x = padX;
  const y = padY;
  const x2 = x + bw;
  const y2 = y + bh;
  const cx = x + bw / 2;
  const cy = y + bh / 2;

  const edge = {
    NORTH: { x1: x, y1: y, x2, y2: y },
    SOUTH: { x1: x, y1: y2, x2, y2 },
    WEST: { x1: x, y1: y, x2: x, y2 },
    EAST: { x1: x2, y1: y, x2, y2 },
  } as const;

  /** Where each side's compass letter and its label sit, and how they align. */
  const marks = {
    NORTH: { letter: [cx, y - 12], label: [cx, y - 30], anchor: "middle" },
    SOUTH: { letter: [cx, y2 + 22], label: [cx, y2 + 40], anchor: "middle" },
    WEST: { letter: [x - 12, cy], label: [x - 28, cy], anchor: "end" },
    EAST: { letter: [x2 + 12, cy], label: [x2 + 28, cy], anchor: "start" },
  } as const;

  const spoken = SIDES.filter((side) => sides[side])
    .map((side) => `${side.toLowerCase()} ${sides[side]!.label}`)
    .join(", ");

  return (
    <figure className="m-0 w-full max-w-[20rem]">
      <svg
        viewBox={`0 0 ${bw + padX * 2} ${bh + padY * 2}`}
        className="block h-auto w-full overflow-visible text-foreground"
        role="img"
        aria-label={`Plot ${plotNumber}, ${widthFt} by ${lengthFt} feet${spoken ? `, bounded by ${spoken}` : ""
          }`}
      >
        {/* The four sides. An open one carries the charge, so it is the only
            thing here drawn heavier than the rest. */}
        {SIDES.map((side) => (
          <line
            key={side}
            {...edge[side]}
            strokeWidth={sides[side]?.open ? 3 : 1.5}
            className={sides[side]?.open ? "stroke-current" : "stroke-border"}
          />
        ))}

        {/* The Plot names and measures itself in the middle, the way a layout
            sheet does. */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-current text-[15px] font-bold"
        >
          {plotNumber}
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-current text-[11px] font-medium"
        >
          {formatPlotSize(widthFt, lengthFt)}
        </text>

        {SIDES.map((side) => {
          const mark = marks[side];
          return (
            <g key={side}>
              <text
                x={mark.letter[0]}
                y={mark.letter[1]}
                textAnchor={mark.anchor}
                dominantBaseline="middle"
                className="fill-current text-[12px] font-bold"
              >
                {side.charAt(0)}
              </text>
              {sides[side] && (
                <text
                  x={mark.label[0]}
                  y={mark.label[1]}
                  textAnchor={mark.anchor}
                  dominantBaseline="middle"
                  // currentColor, so the label follows the page's own muted
                  // ink instead of a hue picked for one background.
                  className="text-[11px] text-muted-foreground"
                  fill="currentColor"
                >
                  {sides[side]!.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* The heading above already names this; the caption is here for a reader
          who cannot see the drawing. */}
      <figcaption className="sr-only">
        Plot {plotNumber} at its own proportions, with what each side abuts.
      </figcaption>
    </figure>
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

  /*
   * Who holds the Plot and who bought it, kept aside so it can sit under the
   * drawing rather than under the measurements — the corner of the page that
   * answers "whose is this".
   */
  /**
   * A buyer, as the rest of the application prints one: the id leads and opens
   * the profile, the name confirms it underneath, and the mobile is masked the
   * way it is on every list.
   */
  const buyer = (person: {
    id: string;
    fullName: string;
    primaryMobile: string;
    customerProfile: { customerId: string } | null;
  }) => (
    <span className="block">
      <PersonLink
        personId={person.id}
        name={person.customerProfile?.customerId ?? person.fullName}
        className={person.customerProfile ? "font-semibold" : undefined}
      />
      {person.customerProfile && (
        <span className="block text-[11px] text-muted-foreground">{person.fullName}</span>
      )}
      <span className="block text-[11px] text-muted-foreground">
        {maskMobile(person.primaryMobile)}
      </span>
    </span>
  );

  const allocation = (
    <Section title={booking ? "Bought by" : "Allocation"}>
      {booking ? (
        <Facts
          rows={[
            { label: "Customer", value: buyer(booking.primaryPerson) },
            {
              label: "Booking",
              value: (
                <Link
                  href={`/bookings?booking=${booking.id}`}
                  className="text-primary hover:underline"
                >
                  {booking.bookingNumber ?? booking.requestNo}
                </Link>
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
      ) : hold ? (
        <Facts
          rows={[
            { label: "Held for", value: buyer(hold.person) },
            {
              label: "Expires",
              value:
                hold.status === "FROZEN" ? (
                  <>
                    {formatIst(hold.expiresAt)}
                    <span className="block text-[11px] text-muted-foreground">
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
        <p className="text-xs text-muted-foreground">Nobody holds this Plot.</p>
      )}
    </Section>
  );

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <main className="mx-auto max-w-4xl space-y-3 pb-6">
        <header className="space-y-3">
          <Link
            href="/plots"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Plot Inventory
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{plot.plotNumber}</h1>
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

        {/* Four short records and a drawing. The records read down the left,
            the drawing sits beside them on the right, and neither is put in a
            filled box: a section is its name and a rule, so a two-row Allocation
            takes two rows of the page and a four-side Boundaries takes four. */}
        <div className="grid gap-x-10 lg:grid-cols-[26rem_minmax(0,1fr)]">
          <div className="min-w-0">
            <Section title="Location Charge (PLC %)">
              {plc ? (
                <>
                  {/* One component IS the total — printing both put 10.00% on the
                    page twice and called the second one a breakdown of the
                    first. The total earns its own row only once there is more
                    than one number adding up to it. */}
                  {plc.components.length > 1 && (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-xs text-muted-foreground">Total</span>
                      <span className="text-lg font-semibold tabular-nums tracking-tight">
                        {formatPercent(plc.totalPercent.toString())}
                      </span>
                    </div>
                  )}

                  {plc.components.length === 0 ? (
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-xs text-muted-foreground">
                        No component applies to this Plot.
                      </span>
                      <span className="text-lg font-semibold tabular-nums tracking-tight">
                        {formatPercent(plc.totalPercent.toString())}
                      </span>
                    </div>
                  ) : (
                    <dl className="mt-1 space-y-1">
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
                          <dd
                            className={`font-semibold tabular-nums text-foreground ${plc.components.length === 1 ? "text-lg tracking-tight" : ""
                              }`}
                          >
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
            </Section>

            <Section title="Dimensions">
              <Facts
                rows={[
                  {
                    label: "Width × Length",
                    value:
                      plot.widthFt && plot.lengthFt ? (
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {formatPlotSize(plot.widthFt.toString(), plot.lengthFt.toString())}
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
          </div>

          <div className="min-w-0">
            {plot.widthFt && plot.lengthFt && (
              <Section title="Layout">
                <div className="flex justify-center pt-1">
                  <PlotShape
                    plotNumber={plot.plotNumber}
                    widthFt={plot.widthFt.toString()}
                    lengthFt={plot.lengthFt.toString()}
                    sides={Object.fromEntries(
                      SIDES.map((side) => {
                        const b = bySide.get(side);
                        if (!b) return [side, undefined];
                        const kind = BOUNDARY_KIND_LABEL[b.kind] ?? b.kind;
                        // A Road is named by its width — that width is what
                        // decides the band. Anything else is named by what it
                        // sits next to.
                        const label =
                          b.kind === "ROAD" && b.roadWidthFt
                            ? `${kind} · ${num(b.roadWidthFt)} ft`
                            : b.reference
                              ? `${kind} · ${b.reference}`
                              : kind;
                        return [side, { label, open: isOpenSide(b.kind) }];
                      })
                    )}
                  />
                </div>
              </Section>
            )}
            {allocation}
          </div>
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
