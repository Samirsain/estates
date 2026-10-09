# Business Model v2 — Part 1: Money Rules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each Project's Direct and Loyalty come from an MD-approved, versioned Project setting, frozen onto the Booking at Booking Request submission. Invite/Royalty bands, positions, cycles, the 3-Loyalty limit, the fixed 3% and the 4% cap are removed.

**Architecture:** A new `ProjectCommissionVersion` model (Draft → Pending → Active → Superseded / Rejected) is managed by a new `commission-settings-service.ts`. Booking submission and revision freeze the Active version, the buyer's classification and the Loyalty subject's Deactivated flag onto the Booking. The pure engine `generateCommission()` reads those frozen terms instead of fixed rates and network bands. Everything else in the commission pipeline (records, supersession, eligibility, payment, Buyback) stays and is trimmed.

**Tech Stack:** Next.js 15 server actions, Prisma 5 + Postgres (Supabase), `prisma/constraints.sql` for CHECKs and partial indexes, Node's built-in `assert` check scripts (`npm run check`, `npm run db:check`).

**Spec:** `docs/superpowers/specs/2026-10-08-business-model-v2-part1-money-rules-design.md` (argues from `system/3_Percent_Club_Business_Model_v2_Final_Approved.md`, cited **v2 §n**). Read both before starting.

## Global Constraints

- Build exactly what the spec says. `system/business-model-v2-review.md` and `system/business-model-v2-loopholes.md` are **not** part of this build.
- Work stays on the local branch `business-model-v2`. Commit locally. **Never `git push`, never open a PR.**
- Direct: `0 < directPercent ≤ 5`. Loyalty: `0 < loyaltyPercent ≤ 3`. Enabled ⇔ a rate is present; a benefit not offered is **Disabled**, never 0%.
- Loyalty Enabled **and** (Direct Disabled **or** Loyalty ≥ Direct) ⇒ `loyaltyExceptionReason` required.
- Only `ADMIN` prepares and sends a version. Only `MD` approves or rejects. At most one Draft-or-Pending and at most one Active per Project.
- A version takes effect at MD approval. No future-dated or backdated versions.
- No Active version ⇒ Booking Request submission is refused with exactly: `This Project has no approved commission settings.`
- Milestones: third-party Direct 25%; self-purchase Direct 100%; Loyalty 100%. Approved Buyback accelerates **Loyalty only**.
- `ruleVersion` strings: `DIRECT/THIRD_PARTY/V{n}/{rate}%@25`, `DIRECT/SELF_PURCHASE/V{n}/{rate}%@100`, `LOYALTY/INTRODUCED_BUYER/V{n}/{rate}%@100`, `LOYALTY/REPEAT_PURCHASE/V{n}/{rate}%@100`, where `{n}` is the Project version number and `{rate}` the trimmed decimal (`3`, `2.5`).
- Membership invitation task: purpose `MEMBERSHIP_INVITATION`, title `Membership invitation`, created once per Customer at their third Customer-closing Loyalty record that reaches its milestone. Blocks nothing.
- Seeded Projects get an Active version with Direct 3%, Loyalty 1%.
- Only mock data exists; reset with `npm run data:reset` before migrating. No legacy transition.
- Rupee amounts never enter the schema (existing PRD rule).

## v2.1 changes to the tasks below (read first — they override the task text)

The spec's "v2.1 amendments" section governs. Per task:

- **Task 1:** add `CUSTOMER_CLOSING_LOYALTY_LIMIT = 3`, `BUYBACK_MIN_SOURCE_PAYMENT = "25"`, and `closingLoyaltyQualifies(alreadyQualified: number): boolean` (`< 3`). `HoldReason` gains `"CLOSER_KYC_PENDING" | "CUSTOMER_TERMS_PENDING"`. `EligibilityInput` gains `closer: { kycVerified: boolean; termsAccepted: boolean } | null` (non-null only for a CLOSING_CUSTOMER Loyalty record). `resolveEligibility` checks it after Aadhaar and bank: KYC first, then Terms. Tests cover the limit helper and both holds.
- **Task 2:** schema adds `CommissionRecord.qualifiedAt DateTime?`, enum values `CLOSER_KYC_PENDING` and `CUSTOMER_TERMS_PENDING` on `CommissionHoldReason`, and `model CustomerTermsAcceptance { id, customerProfileId → CustomerProfile, termsVersion String, acceptedOn DateTime, recordedByRef String, createdAt }` with `CustomerProfile.termsAcceptances`. The `one_current_loyalty_per_booking` index stays.
- **Task 4:** delete the Membership invitation (`inviteToMembershipIfDue`, `MEMBERSHIP_INVITATION_PURPOSE`). In `reassessCommission`, `buybackMilestoneMet = buybackApproved && buybackAccelerates(type) && received ≥ 25`. When any record reaches its milestone without `qualifiedAt`, set `qualifiedAt`. A CLOSING_CUSTOMER record first takes `lockKey("customer-closing-loyalty:{personId}")`, counts the closer's other current, uncancelled, qualified CLOSING_CUSTOMER records, and if `!closingLoyaltyQualifies(n)` it is Cancelled (`afterAffectingChange(..., "CANCELLED_BEFORE_COMPLETION")`, event `LIMIT_REACHED`) instead. When the milestone is lost, clear `qualifiedAt`. The eligibility input's `closer` comes from `Person.aadhaarStatus === "VERIFIED"` and whether a `CustomerTermsAcceptance` exists. `validateSoldBy` (Sold By Customer) refuses a closer with no approved, uncancelled Booking as Primary Customer: `A Sold By Customer must be an existing Customer with their own approved purchase.` `syncRoyaltyLink` lets a Buyback make the link final only at ≥25% received. The review snapshot's `commissionTerms` also carries `versionId`. Add `recordCustomerTermsAcceptance({ idempotencyKey, actorRef, actorRole, customerProfileId, termsVersion, acceptedOn })` to a Customer-side service (CRM/Admin/MD; reason-free; `notFutureDated`), which then reassesses the person's unpaid Loyalty records. Also reassess when Aadhaar becomes VERIFIED on whichever path already writes `aadhaarStatus`.
- **Task 6:** the Customer page gets a "Customer Terms" row: accepted version + date, or a CRM button "Record acceptance" (version reference + date). Hold labels: `CLOSER_KYC_PENDING` → "Closer KYC pending", `CUSTOMER_TERMS_PENDING` → "Customer Terms pending".
- **Task 7:** replace the Membership-invitation test with a lifetime-limit test: five Customer-closing sales by one closer, paid to 100% in order. The first three are Ready, and the fourth and fifth are Cancelled with the limit reason. Five Club-direct repeat purchases by one buyer all stay Ready. Also: a Buyback at 20% received does not accelerate Loyalty but at 30% it does; a closer without an approved purchase is refused; with Aadhaar not Verified the record holds `CLOSER_KYC_PENDING`, and without Terms it holds `CUSTOMER_TERMS_PENDING`. The `makeEligiblePerson` closers get Aadhaar `VERIFIED`, a Terms acceptance and an approved purchase of their own.

## Review Focus

1. **A rate typed with more than four decimals, a comma, spaces or letters** (`3.12345`, `3,5`, `abc`). The DB column is `Decimal(7,4)` and would round silently. Expected: refused with a readable message. Test in Task 1.
2. **Loyalty exactly equal to Direct** (`3` and `3`). That is "not lower", so a reason is required. Expected: refused without a reason, accepted with one. Test in Task 1.
3. **A Project whose version Disables both benefits.** Expected: Booking approves normally with zero commission records and no conflict. Test in Task 7.
4. **PC, CRM or Accounts trying to prepare, send or decide** (PC holds `PROJECT_SETUP`). Expected: refused by the service, not only hidden in the UI. Test in Task 3.
5. **An Admin editing a Draft after another tab already sent it.** Expected: `Only a Draft can be edited.` rather than a silent overwrite of a Pending version. Test in Task 3.

---

## File map

| File | Change |
| --- | --- |
| `src/lib/domain/commission.ts` | Rewrite engine, eligibility, preview; add terms validation; delete bands, cycles, cap, opportunities |
| `src/lib/domain/domain.check.ts` | Replace commission asserts |
| `src/lib/domain/completion.ts` | Delete `rebuildLoyaltyCount` |
| `prisma/schema.prisma` | Add `ProjectCommissionVersion`, Booking fields; drop removed enums/models/fields |
| `prisma/migrations/20261009120000_business_model_v2_money/migration.sql` | Generated |
| `prisma/constraints.sql` | Version CHECKs/indexes, one Loyalty per Booking, 5% bound; drop 3-slot, opportunity, 4% trigger |
| `prisma/seed-commission.ts` | **New** — `ensureActiveCommissionVersion(db, projectId, actorRef)` for every seed and check |
| `src/lib/services/commission-settings-service.ts` | **New** — prepare / send / decide / list |
| `src/lib/services/commission-service.ts` | Freeze helpers; input from frozen terms; drop opportunities, cycles, cap; Membership invitation |
| `src/lib/services/booking-service.ts` | Freeze on submit + revise; terms in review snapshot; Sold By Correction re-reads Deactivated |
| `src/lib/services/network-service.ts` | Drop positions; Royalty link kept without position |
| `src/lib/services/cycle-service.ts` | **Delete** |
| `src/lib/jobs.ts` | Drop anniversary cycle job |
| `src/lib/services/merge-service.ts` | Drop Loyalty rebuild |
| `src/lib/services/report-service.ts`, `src/lib/migration/reconcile.ts` | Drop Royalty/cycle/cap/slot figures |
| `src/app/projects/[id]/commission-settings.tsx` | **New** client section |
| `src/app/projects/[id]/page.tsx`, `src/app/projects/actions.ts` | Load versions; four actions |
| `src/app/bookings/*` | Show frozen terms + version |
| `src/app/calculator/*`, `src/app/portal/*`, `src/app/members/*`, `src/app/customers/*`, `src/app/reports/*`, `src/app/administration/*` | Remove bands/positions/cycles/cap/"x of 3" |
| `prisma/*.check.ts`, `prisma/check-cleanup.ts`, `prisma/reset-data.ts`, all seeds | Updated to v2 |
| `prisma/commission-settings.check.ts` | **New** — approval-flow suite |
| `package.json` | Add `commission-settings:check` to `db:check` |

Type-check note: Task 1 removes exports that many files import, so `tsc` is red from Task 1 until Task 6 finishes. Each task runs its own targeted check; `npm run check` must be fully green at the end of Task 6, and `npm run db:check` at the end of Task 8.

---

### Task 1: The v2 engine (pure domain)

**Files:**
- Modify: `src/lib/domain/commission.ts`
- Modify: `src/lib/domain/completion.ts` (delete `rebuildLoyaltyCount` and its import of `MAX_LOYALTY_SLOTS`)
- Test: `src/lib/domain/domain.check.ts`

**Interfaces — Produces:**
```ts
export type CommissionType = "DIRECT" | "LOYALTY";
export type BeneficiaryRole = "SELLING_MEMBER" | "CLOSING_CUSTOMER" | "REPEAT_PURCHASE_CUSTOMER";
/** A Project version as frozen on a Booking. null percent = Disabled. */
export type FrozenTerms = { version: number; directPercent: string | null; loyaltyPercent: string | null };
export type CommissionTermsInput = {
  directEnabled: boolean; directPercent: string | null;
  loyaltyEnabled: boolean; loyaltyPercent: string | null;
  loyaltyExceptionReason: string | null;
};
export const DIRECT_MAX_PERCENT = "5";
export const LOYALTY_MAX_PERCENT = "3";
export const DIRECT_MILESTONE = "25";
export const FULL_MILESTONE = "100";
export function needsLoyaltyException(t: CommissionTermsInput): boolean;
export function validateCommissionTerms(t: CommissionTermsInput): Check;
export function rateLabel(percent: string): string;            // "3.0000" -> "3"
export type CommissionInput = {
  soldByType: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
  soldByPersonId: string | null;
  buyerPersonId: string;
  buyerIsActiveMember: boolean;      // frozen at submission
  buyerHasPriorPurchase: boolean;
  terms: FrozenTerms | null;         // null = Booking has no frozen version
  loyaltySubjectDeactivated: boolean;
};
export type CommissionOutcome =
  | { ok: true; components: Component[]; totalPercent: Decimal }
  | { ok: false; conflict: string };
export function generateCommission(input: CommissionInput): CommissionOutcome;
export type PersonFacts = { id: string; memberActive: boolean; memberDeactivated: boolean; hasPriorPurchase: boolean };
export function previewInput(soldByType, seller: PersonFacts | null, buyer: PersonFacts, terms: FrozenTerms | null): CommissionInput;
export type EligibilityState = "MILESTONE_PENDING" | "READY" | "ON_HOLD";
export function buybackAccelerates(type: CommissionType | "BUYING"): boolean;  // LOYALTY only
export function resolveEligibility(input: EligibilityInput): Eligibility;    // no percent, no conflictAbove4
```
Kept unchanged: `isLeapYear`, `anniversaryDay`, `experienceSince`, `classifyApprovedBooking` and its types, `totalOf`, `eligibilityLabel` (without the NO_BENEFIT case), `canMarkPaid` (without the NO_BENEFIT branch), `needsPaymentTask`, `countsAsUnpaid`, `afterAffectingChange`, `HoldReason` (minus `COMMISSION_CONFLICT_ABOVE_4`).

Deleted: `DIRECT_PERCENT`, `LOYALTY_PERCENT`, `SALE_CAP_PERCENT`, `MAX_LOYALTY_SLOTS`, `NETWORK_BANDS`, `bandRate`, `nextNetworkPosition`, `counterYearStart`, `counterYearRolled`, the whole performance-cycles section, `NetworkLink`, `band()`, `settle()`'s cap, `checkSaleCap`, `noBenefitLabel`, `opportunityReopens`.

- [ ] **Step 1: Write the failing checks.** In `domain.check.ts`, delete every assert that touches a deleted export (search each name above, plus `INVITE`, `ROYALTY`, `NO_BENEFIT`, `commissionConflictAbove4`, `rebuildLoyaltyCount`). Then add this block where the old engine asserts were:

```ts
/* ------------------------------------------- v2 engine (v2 §11, §19–§24) */
const T = (directPercent: string | null, loyaltyPercent: string | null): FrozenTerms =>
  ({ version: 2, directPercent, loyaltyPercent });
const base = {
  soldByPersonId: null as string | null,
  buyerPersonId: "buyer",
  buyerIsActiveMember: false,
  buyerHasPriorPurchase: false,
  loyaltySubjectDeactivated: false,
};
const comps = (o: CommissionOutcome) => {
  assert.ok(o.ok, o.ok ? "" : o.conflict);
  return o.components.map((c) => `${c.type}|${c.beneficiaryRole}|${c.beneficiaryPersonId}|${c.percent}|${c.milestonePercent}|${c.ruleVersion}`);
};

// Third-party Member sale — Direct at 25%.
assert.deepEqual(
  comps(generateCommission({ ...base, soldByType: "MEMBER", soldByPersonId: "seller", terms: T("3", "1") })),
  ["DIRECT|SELLING_MEMBER|seller|3|25|DIRECT/THIRD_PARTY/V2/3%@25"]
);
// Self-purchase — Direct at 100%, nothing else.
assert.deepEqual(
  comps(generateCommission({ ...base, buyerIsActiveMember: true, soldByType: "MEMBER", soldByPersonId: "buyer", buyerHasPriorPurchase: true, terms: T("3", "1") })),
  ["DIRECT|SELLING_MEMBER|buyer|3|100|DIRECT/SELF_PURCHASE/V2/3%@100"]
);
// Customer closes — Loyalty to the closer.
assert.deepEqual(
  comps(generateCommission({ ...base, soldByType: "CUSTOMER", soldByPersonId: "closer", terms: T("3", "1") })),
  ["LOYALTY|CLOSING_CUSTOMER|closer|1|100|LOYALTY/INTRODUCED_BUYER/V2/1%@100"]
);
// 3% Club repeat purchase — Loyalty to the buyer.
assert.deepEqual(
  comps(generateCommission({ ...base, soldByType: "THREE_PERCENT_CLUB", buyerHasPriorPurchase: true, terms: T("3", "1") })),
  ["LOYALTY|REPEAT_PURCHASE_CUSTOMER|buyer|1|100|LOYALTY/REPEAT_PURCHASE/V2/1%@100"]
);
// 3% Club first purchase — nothing.
assert.deepEqual(comps(generateCommission({ ...base, soldByType: "THREE_PERCENT_CLUB", terms: T("3", "1") })), []);
// Member-closed repeat purchase — Direct only, never Loyalty (v2 §23).
assert.deepEqual(
  comps(generateCommission({ ...base, soldByType: "MEMBER", soldByPersonId: "seller", buyerHasPriorPurchase: true, terms: T("3", "1") })),
  ["DIRECT|SELLING_MEMBER|seller|3|25|DIRECT/THIRD_PARTY/V2/3%@25"]
);
// Direct Disabled, Loyalty Disabled, Deactivated Loyalty subject.
assert.deepEqual(comps(generateCommission({ ...base, soldByType: "MEMBER", soldByPersonId: "seller", terms: T(null, "1") })), []);
assert.deepEqual(comps(generateCommission({ ...base, soldByType: "CUSTOMER", soldByPersonId: "closer", terms: T("3", null) })), []);
assert.deepEqual(comps(generateCommission({ ...base, soldByType: "CUSTOMER", soldByPersonId: "closer", loyaltySubjectDeactivated: true, terms: T("3", "1") })), []);
assert.deepEqual(comps(generateCommission({ ...base, soldByType: "THREE_PERCENT_CLUB", buyerHasPriorPurchase: true, loyaltySubjectDeactivated: true, terms: T("3", "1") })), []);
// No cap, even at the 5% ceiling.
assert.deepEqual(
  comps(generateCommission({ ...base, soldByType: "MEMBER", soldByPersonId: "seller", terms: T("5", "3") })),
  ["DIRECT|SELLING_MEMBER|seller|5|25|DIRECT/THIRD_PARTY/V2/5%@25"]
);
// Kept conflicts, and the new one.
const conflict = (i: CommissionInput) => { const o = generateCommission(i); assert.equal(o.ok, false); return o.ok ? "" : o.conflict; };
assert.match(conflict({ ...base, buyerIsActiveMember: true, soldByType: "THREE_PERCENT_CLUB", terms: T("3", "1") }), /Active Member/);
assert.match(conflict({ ...base, soldByType: "MEMBER", terms: T("3", "1") }), /names no selling Member/);
assert.match(conflict({ ...base, soldByType: "CUSTOMER", terms: T("3", "1") }), /names no closing Customer/);
assert.match(conflict({ ...base, soldByType: "CUSTOMER", soldByPersonId: "buyer", terms: T("3", "1") }), /cannot close their own purchase/);
assert.match(conflict({ ...base, soldByType: "MEMBER", soldByPersonId: "seller", terms: null }), /no frozen commission settings/);

// Version validation (v2 §13).
const terms = (o: Partial<CommissionTermsInput>): CommissionTermsInput =>
  ({ directEnabled: true, directPercent: "3", loyaltyEnabled: true, loyaltyPercent: "1", loyaltyExceptionReason: null, ...o });
assert.ok(validateCommissionTerms(terms({})).ok);
assert.ok(validateCommissionTerms(terms({ directPercent: "5", loyaltyPercent: "3" })).ok);
assert.equal(validateCommissionTerms(terms({ directPercent: "5.01" })).ok, false);
assert.equal(validateCommissionTerms(terms({ loyaltyPercent: "3.01", loyaltyExceptionReason: "x" })).ok, false);
assert.equal(validateCommissionTerms(terms({ directPercent: "0" })).ok, false);           // Disabled, never 0%
assert.equal(validateCommissionTerms(terms({ directEnabled: false, directPercent: "3", loyaltyExceptionReason: "x" })).ok, false);
assert.equal(validateCommissionTerms(terms({ directEnabled: true, directPercent: null })).ok, false);
// Review Focus 1 — malformed and over-precise rates.
for (const bad of ["3.12345", "3,5", "abc", " ", "-1", "1e1"]) {
  assert.equal(validateCommissionTerms(terms({ directPercent: bad })).ok, false, bad);
}
// Review Focus 2 — equal is not lower.
assert.equal(validateCommissionTerms(terms({ directPercent: "3", loyaltyPercent: "3" })).ok, false);
assert.ok(validateCommissionTerms(terms({ directPercent: "3", loyaltyPercent: "3", loyaltyExceptionReason: "MD exception: launch offer" })).ok);
assert.equal(validateCommissionTerms(terms({ directEnabled: false, directPercent: null })).ok, false);
assert.ok(validateCommissionTerms(terms({ directEnabled: false, directPercent: null, loyaltyExceptionReason: "Loyalty only" })).ok);
assert.ok(validateCommissionTerms(terms({ directEnabled: false, directPercent: null, loyaltyEnabled: false, loyaltyPercent: null })).ok);
assert.equal(rateLabel("3.0000"), "3");
assert.equal(rateLabel("2.5000"), "2.5");

// Buyback accelerates Loyalty only (v2 §20, §21).
assert.equal(buybackAccelerates("LOYALTY"), true);
assert.equal(buybackAccelerates("DIRECT"), false);
assert.equal(buybackAccelerates("BUYING"), false);

// Eligibility without "No Benefit" or the cap.
const elig = (o: Partial<EligibilityInput>) => resolveEligibility({
  type: "DIRECT", progressPercent: "30", milestonePercent: "25",
  beneficiaryAadhaarAvailable: true, beneficiaryBankVerified: true,
  memberStatus: "ACTIVE", memberCommissionHold: false, reraStatus: "REGISTERED",
  bookingProcess: "NONE", acquisitionPaymentPending: false, ...o,
});
assert.deepEqual(elig({}), { state: "READY", holdReason: null });
assert.deepEqual(elig({ progressPercent: "20" }), { state: "MILESTONE_PENDING", holdReason: null });
assert.deepEqual(elig({ type: "LOYALTY", progressPercent: "20", milestonePercent: "100", buybackMilestoneMet: true, memberStatus: null, reraStatus: null }), { state: "READY", holdReason: null });
assert.deepEqual(elig({ memberStatus: "DEACTIVATED" }), { state: "ON_HOLD", holdReason: "MEMBER_DEACTIVATED" });

// previewInput — Loyalty subject is the closer on a Customer close, the buyer otherwise.
const person = (id: string, o: Partial<PersonFacts> = {}): PersonFacts =>
  ({ id, memberActive: false, memberDeactivated: false, hasPriorPurchase: false, ...o });
assert.equal(previewInput("CUSTOMER", person("closer", { memberDeactivated: true }), person("buyer"), T("3", "1")).loyaltySubjectDeactivated, true);
assert.equal(previewInput("THREE_PERCENT_CLUB", person("closer", { memberDeactivated: true }), person("buyer"), T("3", "1")).loyaltySubjectDeactivated, false);
assert.equal(previewInput("THREE_PERCENT_CLUB", null, person("buyer"), T("3", "1")).soldByPersonId, null);
```
Update the import list at the top of `domain.check.ts` to the new names (`FrozenTerms`, `CommissionTermsInput`, `CommissionInput`, `CommissionOutcome`, `EligibilityInput`, `PersonFacts`, `validateCommissionTerms`, `rateLabel`, `previewInput`, `generateCommission`, `buybackAccelerates`, `resolveEligibility`).

- [ ] **Step 2: Run to see it fail.**
Run: `node --import ./prisma/alias-loader.mjs src/lib/domain/domain.check.ts`
Expected: FAIL (`validateCommissionTerms` is not exported / the engine still emits `3%` without `V2`).

- [ ] **Step 3: Implement.** In `commission.ts`, delete everything listed under "Deleted". Replace the rates block and the components/engine section with:

```ts
/* ------------------------------------------------------------ v2 terms */

/** v2 §13 — hard ceilings. */
export const DIRECT_MAX_PERCENT = "5";
export const LOYALTY_MAX_PERCENT = "3";
/** v2 §19 — the ordinary Direct milestone is 25% verified Payment Received. */
export const DIRECT_MILESTONE = "25";
/** v2 §20, §21 — self-purchase Direct and every Loyalty settle at 100%. */
export const FULL_MILESTONE = "100";

/** A Project version as frozen on a Booking (v2 §16). A null percent is Disabled. */
export type FrozenTerms = { version: number; directPercent: string | null; loyaltyPercent: string | null };

export type CommissionTermsInput = {
  directEnabled: boolean;
  directPercent: string | null;
  loyaltyEnabled: boolean;
  loyaltyPercent: string | null;
  loyaltyExceptionReason: string | null;
};

/** Up to four decimals, which is what Decimal(7,4) stores without rounding. */
const RATE = /^\d{1,2}(\.\d{1,4})?$/;

/** "3.0000" → "3", "2.5000" → "2.5". The form every label and ruleVersion uses. */
export function rateLabel(percent: string): string {
  return new D(percent).toString();
}

/**
 * v2 §13 — "Customer Loyalty should be lower than Direct Commission"; MD may
 * approve an exception with a written reason. With Direct Disabled there is
 * nothing for Loyalty to be lower than, so that needs the exception too.
 */
export function needsLoyaltyException(t: CommissionTermsInput): boolean {
  if (!t.loyaltyEnabled || t.loyaltyPercent === null || !RATE.test(t.loyaltyPercent)) return false;
  if (!t.directEnabled || t.directPercent === null || !RATE.test(t.directPercent)) return true;
  return new D(t.loyaltyPercent).gte(new D(t.directPercent));
}

export function validateCommissionTerms(t: CommissionTermsInput): Check {
  const rate = (label: string, enabled: boolean, value: string | null, max: string): Check => {
    if (!enabled) {
      return value === null ? ok : fail(`${label} is Disabled, so it cannot carry a rate.`);
    }
    if (value === null || !RATE.test(value.trim())) {
      return fail(`${label} needs a rate such as 3 or 2.5, with at most four decimals.`);
    }
    const n = new D(value.trim());
    if (n.lte(0)) {
      return fail(`${label} cannot be 0%. A benefit that is not offered is set to Disabled.`);
    }
    if (n.gt(new D(max))) return fail(`${label} cannot exceed ${max}%.`);
    return ok;
  };
  const direct = rate("Direct Commission", t.directEnabled, t.directPercent, DIRECT_MAX_PERCENT);
  if (!direct.ok) return direct;
  const loyalty = rate("Customer Loyalty", t.loyaltyEnabled, t.loyaltyPercent, LOYALTY_MAX_PERCENT);
  if (!loyalty.ok) return loyalty;
  if (needsLoyaltyException(t) && !t.loyaltyExceptionReason?.trim()) {
    return fail(
      t.directEnabled
        ? "Customer Loyalty is not lower than Direct Commission. Write the reason for the MD exception."
        : "Customer Loyalty is offered without Direct Commission. Write the reason for the MD exception."
    );
  }
  return ok;
}

/* ---------------------------------------------------------- the components */

export type CommissionType = "DIRECT" | "LOYALTY";

export type BeneficiaryRole = "SELLING_MEMBER" | "CLOSING_CUSTOMER" | "REPEAT_PURCHASE_CUSTOMER";

export type Component = {
  type: CommissionType;
  beneficiaryRole: BeneficiaryRole;
  beneficiaryPersonId: string;
  percent: string;
  milestonePercent: string;
  /** The rule and Project version the percentage came from, frozen for traceability. */
  ruleVersion: string;
};

export type CommissionInput = {
  soldByType: "THREE_PERCENT_CLUB" | "MEMBER" | "CUSTOMER";
  soldByPersonId: string | null;
  /** The Primary Customer — the commercial buyer of this Booking. */
  buyerPersonId: string;
  /** v2 §20 — frozen at Booking Request submission, never re-read. */
  buyerIsActiveMember: boolean;
  /** v2 §23 — an earlier approved, uncancelled purchase makes this a repeat. */
  buyerHasPriorPurchase: boolean;
  /** v2 §16 — the Project version frozen at submission; null if none was. */
  terms: FrozenTerms | null;
  /** v2 §24 — the Person who would earn Loyalty held a Deactivated Member capability. */
  loyaltySubjectDeactivated: boolean;
};

export type CommissionOutcome =
  | { ok: true; components: Component[]; totalPercent: Decimal }
  /** Shown as Commission Conflict, corrected by CRM/Admin. */
  | { ok: false; conflict: string };

/**
 * The facts a screen holds about one Person — the Calculator's input, built
 * without a Booking. Loyalty follows the closing Customer on a Customer close,
 * and the buyer otherwise (v2 §21–§23).
 */
export type PersonFacts = {
  id: string;
  memberActive: boolean;
  memberDeactivated: boolean;
  hasPriorPurchase: boolean;
};

export function previewInput(
  soldByType: CommissionInput["soldByType"],
  seller: PersonFacts | null,
  buyer: PersonFacts,
  terms: FrozenTerms | null
): CommissionInput {
  const loyaltySubject = soldByType === "CUSTOMER" ? seller : buyer;
  return {
    soldByType,
    soldByPersonId: soldByType === "THREE_PERCENT_CLUB" ? null : (seller?.id ?? null),
    buyerPersonId: buyer.id,
    buyerIsActiveMember: buyer.memberActive,
    buyerHasPriorPurchase: buyer.hasPriorPurchase,
    terms,
    loyaltySubjectDeactivated: loyaltySubject?.memberDeactivated ?? false,
  };
}

const done = (components: Component[]): CommissionOutcome =>
  ({ ok: true, components, totalPercent: totalOf(components) });

/**
 * v2 §11, §19–§24, row by row. The final Sold By controls commission. One sale
 * never pays both Direct and Loyalty, and there is no combined cap (v2 §11).
 */
export function generateCommission(input: CommissionInput): CommissionOutcome {
  const terms = input.terms;
  if (!terms) {
    return {
      ok: false,
      conflict:
        "This Booking has no frozen commission settings. Send the Booking Request again so it " +
        "freezes the Project's approved settings.",
    };
  }
  const v = `V${terms.version}`;
  const direct = (personId: string, rule: "THIRD_PARTY" | "SELF_PURCHASE"): Component[] => {
    if (terms.directPercent === null) return [];
    const milestone = rule === "SELF_PURCHASE" ? FULL_MILESTONE : DIRECT_MILESTONE;
    const rate = rateLabel(terms.directPercent);
    return [{
      type: "DIRECT",
      beneficiaryRole: "SELLING_MEMBER",
      beneficiaryPersonId: personId,
      percent: rate,
      milestonePercent: milestone,
      ruleVersion: `DIRECT/${rule}/${v}/${rate}%@${milestone}`,
    }];
  };
  const loyalty = (
    personId: string,
    role: "CLOSING_CUSTOMER" | "REPEAT_PURCHASE_CUSTOMER"
  ): Component[] => {
    if (terms.loyaltyPercent === null || input.loyaltySubjectDeactivated) return [];
    const rate = rateLabel(terms.loyaltyPercent);
    const rule = role === "CLOSING_CUSTOMER" ? "INTRODUCED_BUYER" : "REPEAT_PURCHASE";
    return [{
      type: "LOYALTY",
      beneficiaryRole: role,
      beneficiaryPersonId: personId,
      percent: rate,
      milestonePercent: FULL_MILESTONE,
      ruleVersion: `LOYALTY/${rule}/${v}/${rate}%@${FULL_MILESTONE}`,
    }];
  };

  /* v2 §20 — an Active Member buying personally: Direct at 100%, nothing else. */
  if (input.buyerIsActiveMember) {
    if (input.soldByType !== "MEMBER" || input.soldByPersonId !== input.buyerPersonId) {
      return {
        ok: false,
        conflict:
          "The buyer holds an Active Member capability, so this is a Member personal purchase and " +
          "Sold By must name that same Member. Correct Sold By before Accounts approval.",
      };
    }
    return done(direct(input.buyerPersonId, "SELF_PURCHASE"));
  }

  /* v2 §19 — a Member closes a third-party sale: Direct at 25%. */
  if (input.soldByType === "MEMBER") {
    if (!input.soldByPersonId) return { ok: false, conflict: "Sold By Member names no selling Member." };
    return done(direct(input.soldByPersonId, "THIRD_PARTY"));
  }

  /* v2 §22 — a Customer closes for a different buyer: Loyalty to the closer. */
  if (input.soldByType === "CUSTOMER") {
    if (!input.soldByPersonId) return { ok: false, conflict: "Sold By Customer names no closing Customer." };
    if (input.soldByPersonId === input.buyerPersonId) {
      return {
        ok: false,
        conflict:
          "A Customer cannot close their own purchase as Sold By Customer. A repeat personal " +
          "purchase is recorded as a 3% Club direct sale.",
      };
    }
    return done(loyalty(input.soldByPersonId, "CLOSING_CUSTOMER"));
  }

  /* v2 §23 — 3% Club: a repeat purchase earns Loyalty for the buyer; a first earns nothing. */
  return done(input.buyerHasPriorPurchase ? loyalty(input.buyerPersonId, "REPEAT_PURCHASE_CUSTOMER") : []);
}
```

Then in the eligibility section:
- `export type EligibilityState = "MILESTONE_PENDING" | "READY" | "ON_HOLD";`
- `eligibilityLabel(state: string)` — drop the `type` parameter and the `NO_BENEFIT` case.
- `HoldReason` — drop `"COMMISSION_CONFLICT_ABOVE_4"`.
- `buybackAccelerates` body → `return type === "LOYALTY";` and its comment → "v2 §20, §21 — an Approved Buyback is the alternative milestone for Loyalty only; it never accelerates Direct."
- `EligibilityInput` — remove `percent` and `commissionConflictAbove4`.
- `MEMBER_ROLES` → `["DIRECT"]`.
- `resolveEligibility` — delete the 0% block and the cap line; delete the CR-004 comment block.
- `canMarkPaid` — delete the `NO_BENEFIT` branch.
- Rewrite the file header comment to cite v2 §11–§25 instead of the band/cap references.

- [ ] **Step 4: Run to see it pass.**
Run: `node --import ./prisma/alias-loader.mjs src/lib/domain/domain.check.ts`
Expected: exits 0 with the suite's OK line.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/domain/commission.ts src/lib/domain/completion.ts src/lib/domain/domain.check.ts
git commit -m "feat: the commission engine reads a Project's frozen Direct and Loyalty terms"
```

---

### Task 2: Schema, migration, constraints and the seed helper

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261009120000_business_model_v2_money/migration.sql` (generated)
- Modify: `prisma/constraints.sql`, `prisma/reset-data.ts`, `prisma/check-cleanup.ts`, `prisma/seed.ts`
- Create: `prisma/seed-commission.ts`

**Interfaces — Produces:** Prisma model `projectCommissionVersion`; enum `CommissionVersionStatus`; `Booking.commissionVersionId`, `Booking.commissionVersion`, `Booking.loyaltySubjectDeactivated`; `ensureActiveCommissionVersion(db: PrismaClient, projectId: string, actorRef: string): Promise<{ id: string; version: number }>`.

- [ ] **Step 1: Edit the schema.** Add next to `PlcRuleVersion`:

```prisma
/// v2 §12–§15 — a Project's Direct and Loyalty terms. Every change is a new
/// version; Admin prepares, MD approves, and an Active version is never edited.
enum CommissionVersionStatus {
  DRAFT
  PENDING_APPROVAL
  ACTIVE
  SUPERSEDED
  REJECTED
}

model ProjectCommissionVersion {
  id        String                  @id @default(uuid())
  projectId String
  project   Project                 @relation(fields: [projectId], references: [id])
  /// 1, 2, 3 … per Project; never reused.
  version   Int
  status    CommissionVersionStatus @default(DRAFT)

  /// v2 §13 — Enabled ⇔ a rate. A benefit not offered is Disabled, never 0%.
  directEnabled          Boolean
  directPercent          Decimal? @db.Decimal(7, 4)
  /// v2 §21 — one rate for both Loyalty routes.
  loyaltyEnabled         Boolean
  loyaltyPercent         Decimal? @db.Decimal(7, 4)
  /// v2 §13 — required when Loyalty is not lower than Direct.
  loyaltyExceptionReason String?

  reason        String
  preparedByRef String
  preparedAt    DateTime  @default(now())
  submittedAt   DateTime?
  decidedByRef  String?
  decidedAt     DateTime?
  decisionNote  String?
  effectiveFrom DateTime?
  effectiveTo   DateTime?

  bookings Booking[]

  @@unique([projectId, version])
}
```
On `Project` add `commissionVersions ProjectCommissionVersion[]`.
On `Booking` add:
```prisma
  /// v2 §16 — the Project's Active commission version, frozen at Booking
  /// Request submission and again on each corrected submission.
  commissionVersionId       String?
  commissionVersion         ProjectCommissionVersion? @relation(fields: [commissionVersionId], references: [id])
  /// v2 §24 — the Person who would earn Loyalty held a Deactivated Member
  /// capability at submission. Re-read on a Sold By Correction.
  loyaltySubjectDeactivated Boolean @default(false)
```
Update the `originalClassification` doc comment on Booking: "frozen at Booking Request submission (v2 §16)".

Remove: `INVITE`, `ROYALTY` from `CommissionType`; `INVITING_MEMBER`, `INTRODUCING_MEMBER` from `BeneficiaryRole`; `NO_BENEFIT` from `EligibilityState`; `COMMISSION_CONFLICT_ABOVE_4` (and the stray AC-02 comment) from `CommissionHoldReason`; models `CommissionOpportunity`, `PerformanceCycle` and enums `OpportunityKind`, `OpportunityStatus`, `PerformanceCycleKind`, `PerformanceCycleStatus`; `CommissionRecord.opportunityId` + its relation; every back-relation to those models on `Person`, `MemberProfile`, `CustomerProfile`, `Booking`; `MemberProfile.invitePosition/inviteRatePercent/inviteYearStart/inviteCycleId`; `CustomerProfile.introducedPosition/introducedRatePercent/introducedYearStart/royaltyPosition/royaltyRatePercent/royaltyYearStart/royaltyCycleId/loyaltySlotsConsumed`. Keep `invitedByMemberId`, `royaltyLinkedMemberId`, `royaltyLinkFirstBookingId`, `royaltyLinkFinalAt`, and `PersonMerge.loyaltyRebuiltTo` (historical, no longer written).

Run: `npx prisma validate` → Expected: "The schema at prisma/schema.prisma is valid".

- [ ] **Step 2: Reset the mock data and drop the DB objects the migration would otherwise trip on.**
Run: `npm run data:reset`
Expected: completes (it still runs against the old client, so do this **before** `prisma generate`).

- [ ] **Step 3: Generate the migration from the live database to the new schema.**
```bash
mkdir -p prisma/migrations/20261009120000_business_model_v2_money
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261009120000_business_model_v2_money/migration.sql
```
Open the file and check it: it must create the enum + table + two Booking columns, drop the two tables, the columns and the enum values, and contain **no** statement touching tables unrelated to this change. Prepend these lines (the 4% trigger and the 3-slot CHECK live outside Prisma and reference removed columns):
```sql
-- Business Model v2 part 1 — money rules (v2 §1, §11–§25).
DROP TRIGGER IF EXISTS "sale_commission_within_4_percent" ON "CommissionRecord";
DROP FUNCTION IF EXISTS trg_sale_commission_cap();
DROP FUNCTION IF EXISTS assert_sale_commission_cap(text);
ALTER TABLE "CustomerProfile" DROP CONSTRAINT IF EXISTS "loyalty_slots_max_three";
```

- [ ] **Step 4: Apply it.**
Run: `npx prisma migrate deploy && npx prisma generate`
Expected: "All migrations have been successfully applied."

- [ ] **Step 5: Update `constraints.sql`.** Delete the `loyalty_slots_max_three` block (lines 21–24), the three `CommissionOpportunity` blocks, and the whole RD-03 cap function/trigger block. Change `commission_percent_bounds` to `("type" <> 'BUYING' AND "percent" <= 5)` with comment "v2 §13 — no sale component exceeds the 5% Direct ceiling". Append:

```sql
-- ------------------------------------------------- Business Model v2 part 1

-- v2 §13 — Enabled ⇔ a rate; ceilings 5% Direct and 3% Loyalty; never 0%.
ALTER TABLE "ProjectCommissionVersion" DROP CONSTRAINT IF EXISTS "direct_enabled_has_rate";
ALTER TABLE "ProjectCommissionVersion" ADD CONSTRAINT "direct_enabled_has_rate"
  CHECK (("directEnabled" AND "directPercent" > 0 AND "directPercent" <= 5)
      OR (NOT "directEnabled" AND "directPercent" IS NULL));
ALTER TABLE "ProjectCommissionVersion" DROP CONSTRAINT IF EXISTS "loyalty_enabled_has_rate";
ALTER TABLE "ProjectCommissionVersion" ADD CONSTRAINT "loyalty_enabled_has_rate"
  CHECK (("loyaltyEnabled" AND "loyaltyPercent" > 0 AND "loyaltyPercent" <= 3)
      OR (NOT "loyaltyEnabled" AND "loyaltyPercent" IS NULL));

-- v2 §13 — Loyalty not lower than Direct needs the MD exception's written reason.
ALTER TABLE "ProjectCommissionVersion" DROP CONSTRAINT IF EXISTS "loyalty_exception_has_reason";
ALTER TABLE "ProjectCommissionVersion" ADD CONSTRAINT "loyalty_exception_has_reason"
  CHECK (NOT "loyaltyEnabled"
      OR ("directEnabled" AND "loyaltyPercent" < "directPercent")
      OR length(trim(coalesce("loyaltyExceptionReason", ''))) > 0);

-- v2 §14 — an approved version carries its approver; a sent one, its time.
ALTER TABLE "ProjectCommissionVersion" DROP CONSTRAINT IF EXISTS "commission_version_stamps";
ALTER TABLE "ProjectCommissionVersion" ADD CONSTRAINT "commission_version_stamps"
  CHECK (("status" NOT IN ('ACTIVE', 'SUPERSEDED')
          OR ("decidedByRef" IS NOT NULL AND "effectiveFrom" IS NOT NULL))
     AND ("status" = 'DRAFT' OR "submittedAt" IS NOT NULL));

-- v2 §14 — at most one Active, and at most one Draft-or-Pending, per Project.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_commission_version_per_project"
  ON "ProjectCommissionVersion" ("projectId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS "one_open_commission_version_per_project"
  ON "ProjectCommissionVersion" ("projectId") WHERE "status" IN ('DRAFT', 'PENDING_APPROVAL');

-- v2 §21 — Loyalty is unlimited per Customer, but one sale earns it once.
CREATE UNIQUE INDEX IF NOT EXISTS "one_current_loyalty_per_booking"
  ON "CommissionRecord" ("bookingId") WHERE "type" = 'LOYALTY' AND "isCurrent" = true;
```
Run: `npm run db:constraints` → Expected: "Script executed successfully."

- [ ] **Step 6: The seed helper.** Create `prisma/seed-commission.ts`:

```ts
// v2 §14 — every seeded Project needs an approved commission version before a
// Booking Request can be submitted on it. Direct 3%, Loyalty 1%, so the mock
// scenarios still read naturally (design spec §7).
import type { PrismaClient } from "@prisma/client";

export async function ensureActiveCommissionVersion(
  db: PrismaClient,
  projectId: string,
  actorRef: string
): Promise<{ id: string; version: number }> {
  const active = await db.projectCommissionVersion.findFirst({ where: { projectId, status: "ACTIVE" } });
  if (active) return active;
  const latest = await db.projectCommissionVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const now = new Date();
  return db.projectCommissionVersion.create({
    data: {
      projectId,
      version: (latest?.version ?? 0) + 1,
      status: "ACTIVE",
      directEnabled: true,
      directPercent: "3",
      loyaltyEnabled: true,
      loyaltyPercent: "1",
      reason: "Seeded mock settings",
      preparedByRef: actorRef,
      submittedAt: now,
      decidedByRef: actorRef,
      decidedAt: now,
      decisionNote: "Seeded",
      effectiveFrom: now,
    },
  });
}
```
Call it in `prisma/seed.ts` right after the GRN PLC version is ensured: `await ensureActiveCommissionVersion(db, project.id, "SEED");`, and log the version in the final `console.log`.

- [ ] **Step 7: Cleanup scripts.** `reset-data.ts`: delete the `commissionOpportunity`, `inviteCycleId`, `royaltyCycleId` and `performanceCycle` lines; add `await db.projectCommissionVersion.deleteMany({});` after `db.booking.deleteMany` and before Projects are deleted. `check-cleanup.ts`: same removals, and delete `projectCommissionVersion` rows for TAG projects (`where: { project: { projectCode: { startsWith: tag } } }`) after their Bookings and before their Projects. Also delete the Membership invitation tasks of TAG Customers along with the other TAG tasks (they are `recordKind: "Customer"`; follow how the file already removes tasks by record id).

- [ ] **Step 8: Verify.**
Run: `npm run db:seed && node --env-file=.env -e "const{PrismaClient}=require('@prisma/client');new PrismaClient().projectCommissionVersion.findMany().then(r=>{console.log(r.map(v=>v.status+' '+v.directPercent));process.exit(0)})"`
Expected: one `ACTIVE 3` line for GRN.

- [ ] **Step 9: Commit.**
```bash
git add prisma/schema.prisma prisma/migrations/20261009120000_business_model_v2_money prisma/constraints.sql prisma/seed-commission.ts prisma/seed.ts prisma/reset-data.ts prisma/check-cleanup.ts
git commit -m "feat: Projects carry versioned commission settings; bands, cycles and the cap leave the schema"
```

---

### Task 3: Commission settings service and its approval-flow suite

**Files:**
- Create: `src/lib/services/commission-settings-service.ts`
- Create: `prisma/commission-settings.check.ts`
- Modify: `package.json` (script `commission-settings:check`, added to `db:check` right after `booking:check`)

**Interfaces — Consumes:** `validateCommissionTerms`, `CommissionTermsInput` (Task 1); `projectCommissionVersion` (Task 2); `blocked`, `lockKey`, `runCommand`, `Tx` from `./command`.
**Produces:**
```ts
export type CommissionVersionInput = CommissionTermsInput & { reason: string };
export function prepareCommissionDraft(args: { idempotencyKey; actorRef; actorRole; projectId: string } & CommissionVersionInput): Promise<{ versionId: string; version: number }>;
export function sendCommissionVersion(args: { idempotencyKey; actorRef; actorRole; versionId: string }): Promise<{ versionId: string; version: number }>;
export function decideCommissionVersion(args: { idempotencyKey; actorRef; actorRole; versionId: string; approve: boolean; note: string }): Promise<{ versionId: string; version: number; status: "ACTIVE" | "REJECTED"; supersededVersion: number | null }>;
export function listCommissionVersions(projectId: string): Promise<ProjectCommissionVersion[]>;  // newest first
```

- [ ] **Step 1: Write the failing suite** `prisma/commission-settings.check.ts`:

```ts
// v2 §12–§15 — the commission settings approval flow, against the real database.
// Run: npm run commission-settings:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";
assertCheckDatabase();
import { purgeCheckData } from "./check-cleanup.ts";
import {
  decideCommissionVersion,
  listCommissionVersions,
  prepareCommissionDraft,
  sendCommissionVersion,
} from "@/lib/services/commission-settings-service";

const db = new PrismaClient();
const TAG = "ZZ-CSET";
let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;
const ADMIN = { actorRef: `${TAG}-ADMIN`, actorRole: "ADMIN" };
const MD = { actorRef: `${TAG}-MD`, actorRole: "MD" };
const terms = { directEnabled: true, directPercent: "3", loyaltyEnabled: true, loyaltyPercent: "1", loyaltyExceptionReason: null, reason: "Launch terms" };

async function main() {
  await purgeCheckData(db, TAG);
  const project = await db.project.create({
    data: { projectCode: `${TAG}P`.slice(0, 9), name: `${TAG} Project`, type: "RESIDENTIAL" },
  });
  const projectId = project.id;

  // Only Admin prepares (Review Focus 4: PC holds PROJECT_SETUP but may not).
  for (const role of ["MD", "PC", "CRM", "ACCOUNTS"]) {
    await assert.rejects(
      prepareCommissionDraft({ idempotencyKey: key(), actorRef: `${TAG}-${role}`, actorRole: role, projectId, ...terms }),
      /Only Admin prepares/
    );
  }

  // Validation reaches the service too.
  await assert.rejects(
    prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms, directPercent: "6" }),
    /cannot exceed 5%/
  );
  await assert.rejects(
    prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms, reason: " " }),
    /reason/
  );

  const v1 = await prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms });
  assert.equal(v1.version, 1);

  // Editing the Draft keeps the same version.
  const edited = await prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms, directPercent: "3.5" });
  assert.equal(edited.versionId, v1.versionId);
  assert.equal((await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v1.versionId } })).directPercent?.toString(), "3.5");

  // Only Admin sends; MD cannot approve a Draft that was never sent.
  await assert.rejects(sendCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v1.versionId }), /Only Admin sends/);
  await assert.rejects(decideCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v1.versionId, approve: true, note: "ok" }), /not waiting for MD/);
  await sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v1.versionId });

  // Review Focus 5 — a sent version is no longer editable, and no second open version is allowed.
  await assert.rejects(
    prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms }),
    /waiting for MD/
  );

  // Admin cannot approve; MD needs a note to reject.
  await assert.rejects(decideCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v1.versionId, approve: true, note: "ok" }), /Only MD/);
  await assert.rejects(decideCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v1.versionId, approve: false, note: " " }), /note/);

  const approved = await decideCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v1.versionId, approve: true, note: "Approved" });
  assert.equal(approved.status, "ACTIVE");
  assert.equal(approved.supersededVersion, null);
  const active1 = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v1.versionId } });
  assert.ok(active1.effectiveFrom && active1.decidedByRef === MD.actorRef);

  // Version 2, rejected with a note; version 1 stays Active.
  const v2 = await prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms, loyaltyEnabled: false, loyaltyPercent: null, reason: "No Loyalty" });
  assert.equal(v2.version, 2);
  await sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v2.versionId });
  const rejected = await decideCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v2.versionId, approve: false, note: "Keep Loyalty" });
  assert.equal(rejected.status, "REJECTED");
  assert.equal((await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v1.versionId } })).status, "ACTIVE");

  // A rejected version cannot be sent or decided again.
  await assert.rejects(sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v2.versionId }), /Only a Draft/);

  // Version 3 approved supersedes version 1.
  const v3 = await prepareCommissionDraft({ idempotencyKey: key(), ...ADMIN, projectId, ...terms, directPercent: "4", reason: "Raise Direct" });
  assert.equal(v3.version, 3);
  await sendCommissionVersion({ idempotencyKey: key(), ...ADMIN, versionId: v3.versionId });
  const approved3 = await decideCommissionVersion({ idempotencyKey: key(), ...MD, versionId: v3.versionId, approve: true, note: "Approved" });
  assert.equal(approved3.supersededVersion, 1);
  const old = await db.projectCommissionVersion.findUniqueOrThrow({ where: { id: v1.versionId } });
  assert.equal(old.status, "SUPERSEDED");
  assert.ok(old.effectiveTo);

  const listed = await listCommissionVersions(projectId);
  assert.deepEqual(listed.map((v) => `${v.version}:${v.status}`), ["3:ACTIVE", "2:REJECTED", "1:SUPERSEDED"]);

  await purgeCheckData(db, TAG);
  console.log("commission-settings.check.ts OK");
}

main().then(() => db.$disconnect(), async (error) => {
  console.error(error);
  await purgeCheckData(db, TAG).catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
```
Add to `package.json`: `"commission-settings:check": "node --env-file=.env --import ./prisma/alias-loader.mjs prisma/commission-settings.check.ts"`.

- [ ] **Step 2: Run to see it fail.**
Run: `npm run commission-settings:check`
Expected: FAIL — cannot resolve `@/lib/services/commission-settings-service`.

- [ ] **Step 3: Implement** `src/lib/services/commission-settings-service.ts`:

```ts
// Project commission settings — v2 §12–§15. Admin prepares and sends; MD
// approves or rejects. An approved version is Active at once and supersedes the
// previous one; nothing is ever edited after it leaves Draft.

import { db } from "@/lib/db";
import { validateCommissionTerms, type CommissionTermsInput } from "@/lib/domain/commission";
import { blocked, lockKey, runCommand, type Tx } from "./command";

export type CommissionVersionInput = CommissionTermsInput & { reason: string };

type Actor = { idempotencyKey: string; actorRef: string; actorRole: string };

const termsData = (t: CommissionVersionInput) => ({
  directEnabled: t.directEnabled,
  directPercent: t.directEnabled ? t.directPercent!.trim() : null,
  loyaltyEnabled: t.loyaltyEnabled,
  loyaltyPercent: t.loyaltyEnabled ? t.loyaltyPercent!.trim() : null,
  loyaltyExceptionReason: t.loyaltyExceptionReason?.trim() || null,
  reason: t.reason.trim(),
});

/** Serialises every write to one Project's versions (v2 §14, "no silent overwrite"). */
const lockProject = (tx: Tx, projectId: string) => lockKey(tx, `commission-version:${projectId}`);

/**
 * v2 §14 step 1 — Admin creates the Draft, or edits it while it is still one.
 * A Draft is the only state that can be edited.
 */
export async function prepareCommissionDraft(args: Actor & { projectId: string } & CommissionVersionInput) {
  if (args.actorRole !== "ADMIN") blocked("Only Admin prepares commission settings.");
  if (!args.reason.trim()) blocked("A compulsory reason is required for a commission settings version.");
  const valid = validateCommissionTerms(args);
  if (!valid.ok) blocked(valid.reason);

  return runCommand<{ versionId: string; version: number }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_VERSION_PREPARE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { projectId: args.projectId, ...termsData(args) },
    },
    async (tx) => {
      await lockProject(tx, args.projectId);
      const open = await tx.projectCommissionVersion.findFirst({
        where: { projectId: args.projectId, status: { in: ["DRAFT", "PENDING_APPROVAL"] } },
      });
      if (open?.status === "PENDING_APPROVAL") {
        blocked(`Version ${open.version} is waiting for MD. It can no longer be edited.`);
      }

      const saved = open
        ? await tx.projectCommissionVersion.update({
            where: { id: open.id },
            data: { ...termsData(args), preparedByRef: args.actorRef, preparedAt: new Date() },
          })
        : await tx.projectCommissionVersion.create({
            data: {
              projectId: args.projectId,
              version:
                ((
                  await tx.projectCommissionVersion.findFirst({
                    where: { projectId: args.projectId },
                    orderBy: { version: "desc" },
                    select: { version: true },
                  })
                )?.version ?? 0) + 1,
              ...termsData(args),
              preparedByRef: args.actorRef,
            },
          });

      return {
        result: { versionId: saved.id, version: saved.version },
        audit: {
          entity: "Project",
          entityId: args.projectId,
          action: open ? "COMMISSION_VERSION_EDITED" : "COMMISSION_VERSION_DRAFTED",
          after: { version: saved.version, ...termsData(args) },
          reason: args.reason,
        },
      };
    }
  );
}

/** v2 §14 step 2 — Admin sends the Draft to MD; it can no longer be edited. */
export async function sendCommissionVersion(args: Actor & { versionId: string }) {
  if (args.actorRole !== "ADMIN") blocked("Only Admin sends commission settings to MD.");
  return runCommand<{ versionId: string; version: number }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_VERSION_SEND",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { versionId: args.versionId },
    },
    async (tx) => {
      const found = await tx.projectCommissionVersion.findUnique({ where: { id: args.versionId } });
      if (!found) blocked("That commission settings version no longer exists.");
      await lockProject(tx, found.projectId);
      const version = await tx.projectCommissionVersion.findUniqueOrThrow({ where: { id: args.versionId } });
      if (version.status !== "DRAFT") blocked("Only a Draft can be edited or sent.");
      await tx.projectCommissionVersion.update({
        where: { id: version.id },
        data: { status: "PENDING_APPROVAL", submittedAt: new Date() },
      });
      return {
        result: { versionId: version.id, version: version.version },
        audit: {
          entity: "Project",
          entityId: version.projectId,
          action: "COMMISSION_VERSION_SENT",
          after: { version: version.version },
        },
      };
    }
  );
}

/**
 * v2 §14 steps 3–4 — MD approves (Active at once, previous Active superseded)
 * or rejects with a note. MD's approval is also the MD exception of v2 §13.
 */
export async function decideCommissionVersion(
  args: Actor & { versionId: string; approve: boolean; note: string }
) {
  if (args.actorRole !== "MD") blocked("Only MD approves or rejects commission settings.");
  if (!args.note.trim()) blocked("A compulsory note is required on the MD decision.");

  return runCommand<{
    versionId: string;
    version: number;
    status: "ACTIVE" | "REJECTED";
    supersededVersion: number | null;
  }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "COMMISSION_VERSION_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { versionId: args.versionId, approve: args.approve },
    },
    async (tx) => {
      const found = await tx.projectCommissionVersion.findUnique({ where: { id: args.versionId } });
      if (!found) blocked("That commission settings version no longer exists.");
      await lockProject(tx, found.projectId);
      const version = await tx.projectCommissionVersion.findUniqueOrThrow({ where: { id: args.versionId } });
      if (version.status !== "PENDING_APPROVAL") {
        blocked(`Version ${version.version} is not waiting for MD.`);
      }
      const now = new Date();
      const decision = { decidedByRef: args.actorRef, decidedAt: now, decisionNote: args.note.trim() };

      if (!args.approve) {
        await tx.projectCommissionVersion.update({
          where: { id: version.id },
          data: { status: "REJECTED", ...decision },
        });
        return {
          result: { versionId: version.id, version: version.version, status: "REJECTED" as const, supersededVersion: null },
          audit: {
            entity: "Project",
            entityId: version.projectId,
            action: "COMMISSION_VERSION_REJECTED",
            after: { version: version.version },
            reason: args.note,
          },
        };
      }

      const current = await tx.projectCommissionVersion.findFirst({
        where: { projectId: version.projectId, status: "ACTIVE" },
      });
      if (current) {
        await tx.projectCommissionVersion.update({
          where: { id: current.id },
          data: { status: "SUPERSEDED", effectiveTo: now },
        });
      }
      await tx.projectCommissionVersion.update({
        where: { id: version.id },
        data: { status: "ACTIVE", effectiveFrom: now, ...decision },
      });

      return {
        result: {
          versionId: version.id,
          version: version.version,
          status: "ACTIVE" as const,
          supersededVersion: current?.version ?? null,
        },
        audit: {
          entity: "Project",
          entityId: version.projectId,
          action: "COMMISSION_VERSION_APPROVED",
          before: current ? { version: current.version } : undefined,
          after: {
            version: version.version,
            directPercent: version.directPercent?.toString() ?? null,
            loyaltyPercent: version.loyaltyPercent?.toString() ?? null,
            loyaltyExceptionReason: version.loyaltyExceptionReason,
          },
          reason: args.note,
        },
      };
    }
  );
}

/** Newest first: the Active one, any Draft or Pending, and the history. */
export function listCommissionVersions(projectId: string) {
  return db.projectCommissionVersion.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
  });
}
```
Check `runCommand`'s audit type accepts `before: undefined` (it does for `publishPlcVersion`). If `lockKey` is not exported from `./command`, it is: `commission-service.ts` imports it.

- [ ] **Step 4: Run to see it pass.**
Run: `npm run commission-settings:check`
Expected: `commission-settings.check.ts OK`.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/services/commission-settings-service.ts prisma/commission-settings.check.ts package.json
git commit -m "feat: Admin prepares a Project's commission settings and MD approves them"
```

---

### Task 4: Freeze at submission, and the v2 commission pipeline

**Files:**
- Modify: `src/lib/services/commission-service.ts`
- Modify: `src/lib/services/booking-service.ts` (submit, revise, decide, Sold By Correction)
- Modify: `src/lib/services/network-service.ts`, `src/lib/jobs.ts`, `src/lib/services/merge-service.ts`, `src/lib/services/report-service.ts`, `src/lib/migration/reconcile.ts`, `src/lib/migration/backfill-classification.ts`
- Delete: `src/lib/services/cycle-service.ts`

**Interfaces — Consumes:** Task 1 engine; Task 2 schema.
**Produces (commission-service):**
```ts
export function termsOf(v: { version: number; directEnabled: boolean; directPercent: Prisma.Decimal | null; loyaltyEnabled: boolean; loyaltyPercent: Prisma.Decimal | null }): FrozenTerms;
export function loyaltySubjectDeactivated(tx: Tx, args: { soldByType: SoldByType; soldByPersonId: string | null; buyerPersonId: string }): Promise<boolean>;
export function freezeAtSubmission(tx: Tx, args: { projectId: string; soldByType: SoldByType; soldByPersonId: string | null; buyerPersonId: string }): Promise<{
  commissionVersionId: string; originalClassification: "MEMBER" | "CUSTOMER"; loyaltySubjectDeactivated: boolean; terms: FrozenTerms;
}>;
export const MEMBERSHIP_INVITATION_PURPOSE = "MEMBERSHIP_INVITATION";
```
`generateForBooking`, `reassessCommission`, `cancelCommissionForBooking`, `previewCommission`, `commissionInputFor` keep their signatures.

No new test file in this task: its behaviour is pinned by the rewritten `commission.check.ts` in Task 7. Verification here is the type check of `src/lib`.

- [ ] **Step 1: Freeze helpers** — add to `commission-service.ts` (import `SoldByType` from `@prisma/client`, `FrozenTerms` from the domain):

```ts
/** A Project version in the engine's terms. Disabled is null, never 0. */
export function termsOf(v: {
  version: number;
  directEnabled: boolean;
  directPercent: Prisma.Decimal | null;
  loyaltyEnabled: boolean;
  loyaltyPercent: Prisma.Decimal | null;
}): FrozenTerms {
  return {
    version: v.version,
    directPercent: v.directEnabled && v.directPercent ? v.directPercent.toString() : null,
    loyaltyPercent: v.loyaltyEnabled && v.loyaltyPercent ? v.loyaltyPercent.toString() : null,
  };
}

/** v2 §24 — the would-be Loyalty earner: the closer on a Customer close, else the buyer. */
export async function loyaltySubjectDeactivated(
  tx: Tx,
  args: { soldByType: SoldByType; soldByPersonId: string | null; buyerPersonId: string }
): Promise<boolean> {
  const subject =
    args.soldByType === "CUSTOMER" ? (args.soldByPersonId ?? args.buyerPersonId) : args.buyerPersonId;
  const member = await tx.memberProfile.findUnique({ where: { personId: subject }, select: { status: true } });
  return member?.status === "DEACTIVATED";
}

/**
 * v2 §16 — what a Booking Request freezes when it is submitted, and again when
 * a corrected request is sent. Accounts approval makes it permanent.
 */
export async function freezeAtSubmission(
  tx: Tx,
  args: { projectId: string; soldByType: SoldByType; soldByPersonId: string | null; buyerPersonId: string }
) {
  const version = await tx.projectCommissionVersion.findFirst({
    where: { projectId: args.projectId, status: "ACTIVE" },
  });
  if (!version) blocked("This Project has no approved commission settings.");
  const buyer = await tx.memberProfile.findUnique({
    where: { personId: args.buyerPersonId },
    select: { status: true },
  });
  return {
    commissionVersionId: version.id,
    originalClassification: (buyer?.status === "ACTIVE" ? "MEMBER" : "CUSTOMER") as "MEMBER" | "CUSTOMER",
    loyaltySubjectDeactivated: await loyaltySubjectDeactivated(tx, args),
    terms: termsOf(version),
  };
}
```

- [ ] **Step 2: Engine input** — replace `commissionInputFor` with:

```ts
/** Gathers everything the pure engine needs, straight from the Booking's frozen fields. */
export async function commissionInputFor(tx: Tx, bookingId: string): Promise<CommissionInput> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { commissionVersion: true },
  });

  /** v2 §23 — a repeat is an earlier-submitted Booking of this buyer that Accounts approved and was not cancelled. */
  const priorPurchases = await tx.booking.count({
    where: {
      primaryPersonId: booking.primaryPersonId,
      id: { not: bookingId },
      bookingNumber: { not: null },
      status: { notIn: ["CANCELLED", "REQUEST_REJECTED", "REQUEST_CANCELLED"] },
      submittedAt: { lt: booking.submittedAt },
    },
  });

  return {
    soldByType: booking.soldByType,
    soldByPersonId: booking.soldByPersonId,
    buyerPersonId: booking.primaryPersonId,
    buyerIsActiveMember: booking.originalClassification === "MEMBER",
    buyerHasPriorPurchase: priorPurchases > 0,
    terms: booking.commissionVersion ? termsOf(booking.commissionVersion) : null,
    loyaltySubjectDeactivated: booking.loyaltySubjectDeactivated,
  };
}
```

- [ ] **Step 3: Strip the rest of commission-service.** Delete: `OPPORTUNITY_FOR`, `consumedSlots`, `consumeOpportunity`, `syncLoyaltyCount`, `reopenOpportunity`, `subjectFor`, `freezeClassification` and its call in `generateForBooking`, the `refreshCyclesFor` import, `MAX_LOYALTY_SLOTS`/`opportunityReopens`/`NetworkLink` imports. In `supersedeRecord` delete the opportunity block. In `cancelCommissionForBooking` delete the reopen block and the CR-014 comment. In `reassessCommission`:
  - delete `saleTotal`/`conflictAbove4` and the opportunity-consume block. Replace the milestone-lost block's condition `!milestoneReached && record.opportunityId` with `!milestoneReached && record.payment === "PAID"` (an ordinary Paid needed Ready, so its milestone had been reached; Not Paid steps back by eligibility alone, and Paid Early may legitimately precede the milestone). Keep its `afterAffectingChange(record.payment, "MILESTONE_LOST")` and `MILESTONE_LOST` event; drop the reopen and `opportunityId` writes;
  - call `resolveEligibility` without `percent` and `commissionConflictAbove4`, with `type: record.type as "DIRECT" | "LOYALTY"`;
  - after the eligibility update, add `if (record.type === "LOYALTY" && record.beneficiaryRole === "CLOSING_CUSTOMER" && milestoneReached) await inviteToMembershipIfDue(tx, record.beneficiaryPersonId);`
  - update the header comment of the file: records are generated at Accounts approval from the terms frozen at submission (v2 §16); there is no cap and no one-shot entitlement.

Add:
```ts
export const MEMBERSHIP_INVITATION_PURPOSE = "MEMBERSHIP_INVITATION";

/**
 * v2 §25 — after a third successful Customer-closing Loyalty, CRM is asked to
 * invite the Customer to Membership. Once per Customer; it blocks nothing and
 * later Loyalty is unaffected. "Successful" = the record reached its milestone
 * (100% Payment Received or an Approved Buyback) and is not cancelled.
 */
async function inviteToMembershipIfDue(tx: Tx, personId: string) {
  const customer = await tx.customerProfile.findUnique({
    where: { personId },
    include: { person: { select: { fullName: true } } },
  });
  if (!customer) return;
  const already = await tx.task.count({
    where: { recordKind: "Customer", recordId: customer.id, purpose: MEMBERSHIP_INVITATION_PURPOSE },
  });
  if (already > 0) return;

  const records = await tx.commissionRecord.findMany({
    where: {
      beneficiaryPersonId: personId,
      type: "LOYALTY",
      beneficiaryRole: "CLOSING_CUSTOMER",
      isCurrent: true,
      payment: { not: "CANCELLED" },
    },
    select: { bookingId: true, milestonePercent: true, booking: { select: { paymentReceivedPercent: true } } },
  });
  let qualified = 0;
  for (const r of records) {
    if (!r.bookingId || !r.booking) continue;
    if (r.booking.paymentReceivedPercent.gte(r.milestonePercent) || (await hasApprovedBuyback(tx, r.bookingId))) {
      qualified++;
    }
  }
  if (qualified < 3) return;

  await ensureTask(tx, {
    recordKind: "Customer",
    recordId: customer.id,
    recordName: customer.person.fullName,
    purpose: MEMBERSHIP_INVITATION_PURPOSE,
    title: "Membership invitation",
    assigneeRole: "CRM",
    dueAt: new Date(),
    latestResult: `${qualified} successful Customer-closing Loyalty sales. Invite them to become a Member.`,
  });
}
```
Rename `previewCommission`'s comment (no cap). `raiseCommissionConflict` stays.

- [ ] **Step 4: booking-service.** In `submitBookingRequest`, after `validateSoldBy`, call
```ts
const frozen = await freezeAtSubmission(tx, {
  projectId: plot.projectId,
  soldByType: input.soldByType,
  soldByPersonId: input.soldByPersonId ?? null,
  buyerPersonId: primary.personId,
});
```
and add to `booking.create` data: `commissionVersionId: frozen.commissionVersionId, originalClassification: frozen.originalClassification, loyaltySubjectDeactivated: frozen.loyaltySubjectDeactivated`. Add `commissionTerms: FrozenTerms` to `reviewSnapshot`'s input and output (`commissionTerms: input.commissionTerms`) and pass `frozen.terms`; add `version: frozen.terms.version` to the submit event `detail`.
In `reviseBookingRequest`, do the same with `booking.projectId` and the new parties/Sold By, writing the three fields in the `booking.update` and `commissionTerms` into the new review version.
In `decideBookingRequest`, keep the `previewCommission` conflict gate; update its comment (no 4%; a missing frozen version is now one of the conflicts). Delete nothing else there.
In `decideSoldByCorrection` approve path, set `loyaltySubjectDeactivated: await loyaltySubjectDeactivated(tx, { soldByType: correction.toSoldByType, soldByPersonId: correction.toSoldByPersonId, buyerPersonId: booking.primaryPersonId })` in the same `booking.update` that writes the new Sold By. Nothing else changes: `generateForBooking` already reads the frozen version.
Change Plot (`change-plot-service.ts`) needs no edit: the same Booking keeps `commissionVersionId`. Verify by reading that file that it never writes `commissionVersionId` or `originalClassification`.

- [ ] **Step 5: network-service.** Delete `assignInvitePosition`, `assignRoyaltyPosition`, `membersRollingToday`, and the imports of `bandRate`, `counterYearStart`, `nextNetworkPosition`, `istDay`, `cycle-service`, `generateForBooking`. In `activateMember`, replace the position block with writing `invitedByMemberId: args.invitedByMemberId ?? null` into both the create and update data (check the inviter is activated first, keeping the existing message), and drop `invitePosition`/`inviteRatePercent` from the result and audit. In `syncRoyaltyLink`'s final step, write only `royaltyLinkFinalAt: at`, drop the cycle refresh, the position text in the event reason, and the whole "later Bookings regenerate" loop (no Royalty component exists to create). Update the file header to: "Member activation, who invited whom, and the Royalty Linked Member (kept for part 2)."

- [ ] **Step 6: Delete `cycle-service.ts`**; in `jobs.ts` delete the anniversary cycle job and its imports. In `merge-service.ts` delete `loyaltyEvents`, the `rebuildLoyaltyCount` import and call, the `loyaltySlotsConsumed` write, and `loyaltyRebuiltTo` from the update/result/audit; update `src/app/administration/actions.ts:156` to a plain `Merged.` message (Task 6 handles the client). In `report-service.ts` delete the Royalty, cycle and cap figures (`cycles`, `cyclesInProgress`, `cyclesUpgradeEligible`, `cyclePositions`, the three Royalty counts, the `COMMISSION_CONFLICT_ABOVE_4` count) from both the query list and the returned type. In `reconcile.ts` delete every rule that reads a removed field (positions, slots, cycles, opportunities, `SALE_CAP_PERCENT`); keep the rest. In `backfill-classification.ts` remove `freezeClassification` usage if it imported it (it should call `classifyApprovedBooking` directly).

- [ ] **Step 7: Type-check `src/lib`.**
Run: `npx tsc --noEmit 2>&1 | grep -v "^src/app\|^prisma/" | head -40`
Expected: no lines (errors remain only under `src/app` and `prisma/`, which Tasks 5–8 fix).

- [ ] **Step 8: Commit.**
```bash
git add -A src/lib
git commit -m "feat: a Booking Request freezes its Project's commission settings; Loyalty is unlimited"
```

---

### Task 5: Commission settings on the Project page

**Files:**
- Create: `src/app/projects/[id]/commission-settings.tsx`
- Modify: `src/app/projects/[id]/page.tsx`, `src/app/projects/actions.ts`

**Interfaces — Consumes:** Task 3 service; `needsLoyaltyException`, `validateCommissionTerms`, `rateLabel` from the domain (same validation in the browser as on the server).
**Produces (actions.ts):**
```ts
export async function prepareCommissionDraftAction(projectId: string, input: CommissionVersionInput, key: string): Promise<ActionResult>;
export async function sendCommissionVersionAction(versionId: string, key: string): Promise<ActionResult>;
export async function decideCommissionVersionAction(versionId: string, approve: boolean, note: string, key: string): Promise<ActionResult>;
```
Each calls `requireStaff()` (no action argument — the service enforces Admin/MD), passes `actor.staffAccountId`/`actor.role`, calls `refresh()` plus `revalidatePath(`/projects/${projectId}`)` (for send/decide, read the version's `projectId` from the service result — add `projectId` to the three service results if needed), and returns messages:
- prepare: `Draft version {n} saved. Send it to MD when it is ready.`
- send: `Version {n} sent to MD.`
- approve: `Version {n} is now Active{, superseding version m}. New Booking Requests freeze it; existing ones keep theirs.`
- reject: `Version {n} rejected.`

- [ ] **Step 1: Page loader.** In `page.tsx`, load `const versions = await listCommissionVersions(project.id);` and render, after the PLC card, `<CommissionSettings projectId={project.id} role={actor.role} versions={versions.map(v => ({ id: v.id, version: v.version, status: v.status, directEnabled: v.directEnabled, directPercent: v.directPercent?.toString() ?? null, loyaltyEnabled: v.loyaltyEnabled, loyaltyPercent: v.loyaltyPercent?.toString() ?? null, loyaltyExceptionReason: v.loyaltyExceptionReason, reason: v.reason, preparedAt: v.preparedAt.toISOString(), decidedAt: v.decidedAt?.toISOString() ?? null, decisionNote: v.decisionNote, effectiveFrom: v.effectiveFrom?.toISOString() ?? null, effectiveTo: v.effectiveTo?.toISOString() ?? null }))} />`. Hide the section for `project.isExternalResaleGroup`.

- [ ] **Step 2: The client section** `commission-settings.tsx` (`"use client"`), using `Card`, `Badge`, `Button`, `Input` from `@/components/ui/*` and the `newKey`/`run` pattern from `projects-client.tsx`:
  - **Header:** "Commission settings" and one line: "Applicable Direct Commission is Project-specific and disclosed before the relevant Booking." (v2 §9 wording).
  - **Active block:** "Version {n} · Active since {date}", rows "Direct Commission — {rateLabel}% at 25% / 100% self-purchase" or "Disabled", "Customer Loyalty — {rate}%" or "Disabled", and the exception reason if any. With no Active version: an amber notice "No approved settings. Booking Requests on this Project cannot be submitted until MD approves a version."
  - **Open version block** (Draft or Pending): same rows plus status badge.
    - Role `ADMIN` + Draft: **Edit** (opens the form prefilled) and **Send to MD**.
    - Role `ADMIN` + no open version: **Prepare new version** (form prefilled from Active, or Direct 3 / Loyalty 1 when none).
    - Role `MD` + Pending: **Approve** and **Reject**, both needing a note textarea (Reject disabled while the note is empty).
    - Any other role: read-only.
  - **Form:** two benefit rows, each a checkbox "Enabled" plus a rate `Input` (`inputMode="decimal"`, disabled and cleared when unchecked, max shown as "max 5%" / "max 3%"); an exception-reason textarea shown only when `needsLoyaltyException(...)` is true, labelled "MD exception — why Loyalty is not lower than Direct"; a compulsory "Reason for this version" textarea. Validate with `validateCommissionTerms` before calling the action and show its `reason` inline; disable Save while invalid.
  - **History:** a compact list of every other version: "v{n} · {status} · {Direct} / {Loyalty} · {decisionNote}".
  - Show action results the way `projects-client.tsx` does (its toast/inline message component — reuse it rather than writing a new one).

- [ ] **Step 3: Check it renders.** Run `npm run dev`, sign in as Admin, open a Project, prepare and send a version; sign in as MD, approve it. Use the `run` skill if driving the browser. Expected: the Active block shows the new version and the history lists the old one.

- [ ] **Step 4: Commit.**
```bash
git add src/app/projects
git commit -m "feat: the Project page shows its commission settings, for Admin to prepare and MD to approve"
```

---

### Task 6: Every other screen

**Files:** `src/app/bookings/{load.ts,bookings-client.tsx}`, `src/app/calculator/{page.tsx,calculator-client.tsx}`, `src/app/portal/{page.tsx,portal-client.tsx}`, `src/app/members/{page.tsx,members-client.tsx,actions.ts,[id]/page.tsx}`, `src/app/customers/{page.tsx,customers-client.tsx,actions.ts,[id]/page.tsx}`, `src/app/reports/*`, `src/app/administration/{page.tsx,administration-client.tsx,actions.ts}`, `src/app/dashboard/*` if it reads removed report fields.

- [ ] **Step 1: Bookings.** `load.ts`: include `commissionVersion: { select: { version: true, directEnabled: true, directPercent: true, loyaltyEnabled: true, loyaltyPercent: true } }` and pass a `commissionTerms: { version, direct: string | null, loyalty: string | null }` view (via `termsOf`). In `bookings-client.tsx`, wherever the request snapshot is shown (submit confirmation, Accounts review, Booking detail), add one row: "Commission terms — Version {n}: Direct {rate}% / Disabled · Loyalty {rate}% / Disabled". For a revised request, read `commissionTerms` from the pending review snapshot so Accounts sees what this submission froze. Delete the `NO_BENEFIT` and `COMMISSION_CONFLICT_ABOVE_4` labels/branches; `eligibilityLabel` no longer takes a type.

- [ ] **Step 2: Calculator.** `page.tsx`: drop the `commissionOpportunity` groupBy, every position/band/slot/Royalty field, and the removed constants; load each Project's Active version (`commissionVersions: { where: { status: "ACTIVE" }, take: 1 }`) and pass `terms: FrozenTerms | null` per Project, plus per person `memberActive`, `memberDeactivated`, `hasPriorPurchase`. `calculator-client.tsx`: call `generateCommission(previewInput(type, seller, buyer, project.terms))`; show "This Project has no approved commission settings." when `terms` is null; remove the cap meter, Invite and Royalty line types, band tables, positions and "x of 3 Loyalty"; `resolveEligibility` calls drop `percent` and `commissionConflictAbove4`. Sold Plots keep showing their Booking's frozen records exactly as now.

- [ ] **Step 3: Portal.** Remove network positions, bands and cycles. The deal list (`memberCommissionView`) already shows Project, Plot, type, percent, milestone, eligibility and payment per deal (v2 §69); keep it, and label type `DIRECT` as "Direct Commission".

- [ ] **Step 4: Members, Customers, Reports, Administration, Dashboard.** Delete every reference to `invitePosition`, `inviteRatePercent`, `inviteYearStart`, `royaltyPosition`, `royaltyRatePercent`, `royaltyYearStart`, `loyaltySlotsConsumed`, `performanceCycle`, `commissionOpportunity`, "x of 3", cap figures and `anniversaryDay`-based counter-year text (keep `experienceSince`). Keep "Invited by" and "Royalty Linked Member" displays. Administration merge view: stop showing "Loyalty rebuilt to".

- [ ] **Step 5: Full check.**
Run: `npm run check`
Expected: every pure check OK and `tsc --noEmit` exits 0 except for errors in `prisma/*.ts` seeds and suites (fixed in Tasks 7–8). If `tsconfig` includes `prisma/`, confirm the only remaining errors are there: `npx tsc --noEmit 2>&1 | grep -v "^prisma/"` → no lines.

- [ ] **Step 6: Build.**
Run: `npm run build:check`
Expected: build succeeds.

- [ ] **Step 7: Commit.**
```bash
git add -A src/app
git commit -m "feat: every screen shows Project-specific Direct and Loyalty; bands, cycles and the cap are gone"
```

---

### Task 7: The commission suite, rewritten for v2

**Files:**
- Modify: `prisma/commission.check.ts`
- Modify where they break: `prisma/booking.check.ts`, `prisma/phase5.check.ts`, `prisma/phase6.check.ts`, `prisma/phase7.check.ts`, `prisma/acquisition.check.ts`

**Interfaces — Consumes:** Tasks 2–4; `ensureActiveCommissionVersion` from `./seed-commission.ts`; `prepareCommissionDraft`/`sendCommissionVersion`/`decideCommissionVersion` from Task 3.

- [ ] **Step 1: Delete the removed-rule blocks** in `commission.check.ts` (markers from its own section comments): "Direct 3% at 25% + Invite 1% at 100%" (rewrite as Direct only, below), "the Invite entitlement is the SELLING Member's", "regenerating must not read this Booking's own slot", "a second sale by the same Member earns Direct but no Invite", "RD-02 network positions", "concurrent milestones cannot consume the same slot twice", "AC-02 …", "CR-004 …", "CR-014 …", "AC-07 — CR-013 …" through "That person never moves into a later 1% cycle", "AC-08 — CR-014, CR-027 …" through "a cancelled qualifying event takes its position back out", the Royalty/cycle parts of the Dashboard block, and AC-06's assertions about positions or Royalty records (keep its Royalty-link assertions: provisional/final/none for 3% Club and Customer closes). Remove the `cycle-service` import, `invitePosition`/`inviteRatePercent` from member fixtures, and any `commissionOpportunity` read. Keep: Paid / Paid Early / AC-03, Member hold, cancellation, Sold By Correction, bank, portal privacy, AC-01, the remaining Dashboard figures, AC-09 Buyback.

Every record-shape assert changes from `3%`-style `ruleVersion` to `DIRECT/THIRD_PARTY/V1/3%@25` etc.: the seeded GRN version is 1.

- [ ] **Step 2: Add the v2 blocks** after the fixtures (each uses `bookAndApprove`, `pay`, `currentRecords` already in the file):

```ts
  /* ======================= v2 — freeze at submission (v2 §16) ======================= */
  const settings = (o: Partial<{ directEnabled: boolean; directPercent: string | null; loyaltyEnabled: boolean; loyaltyPercent: string | null; loyaltyExceptionReason: string | null }>) =>
    ({ directEnabled: true, directPercent: "3", loyaltyEnabled: true, loyaltyPercent: "1", loyaltyExceptionReason: null, reason: `${TAG} settings`, ...o });
  async function approveVersion(projectId: string, o: Parameters<typeof settings>[0]) {
    const draft = await prepareCommissionDraft({ idempotencyKey: key(), actorRef: `${TAG}-ADMIN`, actorRole: "ADMIN", projectId, ...settings(o) });
    await sendCommissionVersion({ idempotencyKey: key(), actorRef: `${TAG}-ADMIN`, actorRole: "ADMIN", versionId: draft.versionId });
    await decideCommissionVersion({ idempotencyKey: key(), actorRef: `${TAG}-MD`, actorRole: "MD", versionId: draft.versionId, approve: true, note: "ok" });
    return draft.version;
  }

  // A TAG Project of its own, so changing its version never disturbs GRN.
  const v2Project = await db.project.create({
    data: { projectCode: `${TAG}V2`.slice(0, 9), name: `${TAG} v2`, type: "RESIDENTIAL", status: "ACTIVE" },
  });
  await db.plcRuleVersion.create({ data: { projectId: v2Project.id, version: 1, status: "PUBLISHED", effectiveFrom: new Date(), publishedAt: new Date(), components: { create: [] } } });

  // No Active version → submission is refused.
  const plotNoVersion = await makePlot(v2Project.id, "NV");
  await expectBlocked(/This Project has no approved commission settings\./, () =>
    bookAndApprove({ plotId: plotNoVersion.id, buyerPersonId: buyer.id, soldByType: "MEMBER", soldByPersonId: seller.id })
  );

  const ver1 = await approveVersion(v2Project.id, {});
  // Submitted under version 1; version 2 approved before Accounts decides → records carry version 1.
  const plotFreeze = await makePlot(v2Project.id, "FZ");
  const pending = await submitBookingRequest({
    idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotFreeze.id,
    parties: [{ personId: buyer.id, role: "PRIMARY" }], soldByType: "MEMBER", soldByPersonId: seller.id,
    bookingDate: today, schedule: SCHEDULE,
  });
  const ver2 = await approveVersion(v2Project.id, { directPercent: "4" });
  await decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: pending.bookingId, approve: true, note: "Verified." });
  assert.deepEqual((await currentRecords(pending.bookingId)).map((r) => r.ruleVersion), [`DIRECT/THIRD_PARTY/V${ver1}/3%@25`]);

  // A corrected request sent after version 2 freezes version 2.
  const plotRevise = await makePlot(v2Project.id, "RV");
  const toRevise = await submitBookingRequest({
    idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", plotId: plotRevise.id,
    parties: [{ personId: buyerTwo.id, role: "PRIMARY" }], soldByType: "MEMBER", soldByPersonId: seller.id,
    bookingDate: today, schedule: SCHEDULE,
  });
  const ver3 = await approveVersion(v2Project.id, { directPercent: "5" });
  await reviseBookingRequest({
    idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: toRevise.bookingId,
    parties: [{ personId: buyerTwo.id, role: "PRIMARY" }], soldByType: "MEMBER", soldByPersonId: seller.id,
    bookingDate: today, schedule: SCHEDULE, reason: "Corrected",
  });
  await decideBookingRequest({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", bookingId: toRevise.bookingId, approve: true, note: "Verified." });
  assert.deepEqual((await currentRecords(toRevise.bookingId)).map((r) => r.ruleVersion), [`DIRECT/THIRD_PARTY/V${ver3}/5%@25`]);
  void ver2;

  // Sold By Correction uses the frozen version, not today's (v2 §75).
  const ver4 = await approveVersion(v2Project.id, { directPercent: "2", loyaltyPercent: "1" });
  // pending.bookingId was frozen at ver1 (3%); move it to a Customer close and back to the Member.
  await requestSoldByCorrection({ idempotencyKey: key(), actorRef: CRM, actorRole: "CRM", bookingId: pending.bookingId, toSoldByType: "MEMBER", toSoldByPersonId: inviter.id, reason: "Wrong Member" });
  await decideSoldByCorrection({ idempotencyKey: key(), actorRef: `${TAG}-ADMIN`, actorRole: "ADMIN", bookingId: pending.bookingId, approve: true, note: "Corrected" });
  assert.deepEqual(
    (await currentRecords(pending.bookingId)).map((r) => `${r.beneficiaryPersonId === inviter.id}|${r.ruleVersion}`),
    [`true|DIRECT/THIRD_PARTY/V${ver1}/3%@25`]
  );
  void ver4;

  // Review Focus 3 — both benefits Disabled: approves with no records and no conflict.
  await approveVersion(v2Project.id, { directEnabled: false, directPercent: null, loyaltyEnabled: false, loyaltyPercent: null });
  const plotNone = await makePlot(v2Project.id, "NO");
  const none = await bookAndApprove({ plotId: plotNone.id, buyerPersonId: buyer.id, soldByType: "MEMBER", soldByPersonId: seller.id });
  assert.equal((await currentRecords(none)).length, 0);
  assert.equal((await db.booking.findUniqueOrThrow({ where: { id: none } })).status, "BOOKED");
```
Use the real argument names of `requestSoldByCorrection` and `reviseBookingRequest` from `booking-service.ts` (check them; the shapes above follow the current signatures). If the Sold By Correction requires an inviter that is an Active Member, `inviter` already is.

```ts
  /* ================ v2 — unlimited Loyalty and the Membership invitation (v2 §21, §25) ================ */
  const closer = await makeEligiblePerson("Closer", "9600000090");
  await db.customerProfile.upsert({ where: { personId: closer.id }, create: { personId: closer.id }, update: {} });
  const invitations = () => db.task.count({ where: { recordKind: "Customer", purpose: "MEMBERSHIP_INVITATION", recordName: closer.fullName } });
  const loyaltyBookings: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const p = await makePlot(project.id, `L${i}`);
    const b = await makeEligiblePerson(`LoyaltyBuyer${i}`, `96000001${i}0`);
    const id = await bookAndApprove({ plotId: p.id, buyerPersonId: b.id, soldByType: "CUSTOMER", soldByPersonId: closer.id });
    loyaltyBookings.push(id);
    await pay(id, "100", `${TAG}-LOY-${i}`);
    const [record] = await currentRecords(id);
    // The fourth and fifth still pay (no lifetime limit).
    assert.equal(`${record.type}|${record.eligibility}|${record.payment}`, "LOYALTY|READY|NOT_PAID", `loyalty ${i}`);
    assert.equal(await invitations(), i >= 3 ? 1 : 0, `invitation after ${i}`);
  }
  // At most one current Loyalty per Booking — the database refuses a second.
  await assert.rejects(
    db.commissionRecord.create({ data: { bookingId: loyaltyBookings[0], type: "LOYALTY", beneficiaryRole: "REPEAT_PURCHASE_CUSTOMER", beneficiaryPersonId: closer.id, percent: "1", milestonePercent: "100", ruleVersion: "x" } }),
    /one_current_loyalty_per_booking|Unique constraint/
  );
```
In the AC-09 Buyback block: keep "Loyalty accelerates" and "an unearned Direct is not accelerated"; delete the Invite and Royalty acceleration asserts. Add a Change Plot assert where the file (or `phase5.check.ts`) already approves a same-Project Change Plot: `assert.equal(after.commissionVersionId, before.commissionVersionId)`.

Imports to add: `reviseBookingRequest` from booking-service; the three settings functions; drop `activateMember` only if no remaining block uses it.

- [ ] **Step 3: Other suites.** Run each and fix only what v2 broke:
  - Any suite creating its own Project and submitting a Booking on it → `await ensureActiveCommissionVersion(db, project.id, TAG)` after creating it (phase5 `otherProject`, acquisition `resaleGroup` if it books, booking.check `setupProject` only if it reaches submission).
  - `phase6.check.ts`: delete the Loyalty rebuild assertion around line 564 and any `loyaltySlotsConsumed`/`commissionOpportunity` setup.
  - `booking.check.ts` / `phase5.check.ts`: `originalClassification` is now set at submission; change asserts that expected null before approval.
  - Any `ruleVersion` literal → the `V1` form.

- [ ] **Step 4: Run the database suites.**
Run: `npm run db:check`
Expected: every suite prints its OK line and the command exits 0.

- [ ] **Step 5: Commit.**
```bash
git add prisma/*.check.ts
git commit -m "test: the commission suites check v2's frozen terms, unlimited Loyalty and the Membership invitation"
```

---

### Task 8: Seeds, demos and the final gate

**Files:** `prisma/uat-seed.ts`, `prisma/uat-seed-v2.ts`, `prisma/showcase-seed.ts`, `prisma/demo.ts`, `prisma/seed-member-demo.ts`, `prisma/seed-loyalty-demo.ts`, `prisma/seed-loyalty-demo-finish.ts`

- [ ] **Step 1: Each seed.** After every `db.project.create`/`upsert`, call `ensureActiveCommissionVersion(db, project.id, "SEED")`. Delete Invite/Royalty position, rate, cycle and opportunity setup (`inviteCycleId`, `royaltyCycleId`, `performanceCycle`, `commissionOpportunity`, `invitePosition`, `inviteRatePercent`, `royaltyPosition`, `royaltyRatePercent`, `loyaltySlotsConsumed`). Keep `invitedByMemberId` and Royalty-link fields. Where a seed calls `assignInvitePosition`, replace it with setting `invitedByMemberId` on the Member profile. The `seed-loyalty-demo*` scripts showed the 3-Loyalty limit; keep them working as plain Loyalty demos and drop any "limit reached" step.

- [ ] **Step 2: Run them on a fresh database.**
```bash
npm run data:reset && npm run db:seed && npm run uat:seed:v2 && npm run seed:showcase
```
Expected: each completes without error. Then `npm run data:reset && npm run db:seed` to leave the plain seed in place.

- [ ] **Step 3: Final gate.**
Run: `npm run check && npm run db:check && npm run build:check`
Expected: all three exit 0. `grep -rn "INVITE\b\|ROYALTY\b\|NO_BENEFIT\|COMMISSION_CONFLICT_ABOVE_4\|loyaltySlotsConsumed\|PerformanceCycle\|commissionOpportunity\|SALE_CAP" src prisma --include=*.ts --include=*.tsx | grep -v migrations` → no lines except `OpportunityKind`-free text and the Royalty-link names (`royaltyLinked…`).

- [ ] **Step 4: Commit.** (Local only — do **not** push.)
```bash
git add prisma
git commit -m "chore: every seed runs under Business Model v2"
```
