# 3% Club CRM v3.1 — Corrected Product Requirements Addendum

**English Consolidated PRD — Final Corrective Requirements & Control Specification**  
**Date:** 19 August 2026  
**Status:** Final corrective baseline — no pending owner business-policy decisions  
**Document owner:** 3% Club / Thirty Milestones LLP  
**Confidentiality:** Confidential — internal product, development, testing and operating document

---

## 1. Document Purpose and Authority

This document corrects the rule conflicts, missing controls and implementation ambiguities found during review of Version 3.0 and the earlier draft of Version 3.1.

### 1.1 Binding hierarchy

1. Version 3.0 remains the full product baseline.
2. This corrected Version 3.1 addendum overrides Version 3.0 only where this document expressly changes, clarifies or adds a rule.
3. The earlier uncorrected Version 3.1 draft is superseded and must not be used.
4. Earlier documents, mock-ups, chats and code behavior must not be used to restore a removed rule.
5. A developer must not invent a business rule where this document is silent. Any genuine ambiguity requires a numbered written change request.
6. Protected booking, payment, commission, acquisition, identity and audit records are append-only and must never be silently overwritten or hard-deleted.

### 1.2 Core boundaries retained

- CRM stores percentages, dates, statuses, references, beneficiaries and operational facts.
- CRM does not store deal value, rate, payment amount, refund amount, commission amount, payout amount, TDS or other rupee-ledger data.
- Payment Received and Payment Given are separate concepts and separate datasets.
- System timezone is **Asia/Kolkata**.
- Customer portal, customer service requests, document uploads and standalone calculator remain out of scope.

---

## 2. Resolved Decisions — No Blocking Owner Items

The five items previously shown as blocking are resolved as follows.

### RD-01 — Change Plot payment treatment

- No rupee conversion or value calculation is performed in CRM.
- Change Plot is allowed only within the same Project.
- Accounts manually records the verified Payment Received percentage applicable to the replacement Plot.
- Accounts enters a revised payment schedule totalling exactly 100%.
- Existing Payment Reference Numbers remain linked to the same Booking.
- The same Booking Number continues.
- Old and new percentages, schedule, actor, date/time and reason remain in History.

### RD-02 — Anniversary and annual counters

- The anniversary is the activated Member's **Member Activation Date anniversary**.
- Each Member has two separate annual counters:
  1. Invited Member Counter for Invite Commission.
  2. Introduced Customer Counter for Royalty.
- Positions are assigned when the Member is activated or the Customer is first validly linked as introduced.
- Existing positions never reset, renumber or move.
- At each anniversary, only newly introduced Members or Customers enter the new annual counter.
- A 29 February activation uses 28 February in non-leap years for the annual reset.

### RD-03 — 4% commission cap

- Combined sale commission for one Booking must never exceed 4%.
- The system must not trim, reduce or override any component automatically.
- A Booking Request may be saved, but Accounts cannot approve it while the generated commission combination exceeds 4%.
- The system shows **Commission Conflict — Above 4%** and creates a Dashboard task for CRM/Admin to correct Sold By, beneficiary or another invalid source detail.
- After correction, the commission engine recalculates and Accounts may continue approval.
- No sale-commission record is marked Ready or Paid while the conflict exists.
- Buying Commission remains outside the 4% sale-commission limit.

### RD-04 — Booking approved at 0% and repeated follow-up

- Accounts may approve a Booking at 0% Payment Received.
- There is no compulsory maximum number of **Keep Booking** extensions.
- Each extension requires a new follow-up/decision date and compulsory remark.
- The same Dashboard task remains Pending.
- Overdue work remains red.
- No automatic cancellation or Plot release occurs.
- All previous dates, remarks and extension count remain visible.

### RD-05 — Aadhaar operating model

- Aadhaar is stored as a protected field, not as an uploaded document.
- Normal users see only the last four digits.
- Full value is available only to specifically authorised MD/Admin users and every access is logged.
- Aadhaar is not compulsory at Booking Request.
- Customer/final-buyer Aadhaar is completed in the final-buyer process at 100% Payment Received.
- Aadhaar and PAN duplicate checks apply whenever those values are entered.
- The CRM does not include a separate privacy-request workflow.

---

## 3. Roles

| Role | Primary responsibilities |
|---|---|
| MD | Highest authority, critical permissions, exceptional corrections and recovery governance |
| Admin | System administration, projects, restrictions, users, Member activation and controlled corrections |
| Accounts | Booking decisions, Payment Received/Given confirmation, corrections, bank verification, commission processing and financial workflow checks |
| CRM | Enquiries, Holds, Booking Requests, follow-up, Customer/Member operations and workflow initiation |
| MIS | Read-only masked reporting and authorised manual task creation |
| PC | Project/Plot preparation within granted permissions; no financial approval |
| Member | Restricted Member portal and approved Member actions only |
| System | Enforces approved rules; never infers or changes business policy |

### 3.1 One MD and recovery continuity

- Exactly one active MD account exists in normal operation.
- Admin cannot alter or reset the MD account.
- If MD access is unavailable, two formally authorised company partners/signatories may approve the documented recovery or transfer procedure.
- Recovery does not create two simultaneous ordinary MD accounts.
- MFA remains mandatory for MD and Admin.

---

## 4. Allotment, Registry and Delivered

The earlier Version 3.1 draft incorrectly separated Allotment and Registry into a compulsory sequence. The approved one-route model remains.

### 4.1 Completion route

Inside one **Allotment / Registry** section, select only one route:

1. Allotment, or
2. Registry.

Do not add an Allotment-then-Registry third route without a future approved change request.

### 4.2 Allotment route

Store:

- Allotment Given: Yes/No
- Allotment Date when Yes
- Allotment Number
- Allotment Given To
- Patta Issued: Yes/Don't Know
- Patta Date when Yes

### 4.3 Registry route

Store:

- Advocate Name
- Registry Date

### 4.4 Delivered

After the selected route is completed:

- Booking and Plot show **Delivered** once.
- `Papers Legally Transferred = Yes` is set automatically under the approved CRM model.
- Delivered means the CRM's final documentation/completion state; it is not a separate physical-possession module.
- No separate Confirm Delivery button exists.
- Incorrect Delivered before genuine completion may be reopened only by MD/Admin with compulsory reason and complete history.

---

## 5. Change Plot

### 5.1 Allowed stages

- Enquiry
- Hold
- Booked
- Payment Completed

### 5.2 Enquiry and Hold

- Enquiry may change Project or interested Plot; old interest remains in History.
- Hold may move to another Available Plot for the same Customer.
- The remaining Hold time continues.
- Old Plot returns according to its active restriction.
- No Accounts approval is required for Enquiry/Hold changes.

### 5.3 Approved Booking Change Plot

- Same Project only.
- Cross-Project movement requires Cancel Booking and a new Booking Request.
- CRM selects the new Plot and enters a compulsory remark.
- Replacement Plot is transactionally blocked while under review.
- Old Plot remains allocated and shows **Change Plot Under Process**.
- Freeze the replacement Plot's current PLC snapshot at submission. If the same Customer already held that Plot, use the Hold PLC snapshot.
- Create **Accounts Verification — Change Plot**.

On approval:

- Same Booking Number continues.
- Same Primary Customer and Sold By continue.
- Old Plot returns according to its restriction and receives no RESALE tag.
- New Plot becomes Booked or Payment Completed, matching the verified result.
- Accounts manually records the applicable Payment Received percentage.
- Accounts enters a revised schedule totalling 100%.
- Existing Payment Reference Numbers remain linked.
- Commission is rechecked.
- The replacement PLC snapshot becomes permanent.

On rejection:

- Original Booking and Plot state are restored.
- Replacement Plot returns according to its previous restriction/state.
- Rejection remark is compulsory.
- The temporary replacement PLC snapshot is discarded.

---

## 6. Commission Rules

### 6.1 First qualifying Invite sale

- Only the immediate inviting Member qualifies.
- Member personal purchase does not count and does not consume the opportunity.
- Rejected Booking Requests do not count.
- The first qualifying third-party sale is the first qualifying Booking to reach 100% Payment Received.
- Invite Commission becomes eligible at 100%.
- Cancellation before legal completion restores the opportunity.
- A legally completed sale later bought back remains consumed.
- Only one current Invite Commission opportunity/record may exist per invited Member.

### 6.2 Invite bands

Per annual Invited Member Counter:

- Positions 1–3: 1%
- Positions 4–6: 0.5%
- Positions 7–9: 0.25%
- After 9: 0%

### 6.3 Royalty

- Customer was originally introduced by a Member.
- Customer later buys another Plot personally and directly through 3% Club.
- No selling Member closes the later sale.
- Royalty applies only to the Customer's first qualifying future direct purchase.
- Milestone: 100% Payment Received.
- Royalty may be generated only once per introduced Customer.
- Cancellation before legal completion restores the opportunity.
- Legally completed purchase consumes the opportunity.

Royalty bands use the separate annual Introduced Customer Counter:

- Positions 1–3: 1%
- Positions 4–6: 0.5%
- Positions 7–9: 0.25%
- After 9: 0%

### 6.4 Original Introduced By Member

- Freeze **Original Introduced By Member** at the earliest valid Member-sourced Enquiry for that Person.
- An existing Customer cannot be silently assigned a new original introducing Member.
- Later duplicate Enquiries do not overwrite the relationship.
- After freezing, correction requires Admin/MD, compulsory reason and Accounts review of commission impact.
- Under the corrected Member, the Customer receives the next available Introduced Customer position.
- The old position and relationship remain historical and are not reused.
- If two claims have the exact same timestamp, lower Enquiry ID wins unless Admin/MD resolves a documented dispute.

### 6.5 Loyalty Bonus

Rate: 1%.

A Customer may earn Loyalty Bonus by:

1. Closing a qualifying sale for a different buyer, or
2. Buying another Plot personally and directly through 3% Club.

Rules:

- Combined lifetime maximum: three Loyalty Bonuses.
- The three may be any combination of introduced-buyer sales and repeat personal purchases.
- The lifetime limit never resets.
- First personal purchase receives no repeat-purchase Loyalty.
- Repeat direct purchase may generate both Customer Loyalty and eligible Member Royalty.
- When a Member closes the repeat purchase, Direct/Invite may apply and Loyalty/Royalty do not apply.
- The final Sold By selection controls commission; Enquiry Source remains historical.

A Loyalty-qualifying Booking cancelled before legal completion:

- Unpaid Loyalty record becomes Cancelled.
- The lifetime slot reopens.
- Paid or Paid Early record becomes Accounts Adjustment Required.
- History remains.
- A legally completed sale later bought back keeps the slot consumed.

### 6.6 Loyalty closing attribution

- The buyer may be new or existing.
- Customer Loyalty applies only when that Customer is the final approved **Sold By Customer** closer.
- A pre-existing Sold By claim cannot be overwritten silently.
- After Booking approval, Sold By correction follows the controlled workflow in Section 6.10.

### 6.7 Active Member cannot close as Customer

When a Person has an Active Member capability:

- A closing action must use **Sold By Member**.
- The same action cannot generate Customer Loyalty.
- Past Customer Loyalty history remains unchanged.
- A Deactivated Member cannot earn a new Customer-closing Loyalty benefit unless reactivated.

### 6.8 Concurrency and benefit limits

Invite, Royalty and Loyalty allocation must be atomic.

Tie-breaker when two qualifying events reach 100% at the same instant:

1. Earliest verified 100% timestamp.
2. If equal, lower permanent Booking Number.

Database controls must prevent:

- More than one consumed Invite opportunity per invited Member.
- More than one consumed Royalty opportunity per introduced Customer.
- More than three consumed Loyalty slots per Customer.

### 6.9 Commission record lifecycle

Every component has internal lifecycle fields:

- Current Record: Yes/No
- Effective From
- Effective To
- Closed Reason
- Superseded By
- External Processing Completed: Yes/No

Only one current record may exist for the same Booking, commission type and beneficiary role.

Old records are superseded, never deleted.

### 6.10 Sold By correction

After Booking approval:

1. CRM/Admin raises **Sold By Correction**.
2. Reason and supporting remark are compulsory.
3. Admin/MD approves the attribution correction.
4. Accounts reviews commission impact.
5. Old current commission records become superseded.
6. New valid records are created.
7. Paid/Paid Early affected records become Accounts Adjustment Required.
8. Booking and Payment history remain unchanged.

### 6.11 Paid Early

Accounts may process commission before eligibility becomes Ready.

Required:

- Compulsory remarks
- Payment Reference No.
- Paid Date
- Actor and time

Display:

> **Paid Early — [remarks]**

Rules:

- No additional MD/Admin approval is required.
- It is not a separate maker-checker workflow unless company permissions later require two Accounts users.
- No second commission-payment task is created when the normal milestone is later reached.
- Eligibility continues to update separately.
- Paid Early is excluded from Not Paid totals.
- It cannot be marked Paid again.
- Later cancellation, buyback, payment correction or beneficiary correction may move it to Accounts Adjustment Required.

### 6.12 Payment reversal below a commission milestone

When Payment Received correction reduces progress below a commission milestone:

- Not Paid commission returns to Milestone Pending.
- Paid or Paid Early commission becomes Accounts Adjustment Required.
- No record is deleted.
- No duplicate payout task is created.
- Eligibility is reassessed when the milestone is restored.

---

## 7. Enquiries and Follow-Up

### 7.1 Enquiry task model

- Each Active Enquiry has one Pending follow-up task.
- Multiple Plot-wise Enquiries may exist for one Person/Project, and each remains a separate Enquiry record.
- Do not collapse all Plot Enquiries into one Person/Project task because the approved duplicate and follow-up rules operate per Enquiry.
- Revise reuses the same task for that Enquiry.

### 7.2 Booking cancellation and Enquiry

- Booking Request rejection or pre-approval Cancel Booking keeps the linked Enquiry Active.
- Formal Booking cancellation approval returns the linked Enquiry to Active unless CRM closes it separately using an approved Close reason.
- An Enquiry must never remain Booked when its only approved Booking is Cancelled.
- Previous Booked and cancellation events remain in History.

---

## 8. Holds and Member Hold Requests

### 8.1 Customer identity required

- Every Hold and Member Hold Request must identify the actual Customer/Person at creation.
- Anonymous Member Holds are not allowed.
- If the Member is personally buying, use the Member's linked Customer capability.
- The three-open-position rule is checked before Hold/Request creation.

### 8.2 Maximum open Plot positions

Maximum three per actual Person/Customer across all Projects, counting:

- Active Holds
- Waiting for Booking Approval
- Pending Member Hold Requests

Admin/MD exception requires reason and audit.

### 8.3 Duplicate Hold Requests

- Only one Pending Member Hold Request may exist for the same Customer and same Plot.
- Different Customers may request the same Plot.
- A second request for the same Customer/Plot shows the existing request instead of creating another queue item.

### 8.4 Hold Request expiry

- Pending Member Hold Request expires at the end of the working day if created before the configured cut-off.
- A request created after cut-off expires at the end of the next working day.
- Expired requests stop counting toward the three-open-position limit.
- Member may withdraw while Pending.
- Timestamps and history remain.

### 8.5 Hold extension review

- First extension: CRM, reason required.
- Further extension: Admin approval required.
- Submitting an extension request does not pause the Hold timer.
- If the Hold expires before approval, the extension request closes as Expired.
- The old request cannot revive the Hold; a new Hold is required.

---

## 9. Booking Review Snapshot and Cancellation

### 9.1 Booking Request snapshot

At Booking Request submission, freeze the review version of:

- Primary and Additional Customers
- Ownership shares
- Project and Plot
- PLC snapshot
- Sold By and linked beneficiary
- Booking Date
- Customer Type
- Payment schedule
- Optional remark

While Waiting for Booking Approval, these fields cannot be silently edited.

To change any frozen field:

1. Cancel the pending review version.
2. Preserve it in History.
3. Create a new Booking Request version.
4. Create a new Accounts Verification — Booking task.

### 9.2 Cancel Booking before approval

Visible action remains **Cancel Booking**.

Before Accounts approval:

- Close the Booking Request.
- Do not enter Refund Pending.
- Do not create a permanent Booking cancellation.
- Restore Available or the frozen Hold remainder.
- Linked Enquiry remains Active.
- Accounts task closes as **Request Cancelled**.
- No commission cancellation treatment applies.

### 9.3 Cancel Booking after approval

After Accounts approval:

- Enter formal Refund Pending.
- Create Accounts Verification — Refund.
- Apply payment and commission cancellation/adjustment rules.

### 9.4 Payment Not Received rejection reason

Accounts may approve at 0%, so **Payment Not Received** is not a valid reason merely because payment is zero.

It may be used only where the submitted Booking Request specifically claimed that a required payment had been received but Accounts could not verify it. Otherwise use Incomplete Details or Other.

---

## 10. Payment Received

### 10.1 Instalment statuses

Visible statuses remain only:

- Upcoming
- Received
- Overdue

Part payment is allowed, but there is no separate Partially Received status.

For each instalment show:

- Scheduled %
- Received %
- Remaining %
- Due date

Status logic:

- Received only when Remaining = 0.
- Upcoming when Remaining > 0 and due date has not passed.
- Overdue when Remaining > 0 starting the day after due date.

### 10.2 Payment schedule revision

CRM may revise the unpaid schedule:

- Received portions remain locked.
- Unpaid percentage may be split, combined or moved.
- Already received + revised unpaid total must equal 100%.
- Dates remain chronological and not before Booking Date.
- Reason is compulsory.
- Accounts approves/rejects.
- Old and new schedules remain in History.

### 10.3 Payment Reference uniqueness

- Payment Reference No. is normalised for spaces and case.
- One active Payment Reference No. must be globally unique across Payment Received and Payment Given records.
- Repeated submission returns the existing result.
- Correction supersedes and links the original; it does not overwrite it.

### 10.4 More than 100%

- Payment Received progress cannot exceed 100%.
- The CRM does not create an Excess Receipt percentage entry.
- Any amount above the external deal value remains an external accounting matter and may be referenced only through a non-percentage Accounts remark/task outside Payment progress.

### 10.5 Date validation

The following cannot be future-dated:

- Booking Date
- Payment Received Date
- Payment Given Date
- Payment Reference action date
- Commission Paid Date
- Allotment Date
- Registry Date
- Purchase Date
- Accounts decision/action date

System submission and approval timestamps are automatic and immutable.

---

## 11. Payment Given and Acquisition

### 11.1 Labels

Use:

- **Payment Received** for buyer-to-company sale progress.
- **Payment Given** for company-to-seller acquisition progress.
- **Payment Pending** as the approved visible process message when Payment Given is below 100%.

Do not rename the approved process message to Acquisition Payment Pending.

### 11.2 Payment Given schedule and corrections

Payment Given mirrors the protected mechanics of Payment Received.

Actions:

- **Revise Remaining Payment Given Date/Schedule**
- **Correct Payment Given Entry**

Rules:

- Confirmed Given portions remain locked except through correction.
- Only unpaid portions may be rescheduled.
- Schedule totals 100%.
- Original entry is never deleted.
- Corrected entry links to the original.
- Reason is compulsory.
- Maker/checker staff accounts differ for a Payment Given correction.

### 11.3 Approval threshold and correction below threshold

Accounts may approve Buyback/Purchase for Resale only after at least 20% Payment Given is confirmed.

If a correction reduces approved Payment Given below 20%:

- With no new buyer process: Plot becomes Not Available until Payment Given returns to 20% or the deal is cancelled.
- With a new Hold/Booking process active: do not automatically cancel or release anything; create **Management Action Required**, block further progression and require completion of acquisition or orderly unwind of the buyer process.

If a correction reduces Payment Given from 100% to below 100%:

- Show Payment Pending again.
- Buying Commission returns to Milestone Pending.
- Paid/Paid Early Buying Commission becomes Accounts Adjustment Required.
- New-sale commission remains On Hold — Payment Pending.

### 11.4 Deal cancellation

If acquisition is cancelled before any new buyer process:

- Plot becomes **Not Available — Deal Cancelled**.
- Plot is not sellable.
- Payment Given history remains.
- Accounts adjustment work is created where payment occurred.

If a new Hold, Booking Request or Booking exists:

- Acquisition cannot simply be cancelled.
- Management must complete the acquisition or first unwind the new buyer process through approved workflows.

### 11.5 One active acquisition

A Plot/property may have only one active Buyback or Purchase for Resale process.

Exact active duplicate acquisitions are hard-blocked. Likely duplicates show a warning using:

- Normalised Property/Project Name
- Location
- Plot/Property Number
- Seller Person
- Area
- Existing acquisition/inventory record

### 11.6 External resale property container

Approved Purchase for Resale property enters an **External Resale Property Group** with:

- Actual Property/Project Name
- Location
- Project Type
- Source = External Acquisition
- RESALE-only inventory behavior

It is not a fake normal development Project and cannot release unrelated inventory.

### 11.7 Buying Commission

- CRM proposes beneficiary and percentage.
- MD/Admin approves beneficiary and percentage.
- One beneficiary per acquisition.
- Seller/previous owner cannot receive Buying Commission for arranging their own acquisition.
- Primary or Additional Customer of that Buyback cannot be the Buying Commission beneficiary for arranging their own return.
- Buying Commission is outside the 4% sale cap.
- Milestone: 100% Payment Given.
- Before 100%: Milestone Pending.
- At 100%: create Accounts Verification — Buying Commission.
- Accounts records Paid/Paid Early with reference and date.
- Percentage correction after approval requires MD/Admin, reason and complete history.
- Cancellation before payment: Cancelled.
- Paid/Paid Early affected by cancellation: Accounts Adjustment Required.
- Later resale Booking cancellation does not cancel an earned Buying Commission.

---

## 12. Primary Customer and Ownership Shares

### 12.1 Ownership shares

- One Primary Customer is required.
- One final buyer may omit share and is treated as 100%.
- When two or more final buyers exist, a share is compulsory for every buyer.
- Total must equal exactly 100%.
- Delivery is blocked otherwise.

### 12.2 Share changes

After Booking approval but before Delivered:

- CRM may change shares.
- Reason is compulsory.
- Crucial-action second confirmation is mandatory.
- Old/new shares remain in History.
- No separate Admin approval is required under the approved rule.

After Delivered:

- Normal change is blocked.
- Exceptional audited correction only.

### 12.3 Change Primary Customer

- CRM prepares the request.
- Reason compulsory.
- Crucial-action second confirmation.
- Old Customer remains official while under review.
- Accounts approves/rejects.

On approval:

- New Customer becomes official.
- Booking Number and Plot remain.
- Existing Payment Received percentage and Payment Reference Numbers carry forward unchanged.
- Payment history changes only through an approved correction/adjustment.
- Loyalty and Royalty are rechecked only where buyer identity affects them.
- Direct and Invite remain unchanged unless a Member self-purchase or another commission conflict arises.
- Paid/Paid Early affected records become Accounts Adjustment Required.
- Ownership shares total 100%.
- Old and new Customers remain permanently visible in History.

No additional MD approval is automatically required solely because a commission was paid.

---

## 13. Member Deactivation

On deactivation:

- Portal access is disabled immediately.
- No new Member Enquiries, Hold Requests or Member-linked Booking Requests.
- Unpaid commissions become On Hold — Member Deactivated.
- Paid/Paid Early remain historical.
- Existing Network positions remain.
- Existing Enquiries remain company records and are assigned to CRM.
- Existing Customer Holds remain valid and are handled by CRM.
- Pending Member Hold Requests require CRM review and may be rejected/closed with reason.
- Booking Requests submitted while the Member was Active may continue through Accounts review; any resulting unpaid commission remains held while deactivated.
- Reactivation rechecks unpaid commission eligibility.

---

## 14. Aadhaar, PAN and Bank

### 14.1 Aadhaar statuses

- Pending: no valid Aadhaar number recorded.
- Available: valid-format number recorded.
- Verified: authorised staff has checked identity.

Commission condition uses **Aadhaar Available** unless a later rule expressly requires Verified.

### 14.2 PAN

- PAN Available requires PAN Number.
- PAN Not Available requires PAN Number to be empty.
- PAN is not an automatic commission hold.

### 14.3 Bank change

- CRM enters new bank details.
- Accounts verifies.
- Existing verified bank remains active while new details are Pending.
- On approval, new details become active and old details remain History.
- Do not automatically place every Ready commission on hold merely because a replacement bank entry is pending.
- Accounts selects only a currently Verified bank when processing a payment.

---

## 15. Plot Restrictions and Return Rules

Use one return rule everywhere.

When a Plot returns from Hold, Booking rejection, cancellation, Change Plot or acquisition:

- No active Not for Sale/Pledge restriction: Available.
- Active Not for Sale/Pledge restriction: Not Available with the restriction.
- Booking cancellation adds no RESALE tag.
- Change Plot adds no RESALE tag.
- Buyback/Purchase for Resale adds RESALE, but an active restriction still keeps the Plot Not Available.

### 15.1 Make Available & Hold

The combined **Make Available & Hold** action is removed because it was not separately approved.

Use two authorised actions:

1. Make Available, with compulsory reason and History.
2. Hold, with Customer selection and three-position validation.

---

## 16. Project and Plot Setup

The following remain binding requirements and must not be omitted from development.

### 16.1 Project lifecycle

Internal statuses:

- Setup / Not Active
- Active
- Sold Out
- Completed

**Available (Resale)** is a derived display condition, not a permanent Project status.

Rules:

- Setup/Not Active cannot accept normal Hold or Booking.
- Admin/MD releases eligible Plots and activates the Project.
- Sold Out does not block ongoing Booking/payment/delivery work.
- Completed is historical except authorised corrections.
- A returned RESALE Plot causes the display **Available (Resale)** without deleting the previous Project history.

### 16.2 Plot uniqueness and fields

Plot uniqueness:

> Project + Plot Type + Plot Number

Fields include:

- Plot Number
- Plot Type
- Width and Length for regular Plot
- Calculated Area in sq ft
- Derived sq yd and sq m
- Exact Area Override for irregular Plot with compulsory reason
- North/South/East/West boundary
- Road width when Road
- Adjacent Plot Number when Plot boundary
- Park Facing
- Derived facing/open-side display
- Restriction
- Lifecycle status
- PLC version/snapshot

### 16.3 PLC

- PLC is percentage only.
- Each distinct PLC component is charged once.
- Same category on multiple sides is not charged repeatedly.
- Available/Not Active inventory uses the latest PLC version.
- Hold and Booking use frozen snapshots.
- Corrections preserve old/new values, reason, actor and time.

### 16.4 Bulk inventory preparation

- Provide controlled Excel-style grid preparation in CRM.
- No routine user Excel/CSV upload.
- One controlled migration/import may be used before go-live with validation and reconciliation.

---

## 17. Authentication and Staff Lifecycle

### 17.1 Password and login

- Minimum 10 characters.
- Passwords stored only as secure hashes.
- No password appears in audit.
- MFA mandatory for MD/Admin.
- Initial password handling must not require a new forced-change rule that was not approved.
- Staff cannot change their own password unless a later approved policy changes this.
- Password reset logs out all sessions.
- Member login uses Member ID; mobile alone is insufficient.
- Rate limiting applies to IP and account identifier.
- Invalid Member ID and invalid password use the same generic error.

### 17.2 Emergency staff disable

Normal planned deactivation:

- Show open work.
- Reassign before disabling.

Emergency Disable:

- MD/Admin may disable login immediately with reason.
- Open work enters an Unassigned Review queue.
- Reassignment is completed afterward.
- Historical actor identity never changes.

Reassign:

- Enquiries
- Tasks/follow-ups
- Holds
- Booking responsibility
- Registry/Allotment work
- Open workflow ownership

---

## 18. Scheduled Jobs

All jobs use Asia/Kolkata time, are idempotent and recover after downtime.

| Job | Rule |
|---|---|
| Hold Expiry | Expire at exact stored expiry |
| Member Hold Request Expiry | Apply working-day cut-off rule |
| Instalment Overdue | Remaining balance becomes Overdue the day after due date |
| Payment Received Reminder | One task seven days before the next unpaid due date |
| Payment Given Reminder | One task seven days before the next unpaid due date |
| Booking Decision Alert | Red after seven calendar days without decision |
| RERA Expiry Reminder | One task seven days before expiry |
| Annual Counter Reset | Member Activation Date anniversary; new introductions only |

Requirements:

- Frequency and execution time documented.
- Process records since previous successful run.
- Retry without duplicate tasks/status changes.
- Missed runs are recovered after downtime.
- Job failure and last successful run are monitored.

---

## 19. Idempotency and Transactions

- Critical state-changing requests use a unique idempotency key.
- The server retains the key/result long enough to cover retries, at minimum 24 hours.
- Same key returns the original result.
- UI loading/disabled state is not sufficient protection.
- Database transactions/locking protect Holds, Booking submission/decision, payment corrections, Change Plot, cancellation, acquisition, commission allocation/payment and final completion.
- One Plot may have only one active commercial allocation.
- One major conflicting process may be active per Booking:
  - Refund Pending
  - Change Plot Pending
  - Buyback Pending
  - Primary Customer Change Under Review
  - Sold By Correction Under Review

---

## 20. Task Rules

- Duplicate prevention key is Record + Purpose.
- One record may have different Pending tasks for different purposes.
- One Booking uses one rolling Payment Follow-up task for the next unpaid due date.
- Its due date moves to the next unpaid instalment after the current obligation is completed or validly rescheduled.
- The task closes only when the applicable required percentage is fully received or the process is otherwise formally closed.
- All assignment, revision, escalation and automatic closure events are audited.

---

## 21. Reports, Exports and Audit

- Reports remain live.
- Payment Received and Payment Given appear in separate datasets/columns.
- Commission totals include only current, non-superseded records.
- Merged duplicate Persons are not double-counted.
- Exports remain masked.
- Export log stores report, filters, timestamp, user and row count.
- Optional export hash may be stored for integrity.
- The CRM is not required to store full historical copies of every export unless later approved.
- Old Customer portal accounts are disabled, not deleted, during migration; security history remains.

---

## 22. Person Merge

- Two Active Member profiles cannot be merged through ordinary merge.
- One Member must first be deactivated.
- Network migration requires MD approval.
- One surviving Person/Member identity remains.
- Old IDs remain searchable historical references.
- Loyalty count is rebuilt from unique qualifying historical events:
  - Do not simply add both counts.
  - Do not simply take the higher count.
  - Remove duplicate events.
  - Cap the resulting consumed count at three.
- Existing open positions may temporarily exceed three after merge.
- No new Hold/Request may be created until the Person returns within limit or Admin/MD approves an exception.

---

## 23. Member Portal Privacy and Add Enquiry

### 23.1 Commission view

Member sees only:

- Project
- Plot Type/Number
- Commission Type
- Percentage
- Milestone
- Eligibility/payment status
- Member-safe hold reason

Member does not see:

- Buyer name/mobile/Customer ID
- Aadhaar/PAN/bank
- Internal Accounts remarks
- Other Members' private data

### 23.2 Add Enquiry

- Source automatically becomes By Member.
- Person duplicate check runs.
- Existing Person details are not exposed to Member.
- Enquiry links or creates the Person through controlled CRM logic.
- Existing Original Introduced By is not overwritten.
- Enquiry is assigned to CRM.
- Member sees only Enquiries submitted by that Member and approved status information.

---

## 24. External Reference Correction

All confirmed reference values are immutable.

Correction process:

1. Select the incorrect reference.
2. Enter compulsory reason.
3. Mark old reference Superseded.
4. Enter the replacement reference.
5. Link replacement to old reference.
6. Preserve separate action date and system entry timestamp.
7. Never delete either record.

Use this for Payment Received, Payment Given, refund, commission, buyback, correction and other approved external references.

---

## 25. Acceptance Tests Added in Version 3.1

In addition to the Version 3.0 tests, the vendor must prove:

1. Booking Request fields cannot change under Accounts review without a new request version.
2. Commission conflict above 4% blocks Accounts approval and does not trim percentages.
3. Invite/Royalty/Loyalty simultaneous milestones allocate only the permitted slot.
4. Loyalty slot reopens after cancellation before legal completion.
5. Active Member cannot be selected as Customer closer.
6. Sold By correction supersedes old commission and creates adjustment work when paid.
7. Payment correction below milestone changes Paid/Paid Early to Accounts Adjustment Required.
8. Member Hold requires actual Customer and cannot bypass three-position limit.
9. Member Hold Request expires using the working-day cut-off.
10. Hold extension approval after expiry cannot revive the old Hold.
11. Change Plot freezes replacement PLC and applies manual Accounts percentage.
12. Payment Given correction below 20% follows the buyer/no-buyer rules.
13. Payment Given correction below 100% restores Payment Pending and commission holds.
14. Duplicate external acquisition is blocked/warned.
15. One final buyer may default to 100%; multiple buyers require shares totalling 100%.
16. Restriction return rule works consistently after cancellation and Change Plot.
17. Emergency staff disable immediately blocks login and queues open work.
18. Scheduled jobs recover after downtime without duplicates.
19. Merged Loyalty count is rebuilt from unique events.
20. Member portal never exposes buyer identity or sensitive data.
21. External Reference correction preserves supersession chain.
22. 29 February anniversary resets correctly in non-leap years.

---

## 26. Explicit Owner Exclusions Retained

The following are not pending and must not be added without a future approved change request:

- Project RERA operational block on release, Hold or Booking
- Member RERA selling block beyond commission-hold behavior
- Agreement-for-Sale checkpoint before Payment Received crosses 10%
- Additional legal-clause/notice fields for company-initiated cancellation
- Personal-data request/privacy-complaint workflow
- Special 50% ownership test for Member self-purchase
- Family/relative self-purchase special approval
- Allotment followed by Registry as a third completion route
- Separate compulsory Customer-confirmation call before Member Hold approval
- Customer portal
- Customer service-request module
- Customer/Member document uploads
- Standalone calculator
- Automatic cancellation or mandatory cap on Keep Booking extensions
- Two simultaneous ordinary MD accounts
- Separate Partially Received instalment status
- Excess Receipt percentage entry above 100%
- Paid Early mandatory MD/Admin approval
- Automatic bank-change hold on all Ready commission
- Generic renaming of Payment Pending to Acquisition Payment Pending

---

## 27. Go-Live Gates

Real transactions must not go live until:

1. Version 3.0 and this corrected Version 3.1 addendum are signed off.
2. Field-level permissions and maker-checker rules are implemented.
3. Status-transition and restoration tests pass.
4. Commission compatibility, cap and concurrency tests pass.
5. Payment Received and Payment Given correction tests pass.
6. Migration rehearsal and signed reconciliation are complete.
7. Database concurrency and idempotency tests pass.
8. Security/access testing and MD/Admin MFA pass.
9. Scheduled-job retry/recovery monitoring is demonstrated.
10. Backup restoration and rollback plan are approved.
11. User training and UAT are signed off.
12. Company controls hosting, repository, domain, backups and production credentials.

---

## 28. Final Implementation Instruction

No developer, designer or vendor may use the superseded uncorrected Version 3.1 draft, older chats, mock-ups or earlier code behavior to fill a gap.

Where Version 3.0 conflicts with an express correction in this Version 3.1 addendum, Version 3.1 controls.

Any future change affecting commission, payment, inventory, identity, permissions or legal completion requires:

- Change Request ID
- Owner
- Exact approved wording
- Affected screens/data/statuses
- Permission impact
- Migration impact
- Acceptance-test impact
- Release target
