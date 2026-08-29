# 3% Club CRM v3.1 — Product and UX Design Specification

**Status:** Design companion to the corrected v3.1 PRD  
**Date:** 19 August 2026  
**Read with:** [`PRD.md`](./PRD.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## 1. Design Authority

- `PRD.md` controls all business rules and terminology.
- This file defines the approved screen structure, interaction patterns and visible states.
- Hiding an action is not a substitute for server-side permission enforcement.
- Do not reintroduce removed top-level modules, Customer portal, service requests, document uploads, standalone calculator or rupee values.

---

## 2. Design Principles

1. **Simple visible workflow, strict hidden controls.** Users see the minimum actions needed; the system preserves audit, permissions and restoration logic.
2. **One record, one working context.** Related actions live inside Plot, Enquiry, Booking, Customer or Member profiles.
3. **Exact language.** Use approved labels; do not invent synonyms that blur Payment Received, Payment Given, eligibility or payment status.
4. **Blocked action with reason.** When the system blocks an action, explain the reason and next allowed action.
5. **History over overwrite.** Corrections show the current value and a clear history of previous values.
6. **Mask by default.** Sensitive values are hidden unless the user has explicit permission.
7. **Responsive and operational.** Core actions work on desktop, tablet and mobile browser.

---

## 3. Application Shell and Navigation

### 3.1 Staff navigation

1. Dashboard
2. Plots & Sales
   - Plot Inventory
   - Enquiries
   - Bookings
3. Customers
4. Members
5. Reports
6. Administration — authorised roles only

Do not show separate top-level tabs for:

- Tasks
- Holds
- Cancellations
- Workflow
- Approvals
- Commissions
- KYC
- Service Requests
- Calculator
- Audit Logs
- Exports
- MIS Summary
- Resale Inventory

### 3.2 Member portal navigation

- Profile
- Network
- Deals
- Commission
- Enquiries
- Hold Requests
- View Available Plots

No Customer portal exists.

### 3.3 Global page elements

- Page title and concise status summary
- Permission-aware primary action
- Search/filter controls appropriate to the module
- Masked identity indicators where relevant
- History access inside the record, not as a separate top-level module
- Clear empty, loading and error states

---

## 4. Visual Status System

### 4.1 Dashboard task emphasis

- Overdue: red
- Urgent: yellow
- If both: red wins
- Waiting work remains Pending and displays the latest waiting reason

### 4.2 Exact visible statuses and messages

#### Enquiry

- Active
- Booked
- Closed

#### Task

- Pending
- Completed

`Revise` is an action, not a final status.

#### Booking

- Under Review
- Request Rejected
- Request Cancelled
- Booked
- Payment Completed
- Refund Pending
- Cancelled
- Delivered

#### Plot

- Not Available
- Available
- Hold
- Waiting for Booking Approval
- Booked
- Payment Completed
- Refund Pending
- Delivered

Process messages may appear beside, not replace, the lifecycle:

- Change Plot Under Process
- Buyback Under Process
- Payment Pending
- Not Available — Deal Cancelled
- Primary Customer Change Under Review
- Sold By Correction Under Review
- Management Action Required

#### Commission eligibility

- Milestone Pending
- Ready
- On Hold

#### Commission payment

- Not Paid
- Paid
- Paid Early — remarks
- Accounts Adjustment Required
- Cancelled

Eligibility and payment must be shown as two separate fields/badges.

---

## 5. Common Interaction Patterns

### 5.1 Crucial-action second confirmation

Use for high-impact actions such as:

- Submit Booking Request
- Hold
- Confirm Payment Received/Given
- Cancel Booking
- Change Plot
- Submit Buyback/Purchase for Resale
- Mark Commission Paid/Paid Early
- Approve/Reject
- Complete Allotment/Registry
- Change ownership shares
- Change Primary Customer
- Sold By correction approval
- Merge Person
- Make Plot Available

Confirmation content must show:

- Record identifier
- Exact action
- Key consequences
- Compulsory reason where required
- Confirm and Back buttons

After confirmation:

- Disable action
- Show processing state
- Return existing result on retry

### 5.2 Review snapshot

For Accounts review screens, display a read-only snapshot with:

- Submitted values
- Submitted by/date/time
- Current status
- Approval/rejection actions
- Previous version link where applicable

Never allow the maker to silently change the same snapshot while under review.

### 5.3 History timeline

Every protected record should provide a chronological timeline containing:

- Event name
- Previous and new state/value
- Actor
- Date/time
- Reason/remark
- Linked request/task/reference

Sensitive values remain masked in history unless separately authorised.

### 5.4 Blocked action message

A blocked action should state:

- What is blocked
- Why
- Which existing process/record causes the block
- Which role/action can resolve it

Example:

> Booking cannot proceed because the Customer already has three open Plot positions. Review existing Holds/Requests or request an Admin/MD exception.

---

## 6. Dashboard Design

### 6.1 Views

- Today
- Overdue
- Upcoming
- Completed
- All
- Date Range

### 6.2 Task row/card

Show:

- Task title
- Linked record ID and concise name
- Assignee
- Due date/time
- Urgent indicator
- Latest result/reason
- Primary action

### 6.3 Common actions

- Done
- Revise
- Approve/Reject/Verify/Confirm Payment only where required

`Revise` keeps the task Pending and captures the new date/result/remark.

### 6.4 Add Task

One button: **+ Add Task**

Fields:

- Title
- Assignee
- Due date
- Recurrence
- Optional Customer/Member/Plot/Booking link
- Optional remark
- Urgent Yes/No

---

## 7. Plot Inventory Design

### 7.1 Inventory table

Columns:

- Project
- Plot Type / Plot Number
- Area
- Status
- Location Charge (PLC %)
- Restriction/reason
- Customer/ID when allocated
- Selling Member/ID
- Payment Received %
- Payment Given % where applicable
- RESALE tag
- Next action

### 7.1a Prepare Inventory grid

The controlled Excel-style grid (`main-PRD.md` §16.4). One row per Plot:

- Plot Number
- Plot Type
- Width ft / Length ft, or an exact area with a compulsory reason
- North / East / South / West — what the side faces, and optionally its number.
  A Road is the one kind whose detail is compulsory: its width decides the band
- Area sq ft and Location Charge — **read-only, filled in as the row is typed**

There is no Location Charge field to fill. The Charge is read from the four
sides by the same rule the server runs on save, so the number in the grid is the
number that gets stored.

### 7.1b Location Charge

The Charge is a percentage only, and comes from four categories. A Project sets
the percentages; nobody names or types a category.

| Category | Band | Applies when |
| --- | --- | --- |
| Road width | feet | the Plot touches a road at least that wide |
| Open sides | a count | the Plot has at least that many open sides |
| Park facing | — | any side faces a park |
| Playground facing | — | any side faces a playground |

A banded category charges one band, the highest the Plot reaches. Two Road sides
are one road charge, at the wider road's band.

A side may be a Road, a Plot, Commercial, Informal Sector, Park, Playground,
Facilities, Public Utility or Other. Each may carry a number — the adjacent Plot
Number, the park number and so on — and that number is never compulsory. Road
width is, because it decides the band.

An **open side** is any side that does not abut another Plot. A Plot is a Plot
whatever its type, so Commercial and Informal Sector close a side exactly as a
Residential one does; a road, park, playground, facility or public utility
leaves it open.

Available and Not Active inventory derives the Charge on every read, so
publishing a new version updates the list by itself. Hold and Booking keep the
snapshot they froze, and that snapshot records which sides qualified each
component.

### 7.2 Plot detail page

Reached by clicking the Plot Number on the inventory list, at `/plots/<id>`.

Sections:

- Overview
- Dimensions
- Boundaries
- Location Charge — the total, the components behind it, and the sides that
  qualified each one
- Current allocation, and the Booking link with Payment Received
- Restriction and lifecycle history

The payment schedule and the commission summary are **not** repeated here. Both
belong to the Booking and its own screen shows them in full; this page links
there, so there is one place to correct either.

### 7.3 State actions

#### Available

- Hold
- Start Booking
- Edit Plot Details — authorised only. Width, Length and the four sides, under a
  compulsory reason. Correcting a side corrects the Location Charge with it; a
  frozen Hold or Booking snapshot does not move, and the screen says so.

#### Hold

- Extend Hold
- Cancel Hold
- Book

#### Waiting for Booking Approval

- View request
- Cancel Booking under pre-approval rule

#### Booked

- Open Booking
- Follow-up
- Cancel Booking
- Change Plot

#### Payment Completed

- Prepare Allotment / Registry
- Cancel Booking where permitted
- Change Plot before Delivered

#### Delivered

- View Delivery/Completion

### 7.4 Restrictions

Visible options:

- Not Yet Released
- Not for Sale
- Pledge

Removing Not for Sale/Pledge uses:

1. **Make Available** with compulsory reason
2. A separate **Hold** action if needed

Do not show a combined Make Available & Hold action.

---

## 8. Enquiry Design

### 8.1 List columns

- Enquiry ID
- Name
- Mobile
- City
- Interested Project
- Interested Plot/Type
- Enquiry Source
- Next Follow-up Date
- Status
- Assigned employee where permitted

### 8.2 Create/Edit Enquiry

Fields:

- Person/name/mobile
- City
- Source
- Source Person when By Member/By Customer
- Interested Project
- Optional Plot
- Assigned CRM
- Remark

Show duplicate warning/block according to the approved rules without exposing another person's private profile to a Member.

### 8.3 Enquiry detail

- Current interest
- Source and Original Introduced By relationship
- Follow-up history
- Related Holds/Bookings
- Actions: Follow-up, View Available Plots, Hold, Start Booking, Close

### 8.4 Follow-up

Outcomes:

- Contacted
- Not Answered
- Call Later
- Site Visit Planned
- Booking Discussion

Show previous result/date. Reuse one Pending task per Enquiry.

---

## 9. Hold and Hold Request Design

### 9.1 Hold form

- Actual Customer/Person — required
- Plot
- Enquiry/Member context
- PLC snapshot — read-only
- Expiry — system-calculated 72 hours
- Optional remark

Anonymous Member Holds are not allowed.

### 9.2 Held Plot panel

- Held For type/name/ID
- Responsible CRM
- Start and expiry
- Time remaining
- PLC snapshot
- Extension count
- Hold age

### 9.3 Member Hold Request queue

- Plot
- Customer/Person
- Member
- Created timestamp
- Expiry
- Queue order for that Plot
- Status

Show existing request rather than creating a duplicate for same Customer/Plot.

### 9.4 Extension review

Display the live Hold expiry. State clearly:

> Requesting an extension does not pause the Hold timer.

If expired, close the request and disable approval.

---

## 10. Booking Request and Booking Design

### 10.1 Booking form

- Primary Customer
- Additional Customers
- Ownership shares
- Project/Plot
- Area and PLC snapshot
- Customer Type
- Booking Date
- Sold By
- Payment schedule
- Customer details
- Optional remark

### 10.2 Submission review

Before final confirmation, show a full summary. After submission, all reviewed fields become read-only.

Banner:

> Waiting for Booking Approval — submitted values are locked. To change a reviewed field, cancel this request version and create a new version.

### 10.3 Accounts Booking review

Show:

- Immutable submitted snapshot
- Commission components and total
- Conflict banner when above 4%
- Previous Hold/Plot state
- Approve and Reject

If above 4%:

> Commission Conflict — Above 4%. Approval is blocked until Sold By/beneficiary/source details are corrected.

### 10.4 Booking page sections

- Overview
- Payment
- Documents/data status
- Commission
- Allotment / Registry
- History

### 10.5 Cancel Booking

Same visible label, contextual explanation:

**Before approval:** cancels only the Booking Request; no Refund Pending.

**After approval:** starts formal cancellation and Refund Pending.

---

## 11. Payment Design

### 11.1 Payment Received

Form:

- Payment Received This Time (%)
- Payment Date
- Payment Reference No.
- Optional remark

Instalment display:

- Scheduled %
- Received %
- Remaining %
- Due date
- Status: Upcoming/Received/Overdue

No Partially Received status.

### 11.2 Payment Given

Use identical protected interaction patterns but distinct labels:

- Payment Given This Time (%)
- Payment Date
- Payment Reference No.
- Optional remark

Never merge or visually total Payment Received and Payment Given.

### 11.3 Correction

Correction screen displays:

- Original read-only entry
- Correction reason
- Replacement entry
- Impact preview on payment progress, status and commission eligibility

Old reference/entry remains visible as Superseded after approval.

---

## 12. Customer Design

### 12.1 Customer list

- Customer ID
- Name
- Mobile
- City
- Customer Type
- Aadhaar ending
- PAN Available/Not Available

### 12.2 Customer profile

- Overview
- Invited By
- Property Activity
- Aadhaar & PAN
- Bank Details
- Loyalty Bonus
- History

### 12.3 Primary Customer change

Use a dedicated review flow:

- Old Customer
- Proposed new Customer
- Reason
- Payment carry-forward statement
- Commission impact statement
- Ownership shares
- Accounts Approve/Reject

Old Customer remains official until approval.

### 12.4 Ownership shares

- One final buyer: show 100% default/implicit
- Multiple buyers: require a percentage field for every buyer
- Live total indicator must equal 100%
- Prevent completion when total is not 100%

### 12.5 Person Merge Design

Only Admin or MD may initiate a Person merge.

Merge flow must display:

- Both Persons' identity, IDs, capabilities and linked records side by side
- Surviving Person selector
- Compulsory reason field
- Crucial-action second confirmation
- Warning when two Active Member profiles are detected (one must be deactivated first)
- Warning when open positions would temporarily exceed three after merge

After merge:

- Merged Person is marked **Merged** and remains searchable by old IDs
- Old Customer ID and Member ID remain as historical references
- Loyalty count is displayed as rebuilt from unique qualifying events only (not simple addition)
- History timeline shows merge actor, date/time, reason and all moved capabilities

---

## 13. Member and Portal Design

### 13.1 Member profile

- Overview
- Network
- Deals
- Commission
- Aadhaar, PAN & Bank
- Member Access
- History

### 13.2 Network

Use visible term **Invited By**.

Show:

- Invited By Member/ID
- Fixed position and band
- Introduced Members
- Introduced Customers
- Anniversary period
- Qualification/payment status without buyer-private data

### 13.3 Member portal commission view

Show only:

- Project
- Plot Type/Number
- Commission Type
- Percentage
- Milestone
- Eligibility/payment status
- Member-safe hold reason

Do not show buyer identity, mobile, Customer ID, Aadhaar, PAN, bank or internal Accounts remarks.

### 13.4 Add Enquiry

- Source automatically By Member
- Member enters buyer contact/interest
- Duplicate check occurs without exposing the existing Person
- Member sees only Enquiries submitted by that Member

---

## 14. Commission Design

### 14.1 Commission summary

Show separate columns/fields:

- Type
- Beneficiary
- Percentage
- Milestone
- Current progress
- Eligibility
- Hold reason
- Payment status
- Reference/date where authorised

### 14.2 Paid Early

Action form:

- Compulsory remarks
- Payment Reference No.
- Paid Date

Display exact status:

> Paid Early — [remarks]

Do not create a second payment action at normal milestone.

### 14.3 Superseded records

Current records appear by default. A History/Previous Records control reveals:

- Superseded record
- Effective dates
- Closed reason
- Replacement record link
- Adjustment status

### 14.4 Sold By correction

Show before/after attribution and calculated commission components. Require:

- Reason
- Supporting remark
- Admin/MD approval
- Accounts impact review

### 14.5 External Reference Correction

All confirmed reference values are immutable. Show a correction flow that:

1. Displays the original reference (read-only, marked Superseded after approval)
2. Requires a compulsory reason
3. Accepts the replacement reference
4. Shows separate action date and system entry timestamp fields
5. Links the replacement to the original in the history timeline
6. Never deletes either record

Use this pattern for Payment Received, Payment Given, refund, commission, buyback, and all other approved external references.

---

## 15. Cancellation, Change Plot and Acquisition Design

### 15.1 Refund Pending

Display a locked banner with:

- Previous status
- Cancellation reason
- Payment Received %
- Commission hold/adjustment summary
- Accounts Approve/Reject

### 15.2 Change Plot

Side-by-side comparison:

- Old Plot and status
- New Plot and status
- Old/new PLC snapshots
- Existing Payment Received %
- Accounts-entered applicable percentage for new Plot
- Revised schedule total

The new Plot remains visibly reserved while under review.

### 15.3 Buyback/Purchase for Resale

Show Payment Received and Payment Given in clearly separated panels.

Acquisition card:

- Type
- Seller/previous Customer
- Plot/property
- Arranged By
- Payment Given progress
- Payment Pending indicator
- Buying Commission
- Active buyer-process warning

When cancellation is blocked:

> This deal cannot be cancelled while a new buyer process is active. Complete the acquisition or unwind the buyer process first.

---

## 16. Allotment / Registry Design

One section with a required route selector:

- Allotment
- Registry

Do not show a third sequential route.

### Allotment fields

- Allotment Given
- Allotment Date
- Allotment Number
- Allotment Given To
- Patta Issued
- Patta Date

### Registry fields

- Advocate Name
- Registry Date

Completion shows Delivered once and records the selected route in History.

---

## 17. Reports and Administration Design

### 17.1 Reports categories

- Inventory
- Sales
- Payments
- Commission
- Members
- Customers
- Staff Work

### 17.2 Payment report

Use separate tabs/sections:

- Payment Received
- Payment Given

### 17.3 Export

Before export, show:

- Report name
- Current filters
- Masking notice
- Expected row count where practical

Record export user, filters, timestamp and row count.

### 17.4 Administration

- Staff Users
- Roles & Permissions
- Projects & Plot Setup
- System Settings
- Activity History
- Backup & Technical Control

Emergency Disable must be distinct from planned deactivation.

---

## 18. Responsive and Accessibility Requirements

Implementation design requirements:

- Core forms usable without horizontal scrolling on common mobile widths
- Tables may switch to cards on small screens
- Keyboard-accessible form controls and dialogs
- Visible focus state
- Text labels in addition to colour for status
- Error summary plus field-level validation
- Confirmation dialogs must not rely on colour alone
- Dates display DD/MM/YYYY and time in Asia/Kolkata

---

## 19. Empty, Error and Loading States

### Empty state

State what is empty and provide the permitted next action.

### Validation error

Keep entered data, focus the first error and state the exact rule.

### Conflict error

For concurrency conflicts, show the current record state and link to the winning allocation/request.

### Processing

For crucial actions:

- Show progress
- Prevent repeated submission
- On timeout/retry, retrieve the existing idempotent result

---

## 20. Design Acceptance Checklist

Before design sign-off, confirm:

- Navigation matches the approved six top-level areas
- No removed module is reintroduced
- Every protected action has a second confirmation
- Accounts review uses immutable snapshots
- Payment Received/Given are visibly distinct
- Eligibility and commission payment statuses are distinct
- Sensitive fields mask correctly in list, profile, history and export
- Plot return messaging respects restrictions
- Member portal contains no buyer-private data
- All process messages map to a real backend state/relationship
- Mobile layouts support the primary daily workflows
- Every blocked action explains why and how it can be resolved
