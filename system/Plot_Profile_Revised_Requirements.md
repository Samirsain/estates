# Plot Profile — Revised Requirements

## Purpose
The Plot Profile is a focused page showing the Plot, its dimensions and layout, current booking/allocation information, completion, past deals, history, and available actions.

This revision removes the requested Plot Profile sections while retaining the rest of the existing PRD.

## 1. Header
Show:
- Plot Number
- Project
- Plot Type
- Plot Status
- Resale Tag
- Restriction and Reason, where applicable
- Process Message, where applicable

Process messages may include:
- Change Plot Under Process
- Buyback Under Process
- Payment Pending
- Not Available
- Deal Cancelled

## 2. REMOVE — Details Locked
Remove the complete **Details Locked** section.

Do not show:
- Details Locked indicator
- Lock reason
- Active Hold / Booking lock explanation
- Change Plot lock explanation

## 3. REMOVE — Location Charge
Remove the complete **Location Charge (PLC %)** section.

Do not show:
- Total PLC
- PLC components
- Corner charge
- Park Facing charge
- Road Facing charge
- Sides earning PLC

PLC calculation/configuration may remain in the appropriate calculator or configuration flow.

## 4. REMOVE — PLC Version Used
Remove:
- PLC Version Used
- Published PLC version reference
- PLC version number/date from the Plot Profile

## 5. REMOVE — Frozen vs Current
Remove:
- Frozen PLC percentage
- Current PLC percentage comparison
- Frozen vs Current indicator
- PLC snapshot comparison

## 6. Dimensions · Boundaries · Layout
Keep this section.

### Dimensions
Show:
- Width × Length
- Area in sq ft, up to 4 decimal places
- Area in sq yd
- Area in sq m

### Exact Area Override
Show:
- Override area
- Compulsory reason

### Four Sides
Show:
- Road
- Road width
- Plot
- Park
- Facilities
- Other applicable reference information

### Layout Drawing
Show:
- Plot layout to scale
- Open sides represented with heavier visual treatment

## 7. REMOVE — Current Allocation · Hold
Remove the dedicated **Current Allocation · Hold** section.

Do not show:
- Held For
- Hold Expiry
- Hold Extensions
- Holder ID/name/mobile
- Frozen Timer
- Hold Age
- Responsible CRM
- PLC Snapshot

The underlying Hold workflow/action can remain where required by the Plot lifecycle.

## 8. Current Allocation · Booking
Keep this section.

Show:
- Customer
- Booking Number
- Payment Received %
- Request Number while waiting for approval
- Sold By
- Booking Date
- Member ID / 3% Club / Customer
- Additional Customers and shares
- Customer shares must total 100%
- Payment Given % for Buyback or Purchase for Resale

## 9. Completion
Keep the Completion section.

### Allotment
Show:
- Allotment Date
- Allotment Number
- Given To
- Patta: Yes / Don't Know
- Patta Date

### Registry
Show:
- Delivered On
- Advocate
- Registry Date

## 10. Past Deals
Keep the Past Deals section.

### Earlier Bookings
Show:
- Earlier Booking
- Cancelled
- Refunded
- Moved through Change Plot
- Outcome
- Link to related record

### Acquisitions
Show:
- Buyback
- Purchase for Resale
- Outcome

### Open Enquiries
Show:
- Who asked
- Date
- Status

## 11. History
Keep one unified Plot History timeline.

### Status & Restriction Changes
Record:
- Status change
- Restriction change
- Actor
- Time
- Reason

### Detail Corrections
Record:
- Dimensions
- Sides
- Other editable Plot details
- Old value
- New value
- Reason
- Actor
- Time

## 12. Features / Actions

### Edit Plot Details
Available to authorised users.
- Only while the Plot is editable according to system rules.
- Require a reason for corrections where applicable.

### Set / Remove Restriction
Available to:
- Admin
- MD

### Make Available & Hold
Available to:
- Admin
- MD

The Hold action remains available even though the dedicated Current Allocation · Hold display has been removed.

### Open in Calculator
Available to:
- Staff

Allow:
- Rate input
- Area quote

## 13. Actions by Plot Status

### Available
- Hold
- Start Booking

### Hold
- Extend Hold
- Cancel Hold
- Book

### Waiting Approval
- View Request
- Cancel according to the pre-approval rule

### Booked
- Open Booking
- Follow-up
- Cancel Booking
- Change Plot

### Payment Completed
- Prepare Allotment / Registry
- Cancel where permitted
- Change Plot

### Delivered
- View Delivery

No normal:
- Cancellation
- Change Plot

## 14. Payment Schedule & Commission
Keep detailed payment schedule and commission on the **Booking page**.

The Plot Profile should show:
- Payment Received %
- Link to the relevant Booking

## 15. Final Plot Profile Structure
Recommended top-to-bottom order:

1. Header
2. Dimensions
3. Boundaries
4. Layout
5. Current Allocation · Booking
6. Completion
7. Past Deals
8. History

Operational actions remain available through the Features / Actions area.

## 16. Explicitly Removed
- [x] Details Locked
- [x] Location Charge (PLC %)
- [x] PLC Version Used
- [x] Frozen vs Current
- [x] Current Allocation · Hold
- [x] Hold details as a dedicated profile section
- [x] Frozen PLC timer/note
- [x] PLC snapshot on the Plot Profile

## 17. Retained From Existing PRD
- [x] Header
- [x] Plot status
- [x] Resale restriction
- [x] Process messages
- [x] Dimensions
- [x] Exact area override
- [x] Four-side boundaries
- [x] Layout drawing
- [x] Current Booking allocation
- [x] Completion
- [x] Past deals
- [x] Acquisitions
- [x] Open enquiries
- [x] History
- [x] Edit Plot details
- [x] Set / Remove restriction
- [x] Make Available & Hold action
- [x] Open in Calculator
- [x] Status-based actions
- [x] Booking link
- [x] Payment Received %
- [x] Completion / Registry workflow
