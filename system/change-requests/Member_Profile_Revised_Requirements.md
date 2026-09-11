# Member Profile --- Revised Requirements

## Purpose

The Member Profile is a focused profile page showing who the member is,
their network, deals, commission status, access, and history.

The page should **not function as an alert/compliance dashboard**.

------------------------------------------------------------------------

## 1. Header

Show:

- Full Name
- Member ID
- Member Status: Active / Deactivated
- Commission Hold status, including hold reason when applicable
- Firm Name, if the field is retained in the final PRD
- "Also a Customer" link to the related Customer profile, when
    applicable
- Old Member IDs, retained after a merge and searchable

------------------------------------------------------------------------

## 2. Alerts --- REMOVE

Remove the complete **Alerts** section from the Member Profile.

Do not show:

- RERA Pending / Expired / Expiring in 30 days
- Aadhaar Pending
- Bank Not Verified
- Current Terms Version Not Accepted
- Any alert summary related to payment blockers

The Member Profile should remain a profile and management page rather
than an alert dashboard.

------------------------------------------------------------------------

## 3. Summary

Show:

### Member For

Calculate from the member's activation date.

### Invited By

Show:

- Inviting Member ID
- Inviting Member Name

### Invite Position

Show:

- Position
- Applicable band
- 3% Club status where applicable

------------------------------------------------------------------------

## 4. Contact & Identity

Show:

- Mobile
- Alternate Mobile
- Email
- Date of Birth
- City
- Address
- Activated On
- Aadhaar
- PAN

### Privacy

Sensitive information should follow the existing role-based masking
rules.

Aadhaar and PAN can show:

- Last four digits
- Pending / Available / Verified status

Full sensitive information should only be revealed to authorized roles
and should be logged.

------------------------------------------------------------------------

## 5. RERA

Keep basic RERA information only:

- RERA Status
- RERA Number
- RERA Expiry Date
- Not Applicable reason, when relevant

### REMOVE

Do not show:

- Days to Expiry
- Expiry countdown
- Automatic expiry warning on the Member Profile
- RERA-related alert cards

RERA management can still be handled through the relevant admin action.

------------------------------------------------------------------------

## 6. Bank Details

Show only the member's current verified bank details:

- Bank Name
- Account Holder Name
- Account Last 4 Digits
- IFSC
- Branch
- Verification Status

### REMOVE

Remove the separate:

- Active Account
- Waiting Account
- Pending Account beside Active Account

The profile should display the current verified account clearly.

Older/replaced bank details may remain available through History for
audit purposes.

------------------------------------------------------------------------

## 7. Network

### Members Invited

Show:

- Member ID
- Member Name
- Position
- Band
- Deactivated status/note where applicable

### Royalty Linked Customers

Show:

- Customer ID
- Customer Name
- Position
- Band
- Provisional / Final status

### Invite & Royalty Cycles

Show:

- Cycle number
- Opened on
- Progress, e.g. 7 of 9 filled
- Completed count
- Upgrade Eligible status
- Next anniversary, when applicable

------------------------------------------------------------------------

## 8. Deals

### Bookings Sold By This Member

Show:

- Booking Number
- Project
- Plot
- Customer ID
- Status
- Payment Received %

### Hold Requests / Enquiries

Show:

- Plot
- Date
- Status

------------------------------------------------------------------------

## 9. Commission

### Commission Records

Show:

- Booking
- Project
- Plot
- Commission Type
- Percentage
- Eligibility
- Hold Reason
- Payment Status
- Superseded status

### Milestone

Show:

- 25% or 100%
- Date Paid

### Filters

Provide:

- Current
- All

Superseded records should be hidden by default.

The CRM should store commission counts/percentages without displaying or
storing rupee commission amounts on this profile if that remains the
approved system rule.

------------------------------------------------------------------------

## 10. Member Access

Show:

### Portal Account

- Active
- Disabled
- Locked
- Last Login

### Terms

Remove the detailed current terms version information.

Do not show:

- Terms version number
- Version date

If required for access control, show only:

**Terms Accepted: Yes / No**

Detailed acceptance history can remain in the audit/history system if
required.

------------------------------------------------------------------------

# 11. History

Keep one unified timeline.

Include relevant events such as:

- Activation
- Status changes
- RERA updates
- Commission holds
- Invited By corrections
- Bank changes
- Merges
- Identity views
- Other profile corrections

Each history entry should record:

- Action
- Actor
- Time
- Reason, where applicable

------------------------------------------------------------------------

# 12. Features / Actions

## Edit Details

Available to:

- CRM
- Admin
- MD

## Activate / Deactivate / Reactivate

Available to:

- Admin
- MD

Require a reason where applicable.

## Apply / Remove Commission Hold

Available to:

- Admin
- MD

Require a reason.

## Update RERA

Available to:

- Admin
- MD

## Enter Bank Details

- CRM enters details
- Accounts verifies the account

## Reveal Sensitive Information

Reveal Aadhaar, PAN, or full account information only to authorized
roles.

Log every reveal action.

## Portal Auto-Login Link

Staff can generate an auto-login link.

Link validity:

- 7 days

## Reset Portal Password / Unlock Account

Available to:

- Admin
- MD

------------------------------------------------------------------------

# 13. Add Task for This Member

Add a dedicated action:

**Add Task**

Available to:

- CRM
- Admin
- MD

The task should be linked directly to the selected member.

Suggested task fields:

- Task Title
- Description
- Assigned To
- Due Date
- Priority
- Status
- Created By
- Created At

Suggested statuses:

- Pending
- In Progress
- Completed
- Cancelled

The task should appear in the member's activity/history where
appropriate and should remain linked to the member for future reference.

------------------------------------------------------------------------

# 14. Merge With Another Person

Add a dedicated action:

**Merge With Another Person**

Available to:

- Admin
- MD

Purpose:

Allow an incorrectly duplicated member/person profile to be merged with
another person.

The merge flow should:

1. Search for the other person.
2. Show both profiles for comparison.
3. Confirm the primary profile.
4. Show records that will be merged.
5. Require explicit confirmation.
6. Preserve the old Member ID as a searchable Old Member ID.
7. Move/retain relevant history, deals, commission records, tasks, and
    relationships according to the approved merge rules.
8. Record the merge in History.
9. Store actor, timestamp, and reason.

The system should prevent accidental or silent merges.

------------------------------------------------------------------------

# 15. Final Page Structure

Recommended top-to-bottom order:

1. Header
2. Summary
3. Contact & Identity
4. RERA
5. Bank
6. Network
7. Deals
8. Commission
9. Member Access
10. History

Do **not** include a separate Alerts section.

------------------------------------------------------------------------

# 16. Removed Items --- Final Checklist

The following items are explicitly removed from the Member Profile:

- [x] Alerts section
- [x] RERA days to expiry
- [x] RERA expiry warning/alert
- [x] Aadhaar pending alert
- [x] Bank not verified alert
- [x] Current Terms Version Not Accepted alert
- [x] Active + Waiting bank account display
- [x] Detailed current Terms version display
- [x] Terms version date on the profile

------------------------------------------------------------------------

# 17. New Items Added

The following actions are explicitly added:

- [x] Add Task for this Member
- [x] Merge With Another Person

These actions should be permission-controlled and logged where
appropriate.
