# Business Model v2 — Part 1b: Monetary v2 to the docss set — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the money rules already built (Part 1, v2.1) into line with the docss set, which the Owner ruled on 10 Oct 2026 overrides v2.1.

**Architecture:** No new domain. Changes land in the existing commission engine, the Project settings service, the Sold By validator, the Buyback task, the report service and their screens. Every rule change gets a DB check in the existing `prisma/*.check.ts` suites.

**Tech Stack:** Next.js server actions, Prisma 5 + Postgres, `prisma/constraints.sql`, Node `assert` check scripts.

**Spec:** `docss/1. Business_Model_v2_Single_Source_of_Truth.md` (SSOT §n), `docss/3. Business_Model_v2_CRM_Dashboard_Change_Pack.md` (CP §n), `docss/4. …UAT_Test_Plan.md` (case IDs), gap list `docss/8. Business_Model_v2_CRM_Gap_Check.md` (D-numbers).

## Global Constraints

- Build exactly what the docss set says. Nothing from `system/business-model-v2-review.md` or `-loopholes.md`.
- Local branch `business-model-v2` only. Commit locally. **Never push, never open a PR.**
- Accepted risks (SSOT §114) are not tightened: related closer and co-buyer closer stay allowed, as do same-day repeats and reciprocal closing.
- Only mock data exists; no migration of old rights.

## Choices where the docs leave room (listed openly, not new rules)

1. **When the closer is checked (D1).** UAT LOY-02/03/04 say "Attempt select as Sold By Customer → Blocked", so the check runs where Sold By is chosen: Booking Request submission, revision and Sold By Correction. LOY-08 says a fourth closing sale "may continue", so Accounts approval is *not* blocked; the existing qualify-time cancel stays as the backstop for requests sent before the third event qualified.
2. **"Consumed" closing event (CP §17).** "Consumed" means the same thing the lifetime count already uses: a current, uncancelled CLOSING_CUSTOMER Loyalty record with `qualifiedAt` set, on a Booking that isn't cancelled, counted across merged identities.
3. **Effective time (CP §7.1, §8; UAT SET-08, SET-12).** Admin may enter an optional "Effective from" on the Draft. MD approval refuses one already in the past ("cannot be earlier than its approval"). With none, or one equal to now, the version is Active at approval. A future one makes the version **Approved**, and it becomes Active when its time arrives: a scheduled job activates it, and Booking Request submission activates any that are due first, so a late job never freezes the old version. While a version is Approved and waiting, no new Draft can be started (one open version per Project, as today).
4. **NT01** is raised to MD when Admin sends a version and closes on the decision. Assignee MD; record kind `Project`.
5. **Paid Early (CP §53, T20; UAT BUY-07).** Accounts *requests* with a compulsory reason. That raises T20 "Paid Early Approval — MD". MD approves (as today, now only on a requested record) or rejects with a note, which clears the request. The commission event and the audit row keep the history.
6. **T43 (CP §64; UAT LOY-07, TSK-05).** Raised to CRM once, on the Customer, when their third closing event qualifies. Title "Customer-Closing Limit Reached — Membership Required for Future Selling". Its text says repeat-purchase Loyalty stays separately eligible. It closes when the Person is activated as a Member.
7. **T24/T25 (CP §64, §83, §84; UAT BB-01, TSK-06/07).** T24 becomes "Reward Review — Approved Buyback", raised on every approved Buyback of a sale, with the 25% gate result in its text. T25 "Reward Review — Buyback Unwind" is new, raised on unwind. Both cover money only until Trip/Royalty exist (Parts 2–3).
8. **Deferred, by part:** economics review and Trip fields go to Part 3 (Trip) and Part 2 (Royalty Gift Programme). T21, Recovery, T22/T23, the Change Plot adjustment (D9) and the report's Recovery column go to Part 1c.

## Review Focus

1. A closer with exactly 2 consumed events and 2 more requests pending. Expected: the next submission is allowed (2 < 3); whichever pending one qualifies third wins, and the other is cancelled at qualification. Test in Task 1.
2. MD approving a version whose "Effective from" passed while it waited. Expected: refused, so Admin must re-prepare. Test in Task 3.
3. A Booking Request submitted after an Approved version's time but before the job ran. Expected: it freezes the new version. Test in Task 3.
4. Paid Early approved without a request, or requested twice. Expected: refused. Test in Task 4.
5. A Buyback where the source sale has no commission records (Club-sold first purchase). Expected: T24 is still raised (CP §83 step 11). Test in Task 5.

---

## File map

| File | Change |
| --- | --- |
| `src/lib/services/sold-by.ts` | Closer KYC, Terms, < 3 consumed (Task 1) |
| `src/lib/services/commission-service.ts` | `consumedClosingEvents()`, T43, Paid Early request/reject, T24/T25 (Tasks 1, 2, 4, 5) |
| `src/lib/services/network-service.ts` | close T43 on activation (Task 2) |
| `prisma/schema.prisma` + migration `20261010120000_business_model_v2_part1b` | `APPROVED` status; Paid Early request fields (Tasks 3, 4) |
| `prisma/constraints.sql` | stamps for APPROVED; one-open index includes APPROVED; request before approval (Tasks 3, 4) |
| `src/lib/services/commission-settings-service.ts`, `src/lib/jobs.ts` | effective time, activation, NT01 (Task 3) |
| `src/app/projects/[id]/commission-settings.tsx` + actions | Effective-from field, Approved state (Task 3) |
| `src/app/bookings/*` | Request / Reject Paid Early (Task 4) |
| `src/lib/services/acquisition-service.ts` | T24 always, T25 on unwind (Task 5) |
| `src/lib/services/report-service.ts`, `src/app/reports/reports-client.tsx` | version + route columns; Loyalty report (Task 6) |
| `src/app/members/members-client.tsx`, comments | old wording (Task 7) |
| `prisma/commission.check.ts`, `prisma/commission-settings.check.ts`, `prisma/phase5.check.ts` | tests per task |

## Tasks

### Task 1 — Customer closer preconditions (D1; CP §17, §56.2; SSOT §26, §93; UAT LOY-02/03/04/08, LOY-19)
- [ ] Add `consumedClosingEvents(tx, personId, excludeRecordId?)` to commission-service; `reassessCommission` uses it.
- [ ] `validateSoldBy(..., { sale: true })` for CUSTOMER also refuses: Aadhaar not `VERIFIED`; no `CustomerTermsAcceptance`; `consumedClosingEvents ≥ 3`.
- [ ] Rewrite the commission suite: the 5-closing loop submits all five first, then pays (two cancelled at qualification), then a sixth submission is refused; a closer without KYC and one without Terms are refused at submission.
- [ ] Run `npm run commission:check`; commit.

### Task 2 — T43 Customer-closing limit task (D2; CP §18.4, §64; UAT LOY-07, TSK-05)
- [ ] In `reassessCommission`, when a closing record qualifies as the third, `ensureTask` purpose `CUSTOMER_CLOSING_LIMIT`, kind `Customer`, assignee CRM.
- [ ] `activateMember` closes it.
- [ ] Assert one task after the third, none after the first two, closed on activation; commit.

### Task 3 — Project settings: Approved, effective time, NT01 (D3; CP §7, §8, §65, §92; UAT SET-08, SET-12, TSK-08)
- [ ] Schema `APPROVED`; migration; constraints updated.
- [ ] Prepare takes `effectiveFrom?: Date | null` (future only). Decide: past → refused; future → APPROVED; else ACTIVE now.
- [ ] `activateDueVersions(tx, projectId?)` used by the job `COMMISSION_VERSION_ACTIVATION` and by `freezeAtSubmission`.
- [ ] NT01 on send, closed on decide. Audit carries `commercialExceptionApproved`.
- [ ] UI: Effective-from input; Approved badge with its time.
- [ ] Settings suite: backdated refused, future → Approved → activated by job, submission between them freezes the new one, NT01 lifecycle; commit.

### Task 4 — Paid Early request → T20 → MD decision (D4; CP §53; SSOT §90; UAT BUY-07)
- [ ] Schema: `earlyRequestedByRef`, `earlyRequestedAt`, `earlyRequestReason`.
- [ ] `requestCommissionPaidEarly` (ACCOUNTS; reason; NOT_PAID, not Ready, not already requested) raises T20 `PAID_EARLY_APPROVAL` to MD. `approveCommissionPaidEarly` requires a request and closes T20. `rejectCommissionPaidEarly` (MD; note) clears the request and closes T20.
- [ ] Bookings UI: Accounts "Request Paid Early"; MD "Approve Early" / "Reject".
- [ ] Commission suite updated; commit.

### Task 5 — T24 / T25 (D5; CP §64, §83, §84; UAT BB-01, TSK-06/07)
- [ ] T24 title "Reward Review — Approved Buyback", raised on every approved sale Buyback, with gate text.
- [ ] T25 "Reward Review — Buyback Unwind" in `unwindApprovedBuyback`.
- [ ] phase5 suite asserts both; commit.

### Task 6 — Reports (D10; CP §73.1, §73.5; UAT VIS-06/07)
- [ ] COMMISSION rows add `projectSettingsVersion` and `route`; new `LOYALTY` report: one row per current Loyalty record with route, closer/buyer, the closing count used of 3, and the repeat count.
- [ ] Commit.

### Task 7 — Old wording (D11; Removal Audit §28; UAT OLD-11)
- [ ] Members NETWORK tab text; stale comments in acquisition.ts, reconcile.ts, booking-service.ts, cancellation-service.ts, commission.ts, domain.check.ts, seeds.
- [ ] Commit.

### Gate
- [ ] `npm run check`, `npm run build:check`, `npm run commission-settings:check`, `npm run commission:check`, `npm run phase5:check`, `npm run booking:check`.
