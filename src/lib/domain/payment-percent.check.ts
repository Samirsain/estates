// Confidential payment trial — the revised brief's §3 and §9 cases, fictional figures.
// Run: node --import ./prisma/alias-loader.mjs src/lib/domain/payment-percent.check.ts
import assert from "node:assert/strict";
import { worksheetPoints } from "./worksheet-formula.ts";
import {
  allocateUnits,
  convertPayment,
  duePct,
  paidPct,
  formatPaise,
  formatRupeeTyping,
  fromUnits,
  instalmentRows,
  monetaryText,
  nextAction,
  openingBalance,
  parseRupees,
  plotTokens,
  validPlotTokens,
  tokensForPercent,
  paymentSummary,
  readApproval,
  rupeesOf,
  shareOfInstalment,
  toUnits,
  TOTAL_UNITS,
} from "./payment-percent.ts";
import { validateSchedule } from "./booking.ts";

const paise = (text: string) => {
  const r = parseRupees(text);
  if ("error" in r) throw new Error(r.error);
  return r.paise;
};

const setupCells = { TOTAL: "500000" };
assert.equal(worksheetPoints("25", setupCells, "TOTAL"), "20000");
assert.equal(worksheetPoints("=ROUND((total + 100)*2%,2)", setupCells, "TOTAL"), "10002");
assert.equal(worksheetPoints("=SUM(MAX(2,3),2^3,ABS(-4))", setupCells, "TOTAL"), "15");
assert.equal(worksheetPoints("=TOTAL-1", { TOTAL: "9999999999999999.9999" }, "TOTAL"), "9999999999999998.9999");
assert.equal(worksheetPoints("=RECEIVED*2", { RECEIVED: "10", PTS: "100" }, "RECEIVED"), "20");
for (const expression of ["=TOTAL/0", "=UNKNOWN", "=SUM(1,)", "=2^999999", "=0", "=(-2)", "=1 2", "=1+"]) {
  assert.equal(worksheetPoints(expression, setupCells, "TOTAL"), null);
}
const plan = (received: string[], dues = ["2026-09-01", "2026-10-01", "2026-12-01", "2027-01-01"]) =>
  received.map((r, i) => ({ seq: i + 1, scheduled: "25", received: r, dueDate: `${dues[i]}T00:00:00+05:30` }));
const NOW = new Date("2026-11-25T06:00:00Z"); // 25 Nov 2026, 11:30 IST

// --- percentage units round-trip exactly
assert.equal(toUnits("43.8"), 4380000000n);
assert.equal(fromUnits(4380000000n), "43.8");
assert.equal(fromUnits(TOTAL_UNITS), "100");
assert.equal(fromUnits(2499999999n), "24.99999999");
assert.throws(() => toUnits("1.234567891"), "eight places at most (owner review, 25 Nov 2026)");
assert.throws(() => toUnits("abc"));

// --- §3: ₹50,000, four × 25%, verified 10 / 15 / 12 → 37%
const deal = paise("50,000");
const rows37 = instalmentRows(plan(["25", "12", "0", "0"]), NOW);
const s37 = paymentSummary(rows37, "37");
assert.equal(fromUnits(s37.received), "37");
assert.equal(fromUnits(s37.outstanding), "63");
assert.equal(rows37[0].payment, "COMPLETE");
assert.equal(rows37[1].payment, "PARTIAL");
assert.equal(fromUnits(rows37[1].pending), "13");
// 12 points of the deal towards a 25% instalment is 48% of that instalment.
assert.equal(shareOfInstalment(rows37[1].received, rows37[1].target), "48%");
assert.equal(shareOfInstalment(rows37[0].received, rows37[0].target), "100%");
assert.equal(shareOfInstalment(toUnits("24.9999"), toUnits("25")), "99.99%");
assert.equal(s37.current?.seq, 2);
assert.equal(formatPaise(rupeesOf(deal, s37.received)), "₹18,500.00");
assert.equal(formatPaise(rupeesOf(deal, s37.outstanding)), "₹31,500.00");
assert.equal(formatPaise(rupeesOf(deal, rows37[1].pending)), "₹6,500.00");
assert.equal(formatPaise(rupeesOf(deal, rows37[2].pending)), "₹12,500.00");
// The three old payments, reconstructed — calculated equivalents, not a ledger.
assert.deepEqual(
  ["10", "15", "12"].map((p) => formatPaise(rupeesOf(deal, toUnits(p)))),
  ["₹5,000.00", "₹7,500.00", "₹6,000.00"]
);
// Due states: 2 is past its 1 Oct due date; 3 and 4 are ahead.
assert.equal(rows37[0].due, null);
assert.equal(rows37[1].due, "OVERDUE");
assert.equal(rows37[2].due, "UPCOMING");
assert.equal(fromUnits(s37.overdue), "13");

// --- §3: next payment ₹3,400 → 6.8%, exact, no cumulative needed
const next = convertPayment({ dealPaise: deal, paymentPaise: paise("3400"), currentUnits: s37.received });
assert.ok(next.ok);
assert.equal(fromUnits(next.deltaUnits), "6.8");
assert.equal(fromUnits(s37.received + next.deltaUnits), "43.8");
assert.equal(fromUnits(TOTAL_UNITS - s37.received - next.deltaUnits), "56.2");
assert.equal(formatPaise(rupeesOf(deal, TOTAL_UNITS - s37.received - next.deltaUnits)), "₹28,100.00");
assert.deepEqual(allocateUnits(rows37, next.deltaUnits), [{ seq: 2, units: 680000000n }]);
const rows438 = instalmentRows(plan(["25", "18.8", "0", "0"]), NOW);
assert.equal(fromUnits(rows438[1].pending), "6.2");
assert.equal(formatPaise(rupeesOf(deal, rows438[1].pending)), "₹3,100.00");
assert.equal(rows438[0].payment, "COMPLETE");
// The same payment with cumulative ₹21,900 from official accounts agrees.
const withCum = convertPayment({ dealPaise: deal, paymentPaise: paise("3400"), cumulativePaise: paise("21900"), currentUnits: s37.received });
assert.ok(withCum.ok && withCum.deltaUnits === 680000000n);

// --- §9: ₹5,00,000 and ₹34,000 → 6.8%; first instalment 18.2% remaining
const big = convertPayment({ dealPaise: paise("500000"), paymentPaise: paise("34000"), currentUnits: 0n });
assert.ok(big.ok);
assert.equal(fromUnits(big.deltaUnits), "6.8");
const bigRows = instalmentRows(plan([fromUnits(big.deltaUnits), "0", "0", "0"]), NOW);
assert.equal(fromUnits(bigRows[0].pending), "18.2");

// --- §9: a wrong temporary price changes every equivalent; percentages do not move
assert.equal(formatPaise(rupeesOf(paise("60000"), s37.received)), "₹22,200.00");

// --- §9: threshold 24.99999999% vs 25% — floored, so it never reads as 25%
const crore100 = paise("1000000000");
const near = convertPayment({ dealPaise: crore100, paymentPaise: paise("249999999.90"), cumulativePaise: paise("249999999.90"), currentUnits: 0n });
assert.ok(near.ok);
assert.equal(fromUnits(near.deltaUnits), "24.99999999");
assert.ok(near.deltaUnits < toUnits("25"));
const exact25 = convertPayment({ dealPaise: crore100, paymentPaise: paise("250000000"), currentUnits: 0n });
assert.ok(exact25.ok && exact25.exact && exact25.deltaUnits === toUnits("25"));
const half = convertPayment({ dealPaise: deal, paymentPaise: paise("25000"), currentUnits: 0n });
assert.ok(half.ok && half.deltaUnits === toUnits("50"));
const full = convertPayment({ dealPaise: deal, paymentPaise: paise("50000"), currentUnits: 0n });
assert.ok(full.ok && full.deltaUnits === TOTAL_UNITS);

// --- an inexact payment needs the cumulative figure; a mismatch needs reconciliation
const odd = convertPayment({ dealPaise: paise("3000000"), paymentPaise: paise("10000"), currentUnits: 0n });
assert.ok(!odd.ok && odd.needsCumulative);
const oddCum = convertPayment({ dealPaise: paise("3000000"), paymentPaise: paise("10000"), cumulativePaise: paise("10000"), currentUnits: 0n });
assert.ok(oddCum.ok && fromUnits(oddCum.deltaUnits) === "0.33333333");
const mismatch = convertPayment({ dealPaise: deal, paymentPaise: paise("3400"), cumulativePaise: paise("30000"), currentUnits: s37.received });
assert.ok(!mismatch.ok && /check the price/.test(mismatch.reason));

// --- cross-instalment and full payment allocation
const empty = instalmentRows(plan(["0", "0", "0", "0"]), NOW);
assert.deepEqual(allocateUnits(empty, toUnits("40")), [{ seq: 1, units: 2500000000n }, { seq: 2, units: 1500000000n }]);
assert.equal(allocateUnits(empty, TOTAL_UNITS).length, 4);
const done = instalmentRows(plan(["25", "25", "25", "25"]), NOW);
assert.ok(done.every((r) => r.payment === "COMPLETE" && r.due === null));
assert.equal(paymentSummary(done, "100").current, null);

// --- an aggregate with no individual history is an opening balance, not invented entries
assert.equal(fromUnits(openingBalance("37", ["10", "15", "12"])), "0");
assert.equal(fromUnits(openingBalance("30", [])), "30");
assert.equal(fromUnits(openingBalance("45", ["15"])), "30");

// --- invalid input
for (const bad of ["", "0", "-5", "abc", "1.234", "12,34.5.6"]) assert.ok("error" in parseRupees(bad), bad);
assert.ok("paise" in parseRupees("₹ 5,00,000"));
const excess = convertPayment({ dealPaise: deal, paymentPaise: paise("40000"), currentUnits: s37.received });
assert.ok(!excess.ok && /more than the balance left/.test(excess.reason));
// At eight places ₹1 of ₹100 crore still shows (0.0000001%); one paisa does not.
const tiny = convertPayment({ dealPaise: crore100, paymentPaise: paise("0.01"), cumulativePaise: paise("0.01"), currentUnits: 0n });
assert.ok(!tiny.ok && /too small/.test(tiny.reason));

// --- due-date boundary in Asia/Kolkata (date only)
const dueToday = [{ seq: 1, scheduled: "100", received: "0", dueDate: "2026-11-25T00:00:00+05:30" }];
assert.equal(instalmentRows(dueToday, new Date("2026-11-25T18:20:00Z"))[0].due, "DUE_TODAY"); // 23:50 IST
assert.equal(instalmentRows(dueToday, new Date("2026-11-25T18:40:00Z"))[0].due, "OVERDUE"); // 00:10 IST next day
assert.equal(instalmentRows(dueToday, new Date("2026-11-24T18:20:00Z"))[0].due, "UPCOMING");

// --- plans: 4 × 25% and 10/30/30/30 accepted, a total other than 100% refused
const lines = (pcts: string[]) => pcts.map((p, i) => ({ seq: i + 1, scheduledPercent: p, dueDate: new Date(`2026-12-0${i + 1}T00:00:00+05:30`) }));
const booked = new Date("2026-11-25T00:00:00+05:30");
assert.ok(validateSchedule(lines(["25", "25", "25", "25"]), booked).ok);
assert.ok(validateSchedule(lines(["10", "30", "30", "30"]), booked).ok);
assert.ok(!validateSchedule(lines(["10", "30", "30", "20"]), booked).ok);

// --- free text carries no rupee amount
for (const yes of ["paid 50,000", "₹500 received", "Rs 500", "rs.2000", "2 lakh", "10k paid", "5000/-", "1,25,000", "INR 300"]) {
  assert.ok(monetaryText(yes), yes);
}
for (const no of ["UTR 123456789012", "Customer will pay on Friday", "Cheque no 004512", "Promised by 28 Nov", "Instalment 2"]) {
  assert.ok(!monetaryText(no), no);
}

// --- the approval request: a percentage only; a price or amount refuses the whole call
for (const amount of ["0.01", "24.99", "500000", "500000.01", "9999999999999.99"]) {
  const tokens = plotTokens(paise(amount), "25");
  assert.ok(tokens);
  assert.ok(validPlotTokens(tokens));
  assert.equal(tokensForPercent(tokens, TOTAL_UNITS), tokens);
}
assert.equal(tokensForPercent("2000", toUnits("13")), "260");
assert.equal(tokensForPercent("2000.0004", toUnits("50")), "1000.0002");
assert.equal(tokensForPercent("0.0004", toUnits("0.00000001")), "0");
assert.equal(plotTokens(paise("500000"), "25"), "20000");
assert.equal(plotTokens(paise("500000.01"), "25"), "20000.0004");
assert.equal(plotTokens(paise("1"), "3"), "0.3333");
assert.equal(plotTokens(paise("1"), "0.0001"), "10000");
for (const factor of ["", "0", "1e2", "0.00001", "-1"]) assert.equal(plotTokens(paise("1"), factor), null);
for (const invalid of ["0", "-1", "0.00001", "1e8", "2.0000", "100000000000000000"]) assert.equal(validPlotTokens(invalid), false);
const goodApproval = {
  plotId: "p1",
  bookingId: "b1",
  percent: "6.8",
  paidOn: "2026-11-25",
  reference: "UTR1",
  expectedReceived: "37",
  requestId: "",
  idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
};
assert.ok(readApproval(goodApproval).ok);
for (const extra of [{ dealValue: "50000" }, { amount: "3400" }, { cumulative: "21900" }, { rupees: 1 }, { safetyFactor: 25 }, { divisor: 25 }, { tokens: "20000" }]) {
  const r = readApproval({ ...goodApproval, ...extra });
  assert.ok(!r.ok && !r.error.includes("50000") && !r.error.includes("3400"), JSON.stringify(extra));
}
for (const bad of [{ percent: "0" }, { percent: "-1" }, { percent: "6.800000001" }, { percent: "abc" }, { plotId: "" }, { paidOn: "25/11/2026" }, { paidOn: "2026-02-30" }, { idempotencyKey: "x" }]) {
  assert.ok(!readApproval({ ...goodApproval, ...bad }).ok, JSON.stringify(bad));
}
assert.ok(!readApproval(null).ok && !readApproval([1]).ok);

// --- audit point 7: no cumulative rounding drift. 40 uneven payments on an odd
// deal value; each credit comes from the official cumulative figure, so the
// running total always equals floor(cumulative) and ends at exactly 100%.
{
  const oddDeal = paise("3333333.33");
  let seed = 7n;
  const nextAmount = () => {
    seed = (seed * 1103515245n + 12345n) % 2147483648n;
    return 50000n + (seed % 9000000n); // ₹500 to ₹90,500 in paise
  };
  let cum = 0n;
  let current = 0n;
  let naive = 0n;
  for (let i = 0; i < 40; i++) {
    const remaining = oddDeal - cum;
    const draw = nextAmount();
    const amount = i === 39 || draw > remaining ? remaining : draw;
    if (amount <= 0n) break;
    cum += amount;
    naive += (amount * TOTAL_UNITS) / oddDeal; // what flooring each payment alone would give
    const c = convertPayment({ dealPaise: oddDeal, paymentPaise: amount, cumulativePaise: cum, currentUnits: current });
    assert.ok(c.ok, `payment ${i} converts`);
    current += c.deltaUnits;
    assert.equal(current, (cum * TOTAL_UNITS) / oddDeal, `no drift after payment ${i}`);
  }
  assert.equal(cum, oddDeal);
  assert.equal(current, TOTAL_UNITS, "the last payment lands on exactly 100%");
  assert.ok(naive < TOTAL_UNITS, "flooring each payment alone would have drifted below 100%");
}

// --- rupee boxes take money only: digits, one ".", two paise digits, Indian commas
assert.equal(formatRupeeTyping("abc500000xyz"), "5,00,000");
assert.equal(formatRupeeTyping("500000.567"), "5,00,000.56");
assert.equal(formatRupeeTyping("12.3.4"), "12.34");
assert.equal(formatRupeeTyping(".5"), "0.5");
assert.equal(formatRupeeTyping("0003400"), "3,400");
assert.equal(formatRupeeTyping("₹ 1,23,45,678.9"), "1,23,45,678.9");
assert.equal(formatRupeeTyping("-50"), "50");
assert.equal(formatRupeeTyping(""), "");
for (const typed of ["5,00,000", "5,00,000.56", "3,400", "0.5"]) assert.ok("paise" in parseRupees(typed), typed);

// --- audit point 5: the staff panel's one next action
{
  const today = "2026-11-25";
  const s = (received: string[], total: string) => paymentSummary(instalmentRows(plan(received), NOW), total);
  const base = { status: "BOOKED", hasPlan: true, claimsWaiting: 0, today };
  assert.equal(nextAction({ ...base, status: "PAYMENT_COMPLETED", summary: s(["25", "25", "25", "25"], "100") }).tone, "done");
  assert.match(nextAction({ ...base, claimsWaiting: 1, summary: s(["25", "12", "0", "0"], "37") }).text, /Wait — MD is checking/);
  assert.match(nextAction({ ...base, summary: s(["25", "12", "0", "0"], "37") }).text, /Call the customer — 13% is late/);
  assert.match(nextAction({ ...base, promisedOn: "2026-11-28", summary: s(["25", "12", "0", "0"], "37") }).text, /promised to pay by 28\/11\/2026/);
  assert.equal(nextAction({ ...base, promisedOn: "2026-11-20", summary: s(["25", "12", "0", "0"], "37") }).tone, "urgent", "a broken promise is chased");
  assert.match(nextAction({ ...base, summary: s(["25", "25", "0", "0"], "50") }).text, /25% of instalment 3 is due on 01\/12\/2026/);
  assert.match(nextAction({ ...base, hasPlan: false, summary: paymentSummary([], "0") }).text, /No payment plan yet/);
}

// --- owner review: staff read two places — paid rounds down, left rounds up
assert.equal(paidPct(toUnits("24.99999999")), "24.99%");
assert.equal(duePct(TOTAL_UNITS - toUnits("24.99999999")), "75.01%");
assert.equal(paidPct(toUnits("25")), "25%");
assert.equal(duePct(toUnits("0.00000001")), "0.01%", "a sliver still owed never reads 0%");
{
  const s = paymentSummary(instalmentRows(plan(["24.99999999", "0", "0", "0"]), NOW), "24.99999999");
  assert.match(
    nextAction({ status: "BOOKED", hasPlan: true, claimsWaiting: 0, today: "2026-11-25", summary: s }).text,
    /Call the customer — 25.01% is late/,
    "staff text is two places: 0.00000001 of #1 plus 25 of #2"
  );
}

// --- compatibility: progress saved at four places before the owner review.
// ₹10,000 of ₹30,000 was kept as 33.3333%; the next ₹3,000 with the accounts'
// total of ₹13,000 is accepted and quietly takes up the old rounding.
{
  const legacy = convertPayment({ dealPaise: paise("30000"), paymentPaise: paise("3000"), cumulativePaise: paise("13000"), currentUnits: toUnits("33.3333") });
  assert.ok(legacy.ok, "a four-place history is not called a mismatch");
  assert.equal(fromUnits(toUnits("33.3333") + legacy.deltaUnits), "43.33333333");
}

console.log("payment-percent.check: conversion, allocation, instalment share, opening balance, due-state, text-guard and request-shape cases pass.");
