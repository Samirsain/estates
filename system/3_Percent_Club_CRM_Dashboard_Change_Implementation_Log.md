# 3% Club CRM / Dashboard — Approved Changes Implementation Log

## Status

**A second, larger pack arrived on 3 September 2026 and supersedes the first.**
`3_Percent_Club_CRM_Dashboard_Approved_Changes (2).md` carries 46 business rules,
27 change requests and 31 acceptance criteria, and it *changes* rules the first
pack established rather than only adding to them. Part Two of this log covers it.

**Part One — the first pack (AC-01 … AC-07) — is complete, committed and now
proven against the database.** All eight check suites pass. Two of its rules
survive into the second pack unchanged (Paid Early MD approval, the 5% Buying
Commission cap); the performance-cycle model it introduced is replaced by the
second pack's CR-014.

This document is the running record of what has been built against
[`3_Percent_Club_CRM_Dashboard_Approved_Changes.md`](./3_Percent_Club_CRM_Dashboard_Approved_Changes.md)
("the pack") and its companion
[`3_Percent_Club_Complete_Mock_Data_and_Test_Plan.md`](./3_Percent_Club_Complete_Mock_Data_and_Test_Plan.md)
("the test plan"). It follows the pack's section order.

Each change carries an **AC-nn** reference that appears verbatim in the code
comments, so any line of the implementation traces back to the requirement it
exists for.

---

## 0. How to read the verdicts

| Verdict | Meaning |
| --- | --- |
| **Already met** | The system satisfied the requirement before the pack. Verified against the source, not rebuilt. |
| **Built** | The requirement was not met. Code was written for it. |
| **Corrected** | The first pass implemented it, and the second pass found it wrong. |
| **Open** | Needs a business decision that is genuinely absent from both approved documents. |

---

## 1. Core Approved Rules

### AC-01 · Customer → Member activation keeps historical classification

**Verdict: Built, then hardened in the second pass.**

**What was wrong.** A Booking's Customer-versus-Member classification was never
stored. The commission engine read the buyer's Member status _live_, every time
it ran, and it runs again on a Sold By Correction and on a Change Plot. A
Customer who bought and was later activated as a Member would have their old
approved Booking silently recomputed as a **Member self-purchase** the next time
anything touched it: 3% Direct at the 100% milestone to the buyer, instead of 3%
Direct at 25% to the selling Member plus the inviting Member's 1%. A settled,
approved and possibly already-paid commission would change beneficiary.

**What was built.**

- `Booking.originalClassification` (`CUSTOMER` | `MEMBER`) — frozen the first
  time commission is generated, which is Accounts approval, and never rewritten.
- `freezeClassification()` in `commission-service` writes it once and records a
  `CLASSIFICATION_FROZEN` event on the Booking's history with the reason.
- `commissionInputFor()` prefers the frozen value. Only a Booking that has never
  been approved falls back to the buyer's standing today, which is what a
  pre-approval preview should show.

**Second-pass correction.** The freeze had a hole for **rows approved before the
column existed**. On the next `generateForBooking` those rows would be
classified from the buyer's status _today_ — writing `MEMBER` onto settled
Customer business for exactly the converted Customer the pack is about.

`classifyApprovedBooking()` in the domain now decides it from what the Booking
itself already holds, and both the lazy freeze and the backfill route through
that one function:

- **The commission frozen at approval, which is authoritative.**
  `generateCommission()` is the code that read `buyerIsActiveMember` at the time.
  An Active Member buyer takes the self-purchase branch, emits exactly one
  `DIRECT/SELF_PURCHASE/...` component and returns; every other branch emits
  something else or nothing, and Accounts cannot approve while the engine reports
  a conflict. So the earliest DIRECT record is the engine's own verdict.
- **The Member Activation Date against the approval date, as a fallback**, for a
  Booking that generated no commission at all — a first 3% Club direct purchase
  earns nothing, so there is no verdict to read.
- A disagreement is **reported, not resolved silently**. The benign case is a
  Member who has since been deactivated; the commission wins because it saw the
  real status, and the note says so.
- Where neither signal can answer, the row is left null and listed as an
  exception rather than guessed at.

Live Member status is consulted only for a Booking being approved now.

**Backfill.** `freezeClassification()` only reaches a Booking that something else
touches again, so a Booking nobody corrects would stay null for good.
`npm run backfill:classification` closes that: dry run by default, `--confirm` to
write, one transaction, re-checks each row inside the transaction, safe to
re-run, and non-zero exit while any exception is open.

**Run against production on 2 September 2026.** 4 approved Bookings, 4 resolved,
0 exceptions, all CUSTOMER — 2 from the frozen Direct commission and 2 from
buyers who have never been activated as Members. Independently confirmed before
applying: none of the four buyers has a Member profile at all, so CUSTOMER is
unambiguous by every signal. 4 `CLASSIFICATION_FROZEN` audit rows written under
actor `MIGRATION`, each naming its source. A re-run now reports 0 candidates.

**Where.** `prisma/schema.prisma` (`Booking.originalClassification`) ·
`src/lib/domain/commission.ts` (`classifyApprovedBooking`,
`CommissionInput.buyerIsActiveMember`) ·
`src/lib/services/commission-service.ts` (`freezeClassification`,
`classificationEvidence`, `commissionInputFor`) ·
`src/lib/migration/backfill-classification.ts` ·
`prisma/backfill-classification.ts`.

**Paths verified not to rewrite it:** Accounts approval, Sold By Correction
approval, Change Plot approval, every payment confirmation and correction,
Member activation, member holds, cancellation, Buyback. `originalClassification`
is written in exactly one function.

---

### AC-02 · Royalty earned through completed performance cycles

**Verdict: Corrected.** The first pass invented a counting model the approved
documents do not describe. See §6 for the full account.

**The approved rule, assembled from the corpus.**

| Source | Text |
| --- | --- |
| Pack §1 Royalty | "Royalty is earned through completed performance cycles, **not simply by recording a transaction**." |
| Pack §1 Performance Cycles | "Performance cycles are earned based on completed qualifying activity." · "Partially completed cycles must not be treated as completed cycles." |
| `PRD.md` §6.3 / `main-PRD.md` §14.4 | The qualifying activity for Royalty: introduced Customer, later direct purchase through 3% Club, no selling Member, first such purchase, **milestone 100% Payment Received**. |
| `PRD.md` §6.3 | "Cancellation before legal completion restores the opportunity. **Legally completed purchase consumes the opportunity.**" |
| `COMMISSION-TEST-PLAN.md` §1 | "**Legally completed:** the sale reached final delivery. Before that, it is not legally completed." |
| Test plan TC-ROY-001 | "Given qualifying transactions satisfy **all** cycle conditions: mark cycle complete." |
| Test plan TC-ROY-002 | "Given only **part** of the qualifying conditions are met: keep cycle pending. Do not pay/recognize earned royalty." |

Read together: the qualifying activity is **recorded** at the 100% payment
milestone and **completed** at final delivery. A transaction between the two is
precisely the partially completed cycle the pack refuses to treat as complete,
and precisely what TC-ROY-002 exercises.

**What is implemented now.**

- `qualifyingActivityComplete({ milestoneReached, legallyCompleted })` — both
  halves required. The milestone alone is "recording a transaction".
- `isLegallyCompleted()` — Booking at `DELIVERED` **and** a `BookingCompletion`
  that has not been reopened. Both halves are checked, so a delivery recorded in
  error and reopened does not leave a cycle standing behind it.
- `PerformanceCycle` per Member per counter year, storing the four things the
  pack requires: **cycle start/end dates, qualifying transactions**
  (`qualifyingCount` + `completedCount`, backed by the `records` relation),
  **achievement status**, and **resulting entitlement**.
- The window is the Member's existing annual counter year (RD-02), so a Member
  activated on 29 February rolls on 28 February in a non-leap year — the same
  day their Introduced Customer Counter rolls, not a day apart.
- `cycleAchieved(qualifyingCount, completedCount)` — achieved when the cycle
  holds qualifying activity and **all** of it is complete. TC-ROY-001's "all"
  against TC-ROY-002's "part".
- **Eligibility is gated per record, not on the cycle aggregate.** One Member's
  cycle can hold qualifying transactions from several introduced Customers in
  the same year, and `PRD.md` §6.3 gives each introduced Customer their own
  single entitlement. Gating on the aggregate would let one Customer's completed
  purchase release a different Customer's Royalty.
- `refreshCycle()` **recomputes** the stored figures from the attached records
  rather than incrementing counters. A counter stepped up and down by several
  triggers drifts the first time one path is missed; counting rows cannot, and
  it makes every caller idempotent for free.
- `entitlement` is derived from the qualifying records — `ROYALTY 1.00% across 1
  qualifying transaction` — not a fixed label.

**Can a completed cycle become incomplete?** Only by reopening the delivery,
which genuinely reverses the legal completion. A Buyback does **not**: see AC-05.

**There is no target count, and there should not be one.** `PRD.md` §6.3 already
fixes the number of qualifying transactions per entitlement — "Royalty applies
only to the Customer's **first** qualifying future direct purchase" and "may be
generated only once per introduced Customer". A separate threshold would be an
invented second rule sitting on top of an approved one.

**Where.** `prisma/schema.prisma` (`PerformanceCycle`,
`CommissionRecord.cycleCompletedAt`) · `src/lib/domain/commission.ts`
(`cycleWindow`, `qualifyingActivityComplete`, `cycleAchieved`,
`resolveEligibility`) · `src/lib/services/commission-service.ts`
(`isLegallyCompleted`, `cycleFor`, `refreshCycle`, `recordCycleQualification`,
`reverseCycleCompletion`, `releaseFromCycle`, `onLegalCompletionChanged`) ·
`src/lib/services/completion-service.ts` (`recordCompletion`, `reopenDelivered`).

---

### AC-03 · Paid Early requires recorded MD approval

**Verdict: Built. This deliberately overrides `PRD.md` §6.11.**

**Conflict, stated plainly.** `PRD.md` §6.11 says Paid Early "needs no extra
MD/Admin approval". The pack says the opposite: approval is required, must be
stored, and "without approval, the system must not mark the benefit as
approved." The pack is the later approved baseline, so the pack wins and §6.11
is superseded on this point. `PRD.md` needs the corresponding revision — AC-09.

**What was built.**

- `CommissionRecord.earlyApprovedByRef`, `.earlyApprovedAt`, `.earlyApprovalNote`
  — approver, date/time and reason stored **on the record itself**, so the
  approval cannot be separated from the transaction and beneficiary it approved.
- `approveCommissionPaidEarly()` — **MD only**. Not Admin, and not Accounts, who
  process the payment: an approver who can approve their own early payment is
  not an approver.
- `canMarkPaid()` refuses Paid Early without a stored approval, in the domain.
  The `mdApproved` parameter defaults to `false`, so a caller that forgets it
  gets the safe answer.
- The Booking screen shows **Approve Early** to MD, "Awaiting MD approval" to
  everyone else, and the approver and time once approved.

**Alternate paths audited.** `PAID_EARLY` is written in exactly one place —
`markCommissionPaid()` in `commission-service` — and that call is gated by
`canMarkPaid()`. There is no second route to the state through any service,
server action or report.

**Where.** `src/lib/domain/commission.ts` (`canMarkPaid`) ·
`src/lib/services/commission-service.ts` (`approveCommissionPaidEarly`,
`markCommissionPaid`) · `src/app/bookings/actions.ts` ·
`src/app/bookings/bookings-client.tsx` · `src/app/bookings/load.ts`.

---

### AC-04 · Buying Commission capped at 5%

**Verdict: Built.**

**What was wrong.** The only limit was 100%. Buying Commission correctly sits
outside the 4% sale cap (RD-03), but had no cap of its own.

**What was built.** `BUYING_CAP_PERCENT = 5` in `src/lib/domain/acquisition.ts`,
enforced in `validateBuyingCommission()`. An over-cap figure is **refused, never
trimmed** — the principle RD-03 already applies to the sale cap: the system does
not quietly reduce a number someone entered, it makes them correct it.

Judged on exact decimals (`Prisma.Decimal`), never floating point, so 5.0001% is
refused and 5% exactly is allowed.

**Alternate paths audited.** A `BUYING` record is created in exactly one place —
`recordBuyingCommission()` — which validates first and refuses a second current
record per acquisition. There is no update path that could change the percentage
after the fact without going through the same validation.

**Where.** `src/lib/domain/acquisition.ts` ·
`src/lib/services/acquisition-service.ts` (`recordBuyingCommission`) ·
`src/lib/services/report-service.ts` (cap-exception count).

---

### AC-05 · Buyback / unwind — Option B

**Verdict: Corrected.** The first pass accepted this as already met. The second
pass found the reversal did not follow `main-PRD.md` §14.12.

**What §14.12 actually requires — three cases, not one:**

| Case | Approved rule |
| --- | --- |
| Cancellation before legal completion | Unpaid → Cancelled; Paid/Paid Early → Accounts Adjustment Required |
| **Buyback before legal completion** | "Unpaid old-sale commission: **CRM/management decision, then Accounts approval**" |
| **Buyback after legal completion** | "Original sale commission **normally remains earned** unless the written arrangement states otherwise" |

**What was wrong.** `cancelCommissionForBooking()` applied the _cancellation_
transition to every case. A Buyback on a legally completed sale therefore
**cancelled a commission the approved rule says stays earned**, and the
CRM/management decision the before-completion case requires was skipped
entirely.

**What was corrected.**

- The function now takes `unwind: "CANCELLATION" | "BUYBACK"`, and the Buyback
  call site in `acquisition-service` says so.
- **Buyback after legal completion:** nothing about the record changes — not its
  payment state, not its consumed entitlement, not its completed performance
  cycle. A `BUYBACK_AFTER_COMPLETION` event records that the Buyback happened.
- **Buyback before legal completion:** records step back as before, and the
  entitlement and cycle are released.
- **Both Buyback cases** raise an Accounts decision task
  (`BUYBACK_COMMISSION_REVIEW`). "Normally remains earned" is a human judgement
  against a written arrangement — the system does not make that call, it makes
  sure it is asked for.

**What was already met, and is still met:** the audit trail rather than deletion;
the Booking moving to `BUYBACK_COMPLETED` as closed history; one-shot slots
reopening only where the sale had not legally completed; a `Delivered` Booking
keeping them consumed; Paid and Paid Early records becoming Accounts Adjustment
Required rather than being silently reversed after the money left.

**Where.** `src/lib/services/commission-service.ts`
(`cancelCommissionForBooking`) · `src/lib/services/acquisition-service.ts`
(`decideAcquisition`).

---

### AC-06 · Primary Customer self-purchase

**Verdict: Already met. Verified against `generateCommission()`, not assumed.**

- A self-purchase generates **exactly one** component — 3% Direct at the 100%
  milestone — and the engine `return`s immediately, so no second component can
  attach to the same economic event.
- Self-purchase and third-party business are distinguishable at record level by
  the frozen `ruleVersion`: `DIRECT/SELF_PURCHASE/3%@100` against
  `DIRECT/THIRD_PARTY/3%@25`. AC-01's legacy recovery now depends on this.
- The inviting Member's opportunity is deliberately left untouched by a personal
  purchase, so it cannot be consumed twice (`main-PRD.md` §14.2).
- A Customer closing their own purchase as Sold By Customer is refused outright
  — the other double-count this rule guards against.
- Where the buyer holds an Active Member capability and Sold By names anyone
  else, the engine refuses with a Commission Conflict rather than generating a
  referral commission alongside the self-purchase.

**Where.** `src/lib/domain/commission.ts` (`generateCommission`).

---

## 2. Transaction Integrity

**Verdict: Met.**

| Required field | Where it is held | Used by |
| --- | --- | --- |
| Person / customer / member identity | `Booking.primaryPersonId`, `BookingParty` | commission engine, completion, reports |
| Project | `Booking.projectId` | reports, dashboard |
| Plot / unit | `Booking.plotId` | inventory state machine |
| Booking reference | `Booking.requestNo`, `.bookingNumber` | every task and report row |
| **Original transaction classification** | **`Booking.originalClassification`** (AC-01) | commission engine, dashboard split |
| Current lifecycle status | `Booking.status`, `.activeProcess` | eligibility, dashboard |
| Payment references | `PaymentReceivedEntry` → `ExternalReference` | uniqueness, corrections |
| Commission / royalty status | `CommissionRecord.eligibility`, `.payment`, `.holdReason`, `.cycleCompletedAt` | dashboard, portal |
| Approval status | `BookingReviewVersion`, `CommissionRecord.earlyApprovedAt` (AC-03) | Paid Early gate |
| Created / updated timestamps | `createdAt` / `updatedAt` on every model | audit |
| Audit history | `AuditEvent` (written by `runCommand` on every command) plus `BookingEvent`, `CommissionEvent`, `PlotEvent`, `AcquisitionEvent` | Activity History |

---

## 3. Status / Recovery Rules

**Verdict: Met. Mapping recorded rather than renamed.**

The pack lists eight states in business language; the system carries them under
its established names. **The names were not changed** — renaming live status
enums to match a prose list would change identity and completion behaviour for
no functional gain, and every existing screen, report and audit row refers to
the current names.

| Pack state | System state |
| --- | --- |
| Active | `BOOKED`, `PAYMENT_COMPLETED` |
| Pending | `REQUEST_PENDING` |
| Approved | `BOOKED` — the Booking Number is issued only on Accounts approval |
| Cancelled | `CANCELLED`, `REQUEST_CANCELLED`, `REQUEST_REJECTED` |
| Recovered | `REFUND_PENDING` → `CANCELLED`, via `CancellationRequest` and the refund reference |
| Bought Back / Unwound | `BUYBACK_COMPLETED` |
| Converted | `Hold.CONVERTED_TO_BOOKING`; `Enquiry.BOOKED` |
| Completed | `DELIVERED`, with `BookingCompletion` |

Every one of these paths calls `reassessCommission()`, and nothing is deleted on
any of them. Legal completion and its reopening now call it too — that gap is
the AC-02 correction.

---

## 4. Dashboard Requirements — AC-07

**Verdict: Built, then corrected.**

**What existed.** The Dashboard was a work queue — tasks only, no business
figures at all.

**What was built.** A **Business state** panel fed by `businessState()` in
`report-service`. Every figure is counted from the transaction-level records on
each page load. There is **no rollup table and no cache**: a total kept
separately from the records behind it becomes a second source of truth, and the
first thing anyone finds is that the two disagree.

**Second-pass correction.** `royalty.earned` counted records whose _payment_ was
Paid or Paid Early. Under AC-02, earned means the qualifying activity is
complete, which is not the same thing — TC-ROY-002 requires that an incomplete
cycle is not recognised as earned however far the money has come. It now counts
`cycleCompletedAt`, with `paid` reported separately.

| Pack §4 requirement | Panel group | Underlying query |
| --- | --- | --- |
| Customer vs Member business | Customer vs Member business | `originalClassification` — the frozen value |
| Active vs unwound transactions | Transactions | `status` in BOOKED/PAYMENT_COMPLETED vs BUYBACK_COMPLETED |
| Earned vs pending royalty | Royalty and cycles | `cycleCompletedAt` not null vs null |
| Performance cycle progress | Royalty and cycles | `PerformanceCycle.status` |
| Buying Commission | Buying Commission | `type: BUYING`, summed on `Prisma.Decimal` |
| 5% cap exceptions | Buying Commission | `percent.gt(BUYING_CAP_PERCENT)` |
| Paid Early MD approvals | Paid Early | `earlyApprovedAt` null / not null / `payment: PAID_EARLY` |
| Recoveries | Exceptions | `activeProcess: REFUND_PENDING`, decided `CancellationRequest`s |
| Customer → Member conversions | Conversions | Customer-classified Bookings whose buyer now has an activation date |
| Audit / reversal activity | Audit | `CommissionEvent` reversal actions, superseded records |
| Historical classification visible | Explained in place on the Customer vs Member group | — |

A **Reconciliation** group was added for the test plan's §18 list — enquiries,
holds, approved Bookings and confirmed payment entries — so the Customer/Member
split can be reconciled against the total on the same screen.

**Who sees it.** MD, Admin, Accounts and MIS. CRM and PC work Plot and Enquiry
queues and have no reason to be served commission and royalty totals.

**Where.** `src/lib/services/report-service.ts` (`businessState`) ·
`src/app/dashboard/business-state.tsx` · `src/app/dashboard/page.tsx`.

---

## 5. Developer Acceptance Checklist

| # | Item | Verdict | Reference |
| --- | --- | --- | --- |
| 1 | Royalty logic replaced with approved performance-cycle logic | ☑ Corrected | AC-02 |
| 2 | Customer → Member conversion does not rewrite historical booking classification | ☑ Built | AC-01 |
| 3 | Buyback Option B implemented | ☑ Corrected | AC-05 |
| 4 | Buyback reversals are auditable | ☑ Already met | AC-05 |
| 5 | Performance cycles earned only when qualifying conditions complete | ☑ Corrected | AC-02 |
| 6 | Paid Early requires recorded approval | ☑ Built | AC-03 |
| 7 | Primary Customer self-purchase handled without duplicate commission | ☑ Already met | AC-06 |
| 8 | Buying Commission cannot exceed 5% | ☑ Built | AC-04 |
| 9 | Recovery / cancellation states flow through commission and dashboard | ☑ Met | §3 |
| 10 | Dashboard totals agree with transaction-level records | ☑ Corrected | AC-07 |
| 11 | Audit history exists for all material reversals / conversions | ☑ Already met | §2 |
| 12 | Negative / edge cases covered by UAT | ◐ Written, **unrun** | §7 |

---

## 6. The first pass got AC-02 wrong — the full account

The first pass reported:

> AC-08 — How many qualifying transactions complete a performance cycle?
> Working default: one. Decision needed from Product Owner.

**That question was malformed, and the default was an invention.**

Neither approved document frames a performance cycle as _N transactions_. Both
frame it as qualifying activity that is either **complete** or **partial**. The
first pass invented a counting model, discovered the model needed a number the
documents do not contain, and then supplied the number itself — reasoning that
one "preserves existing behaviour".

**Preserving existing behaviour was the wrong test, and it produced a
demonstrably wrong result.** With a target of one, the very first qualifying
transaction completes the cycle, so a partially completed cycle **cannot exist**.
The pack's "Partially completed cycles must not be treated as completed cycles"
had nothing to constrain, and the test plan's TC-ROY-002 — "Given only part of
the qualifying conditions are met: keep cycle pending" — was **unreachable by
construction**. An approved acceptance test that can never be entered is proof
the model behind it is wrong.

The approved rule was available the whole time, in `PRD.md` §6.3 and
`main-PRD.md` §14.4, which define the qualifying activity and its terminal state
("legally completed purchase consumes the opportunity"), and in
`COMMISSION-TEST-PLAN.md` §1, which defines legal completion as final delivery.
The first pass did not read them, having decided the question was unanswerable.

**Corrected:** `PERFORMANCE_CYCLE_TARGET` and `PerformanceCycle.targetCount` are
gone from the schema and the codebase. Completion is the approved condition.

---

## 7. Verification

| Suite | Command | Result |
| --- | --- | --- |
| Type safety | `npx tsc --noEmit` | **PASS** — clean |
| Production build | `npm run build:check` | **PASS** — compiled, 10/10 static pages |
| Domain rules | `node … src/lib/domain/domain.check.ts` | **PASS** |
| Security / permissions | `node … src/lib/security/security.check.ts` | **PASS** |
| Tasks / IST calendar | `node … src/lib/tasks.check.ts` | **PASS** |
| Classification backfill | `npm run backfill:classification` | **PASS** — 4/4 resolved, 0 exceptions, applied and verified |
| UAT dataset | `npm run uat:seed` | **NOT RUN — blocked** (test plan §1–§8) |
| Commission end to end | `npm run commission:check` | **NOT RUN — blocked** |
| Booking end to end | `npm run booking:check` | **NOT RUN — blocked** |
| Phase 5 (cancellation, change plot, acquisition) | `npm run phase5:check` | **NOT RUN — blocked** |
| Phase 6 (completion) | `npm run phase6:check` | **NOT RUN — blocked** |
| Acquisition | `npm run acquisition:check` | **NOT RUN — blocked** |

### Why the DB-integrated suites did not run

`prisma/check-guard.ts` refuses to run any check script unless
`ALLOW_CHECK_WRITES="true"`. `.env` sets it to `"false"`, and the only
`DATABASE_URL` configured points at the production Supabase instance. The guard
exists because these scripts write and purge tagged rows; overriding it here
would run destructive test data against production. **It was not overridden.**

Exact failure: `Refusing to run a check script against
aws-0-ap-south-1.pooler.supabase.com.`

**To run them:** point `DATABASE_URL` and `DIRECT_URL` at a development or
staging database, set `ALLOW_CHECK_WRITES="true"` in that environment only, then
`npm run db:push && npm run db:seed && npm run db:check`.

### What the unrun suites would verify

`prisma/commission.check.ts` now covers, and nothing else does:

- **AC-01** — a Booking regenerated _after_ its buyer is activated as a Member
  reproduces its Customer-business components exactly, and the frozen
  classification survives a Sold By Correction.
- **AC-02 / TC-ROY-002** — 100% Payment Received alone leaves the cycle
  `IN_PROGRESS` with no `completedAt` and no entitlement, and the Royalty held on
  `PERFORMANCE_CYCLE_INCOMPLETE`.
- **AC-02 / TC-ROY-001** — recording the Registry completion completes the cycle,
  writes the derived entitlement, and releases the Royalty to `READY`.
- **AC-02** — reopening the delivery un-completes the cycle and re-holds the
  Royalty; re-completing re-achieves it; a repeated reassessment never
  double-counts.
- **AC-05** — a Buyback _after_ legal completion leaves the commission earned,
  the entitlement consumed and the cycle complete, and raises the Accounts
  review; a Buyback _before_ completion steps the records back and raises the
  CRM/management decision.
- **AC-03** — Accounts and Admin are both refused approval; MD's approval stores
  approver, time and note; only then does Paid Early go through.

`prisma/phase5.check.ts` now also covers, and nothing else did:

- **Test plan §16.5 / §19** — a Change Plot on a Member-closed sale creates no
  second commission record, keeps the same record, does not double the
  percentage, supersedes nothing, and does not reclassify the Booking. The
  existing Change Plot coverage closed through 3% Club, which earns nothing at
  all, so it could never have caught a duplicated commission.

And the dashboard, which nothing covered at all:

- **Test plan §18** — every `businessState()` figure is re-derived with its own
  independent query and compared. The split reconciles to the total; earned
  Royalty is the completed qualifying activity rather than the paid records
  (TC-ROY-001/002); the Buying Commission total is summed on exact decimals and
  reports nothing above the cap (TC-BC-002).
- **Test plan §11 TC-CM-002** — a duplicate Member activation is refused and one
  Person never holds two Member profiles.

### The UAT dataset

`npm run uat:seed` builds test plan §1–§8 through the same services the screens
call — never by writing rows directly, because a dataset that did not come from
the state machines would prove nothing about them. It is guarded like the check
scripts, re-runnable (it wipes its own four Projects and its own People, those
with mobile numbers beginning 97), and prints a table of every §1–§8 target with
a ✓ or ✗ against it, exiting non-zero if any target is short.

It builds the named scenarios rather than only the volumes: the §7 critical
historical-classification test on Rajesh Kumar step by step; a Royalty path taken
to legal completion so a performance cycle actually completes; a Member
self-purchase and a Customer-closed Loyalty sale; the §16 Change Plot; three
§15 recoveries; and **two Buybacks — one before and one after legal completion**,
because main-PRD §14.12 treats those differently and only a dataset with both can
show it.

**This blocks production acceptance.** The domain suite proves the rules in
isolation; only these prove the wiring — that `recordCompletion` reaches the
commission engine at all, that the classification survives a real regeneration,
and that the unwind branches as §14.12 requires.

---

## 8. Deviations left in place, on purpose

The running system carries wording and headings that differ from `PRD.md` and
`main-PRD.md`. **None was reverted in either pass.** They are unrelated to the
pack, already recorded, and changing them here would mix two unrelated pieces of
work into one diff.

- [`DEVIATIONS.md`](./DEVIATIONS.md) — the plain-language summary.
- [`change-requests/`](./change-requests/) — CR-001 through CR-007, carrying the
  formal fields and owner signature block `PRD.md` §28 requires.

---

## 9. Open items

### AC-09 · `PRD.md` §6.11 contradicts the pack on Paid Early

§6.11 states no MD/Admin approval is required. The pack requires it, and the
pack is implemented. §6.11 needs the corresponding revision so the documents do
not disagree with the running system.

**Decision needed from:** Product Owner, as a `PRD.md` §28 change request.

### AC-10 · Confirm "completed" means legal completion

AC-02 now reads "completed qualifying activity" as reaching **legal completion**
(final delivery), assembled from `PRD.md` §6.3, `main-PRD.md` §14.4 and the
`COMMISSION-TEST-PLAN.md` §1 glossary. Every word of that chain is approved text,
but the pack itself does not use the phrase "legal completion", so the reading is
an inference rather than a quotation.

It is the only reading that gives "not simply by recording a transaction" any
force and makes TC-ROY-002 reachable, so it is implemented rather than deferred.
Confirmation is wanted; nothing is blocked on it.

**Not open:** how many qualifying transactions complete a cycle. `PRD.md` §6.3
fixes that at one per introduced Customer as a consequence of "may be generated
only once per introduced Customer". There is no separate threshold and none is
implemented.

---

## 10. Implementation Principle

The pack's closing instruction — _"do not solve these rules only in the dashboard
layer"_ — is why each rule sits where it does:

- The **5% cap** is in the domain, so a figure entered by any path meets it.
- The **classification freeze** is on the Booking, so exports and future
  integrations read the same value the screen reads.
- The **Paid Early gate** is in `canMarkPaid()`, so hiding the button is a
  convenience, not the control.
- The **cycle gate** is in `resolveEligibility()`, beside every other hold
  reason, so a Royalty record cannot reach Ready by any route.
- The **unwind branch** is in `cancelCommissionForBooking()`, so every caller
  gets §14.12's three cases rather than the one the cancellation path wanted.
- The **Dashboard reads the records** and stores nothing of its own, so it has
  nothing to disagree with.

---

## 11. How this was committed — 3 September 2026

The working tree held the pack and four unrelated pieces of work at once, on a
branch that already carried the Next 15.0.3 → 15.5.25 upgrade. It was split so
the pack is one reviewable commit and nothing unrelated hides inside it.

| # | Commit | Carries | Pack? |
| --- | --- | --- | --- |
| 1 | `a9b4003` | `tsconfig.json` — Next's own rewrite from the 15.5 upgrade, plus the `.next-check` types entry `build:check` needs | Upgrade |
| 2 | `299f116` | One seeded password (`prisma/seed-password.ts`); the Aadhaar check finds its Person by the blind index instead of taking whichever row had one | No |
| 3 | `fc89da0` | `taskSubjects()` (DESIGN §6.2) and feet-and-inches plot sides | No |
| 4 | `93941ef` | Plot Rate & Area Calculator — client-side arithmetic, writes nothing | No |
| 5 | `77e3527` | One percentage-cap rule for shares and instalments alike | No |
| 6 | **`b917d52`** | **AC-01 … AC-07, the schema, the backfill, the checks, the UAT seed and the pack documents** | **Yes** |
| 7 | `429b84a` | Payment, final buyers and completion recorded from the inventory row | No |
| 8 | `a6570b2` | PRD §6.4 — the introducer freeze was never resolved for a first-time enquirer | No |
| 9 | `8bd3ff8` | Bank details saved without the second Accounts decision | No |
| 10 | `f4ba7cf` | List columns, and the monospace dropped across the screens | No |
| 11 | `1961496` | `?booking=<id>` opens that Booking from the Plot it sits on | No |

**Two files carry more than one concern and were not split by hunk.**
`bookings-client.tsx` holds the AC-03 Paid Early controls and the dialogs the
inventory row reuses; `dashboard-client.tsx` holds the AC-07 Business state
panel and the task-table rewrite. Both were rewritten as single pieces of work,
and splitting them by hunk would have produced two commits neither of which
compiled. They sit in commit 6 with the rest of the pack.

**Commit order follows the dependency, not the story.** The shared helpers
(commits 3 and 5) precede the pack because `domain.check.ts` imports them;
the inventory row (commit 7) follows it because `plots-client.tsx` imports the
Booking dialogs.

### Re-verified before committing

| Suite | Result |
| --- | --- |
| `tsc --noEmit` | **PASS** — clean |
| `src/lib/tasks.check.ts` | **PASS** |
| `src/lib/security/security.check.ts` | **PASS** |
| `src/lib/domain/domain.check.ts` | **PASS** |
| The six DB-integrated suites | **Still blocked** — unchanged from §7 |

Run against the whole tree, which is what every commit sums to. The individual
commits were ordered for dependency but were not each type-checked in
isolation.

### The pack's §5 checklist, re-read against the code today

Items 1–11 were confirmed in the source rather than from this document: the
cycle gate at `resolveEligibility` (`PERFORMANCE_CYCLE_INCOMPLETE`),
`originalClassification` written in one function and one migration and nowhere
else, `unwind: "BUYBACK"` reaching `cancelCommissionForBooking` from
`decideAcquisition`, `mdApproved` defaulting to false in `canMarkPaid`,
`BUYING_CAP_PERCENT` enforced in the domain and reported by `businessState`,
and every §4 visibility requirement present as a group on `BusinessState`.

**Item 12 — negative and edge cases covered by UAT — remains the one open
item.** The suites exist; they have not run. Nothing else in the pack is
outstanding.

---

# PART TWO — the Approved Business Changes Pack of 3 September 2026

Source: `3_Percent_Club_CRM_Dashboard_Approved_Changes (2).md`, with its companion
dataset `mockdata-v2.md`. The first pack's file was removed from `system/` when
this one arrived; Part One above remains the record of what was built for it, and
of what is still true of the code.

## 12. What the second pack changes, measured against the running system

Read against the source, not against Part One's claims.

| Pack clause | The system today | What the pack requires |
| --- | --- | --- |
| **CR-001 – CR-004** · Royalty ownership | Royalty follows `CustomerProfile.originalIntroducedByMemberId`, frozen from the earliest Member-sourced Enquiry (`applyIntroducerFreeze` in `enquiry-service`) | Enquiry has **no** earning role. Royalty belongs to the Member who was Sold By on the Customer's **first qualifying purchase** — provisional at the first approved Booking, final at 100% Payment Received **or** an Approved Buyback |
| **CR-013** · Position 10+ | No record is created at all: `generateCommission` skips a component whose band rate is 0 | A 0% line is **created and visible**, and it **consumes** that person's one-time opportunity |
| **CR-014, CR-027** · Cycles | One `PerformanceCycle` per Member per annual counter year, plus an `ANNUAL_COUNTER_RESET` job | Two independent cycles per Member — Invite and Royalty. Positions 1–9 must each complete. Nothing resets on an anniversary; a complete cycle becomes `Upgrade Eligible` and the next opens at the following anniversary |
| **CR-015, CR-016** · Buyback | A Buyback accelerates nothing | An **Approved Buyback is an alternative milestone** for Invite, Royalty and Loyalty, and never for Direct. An unwound Buyback rechecks each accelerated benefit against actual Payment Received |
| **CR-020 – CR-022** · Recovery | Nothing | `Recovery Outstanding` / `Negative Account` status with an external reference and no rupee amount; 15 calendar days; unresolved recovery deactivates a Member and blocks a Customer's future benefits and activation |
| **CR-006** · Self-purchase | Any Active Member buyer takes the self-purchase branch | **Only an Active Member who is the Primary Customer.** An Additional Customer who is a Member does not make it a self-purchase |
| **CR-009, CR-010** · Loyalty and conversion | Three lifetime slots enforced; nothing after the third | After the third Loyalty the Customer cannot be selected as Sold By Customer. Conversion has two routes: after three Loyalty (no inviter) and voluntary (inviter allowed, unused Loyalty forfeited) |
| **CR-019** · Paid Early | **Already built** — MD only, stored approver, time and note | Unchanged by this pack |
| **CR-024** · Buying Commission 5% | **Already built** — enforced in the domain on exact decimals | Adds an external broker as a permitted beneficiary |

Two clauses need no work. Everything else in the table is a change to who earns,
when they earn, or whether an opportunity is consumed — which is exactly the set
the pack's §32 says must not be invented, so each lands as its own reviewed
change with its own evidence.

## 13. What has already been done for this pack

| Item | Where |
| --- | --- |
| Paid Early requires MD approval (CR-019, rule 31) | `approveCommissionPaidEarly`, `canMarkPaid` — Part One AC-03 |
| Buying Commission hard maximum 5% (CR-024, rule 36) | `BUYING_CAP_PERCENT` — Part One AC-04 |
| Approved Bookings keep their classification after Member activation (CR-010 "Existing approved Bookings", acceptance 20) | `Booking.originalClassification` — Part One AC-01 |
| That classification is **visible on the Booking**, not only counted on the Dashboard | `bookings-client.tsx` — the record shows Customer/Member business, and says so plainly where the buyer has since been activated |
| Historical Customer sales create no retroactive Royalty (acceptance 21) | The freeze already prevents reclassification; CR-003's stronger rule is still to build |

## 14. Order of work, and why this order

The dependencies run one way, so the order is not a preference.

1. **Royalty ownership (CR-001 – CR-004).** Everything about Royalty positions,
   cycles and acceptance tests 1–6 rests on the Royalty Linked Member existing.
   Until it does, the rest has nothing to hang from.
2. **Position 10+ visible and consuming (CR-013).** Small, and it changes what a
   cycle counts as a completed position, so it comes before cycles.
3. **Performance cycles and the anniversary job (CR-014, CR-027).** Rebuilt on
   top of 1 and 2.
4. **Buyback as an alternative milestone, and its unwind (CR-015, CR-016).**
   Touches every one-time opportunity, so it follows the opportunities being
   correct.
5. **Self-purchase by Primary Customer only (CR-006).** Independent; small.
6. **Loyalty exhaustion and the two conversion routes (CR-009, CR-010).**
7. **Recovery and negative account (CR-020 – CR-022).** New surface, and the
   payout rules in CR-018 land with it.
8. **Portal and dashboard visibility (CR-026), reports (§40).**
9. **The v2 dataset and the standing checks (`mockdata-v2.md` §41).**

Nothing is written until the rule it implements is quoted in the code beside it,
as Part One did with its AC-nn references. The pack's own instruction in §32
governs the rest: where an implementation choice would change who earns, when,
whether an opportunity is consumed, whether a cycle upgrades or whether a payment
becomes recoverable, it is asked rather than invented, and the question is
recorded here.

## 15. Step 1 built — Royalty ownership (CR-001 – CR-004)

The Enquiry no longer decides anything. `applyIntroducerFreeze`,
`assignIntroducedPosition` and `resolveOriginalIntroducer` are gone, and the
three places that called the freeze — `createEnquiry`, `ensureCustomerProfile`
and the Member Portal's own Enquiry — now record a follow-up relationship and
nothing else. `CustomerProfile.originalIntroducedByMemberId` and its position
stay in the schema as Enquiry-era history, unread by the engine and unwritten by
anything, which is what §30 asks for: preserve old, new, history and reason.

In its place `CustomerProfile` carries the Royalty Linked Member:
`royaltyLinkedMemberId`, `royaltyLinkFirstBookingId`, `royaltyLinkFinalAt`, and
the position it takes — `royaltyPosition`, `royaltyRatePercent`,
`royaltyYearStart`. A null Member against a set first Booking is CR-003's
permanent "no Royalty Member", not a missing value.

One function owns all of it. `syncRoyaltyLink(tx, personId, actorRef)` recomputes
the link from the Bookings themselves rather than being told what changed, so
every rule in CR-002 falls out of one derivation instead of an
establish/finalise/remove trio:

| Called from | Because |
| --- | --- |
| Booking approval | the earliest approved Booking is the first qualifying purchase |
| 100% Payment Received, and a payment correction | the normal milestone |
| Approved Buyback | CR-002's alternative milestone |
| Approved cancellation | a cancelled first Booking consumes no position |
| Sold By Correction | a corrected closer corrects a provisional link |
| Primary Customer change | the Booking may now be someone else's first purchase |

A final link is never recomputed — not by a later sale, not by a later
cancellation. The position is taken only at the milestone, so "no position is
consumed" needs no special case: a provisional link has no position, and the
engine reads a position, not a name. When a link goes final after a later
Booking was already approved, that Booking's commission is regenerated, because
its Royalty would otherwise never be created by anything.

`commissionInputFor` reads the final link instead of the Enquiry freeze; the
pure engine is untouched. The Customer, Member, portal and calculator screens
now name the Royalty Linked Member and say when it is provisional.

`commission.check.ts` gains AC-06, which proves acceptance 1 – 6 end to end
against the database: an Enquiry by Member A followed by a first sale by Member B
gives the Royalty to B; the link is provisional and positionless until 100%
Payment Received; a cancelled first Booking leaves no position consumed and lets
the next Booking establish a new link; a first purchase Sold By 3% CLUB or Sold
By Customer never gains a Royalty Member however many Members sell to that
Customer afterwards; and a Member-closed repeat purchase leaves the unused
Royalty available. All eight suites pass.

Still to build, in the order §14 gives: position 10+ visible and consuming, the
two performance cycles, Buyback as an alternative milestone for Invite, Royalty
and Loyalty, self-purchase by Primary Customer only, Loyalty exhaustion and the
two conversion routes, Recovery, portal and report visibility, and the v2
dataset.

## 16. Land Inquiry, and the dataset reset

Two pieces of work outside the pack's own order, asked for while step 1 was
being finished.

**Land Inquiry Management** (`system/land-inequry-feture-.md`) is now built at
`/land-inquiries`: pre-acquisition land sourcing, in the fourteen business
sections the spec names. Three new tables — `LandInquiry`, `LandInquiryOwner`,
`LandInquiryJamabandiEntry` — and nothing else new. The Person identity, the
staff accounts and sessions, the RBAC, the append-only audit through
`runCommand`, the reference series and the Buyback / Resale workflow are all the
ones already here.

Four decisions worth recording, because each of them could have gone another way:

| Decision | Why |
| --- | --- |
| 3% Club names no source Person | The spec's §26.5 says to reuse whatever dealer classification the repository has. It has none — `THREE_PERCENT_CLUB` is a Sold By type, not a record — so a 3% Club inquiry is the company's own and is attributed by Assigned To. The alternative was inventing a dealer master the spec explicitly forbids |
| Tables and columns follow the repository, not the spec's snake_case | The schema has no `@map` anywhere. A sixty-column snake_case island would have been the only one, and the spec's own §0 and §34 both say to adapt to current conventions. Every semantic the spec states is preserved exactly |
| No universal Bigha conversion, and a check that proves it | Rajasthan's Land Revenue (Land Records) Rules 1957 Appendix I publishes different equivalents per district. Bigha and Biswa are stored as entered; square metres are canonical for the metric side, on the exact published factors |
| North Facing PLC left out of the v2 dataset | `PlcCategory` has no facing direction, and borrowing `PLAYGROUND_FACING` for it would put a percentage on a Plot under a name that does not mean what it says. Adding a category is a PLC spec change, not a dataset change |

`land-inquiry.check.ts` proves the spec's §32 list against the database: the
Another Dealer path creates no Person even when the mobile matches one, the same
dealer mobile reaches several inquiries, a retried submission creates one row,
the metric conversions are exact, Bigha alone invents no metric area, a rate
without a basis is refused, a stale version is rejected rather than merged, a
stage skip and a step back each need their reason, closing sets Status and Stage
together, Approved for Acquisition creates no acquisition, and archive hides
without deleting.

While applying its constraints, `constraints.sql` turned out to have been
failing since `PlotBoundary.adjacentPlotNumber` became `reference`. The file runs
as one script, so every statement after that line — most of the file — had never
been applied by `npm run db:constraints`. Fixed with the rest.

**The dataset.** `npm run data:reset` clears the operating data and keeps the
eight staff accounts and the people they sit on, so everyone can still sign in.
`npm run uat:seed` then rebuilds `mockdata-v1.md`, and `npm run uat:seed:v2`
builds `mockdata-v2.md` §3 – §13 beside it: four Projects, the two PLC versions,
all 78 Plots with the geometry their PLC seed implies, seventeen Members with the
Invite counter spanning every band including position 10 at 0%, the Royalty and
other Customer masters, twenty-two Enquiries and twelve Holds. The two datasets
do not collide — v1's people carry mobile numbers beginning 97, v2's begin 96.

The v2 seed also builds the §16 Royalty acceptance cases against the new rule,
and the dataset now shows them: C201 was enquired by M102 and is linked to M001,
who closed the first sale; C305 and C306 have no Royalty Linked Member at all
because their first purchase was Sold By 3% CLUB and Sold By Customer; C307's
provisional link died with its cancelled first Booking and was re-established
under a different Member; C308's Member-closed repeat consumed nothing.

§14 onward is not seeded. Those scenarios are the outcomes of pack items 2 – 8,
which are not built, and a dataset that records results the engine cannot produce
would be worse than no dataset at all.

## 17. Step 2 built — position 10+ is visible and consumes (CR-013)

The band table has always answered 0% past the ninth position. What happened
with that 0% was nothing at all: `generateCommission` dropped any component
whose rate was zero, so two things followed that the pack forbids. The Booking
never showed who was in the position — a Member could not be told why their
tenth invitee earned them nothing, because there was no record to point at. And
the invited Member's one-time Invite opportunity stayed open, so their *next*
sale would hand the inviter 1% at a position that had already been used.

The fix is one guard removed on each side, Invite and Royalty, and then the
consequences of the record existing.

**A new eligibility state, `NO_BENEFIT`, rather than a hold reason.** A hold is
something that lifts; a 0% band never becomes payable, and calling it On Hold
leaves every screen implying that one day it might. `resolveEligibility` decides
it before everything else, because nothing that follows can change it: not RERA,
not the bank, not Aadhaar, not a deactivated Member, not the 4% cap. The record
carries the pack's own wording — `No Invite Benefit — Position Above 9`.

**"No payable amount is created" is enforced on both routes.** `canMarkPaid`
refuses a `NO_BENEFIT` record, and refuses it for Paid Early too. That second
half matters: Paid Early is the route around an unready record, and MD approval
can waive a condition but must not conjure an amount that was never earned. No
Accounts payment task is raised either, and the screens offer no button.

**The opportunity is consumed anyway.** `reassessCommission` already keyed
consumption on the milestone rather than on the rate, so once the record exists
the pack's "0% still consumes that person's one-time opportunity" falls out. The
one thing added is that a 0% Royalty enters no performance cycle: a cycle is
completed by its positions 1 to 9, and a position past the ninth is outside it.

**The label lived in four screens.** Bookings, Members, the Member detail page
and the Member portal each carried their own copy of the same three-entry map,
so adding a state to the vocabulary would have left three of them printing a raw
enum. There is now one `eligibilityLabel()` in the domain and no copies.

`AC-07` in `commission.check.ts` proves acceptance 7 end to end: a tenth-position
Member closes a sale, the 0% line is created and carries `POSITION_10` beside the
Direct 3%, its eligibility is `NO_BENEFIT`, 100% payment consumes the
opportunity without making it payable, both payment routes are refused, no task
is raised, a second sale by the same Member earns the inviter nothing, and the
position never re-rates. The v2 dataset now carries the case as well, so it can
be seen on a screen and not only in a test.

Next: performance cycles and the anniversary job (CR-014, CR-027), rebuilt on
top of steps 1 and 2.

## 18. Step 3 built — performance cycles and the anniversary job (CR-014, CR-027)

The old model was an annual window. A cycle covered one counter year, a new one
opened every anniversary whether anything had been achieved or not, and only
Royalty had one at all. The pack removes that outright, so this is a rebuild
rather than an edit.

**A cycle is a set of positions, not a span of time.** It opens on an
anniversary and it ends when positions 1 to 9 have each completed, however many
anniversaries that takes. `cycleStart`/`cycleEnd` are gone; `kind`,
`cycleNumber` and `openedOn` replace them, and every Member holds two —
`INVITE` and `ROYALTY` — which upgrade independently.

**A position's success is its consumed one-time opportunity.** That was the
find worth having. CR-014 defines Invite completion as the invited Member's
first qualifying third-party transaction reaching 100% Payment Received, and
Royalty completion as the Customer's one qualifying Royalty transaction reaching
the same milestone. Both of those are already written, atomically and in one
place, by `CommissionOpportunity`: consumed at exactly that milestone, reopened
when a sale is cancelled before completion. So the pack's "cancelled/reversed
qualifying events do not count as successfully completed" needed no new code,
and there is no second source of truth to keep in step. `consumeOpportunity` and
`reopenOpportunity` call `refreshCyclesFor`, and that is the only hook.

**A position now belongs to a cycle rather than to a counter year.**
`MemberProfile.inviteCycleId` and `CustomerProfile.royaltyCycleId` are what
group a counter; the `*YearStart` columns stay as history and nothing writes
them. This is what actually removes the annual reset: the position counter keeps
climbing — past nine into CR-013's 0% band — until the cycle's own nine are
complete and the next anniversary opens a new one. The earned upgrade is a fresh
position 1 back at the top band, which is what an upgrade is *for*.

**CR-027** replaces `ANNUAL_COUNTER_RESET` with
`PERFORMANCE_CYCLE_UPGRADE_CHECK`: per Member whose anniversary is today, per
counter, open the next cycle only if the current one is already Upgrade
Eligible. A completion recorded on the anniversary itself waits a year, which is
the pack's own convention and what makes the job independent of the hour it runs
at. Re-running it opens nothing twice.

### One rule this changes, stated plainly

Royalty used to hold on `PERFORMANCE_CYCLE_INCOMPLETE` until its cycle
completed, which was AC-02's reading of the first pack. CR-004 states Royalty's
milestone directly — 100% Payment Received, or an Approved Buyback — and CR-014
makes a cycle nine positions wide. Keeping the old gate would have held every
Royalty until eight *other* Customers had bought. So the hold is gone: the cycle
decides an upgrade, not whether one commission may be paid. The hold reason is
removed from the enum, the eligibility input no longer takes
`performanceCycleComplete`, and `CommissionRecord` loses `performanceCycleId`
and `cycleCompletedAt` with it — a cycle holds positions, not records.

Legal completion consequently decides nothing about a cycle any more.
`onLegalCompletionChanged` stays as a named call because the completion service
means something by it, but it is now a plain reassessment.

### Evidence

`AC-08` in `commission.check.ts` runs it end to end: nine invited Members each
closing their first sale to 100%, a tenth invitee landing at position 10 and 0%
inside the same cycle without counting towards it, eight of nine refusing to
upgrade, the ninth turning the cycle Upgrade Eligible, the Royalty counter of
the same Member staying untouched, the anniversary run opening nothing on an
ordinary day and opening only the eligible counter on the anniversary, a second
run opening nothing, an old position keeping its cycle and rate, the next
invitee starting at position 1 of cycle 2 at 1%, and a reversed qualifying event
taking the cycle back out of Upgrade Eligible. `domain.check.ts` covers the
completion rule, the anniversary convention and the 29 February fallback.

All nine database suites, `npm run check`, `tsc --noEmit` and `npm run build`
pass, and both datasets were rebuilt so their positions sit in cycles.

Land Inquiries also moved to its own top-level navigation entry, as asked.

Next: CR-015 and CR-016 — an Approved Buyback as the alternative milestone for
Invite, Royalty and Loyalty, and its unwind. It is the seam this step left open
in both cycle-completion conditions.
