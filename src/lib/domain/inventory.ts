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

/**
 * Derived areas are rounded to 4 decimals so every screen shows the same number.
 * PRD §23.1 sets the precision: "Plot area: up to four decimal places".
 */
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
    if (areaSqFt.lte(0)) throw new Error("Area must be greater than zero.");
  }

  const round = (d: Decimal) => new D(d.toFixed(4));
  return {
    areaSqFt: round(areaSqFt),
    areaSqYd: round(areaSqFt.div(SQ_FT_PER_SQ_YD)),
    areaSqM: round(areaSqFt.mul(SQ_M_PER_SQ_FT)),
  };
}

/* -------------------------------------------------------------- boundaries */

export type BoundarySide = "NORTH" | "SOUTH" | "EAST" | "WEST";
export type BoundaryKind =
  | "ROAD"
  | "PLOT"
  | "COMMERCIAL"
  | "INFORMAL_SECTOR"
  | "PARK"
  | "PLAYGROUND"
  | "FACILITIES"
  | "PUBLIC_UTILITY"
  | "OTHER";
export type Boundary = {
  side: BoundarySide;
  kind: BoundaryKind;
  /** A Decimal, a string or a number — whatever the caller already holds. */
  roadWidthFt?: string | number | { toString(): string } | null;
};

/**
 * A side is open when it does not abut another Plot. A Plot is a Plot whatever
 * its type, so Commercial and Informal Sector close a side exactly as a
 * Residential one does; a road, park, playground, facility or public utility
 * leaves it open.
 *
 * Defined by what closes a side rather than by listing what opens one, so a new
 * boundary kind is open unless it is deliberately made to close.
 */
const CLOSED_KINDS: BoundaryKind[] = ["PLOT", "COMMERCIAL", "INFORMAL_SECTOR"];

function isOpenSide(kind: BoundaryKind): boolean {
  return !CLOSED_KINDS.includes(kind);
}

/* ------------------------------------------------------------------- PLC */

/**
 * The PLC catalogue. These four categories are the entire vocabulary: a Project
 * sets the percentages, it does not invent categories, and no code is typed
 * anywhere. Deduplication keys off the category, which is the stable key PLC
 * spec §2.3 and §3.3 require — one that survives a label change.
 *
 * A banded category charges the highest band the Plot reaches, so "three side
 * open" and "two side open" can never both land on the same Plot.
 */
export type PlcCategory = "ROAD_WIDTH" | "OPEN_SIDES" | "PARK_FACING" | "PLAYGROUND_FACING";

export const PLC_CATEGORIES: Record<PlcCategory, { label: string; banded: boolean; unit: string | null }> = {
  ROAD_WIDTH: { label: "Road width", banded: true, unit: "ft" },
  OPEN_SIDES: { label: "Open sides", banded: true, unit: "sides" },
  PARK_FACING: { label: "Park / Playground facing", banded: false, unit: null },
  PLAYGROUND_FACING: { label: "Park / Playground facing", banded: false, unit: null },
};

/** Display order, so a breakdown reads the same way on every screen. */
export const PLC_CATEGORY_ORDER: PlcCategory[] = [
  "ROAD_WIDTH",
  "OPEN_SIDES",
  "PARK_FACING",
];

/** One configured row of a PLC version: a category, its band, its percentage. */
export type PlcComponentRule = {
  category: PlcCategory;
  /** Feet for ROAD_WIDTH, a count of open sides for OPEN_SIDES, null otherwise. */
  threshold?: string | number | null;
  percent: string | number;
  remark?: string | null;
};

export type PlcSnapshotComponent = {
  category: PlcCategory;
  label: string;
  percent: string;
  /** Which sides qualified — the side evidence PLC spec §7.1 asks a snapshot to keep. */
  evidence: string;
};

export type PlcSnapshot = {
  components: PlcSnapshotComponent[];
  totalPercent: Decimal;
};

const SIDE_WORD: Record<number, string> = { 1: "One", 2: "Two", 3: "Three", 4: "Four" };

function hasBand(threshold: string | number | { toString(): string } | null | undefined): boolean {
  return threshold !== null && threshold !== undefined && `${threshold}`.trim() !== "";
}

/**
 * A band under the cursor is empty, then "-", then "4", before it is ever 40.
 * Anything that is not yet a number reads as null here rather than throwing, so
 * a half-typed row can be described. Validation is a separate job and stays
 * strict — this never decides whether a configuration may be saved.
 */
function bandValue(
  threshold: string | number | { toString(): string } | null | undefined
): Decimal | null {
  if (!hasBand(threshold)) return null;
  try {
    return new D(String(threshold));
  } catch {
    return null;
  }
}

/**
 * The label a configured row displays. It is generated, never typed, so two
 * Projects can never describe the same band in two different ways.
 */
export function plcComponentLabel(
  category: PlcCategory,
  threshold?: string | number | null
): string {
  const meta = PLC_CATEGORIES[category];
  if (!meta) return String(category);
  if (!meta.banded) return meta.label;

  const from = bandValue(threshold);
  if (from === null) return `${meta.label} — band not set`;

  if (category === "OPEN_SIDES") {
    const val = from.toNumber();
    if (val === 2) return "Two side open";
    if (val === 2.5) return "Corner Plot";
    if (val === 3) return "Three side open";
    if (val === 4) return "Four side open";
    return `${SIDE_WORD[val] ?? from.toString()} side open`;
  }
  return `Road ${from.toString()} ft`;
}

/**
 * Labels for a whole configured version, in the order given.
 */
export function plcComponentLabels(rules: readonly PlcComponentRule[]): string[] {
  return rules.map((rule) => {
    const label = plcComponentLabel(rule.category, rule.threshold);
    return rule.remark ? `${label} (${rule.remark})` : label;
  });
}

/**
 * PLC spec §5.2 — a version whose bands contradict each other must not publish.
 * This throws rather than choosing one, because §5.3 forbids a silent fallback.
 */
export function validatePlcComponents(rules: readonly PlcComponentRule[]): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    const meta = PLC_CATEGORIES[rule.category];
    if (!meta) throw new Error(`"${rule.category}" is not a PLC category.`);

    const banded = hasBand(rule.threshold);
    if (meta.banded && !banded) throw new Error(`${meta.label} needs a band value.`);
    if (!meta.banded && banded) throw new Error(`${meta.label} does not take a band value.`);

    // Say which row and what is wrong with it. Letting Decimal throw its own
    // "[DecimalError] Invalid argument" would be accurate and useless.
    const percent = bandValue(rule.percent);
    if (percent === null) throw new Error(`${meta.label} has an invalid percentage.`);
    if (percent.lt(0)) throw new Error(`${meta.label} cannot be a negative percentage.`);

    const band = meta.banded ? bandValue(rule.threshold) : null;
    if (meta.banded && band === null) throw new Error(`${meta.label} has an invalid band value.`);

    if (rule.category === "OPEN_SIDES") {
      const val = band!.toNumber();
      if (val !== 2 && val !== 2.5 && val !== 3 && val !== 4) {
        throw new Error("Open sides must be 2 (Two Side Open), 2.5 (Corner Plot), 3 (Three Side Open), or 4 (Four Side Open).");
      }
    }
    if (rule.category === "ROAD_WIDTH" && band!.lte(0)) {
      throw new Error("A road width band must be greater than zero.");
    }

    const key = `${rule.category}|${band ? band.toString() : ""}`;
    if (seen.has(key)) {
      throw new Error(`${plcComponentLabel(rule.category, rule.threshold)} is configured twice.`);
    }
    seen.add(key);
  }
}

/**
 * PRD §16.3 and PLC spec §2.2–2.4 — effective PLC is the sum of each distinct
 * applicable category, charged exactly once however many sides qualify.
 *
 * Every category derives from the Plot's own boundaries (PLC spec §4.1), so
 * nothing is picked by hand and no applicability is stored against the Plot:
 * correct the boundary and the PLC corrects itself, which is the revalidation
 * PRD §8.7 asks an authorised Plot correction to perform.
 *
 * This is the only place effective PLC is computed. Screens call it to display
 * and services call it to freeze, so both read the same number from one rule.
 */
export function buildPlcSnapshot(
  boundaries: readonly Boundary[],
  ruleComponents: readonly PlcComponentRule[]
): PlcSnapshot {
  validatePlcComponents(ruleComponents);

  const sides = (list: readonly Boundary[]) => list.map((b) => title(b.side)).join(", ");
  const roads = boundaries.filter((b) => b.kind === "ROAD");
  const parks = boundaries.filter((b) => b.kind === "PARK");
  const playgrounds = boundaries.filter((b) => b.kind === "PLAYGROUND");
  const open = boundaries.filter((b) => isOpenSide(b.kind));

  // PLC spec §5.3 — a Road side with no width cannot be banded, and guessing at
  // the band is exactly the silent fallback that rule forbids.
  const unmeasured = roads.find((r) => !hasBand(r.roadWidthFt));
  if (unmeasured) {
    throw new Error(
      `${title(unmeasured.side)} is a Road with no width recorded, so its PLC band cannot be decided.`
    );
  }
  const widestRoad = roads.reduce<Decimal | null>((max, r) => {
    const width = new D(String(r.roadWidthFt));
    return max === null || width.gt(max) ? width : max;
  }, null);

  const matched = new Map<PlcCategory, { rule: PlcComponentRule; label: string; evidence: string }>();

  /** A banded category charges the highest band the Plot reaches — once. */
  const chargeBand = (category: PlcCategory, reached: Decimal | null, evidence: string) => {
    if (reached === null) return;
    const tiers = ruleComponents
      .filter((c) => c.category === category)
      .sort((a, b) => new D(b.threshold!).cmp(new D(a.threshold!)));
    const index = tiers.findIndex((c) => reached.gte(new D(c.threshold!)));
    if (index === -1) return;
    const hit = tiers[index];
    const baseLabel = plcComponentLabel(category, hit.threshold);
    matched.set(category, {
      rule: hit,
      label: hit.remark ? `${baseLabel} (${hit.remark})` : baseLabel,
      evidence,
    });
  };

  chargeBand(
    "ROAD_WIDTH",
    widestRoad,
    widestRoad === null ? "" : `${sides(roads)} — widest road ${widestRoad.toString()} ft`
  );
  let openSidesCount = open.length > 0 ? new D(open.length) : null;
  if (open.length === 2) {
    const s1 = open[0].side;
    const s2 = open[1].side;
    const opposite =
      (s1 === "NORTH" && s2 === "SOUTH") ||
      (s1 === "SOUTH" && s2 === "NORTH") ||
      (s1 === "EAST" && s2 === "WEST") ||
      (s1 === "WEST" && s2 === "EAST");
    if (!opposite) {
      openSidesCount = new D("2.5");
    }
  }
  chargeBand("OPEN_SIDES", openSidesCount, open.length > 0 ? `${sides(open)} open` : "");

  /** Park and Playground facing are a single combined green-area PLC category — charged once if any side qualifies. */
  const greenAreas = boundaries.filter((b) => b.kind === "PARK" || b.kind === "PLAYGROUND");
  if (greenAreas.length > 0) {
    const greenRule = ruleComponents.find(
      (c) => c.category === "PARK_FACING" || c.category === "PLAYGROUND_FACING"
    );
    if (greenRule) {
      matched.set(greenRule.category, {
        rule: greenRule,
        label: plcComponentLabel(greenRule.category),
        evidence: `${sides(greenAreas)} facing`,
      });
    }
  }

  const components: PlcSnapshotComponent[] = [];
  let totalPercent = new D(0);
  for (const category of PLC_CATEGORY_ORDER) {
    const hit = matched.get(category);
    if (!hit) continue;
    const percent = new D(hit.rule.percent);
    components.push({ category, label: hit.label, percent: percent.toFixed(4), evidence: hit.evidence });
    totalPercent = totalPercent.add(percent);
  }

  return { components, totalPercent: new D(totalPercent.toFixed(4)) };
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

/**
 * Display-only derivation (PRD §16.2) — never stored, and never a PLC decision.
 * It reads the same boundaries PLC reads, so the words on the row and the
 * percentage beside them can never disagree.
 */
export function derivedFacing(boundaries: readonly Boundary[]): string {
  const roads = boundaries.filter((b) => b.kind === "ROAD");
  const parts: string[] = [];

  if (roads.length > 0) {
    parts.push(`${roads.map((r) => title(r.side)).join(" / ")} road facing`);
  }
  if (roads.length >= 2) parts.push("Corner");
  if (boundaries.some((b) => b.kind === "PARK")) parts.push("Park facing");
  if (boundaries.some((b) => b.kind === "PLAYGROUND")) parts.push("Playground facing");

  const openSides = boundaries.filter((b) => isOpenSide(b.kind)).length;
  parts.push(`${openSides} open side${openSides === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function title(side: BoundarySide): string {
  return side.charAt(0) + side.slice(1).toLowerCase();
}
