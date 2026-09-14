/*
 * Plot Rate & Area Calculator — the arithmetic only.
 *
 * PRD §1.2 and prd-complete §1: the CRM is not a rupee ledger. It stores no deal
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
 * The two ways a discount is given: a share of the figure ("5% for a bulk
 * buyer") or a sum off it ("take fifty thousand off"). Both end at the same two
 * numbers, and the screen shows the working either way.
 */
export type DiscountMode = "PERCENT" | "AMOUNT";

export const DISCOUNT_MODE_LABEL: Record<DiscountMode, string> = {
  PERCENT: "%",
  AMOUNT: "₹",
};

export type Quote = {
  /** Area × rate. */
  base: Decimal;
  /** The Plot Location Charge as a sum, where the Plot carries one. */
  plc: Decimal;
  /** Base and PLC together — what the discount comes off. */
  gross: Decimal;
  /** What the discount takes off. Zero when nothing usable was typed. */
  discount: Decimal;
  /** (Base + PLC) − Discount. Never below zero. */
  commissionable: Decimal;
  /**
   * The same working per unit charged: Base Rate + PLC − Discount = Final Rate.
   * Final is the other three combined, so the rows on screen always add up.
   */
  rates: { base: Decimal; plc: Decimal; discount: Decimal; final: Decimal } | null;
};

/**
 * The Commissionable Sale Value, as CR-017 defines it:
 *
 *     (Base Property Value + Applicable PLC Value) − Authorised Discount
 *
 * and every commission percentage is a share of that figure, not of the base
 * (approved-changes-pack §18; the worked example in mock-data-v2 §24).
 *
 * The discount is typed by hand while someone is negotiating, so every shape a
 * number field can hold that is not a usable discount — blank, nonsense,
 * negative — reads as no discount rather than as an error. A percentage above
 * 100 and a sum above the figure both stop at the figure: a quote cannot go
 * below zero.
 *
 * Nothing here is stored. The CRM holds no rupee column, and PLC is a
 * percentage everywhere it is persisted (plc-location-charge.md §2.1) — this
 * arithmetic is the worksheet Accounts does outside the CRM, run in the browser
 * so a quote can be given while the buyer is still in the room.
 */
export function buildQuote(input: {
  base: Decimal;
  areaUsed: Decimal;
  plcPercent: string | null;
  discountMode: DiscountMode;
  discount: string;
}): Quote {
  const { base, areaUsed, plcPercent, discountMode } = input;

  const plcRate = usable(plcPercent ?? "");
  const plc = plcRate ? new D(base.mul(plcRate).div(100).toFixed(2)) : new D(0);
  const gross = new D(base.add(plc).toFixed(2));

  const typed = usable(input.discount);
  const off = !typed
    ? new D(0)
    : discountMode === "PERCENT"
      ? gross.mul(typed.gt(100) ? new D(100) : typed).div(100)
      : typed;

  const discount = new D((off.gt(gross) ? gross : off).toFixed(2));
  const commissionable = new D(gross.sub(discount).toFixed(2));

  const perUnit = (v: Decimal) => new D(v.div(areaUsed).toFixed(2));
  const rates = areaUsed.gt(0)
    ? { base: perUnit(base), plc: perUnit(plc), discount: perUnit(discount) }
    : null;

  return {
    base,
    plc,
    gross,
    discount,
    commissionable,
    rates: rates && {
      ...rates,
      final: D.max(0, rates.base.add(rates.plc).sub(rates.discount)),
    },
  };
}

/** A typed number that is actually a number, and above zero. Otherwise null. */
function usable(raw: string): Decimal | null {
  const text = raw.trim();
  if (text === "") return null;
  let value: Decimal;
  try {
    value = new D(text);
  } catch {
    return null;
  }
  if (!value.isFinite() || value.isNaN() || value.lte(0)) return null;
  return value;
}

/* ------------------------------------------------------- rupees in words */

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

/** 0-99 in words. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  const ones = ONES[n % 10];
  return ones ? `${tens} ${ones}` : tens;
}

/**
 * A figure written out the way a receipt writes it, in the Indian system:
 * crore, lakh, thousand, hundred — because that is how the number is read
 * aloud here, and "1,061,409" is not how anybody says ten lakh sixty-one
 * thousand.
 *
 * Rupees only: paise are dropped from the words, not rounded into them.
 */
export function rupeesInWords(value: Decimal | string | number): string {
  let n = Number(new D(`${value}`).toFixed(2).split(".")[0]);

  if (!Number.isFinite(n)) return "";

  const parts: string[] = [];
  const take = (size: number, name: string) => {
    const count = Math.floor(n / size);
    if (count > 0) {
      parts.push(`${twoDigits(count)} ${name}`);
      n -= count * size;
    }
  };

  take(10000000, "Crore");
  take(100000, "Lakh");
  take(1000, "Thousand");
  take(100, "Hundred");
  if (n > 0) parts.push(twoDigits(n));

  return `${parts.length ? parts.join(" ") : "Zero"} Rupees Only`;
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
