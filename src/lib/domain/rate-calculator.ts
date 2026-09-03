/*
 * Plot Rate & Area Calculator — the arithmetic only.
 *
 * PRD §1.2 and main-PRD §1: the CRM is not a rupee ledger. It stores no deal
 * value, rate, payment amount or commission amount, and no rupee column exists
 * in the schema. Nothing here changes that. This module takes an area and a
 * rate, returns a number, and the number lives in the browser for as long as
 * the page is open. There is no model, no table, no migration and no server
 * action behind it — the rate never leaves the client, and the calculator
 * writes nothing anywhere.
 *
 * Area is not recomputed here. calculateAreas() in ./inventory is the one area
 * rule in the application, including the exact-area override an irregular Plot
 * carries, and this reads whatever that produced.
 */

import { Prisma } from "@prisma/client";
import type { Decimal } from "./inventory";

const D = Prisma.Decimal;

export type RateType = "SQ_FT" | "SQ_YD";

export const RATE_TYPE_LABEL: Record<RateType, string> = {
  SQ_FT: "Per Sq. Ft.",
  SQ_YD: "Per Sq. Yd.",
};

export type RateInput = {
  rateType: RateType;
  /** As typed. Blank, nonsense and non-positive values are all refused. */
  rate: string;
  areaSqFt: string | number | Decimal;
  areaSqYd: string | number | Decimal;
};

export type RateResult =
  | { ok: true; total: Decimal; areaUsed: Decimal; unit: "Sq. Ft." | "Sq. Yd." }
  | { ok: false; reason: string };

/** Rejects the shapes a number input can hold that are not a number. */
function positive(raw: string | number | Decimal, what: string): Decimal | string {
  const text = `${raw}`.trim();
  if (text === "") return `${what} is required.`;
  let value: Decimal;
  try {
    value = new D(text);
  } catch {
    return `${what} must be a number.`;
  }
  // Decimal accepts Infinity and NaN happily; a rate is neither.
  if (!value.isFinite() || value.isNaN()) return `${what} must be a number.`;
  if (value.lte(0)) return `${what} must be greater than zero.`;
  return value;
}

/**
 * One rate against one area. The rate type picks which area is used, and only
 * that one — a Sq. Ft. rate never touches the Sq. Yd. area, and the two are
 * never multiplied together or added into a single figure.
 */
export function calculateRate(input: RateInput): RateResult {
  if (input.rateType !== "SQ_FT" && input.rateType !== "SQ_YD") {
    return { ok: false, reason: "Choose a Rate Type." };
  }

  const rate = positive(input.rate, "Rate");
  if (typeof rate === "string") return { ok: false, reason: rate };

  const raw = input.rateType === "SQ_FT" ? input.areaSqFt : input.areaSqYd;
  const area = positive(raw, "Area");
  if (typeof area === "string") return { ok: false, reason: area };

  return {
    ok: true,
    // Two decimals: this is a money figure being read off a screen, not a
    // stored value, and a quote is given to the rupee.
    total: new D(area.mul(rate).toFixed(2)),
    areaUsed: area,
    unit: input.rateType === "SQ_FT" ? "Sq. Ft." : "Sq. Yd.",
  };
}

/**
 * A percentage typed by hand — a commission share on the calculator screen.
 *
 * Zero is a real answer here (a network position past 9 earns 0%), so this is
 * not positive() with a different message: blank, nonsense, negative and
 * anything above 100 read as nothing at all, and the field says so by showing
 * no figure rather than by throwing.
 */
export function parsePercent(raw: string): Decimal | null {
  const text = raw.trim();
  if (text === "") return null;
  let value: Decimal;
  try {
    value = new D(text);
  } catch {
    return null;
  }
  if (!value.isFinite() || value.isNaN()) return null;
  return value.gte(0) && value.lte(100) ? value : null;
}

/**
 * Indian digit grouping with two decimals — 3000000 reads 30,00,000.
 *
 * formatQuantity() in lib/tasks groups the same way and is what every other
 * screen uses, but it prints a value exactly as given; a money figure wants
 * its paise either way, so the rounding happens here first.
 */
export function formatRupees(value: Decimal | string | number): string {
  const fixed = new D(value).toFixed(2);
  const [whole, fraction] = fixed.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = whole.replace("-", "");
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}` : tail;
  return `₹${sign}${grouped}.${fraction}`;
}
