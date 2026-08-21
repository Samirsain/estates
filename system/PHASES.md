# 3% Club CRM v3.1 — Implementation Phases

**Status:** Delivery plan companion to the corrected v3.1 PRD  
**Date:** 19 August 2026  
**Read with:** [`PRD.md`](./PRD.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`DESIGN.md`](./DESIGN.md)

---

## 1. Delivery Rules

1. Business rules are taken from `PRD.md`.
2. No phase may introduce a superseded Customer portal, service-request module, document upload, standalone calculator or rupee ledger.
3. A later phase must not weaken a control completed in an earlier phase.
4. Real Booking, payment or commission operations must remain disabled until the applicable go-live gates are passed.
5. Every phase includes requirements, UX, permissions, database constraints, automated tests, audit, migration impact and operating instructions.
6. There are no implementation dates in this document. The vendor estimates effort after reviewing the approved baseline.

---

## Phase 0 — Baseline Lock and Technical Design

### Objective

Convert the approved requirements into a traceable implementation plan before coding.

### Deliverables

- Signed Version 3.0 and corrected Version 3.1 hierarchy
- Requirement IDs and traceability matrix
- Final navigation map
- Field-level role/permission matrix
- Status and transition catalogue
- Logical data model and database constraint plan
- API/server-action command catalogue
- Idempotency and concurrency design
- Scheduled-job design
- Migration discovery and source-data profile
- UX wireframes for all critical workflows

### Mandatory design decisions already fixed

- One active MD in normal operation
- One Person with multiple capabilities
- Percentage-only financial model
- Payment Received and Payment Given separated
- One-route Allotment or Registry completion
- Same-Project Change Plot with manual Accounts percentage
- 4% cap blocks Booking approval until conflict is corrected
- No maximum Keep Booking extensions
- Aadhaar protected field/no upload

### Exit criteria

- No open developer assumption on a critical rule
- Architecture and UX review signed by Product Owner, CRM and Accounts
- All critical states and transitions have named tests

---

## Phase 1 — Platform, Security and Identity Foundation

### Objective

Create a secure, auditable foundation before transactional modules.

### Scope

- Staff accounts, roles and permissions
- Exactly one active MD and documented recovery path
- Admin/MD MFA
- Member ID authentication shell
- Session invalidation and lockout/rate limiting
- Universal Person model
- Customer and Member capabilities
- Aadhaar/PAN protected fields and masking
- Staff/Member status controls
- Audit and security-event framework
- Idempotency store
- Environment and secret-management setup

### Key controls

- Deny by default
- Server-side and field-level authorisation
- No password in logs/audit
- Shared mobile as contact only; Member login by Member ID
- Duplicate Aadhaar/PAN prevention
- Person merge foundation with old-ID preservation

### Tests

- Direct URL/crafted request cannot bypass permission
- Shared-mobile Members remain distinct
- Sensitive fields mask correctly
- MD/Admin MFA enforced
- Disabled accounts cannot log in
- Repeated command with same idempotency key returns the original result

### Exit criteria

- Security review of identity/authentication complete
- Audit events proven immutable to normal users
- No transaction module uses client-side-only permission checks

---

## Phase 2 — Projects, Plot Inventory, Enquiries and Holds

### Objective

Deliver controlled pre-sales and inventory allocation.

### Scope

- Project lifecycle and Project/Plot setup
- Excel-style inventory preparation grid
- Plot dimensions, area, boundaries and PLC versions
- Restrictions and restriction-aware return logic
- Enquiry capture, source attribution and follow-up
- Original Introduced By Member freeze
- Hold creation, expiry and extension
- Member Hold Requests and Member portal enquiry/hold actions
- Three-open-position limit
- Dashboard task foundation and scheduler jobs for pre-sales

### Critical rules

- Plot uniqueness = Project + Plot Type + Plot Number
- Every Hold identifies the actual Customer/Person
- Anonymous Member Holds prohibited
- One Pending Hold Request per Customer/Plot
- Multiple different Customers may request the same Plot
- First Hold extension by CRM; later extension requires Admin
- Extension review does not pause Hold expiry
- Restriction-aware return used everywhere

### Tests

- Concurrent Hold attempts allow one allocation only
- Hold expiry and downtime catch-up create no duplicates
- Three-position limit counts Holds, Waiting Approval and Pending requests
- Same Customer/Plot duplicate request is blocked
- Original Introduced By cannot be silently overwritten
- Project/Plot boundary and PLC calculations are deterministic

### Exit criteria

- Inventory reconciliation passes
- Enquiry/Hold history and task closure verified
- Member portal exposes no unrelated Customer data

---

## Phase 3 — Booking Requests, Approved Bookings and Payment Received

### Objective

Implement the core sale transaction with exact review and restoration behavior.

### Scope

- Booking Request form and immutable review version
- Temporary Request ID and permanent Booking Number
- Accounts approval/rejection at 0% or above
- Cancel Booking before and after approval
- Ownership shares and Additional Customers
- Primary Customer change review
- Payment schedules and revisions
- Payment Received confirmation/correction
- External Reference correction
- Rolling payment-follow-up tasks

### Critical rules

- Pending Booking Review snapshot cannot be edited
- Any change creates a new version and Accounts task
- 4% commission conflict blocks Accounts approval
- Cancel Booking before approval does not enter Refund Pending
- Formal cancellation after approval enters Refund Pending
- Received schedule portions are locked
- Unpaid percentage may be split/combined/moved with Accounts approval
- Payment Reference globally unique across Received and Given
- Payment progress cannot exceed 100%

### Tests

- Double submit/approve creates one Booking Number
- Rejection restores exact Hold/Plot state
- Cancel request and formal cancellation follow different backend paths
- Payment correction preserves original and replacement links
- Reversal below 100% pauses completion workflow
- Multiple final buyers require shares totalling 100%
- Primary Customer change keeps old buyer official until Accounts approval

### Exit criteria

- Booking, Plot and Enquiry state pairs reconcile
- Accounts signs off the review and payment workflow
- No rupee field exists in Booking/payment schema

---

## Phase 4 — Commission and Network Engine

### Objective

Implement all sale-side commission eligibility, limits, history and payment states.

### Scope

- Direct Commission
- Invite Commission and annual Invited Member Counter
- Royalty and annual Introduced Customer Counter
- Loyalty Bonus and three lifetime slots
- Active Member self-purchase rules
- 4% cap/compatibility validation
- Atomic opportunity allocation
- Paid, Not Paid, Paid Early and Accounts Adjustment Required
- Commission supersession and Sold By correction
- Member deactivation holds
- Commission reports and Member portal view

### Critical rules

- Invite first qualifying third-party sale = first to reach 100%
- Member personal purchase does not consume Invite opportunity
- Royalty one qualifying future direct purchase per introduced Customer
- Loyalty maximum three lifetime slots
- Repeat direct purchase may create Loyalty + Royalty
- Active Member cannot close as Customer
- Paid Early does not require extra MD/Admin approval
- No second payment task after Paid Early
- Old commission records are superseded, not deleted

### Tests

- Concurrent milestone events cannot consume duplicate slots
- 29 February anniversary reset works on 28 February in non-leap years
- Above-4% combination blocks Booking approval
- Loyalty slot reopens after cancellation before legal completion
- Paid/Paid Early becomes Accounts Adjustment Required after affected correction
- Member portal does not reveal buyer identity

### Exit criteria

- Commission traceability from Booking to rule version and beneficiary proven
- Accounts validates all payment-state paths
- Commission totals exclude superseded records

---

## Phase 5 — Cancellation, Change Plot and Acquisition

### Objective

Complete exception and resale workflows without corrupting the original sale history.

### Scope

- Refund Pending and exact restoration
- Change Plot within same Project
- Replacement Plot reservation and PLC snapshot
- Buyback and Purchase for Resale
- External Resale Property Group
- Payment Given schedules/corrections
- Payment Pending and Deal Cancelled treatment
- Buying Commission
- Acquisition duplicate detection

### Critical rules

- Only one major conflicting process per Booking
- Change Plot uses same Booking Number
- Accounts manually records applicable percentage on replacement Plot
- Minimum 20% Payment Given before acquisition approval
- Below 100% displays Payment Pending
- Acquisition cannot be cancelled while a buyer process is active without completion/unwind
- One active acquisition per Plot/property
- Buying Commission milestone = 100% Payment Given
- Restriction-aware Plot return applies after every exception

### Tests

- Change Plot rejection fully restores original state
- Payment Given correction below 20% follows buyer/no-buyer paths
- Correction below 100% restores Payment Pending and holds commission
- Duplicate external acquisition blocks/warns correctly
- Seller/returning buyer cannot receive Buying Commission for their own acquisition
- Buyback history does not overwrite original Booking/payment history

### Exit criteria

- Accounts signs off Payment Given and adjustment workflows
- Acquisition and sale payment datasets remain separate
- Returned inventory status/RESALE/restriction reconciliation passes

---

## Phase 6 — Allotment/Registry, Reports, Administration and Portal Completion

### Objective

Complete final documentation, management visibility and controlled administration.

### Scope

- Final buyer details
- One-route Allotment or Registry
- Delivered state and exceptional reopen
- Reports and masked exports
- Administration and Activity History
- Staff emergency disable and reassignment queue
- Final Member portal views
- Remaining scheduled jobs and monitoring
- Person Merge workflow (Admin/MD only; requires deactivation of one Active Member before merge; Loyalty count rebuilt from unique qualifying events; old IDs preserved as searchable references)

### Critical rules

- No Allotment-then-Registry third route
- Delivered means CRM final documentation/completion state
- No separate physical-possession module
- Full sensitive values excluded from exports
- Emergency disable blocks access immediately
- Reports exclude superseded commission and merged duplicates

### Tests

- Delivery blocked until required details/shares are complete
- Delivered event occurs once
- Exceptional reopen preserves history
- Export masks sensitive fields and logs filters/user/row count
- Emergency disable queues open work and invalidates sessions
- Scheduled-job retry and catch-up remain duplicate-safe

### Exit criteria

- Management reports reconcile to source records
- Portal privacy test passes
- Administration and audit sign-off complete

---

## Phase 7 — Migration, Hardening, UAT and Go-Live

### Objective

Move from the earlier implementation to the approved baseline safely.

### Migration activities

- Full backup and staging rehearsal
- Status mapping and one-allocation reconciliation
- Booking/Plot pair reconciliation
- Payment Received/Given separation
- Commission eligibility/payment split and supersession reconstruction
- Member/Customer annual positions rebuilt without renumbering
- Loyalty slots rebuilt from unique qualifying events
- Old Customer portal accounts disabled, not deleted
- Member ID login migration
- Duplicate/merged Person reconciliation
- Signed record-count and exception report

### Hardening

- Concurrency/load tests
- Idempotency retry tests
- Permission abuse tests
- Scheduler downtime/recovery tests
- Backup restore and rollback rehearsal
- Security review and MFA verification
- Browser/responsive tests

### UAT groups

- MD/Admin
- CRM
- Accounts
- MIS/PC where applicable
- Selected Members for portal UAT

### Go-live gates

All gates in `PRD.md` must pass, including:

- Signed requirements
- Permission and transition tests
- Commission cap/concurrency tests
- Payment correction tests
- Migration reconciliation
- Security/access testing
- Scheduled-job recovery evidence
- Backup restoration and rollback plan
- User training and UAT sign-off
- Company control of production-critical accounts

---

## Post-Go-Live Stabilisation

### Initial controls

- Daily reconciliation of Plot allocation and Booking state
- Daily review of failed jobs and duplicate-prevention alerts
- Daily review of Accounts Adjustment Required
- Weekly review of Paid Early records
- Weekly review of unresolved Management Action Required
- Weekly backup verification

### Change control

Every future change affecting commission, payment, inventory, identity, permissions or completion requires:

- Change Request ID
- Owner
- Exact approved wording
- Affected screens/data/statuses
- Permission, migration and test impact
- Release target
