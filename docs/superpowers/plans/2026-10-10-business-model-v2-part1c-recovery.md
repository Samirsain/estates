# Business Model v2 — Part 1c: Recovery, Accounts Adjustment, set-off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a paid monetary benefit becomes invalid, Accounts is told (T21), can open a Recovery Outstanding with an external reference and a 15-day deadline (T22), and the beneficiary's new cash payouts are blocked until the Recovery is repaid or set off against a later benefit.

**Architecture:** A new `Recovery` model and `recovery-service.ts` for the Accounts commands. `commission-service.ts` raises T21 at every place a record becomes Accounts Adjustment Required, reads "Recovery outstanding" into eligibility as a hold, and refuses payout while one is open. The service graph stays acyclic: recovery-service imports commission-service, never the reverse.

**Spec:** SSOT §22, §90, §91, §96, §99; CP §15, §54, §61, §62.1, §64 (T21, T22), §79, §85, §87; UAT DIR-08, DIR-11, LOY-18, BUY-08, CTL-01, CTL-03, COR-02, COR-07, BB-07. Gap list D6, D9.

## Global Constraints

- No rupee amounts anywhere (CP §54 "CRM need not store rupee recovery amount").
- Local branch only; never push.
- Only Accounts handles Recovery (CP §77 "Accounts may … create/handle Recovery").

## Choices where the docs leave room

1. **Who creates a Recovery.** The docs require an external Accounts Recovery Reference and a notice date (SSOT §91; CP §54), which only Accounts can supply. So the system raises T21 "Accounts Adjustment Required" automatically, and Accounts resolves it in one of two ways: **Open Recovery** (notice date, reference, reason), or **No recovery needed** (reason), e.g. when the milestone was restored (SSOT §99) or a cheaper Change Plot turned out not to overpay.
2. **T21 sources (CP §64):** every move of a record into Accounts Adjustment Required (cancellation, payment correction, Sold By correction, Buyback unwind, Buying Commission step-back). Also an approved Change Plot on a Booking whose current Direct or Loyalty is already Paid/Paid Early (CP §61; UAT DIR-11, COR-07), because the CRM holds no prices: Accounts checks the final unit's value outside the CRM.
3. **Payout block (CP §54 "where approved rule applies"; UAT CTL-01).** While a beneficiary has a Recovery Outstanding, every new monetary payout to them is refused: Paid and Paid Early, Direct, Loyalty and Buying. Direct and Loyalty also show the safe hold "Recovery Outstanding". The entitlement stays recorded.
4. **Set-off (SSOT §91; CP §54).** Accounts may settle a Recovery against a later benefit of the same person once that benefit has reached its milestone. The benefit is marked Paid with the set-off reference. Accounts says whether that fully clears the Recovery; the CRM cannot tell, since amounts sit outside it.
5. **Deadline.** Due = notice date + 15 calendar days (Asia/Kolkata). T22 "Recovery Outstanding Follow-up" goes to Accounts, due then. Deactivation after the deadline stays a manual MD/Admin decision ("may", SSOT §91).
6. **Merge (CP §87).** An outstanding Recovery of an identity merged into a Person blocks that Person too.
7. **T23 "Correct Beneficiary Before Old Recovery — MD Approval"** (CP §64 "Keep"; built in Part 1d from its title, as the Owner directed on 10 Oct: "follow the docs"). When a Booking holds a superseded, paid record of a *different* beneficiary that is Adjustment Required and unresolved (Recovery outstanding, or T21 unanswered), the corrected beneficiary's record waits with hold "Old Recovery Pending" and T23 goes to MD. MD may approve paying first; otherwise clearing the Recovery, or closing T21 with no Recovery needed, releases it. Not built: third-party payer capture (CP §15), which is conditional on the payment workflow already holding payer metadata, and it does not.

## Tasks

### Task 1 — Schema
- [ ] `enum RecoveryStatus { OUTSTANDING CLEARED }`, `enum RecoveryClearance { REPAID SET_OFF }`, `model Recovery` (recoveryNo, personId, commissionRecordId, status, noticeOn, dueOn, reference, reason, opened*, cleared*, clearedHow, clearNote, setOffRecordId); hold reason `RECOVERY_OUTSTANDING`.
- [ ] Constraints: reference non-blank; due = notice + 15 days; cleared stamps; one OUTSTANDING per commission record.

### Task 2 — T21 everywhere a record needs adjustment; payout block; hold
- [ ] `raiseAdjustmentTask(tx, recordId, cause)` in commission-service; called at the five transition sites and from Change Plot approval.
- [ ] `resolveEligibility` input `recoveryOutstanding` → hold `RECOVERY_OUTSTANDING` (after the milestone, before beneficiary conditions).
- [ ] `markCommissionPaid` refuses while the beneficiary has a Recovery Outstanding.
- [ ] Fix `stepBackBuyingCommission` so a paid record becomes Adjustment Required even before 100% (UAT BUY-08).

### Task 3 — Recovery commands (`recovery-service.ts`)
- [ ] `openRecovery`, `closeAdjustmentWithoutRecovery`, `clearRecovery`, `setOffRecovery`. Each closes or raises T21/T22 and reassesses the beneficiary's records.

### Task 4 — Screens and report
- [ ] Bookings commission row: Accounts actions for Adjustment Required records and Outstanding Recoveries; Set off on records held by Recovery.
- [ ] Hold labels (bookings, portal, calculator); COMMISSION report `recoveryOutstanding`.

### Task 5 — Checks
- [ ] Commission suite: DIR-08 (paid Direct, payment corrected below 25% → AAR + T21), open Recovery → T22 + Direct on another sale held (CTL-01) + payout refused, set-off partial then full, clear → hold lifts (CTL-03), close-without-recovery, Change Plot T21 (DIR-11), Buying Commission Paid Early then deal cancelled → AAR + T21 (BUY-08).
