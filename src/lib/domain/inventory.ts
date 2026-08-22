// Project and Plot rules — PRD.md §15, §16; DESIGN.md §7.
// Exact decimal arithmetic only (ARCHITECTURE §3.4): no binary floating point
// touches an area, a percentage or a share.

import { Prisma } from "@prisma/client";

const D = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

export const SQ_FT_PER_SQ_YD = new D("9");
export const SQ_M_PER_SQ_FT = new D("0.09290304");

export type PlotRestriction = "NONE" | "NOT_YET_RELEASED" | "NOT_FOR_SALE" | "PLEDGE";
export type PlotLifecycle =
  | "NOT_AVAILABLE"
  | "AVAILABLE"
  | "HOLD"
  | "WAITING_FOR_BOOKING_APPROVAL"
  | "BOOKED"
  | "PAYMENT_COMPLETED"
  | "REFUND_PENDING"
  | "DELIVERED";

/* ------------------------------------------------------------------ area */

export type AreaInput =
  | { kind: "REGULAR"; widthFt: string | number; lengthFt: string | number }
  /** Irregular Plot — the exact area is entered and a reason is compulsory. */
  | { kind: "EXACT"; exactAreaSqFt: string | number; reason: string };

export type Areas = { areaSqFt: Decimal; areaSqYd: Decimal; areaSqM: Decimal };

/** Derived areas are rounded to 3 decimals so every screen shows the same number. */
export function calculateAreas(input: AreaInput): Areas {
  let areaSqFt: Decimal;
  if (input.kind === "REGULAR") {
    const width = new D(input.widthFt);
    const length = new D(input.lengthFt);
    if (width.lte(0) || length.lte(0)) throw new Error("Width and Length must be greater than zero.");
    areaSqFt = width.mul(length);
  } else {
    if (!input.reason?.trim()) {
      throw new Error("An exact area override requires a compulsory reason.");
    }
    areaSqFt = new D(input.exactAreaSqFt);
    if (areaSqFt.lte(0)) throw new Error("Exact area must be greater than zero.");
  }

  const round = (d: Decimal) => new D(d.toFixed(3));
  return {
    areaSqFt: round(areaSqFt),
    areaSqYd: round(areaSqFt.div(SQ_FT_PER_SQ_YD)),
    areaSqM: round(areaSqFt.mul(SQ_M_PER_SQ_FT)),
  };
}

/* ------------------------------------------------------------------- PLC */

export type PlcComponentRule = { code: string; label: string; percent: string | number };
export type PlcSnapshot = {
  components: Array<{ code: string; label: string; percent: string }>;
  totalPercent: Decimal;
};

/**
 * PRD §16.3 — PLC is percentage only, each distinct component is charged once,
 * and the same category appearing on multiple sides is not charged repeatedly.
 * An unknown code fails loudly rather than being silently dropped.
 */
export function buildPlcSnapshot(
  appliedCodes: readonly string[],
  ruleComponents: readonly PlcComponentRule[]
): PlcSnapshot {
  const byCode = new Map(ruleComponents.map((c) => [c.code, c]));
  const seen = new Set<string>();
  const components: PlcSnapshot["components"] = [];
  let totalPercent = new D(0);

  for (const code of appliedCodes) {
    if (seen.has(code)) continue; // charged once, however many sides qualify
    const rule = byCode.get(code);
    if (!rule) throw new Error(`PLC component "${code}" is not in the Project's current rule version.`);
    seen.add(code);
    const percent = new D(rule.percent);
    if (percent.lt(0)) throw new Error(`PLC component "${code}" cannot be negative.`);
    components.push({ code, label: rule.label, percent: percent.toFixed(3) });
    totalPercent = totalPercent.add(percent);
  }

  return { components, totalPercent: new D(totalPercent.toFixed(3)) };
}

/* --------------------------------------------------- restriction and return */

/** Only Not for Sale and Pledge block availability (PRD §15). */
const BLOCKING_RESTRICTIONS: PlotRestriction[] = ["NOT_FOR_SALE", "PLEDGE"];

export function restrictionBlocksSale(restriction: PlotRestriction): boolean {
  return BLOCKING_RESTRICTIONS.includes(restriction);
}

export type PlotReturn = { lifecycle: PlotLifecycle; message: string | null };

/**
 * The single restriction-aware return used everywhere a Plot comes back —
 * Hold expiry or cancel, Booking rejection, Booking cancellation, Change Plot
 * and acquisition (PRD §15). Booking cancellation and Change Plot add no
 * RESALE tag; the caller passes the tag through unchanged.
 */
export function plotReturnState(restriction: PlotRestriction, restrictionReason?: string | null): PlotReturn {
  if (restrictionBlocksSale(restriction)) {
    return {
      lifecycle: "NOT_AVAILABLE",
      message: restrictionReason
        ? `Not Available — ${humaniseRestriction(restriction)}: ${restrictionReason}`
        : `Not Available — ${humaniseRestriction(restriction)}`,
    };
  }
  if (restriction === "NOT_YET_RELEASED") {
    // A released Plot carries no NOT_YET_RELEASED restriction, so this only
    // happens if setup data is inconsistent. Fail visibly rather than silently
    // publishing unreleased inventory.
    return { lifecycle: "NOT_AVAILABLE", message: "Not Available — Not Yet Released" };
  }
  return { lifecycle: "AVAILABLE", message: null };
}

export function humaniseRestriction(restriction: PlotRestriction): string {
  return {
    NONE: "No restriction",
    NOT_YET_RELEASED: "Not Yet Released",
    NOT_FOR_SALE: "Not for Sale",
    PLEDGE: "Pledge",
  }[restriction];
}

export type ProjectLifecycle = "SETUP_NOT_ACTIVE" | "ACTIVE" | "SOLD_OUT" | "COMPLETED";

/**
 * A Hold or Booking may only start from an Available, unrestricted Plot in a
 * Project that has been activated (PRD §16.1).
 *
 * Sold Out and Completed still allow it: a returned RESALE Plot in such a
 * Project stays visible and sellable, which is what the Available (Resale)
 * display condition means (PRD §8.8, §16.1).
 */
export function canAllocate(
  lifecycle: PlotLifecycle,
  restriction: PlotRestriction,
  projectLifecycle: ProjectLifecycle
): { ok: true } | { ok: false; reason: string } {
  if (projectLifecycle === "SETUP_NOT_ACTIVE") {
    return {
      ok: false,
      reason:
        "The Project is still Unreleased and cannot accept a Hold or Booking. " +
        "Admin or MD must activate the Project first.",
    };
  }
  if (restrictionBlocksSale(restriction)) {
    return { ok: false, reason: `Plot carries an active ${humaniseRestriction(restriction)} restriction.` };
  }
  if (lifecycle !== "AVAILABLE") {
    return { ok: false, reason: `Plot is ${lifecycle.replaceAll("_", " ").toLowerCase()}, not Available.` };
  }
  return { ok: true };
}

/* ----------------------------------------------------------- derived facing */

export type BoundarySide = "NORTH" | "SOUTH" | "EAST" | "WEST";
export type BoundaryKind = "ROAD" | "PLOT" | "PARK" | "OTHER";
export type Boundary = { side: BoundarySide; kind: BoundaryKind; roadWidthFt?: string | number | null };

/** Display-only derivation (PRD §16.2) — never stored, never a PLC decision. */
export function derivedFacing(boundaries: readonly Boundary[], parkFacing: boolean): string {
  const roads = boundaries.filter((b) => b.kind === "ROAD");
  const parks = boundaries.filter((b) => b.kind === "PARK");
  const parts: string[] = [];

  if (roads.length > 0) {
    parts.push(`${roads.map((r) => title(r.side)).join(" / ")} road facing`);
  }
  if (roads.length >= 2) parts.push("Corner");
  if (parkFacing || parks.length > 0) parts.push("Park facing");

  // The Park Facing flag counts as an open side even when no side is recorded
  // as PARK, but never double-counts one that is.
  const parkOpenSides = parks.length > 0 ? parks.length : parkFacing ? 1 : 0;
  const openSides = roads.length + parkOpenSides;
  parts.push(`${openSides} open side${openSides === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function title(side: BoundarySide): string {
  return side.charAt(0) + side.slice(1).toLowerCase();
}
