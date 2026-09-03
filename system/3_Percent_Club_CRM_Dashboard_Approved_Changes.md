# 3% Club CRM / Dashboard — Approved Changes Implementation Pack

## Status

Approved implementation baseline.

This document is a change-only implementation brief for the CRM/dashboard developer.

## 1. Core Approved Rules

### Royalty

- Royalty must be rewritten around the approved Member/Customer lifecycle.
- Royalty is earned through completed performance cycles, not simply by recording a transaction.
- The system must retain the historical classification of an already-approved Customer Booking when that customer later becomes a Member.
- Historical records must not be retroactively reclassified merely because the person's Member status changes.

### Customer → Member Activation

- A Customer may later become a Member.
- Existing approved Customer Bookings remain classified as Customer Bookings after activation.
- New eligible business generated after Member activation follows the Member rules.
- The CRM must preserve the original booking source/classification and show the current person profile separately.

### Buyback / Unwind

- Implement **Option B — Buyback unwind**.
- When an approved Buyback/unwind occurs, the related financial and commission effects must be reversed/adjusted according to the approved transaction state.
- The system must maintain an audit trail rather than deleting the original transaction.
- Any downstream commission/royalty already generated from the affected transaction must be recalculated or reversed according to the approved unwind rule.

### Performance Cycles

- Performance cycles are earned based on completed qualifying activity.
- The CRM must store cycle start/end dates, qualifying transactions, achievement status and resulting entitlement.
- Partially completed cycles must not be treated as completed cycles.
- Corrections must preserve an audit trail.

### Paid Early MD Approval

- Paid Early MD status/benefit requires the approved MD approval.
- Approval must be stored with approver, date/time and related transaction/member.
- Without approval, the system must not mark the benefit as approved.

### Primary Customer Self-Purchase

- A Primary Customer self-purchase must follow the approved Customer rules.
- The CRM must distinguish self-purchase from referral/third-party customer business.
- The transaction must not accidentally create duplicate commissions or double-count the same economic event.

### Buying Commission

- Buying Commission is capped at **5%**.
- The cap must be enforced by the system, not only by dashboard display.
- Any calculation exceeding the cap must be prevented or flagged for correction.

## 2. Transaction Integrity

Every material transaction should retain:

- Person/customer/member identity
- Project
- Plot/unit
- Booking reference
- Original transaction classification
- Current lifecycle status
- Payment references
- Commission/royalty status
- Approval status where applicable
- Created/updated timestamps
- Audit history

## 3. Status / Recovery Rules

Recovery, cancellation, Buyback and conversion events must update downstream calculations without deleting historical records.

The CRM should distinguish:

- Active
- Pending
- Approved
- Cancelled
- Recovered
- Bought Back / Unwound
- Converted
- Completed

## 4. Dashboard Requirements

Dashboard totals must be based on approved/current business state.

Provide visibility for:

- Customer vs Member business
- Active vs unwound transactions
- Earned vs pending royalty
- Performance cycle progress
- Buying Commission
- 5% cap exceptions
- Paid Early MD approvals
- Recoveries
- Customer → Member conversions
- Audit/reversal activity

Historical classification must remain visible so reports can explain why an older booking is still shown as a Customer Booking after Member activation.

## 5. Developer Acceptance Checklist

- [ ] Royalty logic replaced with approved performance-cycle logic.
- [ ] Customer → Member conversion does not rewrite historical booking classification.
- [ ] Buyback Option B implemented.
- [ ] Buyback reversals are auditable.
- [ ] Performance cycles are earned only when qualifying conditions are complete.
- [ ] Paid Early MD requires recorded approval.
- [ ] Primary Customer self-purchase is handled without duplicate commission.
- [ ] Buying Commission cannot exceed 5%.
- [ ] Recovery/cancellation states flow through commission and dashboard calculations.
- [ ] Dashboard totals agree with transaction-level records.
- [ ] Audit history exists for all material reversals/conversions.
- [ ] Negative/edge cases are covered by UAT.

## 6. Implementation Principle

Do not solve these rules only in the dashboard layer. The underlying CRM/business logic must enforce the approved rules so that reports, exports and future integrations all receive the same correct values.
