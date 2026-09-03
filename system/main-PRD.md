# 3% Club CRM — Final Developer Requirements v3.1
## Consolidated / Corrected / Complete Specification

**Status:** Final Consolidated Developer Specification  
**Baseline:** Version 3.0  
**Correction Layer:** Corrected Version 3.1  
**Authority Rule:** Version 3.0 remains the complete baseline. Version 3.1 overrides or adds requirements only where it explicitly changes or clarifies Version 3.0.  
**Implementation Rule:** This consolidated document is the single working specification. Older chats, superseded drafts, mock-ups, and previous code behavior must not be used to fill gaps.

> **Important:** The complete Version 3.0 requirements are retained below, followed by the complete corrected Version 3.1 correction/addendum. This prevents any Version 3.0 requirement from being lost while making every Version 3.1 correction enforceable.

---

# PART A — COMPLETE VERSION 3.0 BASELINE

The following is the complete Version 3.0 developer requirement set and remains binding
except where Part B explicitly changes or clarifies a rule.

---
title: "3% Club CRM"
subtitle: "Final Developer Requirements and Business Rules - Version 3.0"
author: "Document Owner: 3% Club / Thirty Milestones LLP"
date: "19 August 2026"
documentclass: report
fontsize: 10pt
geometry: margin=0.72in
toc: true
toc-depth: 3
numbersections: false
colorlinks: true
linkcolor: blue
urlcolor: blue
---

# Document Control and Binding Authority

**Document title:** 3% Club CRM - Final Developer Requirements and Business Rules  
**Version:** 3.0  
**Status:** Final superseding development baseline  
**Effective baseline:** 19 August 2026  
**Document owner:** 3% Club / Thirty Milestones LLP  
**Confidentiality:** Confidential - internal product, development, testing and operating document

## Rule hierarchy

1. This Version 3.0 document is the only binding implementation baseline for the CRM.
2. Version 3.0 supersedes Version 2.3, the Items 1-66 review workbook, earlier mock-ups, prior requirement documents and conflicting chat instructions.
3. Earlier sources may be used only to understand history. They must not be used to restore a feature, field, status, portal, approval or rule removed by Version 3.0.
4. A developer must not choose an older or easier rule when Version 3.0 is silent. Any genuine ambiguity must be raised as a written, numbered change request and approved by the owner before coding.
5. Every approved change after Version 3.0 must update requirements, permissions, status transitions, acceptance tests and migration instructions together.
6. No protected booking, payment, commission, acquisition, identity or audit record may be silently overwritten or hard-deleted.

## Core product boundaries

- The CRM is an operational, percentage, eligibility, reference and history system.
- The CRM is not a rupee-based accounting ledger.
- Deal value, rate, payment amount, refund amount, commission amount, payout amount, deductions, TDS, recoveries and financial statements remain outside the CRM.
- The CRM stores percentages, dates, statuses, reference numbers, beneficiaries and approved operational facts.
- Payment Received and Payment Given are separate concepts and must never be combined.
- The system timezone is **Asia/Kolkata**.
- Dates display as **DD/MM/YYYY**. Date-time displays use India local time.

## No pending owner policy decisions

The owner business-process review is complete. No unresolved owner policy item should delay Version 3.0. Items expressly excluded or accepted as owner decisions are listed in the final appendices.

\newpage

# 1. Product Objective, Scope and Non-Scope

## 1.1 Objective

Build a responsive real-estate CRM for plotted projects that provides one controlled operating system for:

- Staff work and follow-up
- Projects and plot inventory
- Enquiries, Holds and Booking Requests
- Approved Bookings and percentage-based payment tracking
- Customers and Members
- Direct, Invite, Royalty, Loyalty and Buying Commission rules
- Cancellation, Change Plot, Buyback and Purchase for Resale
- Allotment, Registry and Delivery
- Reports, permissions, history, security and backups
- A limited Member portal

The system must remain simple for day-to-day users while preserving strict backend controls, approvals, permissions, immutable history and duplicate protection.

## 1.2 In scope

- Individual buyers only
- Residential and Commercial plotted projects
- Residential, Commercial and Informal Sector plot types under the approved Project Type rules
- Multiple Projects and Developers
- Staff roles: MD, Admin, Accounts, CRM, MIS and PC
- Member portal access using Member ID
- Percentage-only payment and commission tracking
- Company-handled Buyback and Purchase for Resale
- Masked identity and bank information
- Excel/PDF operational reports for authorised roles

## 1.3 Out of scope

- Customer portal
- Developer or promoter portal
- Organisation or company buyers
- Flats, villas and non-plot inventory
- Private person-to-person resale not handled by the company
- Rupee ledger, price cards, stored rates or stored financial statements
- Standalone CRM calculator
- Payment gateway, banking integration or automatic accounting integration
- Automatic WhatsApp, SMS or email campaigns
- Customer or Member document uploads
- Scanned KYC, agreement or registry file storage inside the CRM
- Multi-level commission beyond the immediate approved Invite relationship
- Two selling Members sharing one Direct Commission
- Marketing-consent and privacy-request workflow

## 1.4 Design principles

- One screen should perform one clear business purpose.
- Related operations should remain inside the relevant Customer, Member, Plot or Booking record.
- Internal workflow complexity must not create unnecessary top-level tabs.
- Users see only actions they are authorised to perform.
- Permission checks must also be enforced on the server and database transaction layer.
- The system must show a clear reason whenever an action is blocked.

\newpage

# 2. Final Navigation and Screen Structure

## 2.1 Top-level navigation

The final staff navigation is:

1. **Dashboard**
2. **Plots & Sales**
3. **Customers**
4. **Members**
5. **Reports**
6. **Administration** - authorised roles only

## 2.2 Plots & Sales sub-navigation

- Plot Inventory
- Enquiries
- Bookings

There is no separate Resale Inventory. A returned or externally acquired Plot appears in normal Plot Inventory with an automatic **RESALE** tag.

## 2.3 Removed top-level modules

The following must not appear as separate top-level modules:

- Tasks
- Checklists
- Workflow
- Approvals
- Holds
- Cancellations
- Commissions
- KYC
- Service Requests
- Customer Requests
- Customer Portal
- Calculator
- Audit Logs
- Exports
- MIS Summary
- Resale Inventory

Their approved functions are embedded in Dashboard, record profiles, Reports or Administration.

## 2.4 Universal search

Search must respect field-level permissions and support, where applicable:

- Project
- Plot Number
- Customer Name
- Mobile
- Booking Number
- Enquiry ID
- Customer ID
- Member ID
- Aadhaar last four digits
- PAN last four digits

Search results must never expose full Aadhaar, full bank account number or password information.

# 3. Roles, Permissions and Maker-Checker Controls

## 3.1 Final roles

### MD

- Highest-authority account
- Full operational and governance visibility
- Controls Admin accounts and critical permissions
- Can perform exceptional corrections within approved rules
- Cannot be disabled through ordinary workflow

### Admin

- Broad operational administration
- Projects, Plot setup, restrictions, users, permissions and controlled corrections
- Member activation/deactivation and access control
- Cannot alter the MD account or self-elevate authority

### Accounts

- Booking approval/rejection
- Payment Received and Payment Given confirmation
- Payment corrections
- Bank verification
- Commission payment processing
- Refund, Change Plot and acquisition verification
- Full bank details where authorised
- No full Aadhaar or PAN access unless separately authorised as Admin/MD

### CRM

- Enquiries, Holds, Booking Requests and Customer/Member operations
- Operational follow-up and final-buyer details
- Initiates cancellations, Change Plot and acquisition processes
- Cannot approve own maker-checker requests
- No default access to full sensitive identity or bank values

### MIS

- Read-only operational reporting and masked visibility
- May create manual tasks
- No financial approval
- No full identity or bank values

### PC

- Project and Plot operational preparation within granted permissions
- No financial approval
- No full sensitive data
- No Member portal administration unless separately granted

### Member

- Limited Member portal only
- Can view only own approved data and perform only the approved Member actions

## 3.2 Permission rules

- UI visibility and server-side authorisation must both enforce every permission.
- Holding multiple roles does not permit self-approval.
- Maker and checker Staff Account IDs must be different for protected workflows.
- MD/Admin may see all Dashboard work; ordinary staff see assigned work and authorised linked records.
- Sensitive access must be logged.
- No export may contain full Aadhaar, full PAN, full bank account, passwords or secret credentials.

## 3.3 Maker-checker workflows

Different staff accounts are required for:

- Booking Request creation and Accounts decision
- Bank-detail entry and verification
- Payment correction and verification
- Commission payment preparation/processing where separate entry exists
- Cancellation/refund decision
- Change Plot financial verification
- Buyback and Purchase for Resale verification
- Buying Commission approval and processing
- Primary Customer change and Accounts approval

## 3.4 Crucial-action second confirmation

The following actions require an explicit second confirmation before submission:

- Submit Booking Request
- Hold
- Confirm Payment Received
- Confirm Payment Given
- Cancel Booking
- Change Plot
- Submit Buyback
- Submit Purchase for Resale
- Mark Commission Paid
- Mark Commission Paid Early
- Approve
- Reject
- Complete Allotment
- Complete Registry
- Change ownership shares after Booking approval
- Change Primary Customer
- Merge duplicate Persons
- Make a restricted Plot Available

After the second confirmation:

- Disable the action button
- Show processing state
- Prevent repeated clicks
- Return the existing result on retry
- Never create duplicate records, numbers, tasks or references

# 4. Dashboard and Unified Work Management

## 4.1 Dashboard replaces My Work and separate work modules

All staff work appears in one Dashboard task list.

Views:

- Today
- Overdue
- Upcoming
- Completed
- All
- Date Range

## 4.2 Task statuses and actions

Visible task statuses are only:

- Pending
- Completed

**Revise** is an action, not a separate final status. Revise keeps the task Pending, records the reason or result and updates the next date where required.

There is no visible Sent Back status.

## 4.3 Visual rules

- Urgent task: yellow
- Overdue task: red
- When both apply, overdue red wins
- Waiting work remains Pending with the latest reason

## 4.4 Manual task creation

One button: **+ Add Task**

Permitted users include authorised Admin, CRM and MIS.

Fields:

- Title
- Assigned employee
- Due date
- Recurrence
- Optional linked Customer
- Optional linked Member
- Optional linked Plot
- Optional linked Booking
- Optional remark
- Urgent: Yes/No

Recurrence values:

- Daily
- Weekly
- Every 15 Days
- Monthly
- Quarterly
- Half-yearly
- Yearly

## 4.5 Automatic work rules

- Only one Pending task may exist for the same record and purpose.
- A linked business action automatically completes the relevant task.
- Revising a task must reuse the same task where the business purpose is unchanged.
- Task history records previous dates, results, remarks, assignee and actor.

## 4.6 Common Accounts task titles

- Accounts Verification - Booking
- Accounts Verification - Payment
- Accounts Verification - Payment Correction
- Accounts Verification - Refund
- Accounts Verification - Change Plot
- Accounts Verification - Buyback
- Accounts Verification - Purchase for Resale
- Accounts Verification - Commission
- Accounts Verification - Bank Details
- Accounts Verification - Primary Customer Change
- Accounts Verification - External Reference

# 5. Universal Person, Identity and Duplicate Management

## 5.1 One Person, One Record

Use one immutable Person record with optional capabilities:

- Enquiry person
- Customer
- Member
- Seller
- Final registration buyer
- Staff, where applicable

A Person may be both Member and Customer without duplicate identity records.

## 5.2 IDs

- Person UUID: immutable internal key
- Customer ID: created when the first Booking Request is submitted and retained even if rejected
- Member ID: created and activated only after Admin/MD activation
- Booking Request ID: temporary pre-approval identifier
- Booking Number: created only after Accounts approval

## 5.3 Duplicate controls

Strong duplicate checks:

- Aadhaar
- PAN
- Existing Customer ID
- Existing Member ID
- Existing Person relationship

Mobile rules:

- Matching mobile creates a warning, not a hard block.
- Shared family, office or contact mobiles are allowed with a reason.
- Shared mobile must not merge different people.
- Shared mobile must not automatically open multiple Person records.

## 5.4 Controlled Person merge

Only Admin or MD may merge confirmed duplicates.

Process:

1. Verify identity.
2. Select the surviving Person.
3. Move linked capabilities, Enquiries, Bookings, commission relationships and history.
4. Mark the duplicate record **Merged**.
5. Preserve old Customer and Member IDs as searchable historical references.
6. Record actor, date/time, reason and affected links.
7. Never merge genuinely different people only because they share a mobile.
8. Never hard-delete the merged record.

## 5.5 Identity corrections

Corrections preserve:

- Old masked value
- New masked value
- Reason
- Changed by
- Changed date/time
- Approval where required

# 6. Customers

## 6.1 Customer list

Columns:

- Customer ID
- Name
- Mobile
- City
- Customer Type
- Aadhaar ending last four
- PAN Available / PAN Not Available

The main list must not display full private details.

## 6.2 Customer profile sections

1. Overview
2. Invited By
3. Property Activity
4. Aadhaar & PAN
5. Bank Details
6. Loyalty Bonus
7. History

## 6.3 Customer profile rules

- Customer Type: End User or Investor
- Invited By is separate from Enquiry Source and Sold By.
- Property Activity shows all Enquiries, Holds, Booking Requests, Bookings, payments, Change Plot, cancellations, acquisitions, Allotment, Registry and Delivery.
- Original commercial Booking Customer and final registration buyer must remain distinguishable.
- Customer has no portal in Version 3.0.

## 6.4 Customer actions

Authorised staff actions:

- Start Enquiry
- View Available Plots
- Hold
- Start Booking
- Add Task

# 7. Members and Member Portal

## 7.1 Member activation

- CRM may create or complete a Member profile.
- Only Admin or MD may activate a Member.
- Member ID and Network position become active at activation.
- Activation cannot be backdated.
- Member must be Active before a Booking Request to receive Member commission.

Before activation the Person cannot:

- Access Member portal
- Request Hold as Member
- Add Enquiry as Member
- Introduce Members or Customers in Network
- Receive Member commission

## 7.2 Member list

Columns:

- Member ID
- Name
- Mobile
- City
- Firm Name
- Member Status
- RERA Status

Search:

- Member ID
- Name
- Mobile
- City
- Firm
- RERA Number
- Aadhaar last four
- PAN last four

## 7.3 Member profile sections

1. Overview
2. Network
3. Deals
4. Commission
5. Aadhaar, PAN & Bank
6. Member Access
7. History

## 7.4 Member status and deactivation

Statuses:

- Active
- Deactivated

When deactivated:

- Member portal is disabled.
- No new Member Enquiries, Hold Requests or Member-linked Booking Requests may be created.
- All unpaid commissions become **On Hold - Member Deactivated**.
- Paid and Paid Early records remain historical.
- Reactivation rechecks unpaid commission eligibility.
- Admin/MD authority and compulsory reason are required.

## 7.5 Member portal login

- Every portal-enabled Member logs in using unique **Member ID**.
- Shared mobile is allowed only as a contact number.
- Mobile number alone must not identify the Member login account.
- Password reset requires the exact Member ID plus identity verification.
- Passwords are never visible after creation.

## 7.6 Member portal views

Member may view only their own:

- Profile
- Network
- Deals
- Commission status
- Enquiries
- Hold Request status

Member portal actions:

- Add Enquiry
- View Available Plots
- Request Hold

Member cannot:

- Start Booking directly
- Create or edit Customer profiles
- Add staff tasks
- Confirm payments
- Approve or reject workflows
- Change commission
- View full identity or bank values
- Access Reports or Administration

## 7.7 Network terminology and corrections

Use **Invited By**, never Inviter in the visible UI.

Before Member activation:

- CRM may correct Invited By normally.

After activation:

- Only Admin/MD may correct Invited By.
- Reason is compulsory.
- Existing Members are not renumbered.
- Corrected Member receives the next available Network position under the correct Member.
- Paid or pending commission impact creates Accounts work.

# 8. Projects, Plot Inventory, Restrictions and PLC

## 8.1 Project rules

Project Types:

- Residential
- Commercial

Plot Types:

- Residential
- Commercial
- Informal Sector

A Commercial Project cannot contain Residential Plot Type.

## 8.2 Plot Inventory list

Columns:

- Project
- Plot Type / Plot Number
- Area
- Status
- Location Charge (PLC %)
- Restriction / reason
- Customer name / ID if allocated
- Selling Member / ID
- Payment Received progress
- Payment Given progress where applicable
- RESALE tag
- Next action

There is no Resale Tag filter unless later approved. The RESALE tag is automatic and cannot be manually added to an ordinary Plot.

## 8.3 Plot lifecycle statuses

- Not Available
- Available
- Hold
- Waiting for Booking Approval
- Booked
- Payment Completed
- Refund Pending
- Delivered

Additional visible process messages may include:

- Change Plot Under Process
- Buyback Under Process
- Payment Pending
- Not Available - Deal Cancelled

These messages must not create conflicting duplicate lifecycle states.

## 8.4 Plot actions by state

### Available

- Hold
- Start Booking
- Edit Plot Details - authorised users only

### Hold

- Extend Hold
- Cancel Hold
- Book

### Waiting for Booking Approval

- Status and linked request only
- Cancel Booking through the approved pre-approval rule

### Booked

- Open Booking
- Follow-up
- Cancel Booking
- Change Plot

### Payment Completed

- Prepare Allotment / Registry
- Cancel Booking where permitted
- Change Plot before Delivered

### Delivered

- View Delivery
- No normal cancellation or Change Plot

## 8.5 Location Charge (PLC %)

- Use the visible term **Location Charge (PLC %)**.
- PLC is percentage only.
- Current PLC is snapshotted at Hold or Booking Request submission.
- Active Hold and Booking snapshots do not change when Project PLC changes.
- A returned Plot uses the latest active PLC unless an authorised preserved snapshot rule applies.
- PLC corrections preserve old and new values, reason, maker, approver and time.

## 8.6 Plot restrictions

Restrictions:

- Not Yet Released
- Not for Sale
- Pledge

Visible inventory uses **Not Available** rather than Unreleased.

Admin/MD may:

- Apply Not for Sale or Pledge with reason
- Remove the restriction and make the Plot **Available**
- Use **Make Available & Hold** where the Plot should immediately be held for a selected Customer

Once Available, the Plot may receive:

- Enquiries
- Holds
- Booking Requests

If a restriction is added after a Hold or Booking already exists:

- Do not silently cancel the transaction.
- Record the restriction.
- Apply it if the Plot later returns to inventory.
- Interrupting an active transaction requires the proper cancellation, Change Plot or Buyback process.

## 8.7 Locked commercial details

Important Plot details are locked during:

- Active Hold
- Waiting for Booking Approval
- Booked
- Payment Completed
- Change Plot
- Cancellation / Refund
- Buyback
- Delivery / legal process

Authorised correction requires:

- Reason
- Old/new history
- Revalidation of PLC, payments and commission where applicable

## 8.8 Returned Plot rules

- Booking Cancellation: Available, no RESALE tag
- Buyback: Available + RESALE after approval
- Purchase for Resale: Available + RESALE after approval
- Failed/cancelled acquisition: Not Available - Deal Cancelled
- A returned resale Plot in a Sold Out or Completed Project remains visible and the Project may show **Available (Resale)**.

# 9. Enquiries

## 9.1 Enquiry list

Columns:

- Enquiry ID
- Name
- Mobile
- City
- Interested Project
- Interested Plot / Type
- Enquiry Source
- Next Follow-up Date
- Status
- Assigned employee - Admin/MD visibility as configured

## 9.2 Enquiry sources

- Online / Advertisement / Website
- Site Visit
- By Member
- By Customer
- Existing Customer
- Direct / Walk-in

Source Person is required for By Member and By Customer.

Enquiry Source records how the enquiry arrived. It does not automatically decide commission.

## 9.3 Duplicate Enquiry rules

- Different Person + same Project + same Plot: allowed
- Same Person + same Project + same Plot: only one Active Enquiry
- Same Person + same Project + different Plot: allowed
- Same Person + different Project: allowed
- Same Person + same Project + no Plot: only one Active General Enquiry
- Closed Enquiry may later be created again for the same Plot
- Project-level Enquiry without Plot is allowed
- An Enquiry never blocks a Plot

## 9.4 Enquiry statuses

- Active
- Booked
- Closed

Close reasons:

- Invalid Number
- Budget Issue
- Not Interested
- Loan Denied
- Other - remark compulsory

**Not Picking Call** is not a Close reason.

## 9.5 Follow-up through Revise

Outcomes:

- Contacted
- Not Answered
- Call Later
- Site Visit Planned
- Booking Discussion

Fields:

- Next date
- Optional time
- Optional remark

The system must show the previous result/date and keep only one Pending follow-up task.

## 9.6 Enquiry actions

- Follow-up
- View Available Plots
- Hold
- Start Booking
- Close Enquiry

# 10. Holds and Member Hold Requests

## 10.1 Hold creation

Hold may originate from:

- Plot
- Enquiry
- Customer
- Member profile

Visible button: **Hold**

Rules:

- Duration is automatically 72 hours.
- No duration field is shown at creation.
- Select Enquiry, Customer or Member context.
- Optional remark.
- Store Project, Plot, CRM, start, expiry, PLC snapshot and creator.
- Member Hold requires an actual Customer before Booking unless the Member is personally buying.

## 10.2 Held Plot display

Show:

- Status
- Held For type
- Name / ID / mobile according to permission
- Created time
- Expiry time
- Time remaining
- Responsible CRM
- PLC snapshot
- Extension count
- Hold age

Actions:

- Extend Hold
- Cancel Hold
- Book

## 10.3 Hold task

Dashboard task remains Pending until Hold is booked or cancelled.

**Done** offers:

- Cancel Hold
- Book

**Revise** means Extend Hold:

- New expiry
- Optional remark
- Same task remains Pending
- History retained

## 10.4 Hold extensions

- First extension: CRM, reason required
- Further extension: Admin approval required
- Old and new expiry, actor, reason and count remain in history

## 10.5 Hold and Booking Request interaction

- Freeze remaining Hold time when Booking Request is submitted.
- Approval permanently ends the Hold.
- Accounts rejection restores the frozen remaining duration.
- A direct Available-Plot request returns to Available on rejection.
- Expired Hold cannot be submitted for Booking.

## 10.6 Maximum open Plot positions

Maximum **three open Plot positions per actual Customer** across all Projects.

Count together:

- Active Holds
- Waiting for Booking Approval
- Pending Member Hold Requests linked to that Customer

A Member may request Holds for many different genuine Customers.

An authorised Admin/MD exception for a genuine multi-Plot buyer requires a reason and audit.

## 10.7 Member Hold Requests

- A request does not block the Plot before CRM approval.
- A Member may select only their own linked Enquiry, Customer or CRM-supplied record.
- Member cannot browse unrelated Customers or Enquiries.
- Multiple different Customers may request the same Plot.
- Only one Pending Hold Request may exist for the same Customer and same Plot.
- Oldest Pending request is processed first separately for each Plot.
- A later request on another Plot is not blocked by an older request elsewhere.
- No compulsory separate Customer-confirmation call is required.
- On CRM approval, create the actual 72-hour Hold.

# 11. Booking Requests and Approved Bookings

## 11.1 Booking initiation

Booking may start from:

- Available Plot
- Hold
- Enquiry
- Customer profile
- Member profile - staff side only

From a Member profile:

- Select or create the actual Customer.
- Member is the buyer only when personally purchasing.
- Sold By Member is selected only when the Member actually closes the deal.

## 11.2 Booking form

Fields:

- Primary Customer
- Additional Customer(s)
- Ownership shares where used
- Project
- Plot
- Area
- Location Charge (PLC %) snapshot
- Customer Type
- Booking Date
- Sold By
- Payment Schedule
- Customer details
- Optional remark

Use visible terms:

- Customer
- Primary Customer
- Additional Customer

Do not use Applicant or Co-applicant as the primary visible terminology.

## 11.3 Sold By

Values:

- 3% Club
- Member
- Customer

Sold By is separate from Enquiry Source.

The person who actually closes the deal receives the applicable benefit:

- Member closes: Member Direct Commission and possible Invite Commission
- Customer closes for a different buyer: Customer Loyalty Bonus
- 3% Club closes directly: no Member Direct or Invite Commission; applicable Royalty and/or repeat-purchase Loyalty may apply

Sold By freezes after Booking approval and may be corrected only through an authorised, audited correction.

## 11.4 Payment schedule

- Percentage only
- Total exactly 100%
- Due dates chronological
- No due date before Booking Date
- No future Booking Date
- Backdated Booking Date requires reason

## 11.5 Submission and Accounts decision

On submission:

- Create temporary Booking Request ID.
- Plot becomes Waiting for Booking Approval.
- Hold timer pauses where applicable.
- Create **Accounts Verification - Booking**.

Accounts actions:

- Approve
- Reject

No Revise action for Accounts Booking decision.

Reject reasons:

- Payment Schedule Incorrect
- Incomplete Details
- Payment Not Received
- Other

Approval may occur at 0% Payment Received.

On approval:

- Generate permanent Booking Number.
- Plot becomes Booked.
- Enquiry becomes Booked.
- Hold ends.
- Sold By freezes.
- Payment and commission engines start.

On rejection:

- Restore exact previous Plot/Hold state.
- Enquiry remains Active.
- Customer ID remains permanent.
- Request and rejection history remain.

## 11.6 Booking decision period

- Decision/follow-up period is seven calendar days from Booking Request submission.
- Overdue Dashboard task turns red.
- CRM may choose:
  - Keep Booking with new follow-up/decision date and compulsory remark
  - Cancel Booking
- Same Dashboard task remains Pending when kept.
- All previous outcomes, dates, remarks and extension count remain visible.
- No automatic release.
- No compulsory maximum number of extensions.

## 11.7 Cancel Booking button before and after approval

The visible action is **Cancel Booking** in both stages, but backend treatment differs.

### Before Accounts approval

- Close/cancel the Booking Request.
- Do not enter Refund Pending.
- Do not create a permanent Booking cancellation.
- From Available: return Plot to Available.
- From Hold: restore frozen Hold remainder, unless CRM also cancels the Hold.
- Enquiry remains Active.
- Accounts Booking task completes as request cancelled.
- No commission cancellation treatment is applied.

### After Accounts approval

- Start the formal Cancellation workflow.
- Enter Refund Pending.
- Create Accounts Verification - Refund.
- Apply the approved payment and commission treatment.

## 11.8 Booking page sections

- Overview
- Payment
- Documents
- Commission
- Allotment / Registry
- History

# 12. Payment Received and Instalments

## 12.1 General rules

- Payment tracking is inside Booking.
- Percentage only; no rupee value.
- Instalment statuses: Upcoming, Received, Overdue.
- Accounts confirms verified payments.
- Allocate to oldest unpaid instalment first.
- Part payment is allowed.
- Cumulative Payment Received cannot exceed 100%.

## 12.2 Confirm Payment Received

Button: **Confirm Payment Received**

Fields:

- Payment Received This Time (%)
- Payment Date
- Payment Reference No.
- Optional remark

Payment Received This Time is incremental, not cumulative.

## 12.3 Payment Reference No.

- Hard duplicate block after normalising spaces and case.
- Repeated click returns existing result.
- Original reference cannot be silently overwritten.
- Correction creates a linked replacement and retains the old record.

## 12.4 Cumulative due follow-up

Dashboard shows:

> Previous unpaid percentage + current instalment percentage = total due by next due date

Create reminder seven days before due date. On the next calendar day after due date, unpaid balance becomes Overdue and turns red.

## 12.5 Revising unpaid payment dates

Action: **Revise Remaining Payment Date**

Fields:

- New due date
- Reason
- Optional remark

Create Accounts Verification - Payment.

Approval shifts only the remaining unpaid percentage. Received percentage and previous history remain locked.

## 12.6 Correct Payment Entry

- Original entry is never deleted.
- Mark original as corrected.
- Record correction reason.
- Create correct replacement entry.
- Recalculate schedule, payment progress and commission.
- Use Accounts Verification - Payment Correction.
- Maker and checker must differ.

## 12.7 Reversal below 100%

Before Allotment/Registry:

- Payment Completed returns to Booked.
- Allotment/Registry work pauses.
- Commission is recalculated or rechecked.
- Final workflow restarts only at 100% again.

After Delivered:

- Normal reduction is blocked.
- MD/Admin exceptional correction requires authority, reason and full history.

# 13. Primary Customer, Ownership Shares and Final Registration Buyer

## 13.1 Ownership shares

- Identify one Primary Customer.
- Additional Customers may be linked.
- Once shares are used, total must equal exactly 100%.
- Identity and duplicate checks apply to every linked Person.

## 13.2 Share changes

Before Booking approval:

- CRM may edit Customers and shares normally.

After Booking approval but before Delivered:

- CRM may change shares.
- Crucial-action second confirmation is mandatory.
- Reason is compulsory.
- Old and new shares remain in history.
- Total must remain 100%.
- Recheck final-buyer readiness.

After Delivered:

- Normal share changes are blocked.
- Exceptional audited correction only.

## 13.3 Final registration buyer

Final registration buyer may differ from the original commercial Booking Customer.

A registration/nominee change:

- Does not automatically change the commercial Booking Customer.
- Does not automatically recalculate commission.
- Records final registration names and ownership shares separately.
- Preserves original Booking Customer permanently.

## 13.4 Change Primary Customer

Use only when the actual commercial buyer changes.

Workflow:

1. CRM selects **Change Primary Customer**.
2. CRM selects the new Customer.
3. Reason is compulsory.
4. CRM uses the crucial-action second confirmation.
5. Status/message becomes **Primary Customer Change Under Review**.
6. Old Customer remains official until Accounts decision.
7. Accounts reviews payment, commission, duplicate and ownership impact.
8. Accounts Approves or Rejects.

On approval:

- New Customer becomes the official commercial Booking Customer.
- Booking Number and Plot remain unchanged.
- Existing Payment Received percentage and Payment Reference Numbers carry forward unchanged.
- Payment history changes only if Accounts enters an approved correction or adjustment.
- Loyalty Bonus and Royalty eligibility are rechecked only where the Customer identity affects them.
- Direct and Invite Commission remain unchanged unless the new Customer creates a Member self-purchase or another commission conflict.
- Paid and Paid Early records are never deleted; affected records become **Accounts Adjustment Required** where necessary.
- Ownership shares are updated and must total 100%.
- Old and new Customers remain permanently visible in History.

On rejection:

- Old Customer remains official.
- No payment or commission change is applied.
- Rejection remark remains in History.

# 14. Commission Engine

## 14.1 Global rules

- No rupee commission values are stored.
- One Booking may have multiple approved percentage components.
- Combined sale commission cannot exceed 4%.
- Invalid combinations are blocked, not silently reduced.
- Eligibility and payment status are separate.
- Beneficiary, type, percentage, milestone, evidence and history are permanent.

## 14.2 Direct Commission

- Rate: 3%
- Beneficiary: final selling Member
- Ordinary milestone: 25% verified Payment Received
- Only one selling Member

Member personal purchase:

- Active Member personally buying receives 3% Direct Commission.
- Milestone is 100% Payment Received.
- No Invite Commission.
- No Royalty.
- No Loyalty Bonus.
- The Member's personal purchase does not consume the inviting Member's first qualifying Invite Commission opportunity.

## 14.3 Invite Commission

Annual Invited Member counter for each Member:

- Positions 1-3: 1%
- Positions 4-6: 0.5%
- Positions 7-9: 0.25%
- Position after 9: 0%

Rules:

- Position is assigned when the invited Member is activated.
- Position remains permanently fixed for that relationship.
- Anniversary reset applies only to newly introduced Members.
- Existing Members are never renumbered or counted again.
- Only the immediate inviting Member qualifies.
- The invited Member's first qualifying third-party sale is the eligible opportunity.
- Rejected Booking Request does not count.
- Member personal purchase does not count and does not consume the opportunity.
- Eligibility milestone is 100% Payment Received on the qualifying sale.
- Cancellation before legal completion restores the opportunity.
- A legally completed sale later bought back remains consumed.

## 14.4 Royalty

Annual Introduced Customer counter for each Member is separate from the Invited Member counter:

- Positions 1-3: 1%
- Positions 4-6: 0.5%
- Positions 7-9: 0.25%
- Position after 9: 0%

Position rules:

- Customer receives the Royalty position when first linked as introduced by the Member.
- Position and percentage remain permanently frozen.
- Anniversary reset applies only to newly introduced Customers.
- Existing Customers are never renumbered or counted again.

Royalty applies when:

- Customer was originally introduced by the Member.
- Customer later buys another Plot personally and directly through 3% Club.
- No selling Member closes that later sale.
- It is the Customer's first qualifying future direct purchase for Royalty.
- Royalty milestone is 100% Payment Received.
- Royalty may be generated only once for that introduced Customer.

A cancelled qualifying repeat purchase before legal completion does not permanently consume the Royalty opportunity. A legally completed qualifying purchase consumes it.

## 14.5 Loyalty Bonus

Rate: 1%

An existing Customer may receive Loyalty Bonus by:

1. Closing a qualifying sale for a different buyer, or
2. Buying another Plot personally and directly through 3% Club

Lifetime rule:

- One combined lifetime maximum of three Loyalty Bonuses per Customer.
- The three may be any combination of introduced-buyer deals and repeat personal purchases.
- The limit never resets annually.
- First personal purchase receives no repeat-purchase Loyalty Bonus.

Repeat personal purchase directly through 3% Club:

- Customer receives 1% Repeat-Purchase Loyalty Bonus.
- Original introducing Member may also receive Royalty when eligible.
- No Direct Commission.
- No Invite Commission.
- Loyalty + Royalty is allowed subject to the 4% overall cap.

When a Member closes the repeat purchase:

- Member Direct Commission applies.
- Invite Commission may apply.
- Customer receives no Repeat-Purchase Loyalty Bonus.
- Original Member receives no Royalty on that Booking.

## 14.6 Closer controls commission

The final Sold By selection controls commission, not the original Enquiry Source.

Examples:

- Customer introduced lead, Member closes: Member Direct + possible Invite; Customer no Loyalty Bonus.
- Customer introduces and closes: Customer Loyalty Bonus.
- 3% Club closes a repeat purchase: Repeat-Purchase Loyalty and eligible Royalty.

Enquiry Source remains historical and separate.

## 14.7 Eligibility conditions

### Member commission conditions

- Required payment milestone
- Aadhaar available
- Bank verified
- RERA Registered or Not Applicable where applicable
- No deal-level or Member-level hold

PAN does not create an automatic commission hold. Member agreement is not a CRM eligibility requirement.

### Loyalty conditions

- Required payment milestone
- Customer Aadhaar available
- Bank verified

## 14.8 Eligibility statuses

- Milestone Pending
- Ready
- On Hold

Controlled hold reasons include:

- Aadhaar Pending
- Bank Verification Pending
- RERA Pending
- RERA Expired
- Member Commission Hold
- Member Deactivated
- Refund Pending
- Change Plot Pending
- Buyback Pending
- Payment Pending

## 14.9 Payment statuses

- Not Paid
- Paid
- Paid Early - [remarks]
- Accounts Adjustment Required
- Cancelled, where the underlying commission is cancelled before payment

## 14.10 Paid Early

Accounts may pay before normal eligibility is Ready.

Requirements:

- Compulsory remarks
- Payment Reference No.
- Paid Date
- Actor and time

Display:

> Paid Early - [remarks]

Rules:

- No additional MD/Admin approval is required.
  > **Superseded on this point by the Approved Changes pack, 3 September 2026.**
  > [`3_Percent_Club_CRM_Dashboard_Approved_Changes.md`](./3_Percent_Club_CRM_Dashboard_Approved_Changes.md)
  > §1 "Paid Early MD Approval" requires the approved MD approval, requires it
  > stored with approver, date/time and the related transaction/member, and
  > states that without it "the system must not mark the benefit as approved".
  > The pack is the later approved baseline, so it controls, and it is what the
  > system implements: `approveCommissionPaidEarly()` is MD only, and
  > `canMarkPaid()` refuses Paid Early without a stored approval. Every other
  > rule in this section — compulsory remarks, reference and date, no second
  > payment task, exclusion from Not Paid totals, no second Paid — stands.
- No second payment task is created when the normal milestone is later reached.
- Eligibility continues to update separately.
- Paid Early is excluded from Not Paid totals.
- It cannot be marked Paid again.
- Later cancellation, buyback or correction may change the record to Accounts Adjustment Required.

## 14.11 Member-level and deal-level holds

Deal-level hold affects only that commission record.

Member deactivation or Member Commission Hold may affect all unpaid records while preserving paid history.

Removing a hold automatically reassesses affected records and resumes the same Accounts task rather than creating duplicates.

## 14.12 Commission after cancellation or buyback

### Cancellation before legal completion

- Unpaid commission: Cancelled
- Paid or Paid Early: Accounts Adjustment Required

### Buyback before legal completion

- Unpaid old-sale commission: CRM/management decision, then Accounts approval
- Paid or Paid Early: adjustment/recovery according to approved company arrangement

### Buyback after legal completion

- Original sale commission normally remains earned unless the written arrangement states otherwise
- Buying Commission is separate

# 15. Cancellation and Refund Pending

## 15.1 Formal cancellation scope

Formal Cancellation applies only after Accounts has approved the Booking and a permanent Booking Number exists.

Allowed from:

- Booked
- Payment Completed

Blocked after conflicting major process or Delivered, except authorised exceptional correction.

## 15.2 Cancellation form

Fields:

- Cancellation Reason
- Remark - compulsory only for Other

Reasons:

- Payment Not Received
- Loan Denied
- Other

No supporting-note upload exists.

## 15.3 Submission

- Booking and Plot enter Refund Pending.
- Plot is blocked.
- Payment follow-up pauses.
- Commission becomes On Hold - Refund Pending.
- Create Accounts Verification - Refund.

## 15.4 Accounts decision

At 0%:

- Accounts may approve with **No Payment Received**.

When payment exists:

- Payment Reference No.
- Action date
- No rupee amount

On approval:

- Booking becomes Cancelled.
- Plot becomes Available.
- Booking cancellation does not add RESALE tag.
- Apply commission cancellation/adjustment rules.

On rejection:

- Restore exact previous Booking, Plot, payment, commission and task state.
- Rejection reason compulsory.

# 16. Change Plot

## 16.1 Allowed stages

- Enquiry
- Hold
- Booked
- Payment Completed

## 16.2 Enquiry change

- Change interested Plot or Project.
- No Accounts approval.
- Preserve old interest history.
- Enquiry remains Active.

## 16.3 Hold change

- Move Hold to another Available Plot.
- Old Plot becomes Available.
- New Plot becomes Hold.
- Same Customer.
- Remaining Hold time continues.
- No Accounts approval.
- Preserve history.

## 16.4 Approved Booking change

- Same Project only.
- Cross-Project move requires Cancel Booking and a new Booking Request.
- CRM selects New Plot.
- Remark compulsory.
- New Plot is blocked during review.
- Old Plot remains allocated with **Change Plot Under Process**.
- Create Accounts Verification - Change Plot.

On approval:

- Same Booking Number.
- Same Customer and Sold By.
- Old Plot becomes Available without RESALE tag.
- New Plot receives Booked or Payment Completed state.
- Existing Payment Reference Numbers carry over.
- Accounts records percentage applicable to new Plot and revised schedule totalling 100%.
- Commission is rechecked.

On rejection:

- Restore original Booking/Plot state.
- New Plot becomes Available.
- Rejection remark compulsory.

# 17. Buyback, Purchase for Resale and Payment Given

## 17.1 Entry point

Plot Inventory main button:

> Buyback/Resale

Choose:

1. Buyback - Previously Sold by Us
2. Purchase for Resale - New Property from Outside

## 17.2 Buyback stages supported

- Part Payment Received
- Full payment, no Allotment, papers not legally transferred
- Full payment, Allotment given, papers not legally transferred
- Full payment, Allotment given, papers legally transferred

## 17.3 Buyback form

Select existing Project, Plot and Booking.

Show:

- Customer / ID
- Booking Number
- Payment Received percentage
- Payment references
- Payment status
- Allotment Yes/No
- Papers legally transferred Yes/No
- Existing commission records

Buyback Arranged By:

- 3% Club
- Member
- Customer

## 17.4 Purchase for Resale form

Fields:

- Seller Name
- Mobile
- City
- Optional address
- Property / Project Name
- Location
- Plot / Property Number
- Type
- Area
- PLC if applicable
- Purchase Date
- Compulsory remark
- Purchase Arranged By
- Buying Commission percentage
- Payment Given schedule

Do not create a fake standard Project solely to store external property context. Use the approved acquisition structure and then place the property into normal Plot Inventory on approval.

## 17.5 Payment Given

Payment Given is company-to-seller/previous-customer acquisition payment.

It is separate from Payment Received.

Fields for each entry:

- Payment Given This Time (%)
- Payment Date
- Payment Reference No.
- Optional remark

Rules:

- Schedule total 100%.
- Accounts confirms **Confirm Payment Given**.
- Oldest unpaid due first.
- Reminders seven days before due.
- Previous unpaid + current due is shown as total due.
- Reference duplicate protection applies.

## 17.6 Minimum approval threshold

Accounts may approve Buyback or Purchase for Resale only after at least **20% Payment Given** is confirmed.

On approval:

- Plot enters normal inventory as Available + RESALE.
- When Payment Given is below 100%, show **Payment Pending**.
- Payment Given schedule and reminders continue.

## 17.7 Payment Pending and Deal Cancelled controls

While Payment Given is below 100%:

- Plot may be marketed, held or booked under the approved business model.
- New-sale commission remains On Hold - Payment Pending unless Accounts uses Paid Early.

If a new Hold, Booking Request or confirmed Booking exists:

- The acquisition cannot simply be cancelled.
- Management must either complete the acquisition or first unwind the new buyer process through the approved rules.

If the acquisition is cancelled before any new buyer process exists:

- Plot becomes **Not Available - Deal Cancelled**.
- It must not remain sellable.
- Payment Given history remains.
- Accounts adjustment work is created where payment already occurred.

## 17.8 Buying Commission

- No fixed maximum percentage.
  > **Superseded on this point by the Approved Changes pack, 3 September 2026.**
  > [`3_Percent_Club_CRM_Dashboard_Approved_Changes.md`](./3_Percent_Club_CRM_Dashboard_Approved_Changes.md)
  > §1 "Buying Commission" caps it at **5%**, to be "enforced by the system, not
  > only by dashboard display", with any figure above the cap "prevented or
  > flagged for correction". Implemented as `BUYING_CAP_PERCENT` in the domain,
  > judged on exact decimals and refused rather than trimmed. The rest of this
  > section stands, including that Buying Commission sits outside the 4% sale
  > limit — the 5% cap is its own, separate ceiling.
- MD/Admin approval required.
- One beneficiary per acquisition.
- Seller or previous owner cannot be beneficiary for arranging their own acquisition.
- Outside the 4% sale commission limit.
- Becomes payable only at 100% Payment Given.
- Before 100%: Milestone Pending.
- Acquisition cancelled before 100%: Cancelled.
- Paid/paid-early record affected by cancellation: Accounts Adjustment Required.
- Later resale Booking cancellation does not cancel an earned Buying Commission.

## 17.9 Buyback Accounts decision

Submission:

- Block Plot.
- Show Buyback Under Process.
- Hold unpaid old-sale commission as Buyback Pending.
- Create Accounts Verification - Buyback.

Accounts verifies the 20% threshold and approves/rejects.

On approval:

- Old Booking becomes Buyback Completed/closed history.
- Previous Customer is removed from active allocation.
- Plot becomes Available + RESALE.
- Histories remain.

On rejection:

- Restore exact prior state.
- Rejection remark compulsory.

Paper tasks:

- Allotment given, papers not transferred: Collect Allotment Papers Back
- Papers legally transferred: Complete Registry Back

# 18. Allotment, Registry and Delivery

## 18.1 Trigger

At 100% Payment Received:

- Booking and Plot become Payment Completed.
- Create **Complete Final Buyer Details**.
- Prepare Allotment / Registry.

## 18.2 Final buyer details

Collect:

- Primary Customer
- Additional Customer(s)
- Aadhaar Number
- Date of Birth
- Address
- PAN Available / PAN Not Available

No document upload.

## 18.3 Completion route

Inside Booking/Plot use one tab:

> Allotment / Registry

Choose only one:

1. Allotment
2. Registry

The owner has expressly retained the one-route model. Do not add an Allotment-then-Registry sequence without a later approved change request.

## 18.4 Allotment fields

- Allotment Given: Yes/No
- Allotment Date when Yes
- Allotment Number
- Allotment Given To
- Patta Issued: Yes/Don't Know
- Patta Date when Yes

## 18.5 Registry fields

- Advocate Name
- Registry Date

## 18.6 Preconditions

Before completion:

- Payment Received = 100%
- Final buyer details complete
- Aadhaar available
- PAN Available or PAN Not Available selected
- No conflicting major process

## 18.7 Delivered

After Allotment is given or Registry is completed:

- Show visible final status **Delivered** once only.
- Backend may update linked Booking and Plot for consistency.
- Papers Legally Transferred becomes Yes automatically.
- No separate Confirm Delivery action.

Incorrect Delivered before legal completion:

- MD/Admin exceptional reopen
- Compulsory reason
- Restore prior state and tasks
- Preserve full history

After genuine legal completion:

- Normal reopening blocked
- Only legally approved exceptional correction

# 19. Aadhaar, PAN, Bank and RERA Data

## 19.1 No uploads

The CRM stores fields and statuses only. Physical or scanned copies are maintained outside the CRM.

No Customer or Member upload, file versioning or attachment workflow is included.

## 19.2 Aadhaar and PAN

Aadhaar fields:

- Aadhaar Number
- Date of Birth
- Address

PAN field:

- PAN Number

Visibility:

- Normal staff: masked
- MD/Admin: full where authorised
- Search: last four only

PAN visible status:

- PAN Available
- PAN Not Available

PAN is not an automatic commission hold.

## 19.3 Complete Customer Details task

Created at 100% Payment Received because final registration buyer may differ.

Revise outcomes:

- Contacted
- Not Answered
- Call Later
- Other

Other requires remark. Next date/time may be recorded.

## 19.4 Bank details

Statuses:

- Pending
- Verified

Process:

- CRM enters.
- Accounts verifies through Accounts Verification - Bank Details.
- Maker and checker differ.
- Existing verified bank remains active while new details are Pending.
- On approval, new details become active and old details remain history.

Visible fields:

- Account Holder
- Bank Name
- Account ending last four
- IFSC
- Status

Full account visible only to Accounts/Admin/MD.

## 19.5 RERA

Member RERA fields:

- Status
- Registration Number
- Expiry Date
- Not Applicable reason

Statuses:

- Registered
- Pending
- Expired
- Not Applicable

Rules:

- Not Applicable reason compulsory.
- Not Applicable does not hold commission.
- One task is created seven days before expiry and turns overdue/red after expiry.
- No duplicate task.
- Pending/Expired may hold commission where applicable.
- Project RERA and Member RERA do not create the additional selling blocks that the owner expressly excluded.

# 20. Reports and Exports

## 20.1 Reports tab

Categories:

- Inventory
- Sales
- Payments
- Commission
- Members
- Customers
- Staff Work

No rupee values.

## 20.2 Inventory report

- Project / Location
- Plot / Property Number
- Type
- Area
- PLC %
- Status
- RESALE
- Customer
- Booking
- Payment Received %
- Payment Given % where applicable
- Next action

## 20.3 Sales report

- Date
- Booking Number
- Customer
- Project / Plot
- Sold By
- Enquiry Source separately
- Status
- Payment Received %
- Allotment / Registry
- RESALE

## 20.4 Payments report

Separate sections or datasets:

- Payment Received
- Payment Given

Never combine them into one percentage total.

## 20.5 Commission report

- Beneficiary
- Beneficiary ID
- Type
- Project / Plot
- Booking
- Percentage
- Milestone
- Payment progress
- Eligibility
- Hold reason
- Payment status
- Payment Reference No.
- Paid Date

Include Direct, Invite, Royalty, Loyalty and Buying Commission.

## 20.6 Member and Customer reports

Member report includes identity, status, RERA, Invited By, Network, deals and commission counts.

Customer report includes identity, type, activity, Bookings, payment, delivery and Loyalty count.

## 20.7 Exports

- Excel and PDF only for authorised roles.
- Export values remain masked.
- Log user, date/time, report and filters.
- Never export full Aadhaar, PAN, bank account or password data.
- Report data is live; totals are not manually editable.

# 21. Administration

## 21.1 Sections

1. Staff Users
2. Roles & Permissions
3. Projects & Plot Setup
4. System Settings
5. Activity History
6. Backup & Technical Control

## 21.2 Staff users

MD/authorised Admin creates:

- Name
- Mobile
- Email or username
- Role
- Status
- Initial password

Statuses:

- Active
- Disabled

## 21.3 Staff deactivation

Before disabling:

- Show all open work.
- Replacement employee is compulsory.
- Reassign Enquiries, tasks, follow-ups and responsibilities.
- Historical actions retain original employee.

## 21.4 Activity History

Administration-only consolidated audit view:

- User
- Action
- Record
- Old value
- New value
- Reason
- Date/time
- Correlation/request

History is immutable for normal users.

# 22. Authentication and Security

## 22.1 Passwords

- Minimum 10 characters
- Stored only as secure password hashes
- Never visible after save
- No password in audit logs

## 22.2 MFA

- Mandatory for MD and Admin
- Strongly supported for other staff where enabled

## 22.3 Login and session controls

- Failed-login lockout
- Session timeout
- Logout all sessions on password reset
- Disabled account cannot log in
- Role, permission and status change invalidates affected sessions
- Staff and Member sessions are separate security contexts

## 22.4 Member reset

- Identify exact Member ID
- Verify identity
- Mobile alone is insufficient
- Record reset actor, time and reason

## 22.5 Security enforcement

- Deny by default
- Server-side permission checks
- Record-scope checks
- Field-scope checks
- Rate limiting
- CSRF protection where applicable
- Secure cookies
- TLS in transit
- Encryption at rest
- Secure secrets outside source code
- Sensitive access logging

# 23. Technical and Data-Integrity Requirements

## 23.1 Exact decimal arithmetic

- Payment, PLC and commission percentages: exact decimal, up to four decimal places
- Plot area: up to four decimal places
- Display normally to two decimals unless more detail is needed
- Never use binary floating-point for 100% or 4% validation

## 23.2 Transactions and concurrency

Critical actions must run in database transactions with locking or equivalent concurrency controls:

- Hold creation/approval
- Booking Request submission
- Booking approval/rejection
- Payment entry/correction
- Cancellation decision
- Change Plot decision
- Buyback/Purchase approval
- Primary Customer change
- Commission eligibility generation/payment
- Allotment/Registry completion

A Plot may have only one active commercial allocation at a time.

## 23.3 Idempotency

A retry must return the existing result rather than create:

- Duplicate Booking Number
- Duplicate Hold
- Duplicate payment entry
- Duplicate Payment Reference No.
- Duplicate commission record
- Duplicate task
- Duplicate acquisition
- Duplicate audit side effect

## 23.4 Major pending process rule

Only one major conflicting process may be active for a Booking at a time:

- Refund Pending
- Change Plot Pending
- Buyback Pending
- Primary Customer Change Under Review

Block incompatible actions until the pending process is approved, rejected or completed.

## 23.5 Append-only histories

Maintain explicit append-only history for:

- Project status
- Plot lifecycle
- Plot restrictions
- Hold and extensions
- Booking status
- Payment Received
- Payment Given
- Payment corrections
- Primary Customer
- Ownership shares
- Commission eligibility/payment
- Allotment/Registry/Delivered
- User assignment
- Login/security events

Each history row stores previous state, new state, actor, time, reason and linked request.

## 23.6 Data deletion

- No hard deletion of protected operational records.
- Merged records are marked Merged.
- Cancelled records remain searchable history.
- Audit cannot be edited or deleted by normal users.

## 23.7 Environments and operations

- Separate development, test, staging and production
- Synthetic or masked non-production data
- Automated error and job monitoring
- Backup monitoring
- Security-event monitoring
- Release notes and rollback plan

## 23.8 Backup and recovery

- Daily encrypted backups
- At least 30 rolling days retention
- Target RPO: 24 hours
- Target RTO: 8 hours
- Documented restoration test at least quarterly
- Company-controlled backup storage and credentials

## 23.9 Company ownership and handover

The contract and technical handover must ensure the company can:

- Use the system
- Host the delivered system
- Export all company data
- Appoint another vendor
- Modify and maintain the delivered solution
- Access source code, repository, hosting, domain, backups and production credentials

The vendor must not retain sole control over any production-critical account.

# 24. Status Catalogue

| Object | Allowed visible statuses / messages |
|---|---|
| Enquiry | Active; Booked; Closed |
| Task | Pending; Completed |
| Project | Active; Sold Out; Completed; Available (Resale) where applicable |
| Plot | Not Available; Available; Hold; Waiting for Booking Approval; Booked; Payment Completed; Refund Pending; Delivered |
| Plot process messages | Change Plot Under Process; Buyback Under Process; Payment Pending; Not Available - Deal Cancelled |
| Booking Request | Pending; Rejected/Cancelled request history; Approved event creates Booking |
| Booking | Booked; Payment Completed; Refund Pending; Cancelled; Delivered; Buyback Completed/Closed |
| Instalment | Upcoming; Received; Overdue |
| Aadhaar | Pending; Verified |
| PAN | PAN Available; PAN Not Available |
| Bank | Pending; Verified |
| RERA | Registered; Pending; Expired; Not Applicable |
| Commission eligibility | Milestone Pending; Ready; On Hold |
| Commission payment | Not Paid; Paid; Paid Early - remarks; Accounts Adjustment Required; Cancelled |
| Hold Request | Pending; Approved; Rejected; Expired; Withdrawn |
| Member | Active; Deactivated |
| Staff/Login | Active; Disabled |

# 25. Commission Compatibility Matrix

| Scenario | Direct | Invite | Royalty | Loyalty | Notes |
|---|---:|---:|---:|---:|---|
| Member closes third-party sale | 3% | Eligible band | No | No | Total maximum 4% |
| Active Member buys personally | 3% at 100% | No | No | No | Does not consume Inviter opportunity |
| Existing Customer repeat purchase, 3% Club direct | No | No | Eligible band | 1% | Royalty + Loyalty allowed |
| Customer closes sale for different buyer | No | No | No | 1% | Lifetime Loyalty limit applies |
| Customer-origin lead later closed by Member | 3% | Eligible band | No | No | Closer controls commission |
| 3% Club direct first purchase | No | No | No | No | First purchase has no repeat Loyalty |
| Acquisition arranged by approved beneficiary | No sale component | No | No | No | Separate Buying Commission outside 4% |

# 26. Dashboard Automatic Task Matrix

| Trigger | Task title | Owner | Completion |
|---|---|---|---|
| New Enquiry follow-up | Enquiry Follow-up | CRM | Follow-up/close/book action |
| Hold created | Hold Follow-up | CRM | Book or Cancel Hold |
| Booking Request submitted | Accounts Verification - Booking | Accounts | Approve/Reject/Cancel request |
| Booking Request exceeds 7 days | Booking Decision Follow-up | CRM | Keep with new date or Cancel Booking |
| Instalment due in 7 days | Payment Follow-up | CRM | Received or valid reschedule |
| Payment correction submitted | Accounts Verification - Payment Correction | Accounts | Approve/Reject |
| 100% Payment Received | Complete Customer Details | CRM | Required fields complete |
| 100% Payment Received | Prepare Allotment / Registry | CRM | Allotment or Registry complete |
| Cancellation submitted | Accounts Verification - Refund | Accounts | Approve/Reject |
| Change Plot submitted | Accounts Verification - Change Plot | Accounts | Approve/Reject |
| Buyback submitted | Accounts Verification - Buyback | Accounts | Approve/Reject |
| Purchase for Resale submitted | Accounts Verification - Purchase for Resale | Accounts | Approve/Reject |
| Payment Given due in 7 days | Payment Given Follow-up | Accounts/CRM as configured | Confirmed/rescheduled |
| Bank details submitted | Accounts Verification - Bank Details | Accounts | Approve/Reject |
| Commission Ready | Accounts Verification - Commission | Accounts | Paid / Paid Early / Revise |
| RERA expiry in 7 days | RERA Renewal | CRM | Updated/Not Applicable |
| Primary Customer change | Accounts Verification - Primary Customer Change | Accounts | Approve/Reject |

# 27. Current Software Change and Migration Plan

## 27.1 Existing software must be treated as an earlier implementation

The current codebase follows Version 2.3 structures and contains routes, statuses and features that conflict with Version 3.0. Version 3.0 requires controlled refactoring, not merely renaming text.

## 27.2 Navigation migration

Map existing routes into the final navigation:

- Existing Dashboard/My Work -> Dashboard
- Leads -> Plots & Sales / Enquiries
- Plots -> Plots & Sales / Plot Inventory
- Holds -> embedded in Plot, Enquiry, Customer, Member and Dashboard
- Bookings -> Plots & Sales / Bookings
- Workflow -> embedded in Booking and Plot
- Cancellations -> embedded in Booking
- Commissions -> Member, Customer, Plot and Booking profiles; Dashboard work
- Tasks -> Dashboard
- Service Requests -> remove
- Calculator -> remove
- Customer portal -> remove
- MIS Summary/Exports -> Reports
- Audit logs/settings -> Administration

## 27.3 Data migration

Migration must:

1. Back up production.
2. Copy to staging.
3. Map every existing status to Version 3.0.
4. Reconcile every Plot to one active state.
5. Reconcile Booking and Plot status pairs.
6. Separate Payment Received and Payment Given.
7. Preserve all old IDs and histories.
8. Convert mobile hard-duplicate assumptions to shared-contact warnings without merging people.
9. Create Member-ID login credentials for portal-enabled Members.
10. Remove Customer portal accounts and access safely.
11. Convert legacy commission statuses into eligibility and payment status pairs.
12. Rebuild annual Member and Customer introduction counters without renumbering existing relationships.
13. Mark resale/acquisition records and Payment Pending correctly.
14. Verify no protected record is lost.
15. Produce a signed migration reconciliation report.

## 27.4 Known current-build gaps to close

At minimum, development must complete or replace:

- Aadhaar/PAN capture fields
- Full report coverage
- Assignment and security histories
- Bulk inventory preparation where approved
- Additional Customers and ownership shares
- Primary Customer change workflow
- No-upload document model
- Payment Given and acquisition schedule controls
- Buying Commission
- Paid Early
- Duplicate Person merge
- Three-open-position enforcement
- Duplicate Customer/Plot Hold Request prevention
- New navigation and embedded workflows

# 28. Minimum Acceptance Tests

## 28.1 Identity and access

1. Same mobile may be used as contact for different Persons with reason.
2. Aadhaar/PAN duplicate shows existing Person and blocks duplicate identity record.
3. Member login works by unique Member ID.
4. Mobile-only password reset cannot select among shared-mobile Members.
5. Disabled Member and staff accounts cannot log in.
6. MD/Admin MFA is enforced.
7. User cannot access hidden route/action by direct URL or crafted request.
8. Duplicate Person merge preserves both old IDs and history.

## 28.2 Enquiries

9. Different people may enquire for the same Plot.
10. Same Person/Project/Plot cannot have two Active Enquiries.
11. Same Person may have different Plot Enquiries in one Project.
12. Project-level Active General Enquiry duplicate is blocked.
13. Closed Enquiry may be recreated later.
14. Enquiry never blocks a Plot.
15. Closing requires approved reason.
16. Revise reuses one Pending follow-up task.

## 28.3 Holds

17. Hold automatically expires after 72 hours.
18. First extension requires CRM reason.
19. Further extension requires Admin approval.
20. Booking Request freezes remaining Hold time.
21. Booking rejection restores frozen remainder.
22. Three-open-position limit counts Holds, Waiting Approval and Pending Member requests.
23. Same Customer/Plot duplicate Pending Hold Request is blocked.
24. Different Customers may request the same Plot.
25. Two simultaneous Hold attempts cannot both succeed.

## 28.4 Booking

26. Submission creates temporary Request ID only.
27. Accounts approval at 0% creates permanent Booking Number.
28. Accounts rejection restores exact previous state.
29. Sold By is separate from Enquiry Source.
30. Customer ID remains after rejected first request.
31. Seven-day follow-up turns red and does not auto-release Plot.
32. Keep Booking requires new date and remark.
33. Cancel Booking before approval does not enter Refund Pending.
34. Cancel Booking after approval enters Refund Pending.
35. Repeated Submit/Approve clicks produce one result.

## 28.5 Payment Received

36. Instalment schedule must total exactly 100%.
37. Incremental payment is allocated oldest unpaid first.
38. Cumulative Payment Received cannot exceed 100%.
39. Payment Reference duplicate is blocked after normalisation.
40. Part payment preserves received portion.
41. Reschedule changes only unpaid remainder.
42. Correction preserves original and replacement link.
43. Reversal below 100% pauses final workflow.
44. Reaching 100% again restarts final workflow once.

## 28.6 Customers and shares

45. Shares total 100% when used.
46. CRM share change after approval requires second confirmation and reason.
47. Share change after Delivered is blocked.
48. Registration buyer change does not change commercial Customer.
49. Primary Customer change remains pending until Accounts approval.
50. Approval carries payment references unchanged unless Accounts records correction.
51. Loyalty/Royalty recheck occurs only where buyer identity affects them.
52. Direct/Invite remain unless self-purchase or conflict arises.
53. Rejection leaves old Customer official.

## 28.7 Commission

54. Member sale creates Direct 3% at 25% milestone.
55. Member personal purchase creates Direct 3% only at 100%.
56. Member personal purchase does not consume Inviter opportunity.
57. Invite counter and Customer Royalty counter are separate.
58. Existing network positions do not change after anniversary reset.
59. Customer repeat direct purchase can create Loyalty + Royalty.
60. Member-closed repeat purchase creates Direct/Invite and no Loyalty/Royalty.
61. Customer lifetime Loyalty count never exceeds three.
62. Total sale commission above 4% is blocked.
63. Paid Early requires remarks, reference and date.
64. Paid Early does not create a second payment task at milestone.
65. Later cancellation changes affected Paid/Paid Early to Accounts Adjustment Required.
66. Member deactivation holds all unpaid records only.

## 28.8 Cancellation and Change Plot

67. Formal cancellation at 0% still enters Refund Pending.
68. Cancellation approval returns Plot Available without RESALE.
69. Rejection restores exact prior state.
70. Change Plot for approved Booking works only within same Project.
71. Old Plot does not receive RESALE tag after Change Plot.
72. Payment references carry to replacement Plot.
73. Rejection releases replacement and preserves original.

## 28.9 Acquisition and Payment Given

74. Buyback/Purchase cannot be approved below 20% Payment Given.
75. Approval adds RESALE and Payment Pending when below 100%.
76. Payment Received and Payment Given remain separate.
77. Buying Commission is Milestone Pending below 100% Payment Given.
78. New-sale commission is On Hold - Payment Pending.
79. Acquisition cannot be cancelled while a new buyer process is active without unwind/completion.
80. Cancelled acquisition with no buyer process becomes Not Available - Deal Cancelled.
81. Buying Commission becomes payable at 100% Payment Given.
82. Seller cannot receive Buying Commission for arranging own acquisition.

## 28.10 Delivery

83. 100% creates final-buyer and Allotment/Registry tasks once.
84. Delivery is blocked until required details are complete.
85. Allotment or Registry completes Delivered automatically.
86. Delivered appears once in UI.
87. Normal post-Delivered correction is blocked.
88. Exceptional reopen preserves complete history.

## 28.11 Reports, audit and security

89. Reports contain no rupee values.
90. Exports never contain full Aadhaar/PAN/bank/password data.
91. Export action is logged with filters.
92. Every protected status change has actor/time/reason.
93. Double-click and retry tests create no duplicate records.
94. Concurrent Hold/Booking tests allow one allocation only.
95. Restore test meets documented RPO/RTO evidence.
96. Departing staff cannot be disabled until open work is reassigned.

# 29. Go-Live Gates

Real transactions must not go live until all are complete:

- Approved Version 3.0 UX prototype
- Field-level permission matrix implemented
- Status-transition tests passed
- Commission compatibility tests passed
- Migration rehearsal and reconciliation completed
- Database concurrency tests passed
- Security and access-control testing passed
- Backup restoration test completed
- Production rollback plan approved
- Accounts operational procedure approved
- User training completed
- UAT sign-off by MD/Admin, CRM and Accounts
- Company controls hosting, repository, domain, backups and production credentials

# 30. Explicit Owner Decisions and Excluded Recommendations

The following were deliberately excluded or ignored by the owner and are not pending requirements. A vendor must not add them without a later approved change request.

- Project RERA operational block on release, Hold or Booking
- Member RERA operational selling block beyond approved commission hold behaviour
- Agreement-for-Sale checkpoint before Payment Received crosses 10%
- Additional legal-clause and notice fields for company-initiated cancellation
- Personal-data request and privacy-complaint workflow
- Special 50% ownership test for Member self-purchase
- Family/relative self-purchase special approval rule
- Allotment followed by Registry as a third completion route
- Separate compulsory Customer confirmation call before approving Member Hold Request
- Customer portal
- Customer service-request module
- Document and KYC file uploads
- Standalone calculator

These exclusions are owner business decisions for the CRM scope. They do not replace any independent legal, accounting, tax, RERA, privacy or contractual obligations of the business.

# 31. Glossary

| Term | Meaning |
|---|---|
| 3% Club | Member/dealer community and CRM operating model |
| Thirty Milestones LLP | Company and CRM data owner |
| Person | One universal identity record with optional Customer/Member roles |
| Customer | Individual buyer with Customer ID after first Booking Request |
| Member | Activated dealer/community participant with Member ID |
| Enquiry Source | How the lead arrived; does not automatically decide commission |
| Sold By | Final closer/source that controls Direct or Loyalty treatment |
| Direct Commission | 3% benefit to the selling Member |
| Invite Commission | Band benefit to the Member who invited the selling Member |
| Royalty | Band benefit to the Member who originally introduced a Customer, on one later direct repeat purchase |
| Loyalty Bonus | 1% Customer benefit for closing an introduced-buyer sale or direct repeat personal purchase |
| Buying Commission | Separate acquisition-arrangement benefit, payable at 100% Payment Given |
| Payment Received | Buyer-to-company sale payment percentage |
| Payment Given | Company-to-seller acquisition payment percentage |
| Payment Pending | Approved acquisition with Payment Given below 100% |
| RESALE | Automatic tag for Buyback/Purchase-for-Resale inventory |
| Ready | Commission eligibility conditions complete |
| Paid Early | Accounts processed commission before normal eligibility, with remarks |
| Accounts Adjustment Required | Externally processed commission/payment needs review after later change |
| Crucial-action confirmation | Second explicit confirmation for high-impact action |

# 32. Final Sign-Off

Implementation instruction: No developer, designer or vendor may use an older chat, document, mock-up or code behaviour to fill a Version 3.0 gap. Every ambiguity must be documented and approved before coding.

| Role | Name | Date | Signature |
|---|---|---|---|
| Founder / MD |  |  |  |
| Product Owner |  |  |  |
| CRM Operations |  |  |  |
| Accounts Owner |  |  |  |
| Admin / Process Owner |  |  |  |
| Technology Vendor |  |  |  |
| Technology / Security |  |  |  |



---

# PART B — COMPLETE CORRECTED VERSION 3.1 OVERRIDES AND ADDITIONS

The following is the complete corrected Version 3.1 document. These rules are binding
in addition to Version 3.0, and control wherever they expressly conflict with Version 3.0.

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
  > **Superseded on this point by the Approved Changes pack, 3 September 2026.**
  > [`3_Percent_Club_CRM_Dashboard_Approved_Changes.md`](./3_Percent_Club_CRM_Dashboard_Approved_Changes.md)
  > §1 "Paid Early MD Approval" requires the approved MD approval, requires it
  > stored with approver, date/time and the related transaction/member, and
  > states that without it "the system must not mark the benefit as approved".
  > The pack is the later approved baseline, so it controls, and it is what the
  > system implements: `approveCommissionPaidEarly()` is MD only, and
  > `canMarkPaid()` refuses Paid Early without a stored approval. Every other
  > rule in this section — compulsory remarks, reference and date, no second
  > payment task, exclusion from Not Paid totals, no second Paid — stands.
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
  > **Reinstated by the Approved Changes pack, 3 September 2026.** The pack's §1
  > "Paid Early MD Approval" requires exactly this approval, so the item is no
  > longer excluded. See the note in §6.11.
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
