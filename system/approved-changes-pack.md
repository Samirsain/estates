# 3% CLUB CRM / DASHBOARD — APPROVED BUSINESS CHANGES PACK

**Document type:** Change-only implementation pack  
**Owner:** 3% Club / Thirty Milestones LLP  
**Baseline to modify:** `3% Club CRM v3.1 — Corrected Product Requirements Addendum`  
**Purpose:** Give Claude/developer one clean list of the newly approved business changes without reopening already-approved parts of the CRM.

> This document does **not** replace the complete PRD. It overrides the baseline only where an approved change below expressly says so. Everything not changed here continues under corrected v3.1.

---

# 1. FINAL APPROVED BUSINESS RULES

1. **Enquiry has no commission or Royalty ownership role.**
2. Royalty belongs to the Member who was **Sold By Member on the Customer's first qualifying purchase**.
3. A Royalty link is provisional at the first approved Booking and becomes final only when that first purchase reaches:
   - 100% verified Payment Received, or
   - an **Approved Buyback**.
4. If the first Booking is cancelled before either condition, no Royalty position is consumed.
5. If the Customer's first qualifying purchase was Sold By 3% CLUB or Sold By Customer, that Customer never gets a Royalty-linked Member later.
6. Royalty is paid only on that Customer's first qualifying future **direct personal purchase** through 3% Club.
7. A Member-closed repeat purchase does **not** consume unused Royalty.
8. Invite and Royalty counters upgrade **independently**.
9. Upgrade is **earned, not automatic**.
10. Positions 1–9 continue across anniversaries until the required qualifying transactions are completed.
11. After a counter becomes Upgrade Eligible, a new cycle starts at the next Member Activation Anniversary.
12. Position 10+ = **0%**, remains visible, and consumes that person's one-time opportunity.
13. Only an **Active Member who is Primary Customer** makes the Booking a Member self-purchase.
14. Member self-purchase: buyer-Member gets 3% Direct at 100%; no other Direct/Invite/Royalty/Loyalty.
15. Customer Loyalty remains 1%, maximum three lifetime benefits across all Loyalty routes.
16. After the third Loyalty, Customer may keep buying but cannot be selected as Sold By Customer on a new third-party sale.
17. Customer may voluntarily become Member before using all three Loyalty benefits; unused Loyalty is forfeited.
18. Customer converted after consuming three Loyalty benefits becomes a Member with **no inviter**.
19. Existing approved Customer-classified Bookings keep their original classification after Member activation.
20. Customer-era sales do not retrospectively create Royalty relationships after conversion.
21. Buyback may happen before Delivered and at any source-sale Payment Received stage, subject to the existing acquisition workflow.
22. **Approved Buyback is an alternative milestone for Invite, Royalty and Loyalty**, so those benefits may become payable before 100% Payment Received.
23. Approved Buyback does **not** accelerate Direct Commission.
24. If the Buyback is later cancelled/unwound, any Invite/Royalty/Loyalty that qualified only because of Buyback must be rechecked against the normal 100% milestone.
25. Commissionable Sale Value outside CRM = **(Base Property Value + PLC) − Authorised Discount**.
26. CRM remains percentage-only and stores no rupee deal, commission, payout or recovery amount.
27. Payout target = **within 7 working days** after eligibility/holds are clear.
28. No minimum payout threshold.
29. Each commission is paid separately; multiple commissions are not combined in one transfer.
30. Verified bank account is required.
31. Paid Early requires **MD approval**.
32. Recoverable payment creates `Recovery Outstanding / Negative Account` status in CRM with an external Accounts reference, but no rupee amount.
33. Recovery deadline = **15 calendar days**.
34. Unresolved Member recovery deactivates Membership; unresolved Customer recovery blocks future benefit payout and future Membership activation.
35. Correct new beneficiary may be paid before old recovery only with MD approval.
36. Buying Commission is case-by-case, Acquisition Price base, hard maximum **5%**, one beneficiary, outside 4% sale cap.
37. Buying beneficiaries may be Member, Customer or external broker.
38. Seller/previous owner cannot earn Buying Commission for arranging their own return.
39. Same person may later earn Direct Commission on a separate genuine resale.
40. Cancellation/unwind of the acquisition itself makes Buying Commission cancelled/recoverable.
41. Later resale cancellation does not cancel correctly earned Buying Commission.
42. Related-party purchase uses the **simple legal Primary Customer identity rule**; no automatic family/beneficial-owner reclassification.
43. Duplicate identity merge rebuilds Loyalty from unique qualifying events.
44. Statutory deductions are handled externally by Accounts as applicable by law.
45. Final external commission calculation uses 2 decimals; no intermediate rounding.
46. PAN and invoice are not business-rule payout blockers in this change pack.

---

# 2. CR-001 — REMOVE ENQUIRY FROM ROYALTY

## Replace current baseline rule
The current rule that freezes `Original Introduced By Member` from the earliest Member-sourced Enquiry must no longer drive Royalty.

## New rule
> **Enquiry Source is history/follow-up only. It does not decide Direct, Invite, Royalty or Loyalty.**

## Required change

- Do not create/freeze Royalty beneficiary from Enquiry.
- Existing `Original Introduced By Member` must not drive new commission logic.
- Member Enquiry features remain operational but have zero earning effect.

## Acceptance
Enquiry by Member A + first qualifying sale by Member B = future Royalty belongs to B.

---

# 3. CR-002 — ROYALTY LINKED MEMBER

Use the business concept:

> **Royalty Linked Member**

At the Customer's earliest approved first Booking:

- if `Sold By = Member`, store that Member as **Provisional Royalty Linked Member**;
- if `Sold By = 3% CLUB` or `Sold By = Customer`, no Royalty link is created.

The link becomes final and the Customer takes the next Royalty counter position only when the first purchase reaches either:

1. 100% verified Payment Received; or
2. Approved Buyback.

If that Booking is cancelled before either condition:

- provisional link is removed from current state;
- no position is consumed;
- history remains;
- a later valid first purchase may establish a new link.

Tie: if qualifying timestamps are equal, lower permanent Booking Number wins.

---

# 4. CR-003 — NO RETROACTIVE ROYALTY FOR OLD COMPANY/CUSTOMER BUYER

If the Customer's first qualifying purchase was:

- Sold By 3% CLUB, or
- Sold By Customer,

then that Customer has **no Royalty Linked Member**.

A Member who later sells another property to that existing Customer does not acquire future Royalty ownership.

---

# 5. CR-004 — ROYALTY TRIGGER

Royalty:

- one time per Customer for life;
- rate comes from the Royalty Linked Member's frozen Royalty position.

Qualifying future purchase must be:

- the same Customer as Primary Customer;
- direct personal purchase;
- Sold By 3% CLUB;
- Customer not treated as Active Member for that approved Booking;
- Royalty unused.

Normal milestone: 100% Payment Received.

Alternative milestone: Approved Buyback.

If another Member closes the repeat purchase:

- Direct/Invite may apply to that seller;
- Loyalty/Royalty do not apply on that Booking;
- unused Royalty remains available.

> **Only an actual qualifying Royalty transaction consumes Royalty.**

---

# 6. CR-005 — SOLD BY VALUES

Use only:

- Sold By Member
- Sold By Customer
- Sold By 3% CLUB

One final closer classification per Booking.

---

# 7. CR-006 — PRIMARY CUSTOMER SELF-PURCHASE

> **Only an Active Member who is Primary Customer makes the Booking a Member self-purchase.**

If only an Additional Customer is an Active Member, the Booking does not automatically become self-purchase.

Member self-purchase:

- buyer-Member receives Direct 3%;
- milestone = 100% Payment Received;
- no other selling Member receives Direct;
- no Invite;
- no Royalty;
- no Loyalty.

---

# 8. CR-007 — RELATED PARTIES

Use simple legal identity.

- Legal named Primary Customer controls classification.
- No automatic spouse/family/relative/beneficial-owner rule.
- Earlier exclusion of special family and 50% ownership tests remains aligned.

---

# 9. CR-008 — CUSTOMER LOYALTY

Rate: **1%**

Maximum: **3 lifetime Loyalty benefits per real Customer**.

May be earned by:

1. Customer closes a qualifying third-party sale; or
2. Customer makes a repeat direct personal purchase through 3% Club.

First personal purchase: no repeat-purchase Loyalty.

Repeat direct purchase may generate both:

- Loyalty 1% if available;
- Royalty if eligible.

Member-closed repeat purchase: no Loyalty/Royalty on that Booking.

---

# 10. CR-009 — AFTER THIRD LOYALTY

After third Loyalty:

- no fourth Loyalty;
- status = `Membership Invitation Required / Loyalty Exhausted`;
- Customer may continue buying;
- Customer cannot be selected as Sold By Customer on a new third-party sale.

Future selling activity requires formal Member activation.

No past Customer sale converts to Direct.

---

# 11. CR-010 — CUSTOMER → MEMBER

## Route A — 3-Loyalty conversion
Customer consumed all 3 Loyalty benefits.

On activation:

- no inviter;
- no one can receive Invite Benefit from this converted Member;
- no future Customer Loyalty;
- past Customer sales stay historical;
- past Customer sales do not retrospectively create Royalty;
- future third-party sales may earn Direct;
- future first Customer purchases sold after activation may establish new Royalty links.

## Route B — voluntary conversion before 3 Loyalty
Customer has 0, 1 or 2 Loyalty benefits.

On activation:

- an inviter may be recorded only if validly recorded before activation;
- unused Customer Loyalty is forfeited;
- future activity uses Member rules;
- past Customer sales do not become Member sales or retroactive Royalty links.

## Existing approved Bookings
Member activation changes classification only for **new Booking Requests submitted after activation**.

An already approved Booking keeps its approved Customer/Sold By/commission treatment.

---

# 12. CR-011 — INVITE BANDS

| Position | Rate |
|---|---:|
| 1–3 | 1% |
| 4–6 | 0.5% |
| 7–9 | 0.25% |
| 10+ | 0% |

Immediate inviter only.

No earning merely for joining.

Invited Member personal purchase does not count and does not consume Invite.

---

# 13. CR-012 — ROYALTY BANDS

| Position | Rate |
|---|---:|
| 1–3 | 1% |
| 4–6 | 0.5% |
| 7–9 | 0.25% |
| 10+ | 0% |

Royalty positions are now based on Customers whose **first qualifying purchase was sold by that Member**, not Enquiries.

---

# 14. CR-013 — POSITION 10+

For Invite and Royalty:

- Position 10+ earns 0%.
- Position/rate remains visible.
- Recommended visible status:
  - `No Invite Benefit — Position Above 9`
  - `No Royalty Benefit — Position Above 9`
- no payable amount is created.

> **0% still consumes that person's one-time opportunity when the qualifying event occurs.**

That person never moves into a later 1% cycle.

---

# 15. CR-014 — PERFORMANCE CYCLES

Remove automatic annual reset.

Each Member has independent:

1. Invite Performance Cycle
2. Royalty Performance Cycle

## Invite Cycle completion
Positions 1–9 must each successfully complete that invited Member's first qualifying third-party transaction through:

- 100% Payment Received, or
- Approved Buyback alternative milestone.

## Royalty Cycle completion
Royalty positions 1–9 must each successfully generate that Customer's one qualifying Royalty transaction through:

- 100% Payment Received, or
- Approved Buyback alternative milestone.

Cancelled/reversed qualifying events do not count as successfully completed.

## Upgrade

- Invite and Royalty upgrade independently.
- If a counter is incomplete on anniversary, nothing resets.
- When positions 1–9 are all successful, status becomes `Upgrade Eligible`.
- New cycle starts at the next Member Activation Anniversary.
- Existing positions never renumber/re-rate.

Implementation convention:
run upgrade check at start of anniversary day in Asia/Kolkata; completion recorded after that run waits until the next anniversary.

---

# 16. CR-015 — BUYBACK ALTERNATIVE MILESTONE

Buyback may occur before Delivered and at any source-sale Payment Received stage, while retaining the existing acquisition workflow.

Once Buyback is **Approved**:

- pending Invite may become payable before 100%;
- pending Royalty may become payable before 100%;
- pending Loyalty may become payable before 100%.

Direct is not accelerated.

Examples:

- third-party Direct at 20% + Approved Buyback → Direct still pending;
- third-party Direct at 30% + Approved Buyback → Direct already earned at 25%;
- Member self-purchase at 60% + Approved Buyback → Direct still pending until 100%.

---

# 17. CR-016 — BUYBACK UNWIND / OPTION B

If an Approved Buyback that acted as alternative milestone is later cancelled/unwound:

1. recheck Invite/Royalty/Loyalty against actual Payment Received;
2. if 100% was independently reached, keep benefit valid;
3. if 100% was not reached:
   - unpaid benefit returns to pending/available;
   - paid benefit becomes Accounts Adjustment Required / Recovery Outstanding;
   - one-time opportunity reopens;
   - successful-cycle-completion status reverses;
4. no duplicate payout later.

---

# 18. CR-017 — COMMISSIONABLE SALE VALUE OUTSIDE CRM

CRM remains percentage-only.

Accounts uses:

> **Commissionable Sale Value = (Final Approved Base Property Value + Applicable PLC Value) − Authorised Discount**

Exclude:

- GST/taxes
- stamp duty
- registration
- government levies
- documentation
- maintenance
- utility
- finance charges
- interest
- penalty
- refunds
- other pass-through charges

PLC is included in the monetary base.

CRM does not calculate/store rupee commission.

---

# 19. CR-018 — PAYOUT POLICY

After eligibility and holds/documents are clear:

- payout target = within **7 working days**;
- verified bank required;
- no minimum payout threshold;
- invoice not required as business-rule condition;
- PAN not a business-rule blocker;
- statutory deductions handled externally as applicable by law;
- final external calculation uses 2 decimal places;
- no intermediate rounding;
- every commission paid separately;
- do not combine multiple commissions into one transfer.

CRM stores payment reference/date/status, not rupee amount.

---

# 20. CR-019 — PAID EARLY

Paid Early now requires **MD approval**.

Required:

- MD approval
- compulsory written reason
- payment reference
- paid date
- beneficiary
- commission type/percentage
- actor/time

Accounts alone cannot approve Paid Early.

No second payout when normal milestone is later reached.

If later invalidated, recovery/adjustment rules apply.

---

# 21. CR-020 — RECOVERY / NEGATIVE STATUS

CRM stays percentage-only.

When paid commission becomes recoverable:

- show `Recovery Outstanding`;
- show `Negative Account`;
- link external Accounts Recovery Reference;
- **do not store rupee recovery amount in CRM**.

## Member

- future cash payout blocked;
- external Accounts may set off future commissions;
- recovery must be resolved within **15 calendar days**;
- unresolved after 15 days → Membership deactivated;
- recovery survives deactivation;
- reactivation requires Recovery Cleared + authorised reactivation.

## Customer

- future Loyalty/benefit payout blocked;
- future Membership activation blocked until Recovery Cleared.

---

# 22. CR-021 — NEW BENEFICIARY BEFORE OLD RECOVERY

If already-paid A is corrected to B:

- mark A Recovery Outstanding first;
- B may be paid before A repays **only with MD approval**;
- only B remains current valid beneficiary;
- A remains superseded/history.

---

# 23. CR-022 — CORRECTIONS

After approved Sold By / beneficiary correction:

- only new correct beneficiary retains entitlement;
- unpaid old record superseded;
- paid old record becomes recovery/Accounts adjustment;
- new valid benefit recalculated;
- Booking/payment history remains;
- no duplicate opportunity consumption.

Royalty corrections use first-qualifying-sale logic, not Enquiry.

---

# 24. CR-023 — DUPLICATE PERSON MERGE

Loyalty:

- rebuild from unique qualifying transactions;
- duplicate transaction counts once;
- cap consumed Loyalty at 3.

Royalty:

- one real person cannot keep two current Royalty links;
- determine genuine first qualifying purchase across merged history;
- its Sold By Member, if any, is the single Royalty Linked Member.

Old IDs/history remain searchable.

---

# 25. CR-024 — BUYING COMMISSION

- rate = case-by-case;
- hard maximum = **5%**;
- external monetary base = Acquisition Price;
- beneficiary = Member / Customer / external broker;
- one beneficiary per acquisition;
- seller/previous owner cannot be beneficiary for arranging own return;
- Primary/Additional Customer of that Buyback cannot be beneficiary for arranging own return;
- outside 4% sale cap;
- milestone = 100% Payment Given;
- Paid Early uses MD approval.

Same genuine person may later earn Direct on a separate resale.

---

# 26. CR-025 — ACQUISITION CANCELLATION

If the original acquisition itself is cancelled/unwound:

- unpaid Buying Commission is cancelled;
- paid/paid-early Buying Commission becomes recoverable/Accounts Adjustment Required.

If acquisition remains valid but a later resale Booking is cancelled:

> correctly earned Buying Commission remains earned.

---

# 27. CR-026 — MEMBER PORTAL / DASHBOARD

Member-safe additions:

- Invite Cycle number
- Invite position/rate/status
- Royalty Cycle number
- Royalty position/rate/status
- 0% Position Above 9 status
- Upgrade Eligible status
- next Membership anniversary date
- Recovery Outstanding / Negative Account status
- safe hold reason

Do not expose:

- buyer identity
- Aadhaar/PAN/bank
- other Members' private information
- internal Accounts notes
- rupee recovery amount

---

# 28. CR-027 — SCHEDULED JOB

Remove automatic `Annual Counter Reset`.

Replace with:

> **Performance Cycle Anniversary Upgrade Check**

Per Member, independently for Invite and Royalty:

1. check current cycle positions 1–9;
2. if not all successful, do nothing;
3. if Upgrade Eligible, open next cycle on anniversary;
4. never move existing positions;
5. retries/missed runs must not duplicate cycles.

29-Feb activation continues to use 28-Feb in non-leap years.

---

# 29. UNCHANGED CORE RULES

Unless changed above:

- Direct third-party = 3% at 25% Payment Received.
- Member self-purchase Direct = 3% at 100%.
- Invite immediate inviter only.
- Royalty once per Customer.
- Loyalty 1%, max 3 lifetime.
- Sale commission cap remains 4%.
- Buying Commission outside 4%.
- Payment Received and Payment Given remain separate.
- Booking review snapshot remains frozen.
- Payment Reference uniqueness remains global.
- corrections supersede; no silent overwrite/delete.
- Change Plot after Booking remains same Project only.
- cross-Project requires Cancel Booking + new Booking Request.
- one Primary Customer.
- multiple-buyer shares total exactly 100%.
- Delivered uses one selected Allotment or Registry route.
- CRM does not store rupee deal/payment/commission amount.
- Member portal remains privacy-masked.
- timezone = Asia/Kolkata.
- existing acquisition approval threshold/workflow remain unless separately changed.
- existing role/maker-checker controls remain.

---

# 30. MIGRATION INSTRUCTION

## If no live real transactions

- update rules before go-live;
- seed test data under the new model;
- do not preserve Enquiry-based Royalty as an earning rule.

## If real records exist
Do not bulk rewrite silently.

Owner-reviewed migration is required for:

- old `Original Introduced By Member`
- existing Royalty positions
- annual counters
- Paid Early records
- Customer-to-Member conversions
- recoveries

Preserve old/new/history/reason.

---

# 31. ACCEPTANCE CRITERIA FOR THESE CHANGES

Vendor/Claude must prove:

1. Enquiry Member does not get Royalty merely due to Enquiry Source.
2. First qualifying sale's Sold By Member establishes Royalty Link.
3. Cancelled first Booking before 100%/Approved Buyback consumes no Royalty position.
4. First purchase Sold By 3% CLUB never later gains a Royalty Member.
5. First purchase Sold By Customer never later gains a Royalty Member.
6. Member-closed repeat purchase does not consume Royalty.
7. Position 10 stays visible at 0% and never re-rates.
8. Invite and Royalty cycles upgrade independently.
9. Anniversary does not reset incomplete cycle.
10. Approved Buyback before 100% accelerates Invite.
11. Approved Buyback before 100% accelerates Royalty.
12. Approved Buyback before 100% accelerates Loyalty.
13. Approved Buyback does not accelerate Direct.
14. Buyback unwind reverses benefit supported only by Buyback.
15. Primary Customer Member self-purchase blocks other seller commission.
16. Additional Member buyer alone does not create self-purchase.
17. Third Loyalty blocks new Sold By Customer activity.
18. 3-Loyalty converted Member has no inviter.
19. Voluntary converted Member may have inviter.
20. Existing approved Customer Booking keeps old classification after Member conversion.
21. Historical Customer sale does not create retroactive Royalty.
22. Buying Commission >5% is rejected.
23. Acquisition cancellation makes Buying Commission recoverable.
24. Later resale cancellation leaves acquisition Buying Commission intact.
25. Paid Early without MD approval is blocked.
26. Recovery Outstanding blocks payout and deactivates Member after 15 days if unresolved.
27. CRM stores recovery status/reference but not rupee recovery amount.
28. No minimum payout threshold.
29. Separate commissions are not combined into one transfer.
30. Duplicate merge uses unique Loyalty events.
31. Related-party identity alone does not trigger self-purchase.

---

# 32. IMPLEMENTATION INSTRUCTION TO CLAUDE / DEVELOPER

> Treat this file as the approved change request against corrected v3.1.  
> Do not restore the old Enquiry-based Royalty model, automatic annual reset, or Accounts-only Paid Early behavior.  
> Where this document is silent, retain corrected v3.1.  
> If any implementation choice would change who earns, when they earn, whether an opportunity is consumed, whether a cycle upgrades, or whether a payment becomes recoverable, stop and raise a written business-rule question instead of inventing behavior.
