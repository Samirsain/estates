# 3% Club CRM v3.1 — Developer-Side PLC Specification

**Document type:** Developer implementation specification  
**Source:** Corrected CRM v3.1 PRD  
**Scope:** PLC configuration, calculation, versioning, snapshots, corrections, permissions, workflows, audit and testing  
**Important boundary:** PLC is stored and processed only as a percentage. The CRM must not calculate or store any rupee value from PLC.

---

## 1. Purpose

This document defines the complete developer-side PLC concept for the 3% Club CRM.

It must be used together with the full Version 3.0 baseline and the corrected Version 3.1 addendum. Where this document repeats an approved PLC rule, it is for implementation clarity only. It does not create a new commercial policy.

The implementation must ensure that:

- PLC is configurable project-wise.
- PLC is calculated consistently for every Plot.
- The same PLC category is never charged twice merely because it applies on multiple sides.
- Available inventory always reflects the latest published PLC version.
- Hold, Booking and Change Plot transactions retain frozen historical PLC snapshots.
- Old PLC values are never silently overwritten or deleted.
- Every correction remains auditable.

---

## 2. Core PLC Business Rules

### 2.1 Percentage-only model

- PLC must be stored as a percentage.
- PLC must not be converted into rupee value inside the CRM.
- The CRM must not store:
  - PLC amount
  - Plot value
  - Rate
  - Total price
  - Tax amount
  - Any other rupee calculation derived from PLC

Use an exact decimal data type. Do not use floating-point storage.

Recommended technical type:

```text
DECIMAL(7,4)
```

Example supported values:

```text
0.0000%
1.2500%
12.5000%
100.0000%
```

The final allowed precision must remain consistent across database, API, UI and exports.

### 2.2 Distinct PLC component rule

A Plot may have one or more applicable PLC components.

The effective PLC is:

```text
Sum of each distinct applicable PLC category exactly once
```

Example:

```text
Park Facing = 2%
Corner = 1%
Total PLC = 3%
```

### 2.3 No duplicate charge for the same category

When the same category applies on more than one side, charge it only once.

Example:

```text
North side = Road
East side = Road
Road-facing PLC category = 2%
Effective Road-facing PLC = 2%, not 4%
```

The calculation must deduplicate by a stable category key, not by the display label.

Recommended key:

```text
plc_category_code
```

### 2.4 Different categories may be combined

Different applicable categories may be added together once each.

Example:

```text
Road Facing = 2%
Park Facing = 1.5%
Corner = 1%
Total PLC = 4.5%
```

The actual PLC categories and their percentages must be configurable. Developers must not hard-code unapproved categories.

### 2.5 Zero PLC

If no PLC component applies to a Plot:

```text
Total PLC = 0%
```

The system should still be able to show that PLC was evaluated and resulted in 0%.

---

## 3. PLC Configuration Model

### 3.1 Project-level PLC configuration

PLC configuration belongs to a Project.

Each Project may have multiple PLC versions over time.

A version should contain:

- Project
- Version number
- Effective date/time
- Status
- Created by
- Created at
- Published by
- Published at
- Reason or version note
- PLC components included in that version

Recommended technical statuses:

```text
Draft
Published
Superseded
```

These are technical version statuses and do not create a new business workflow.

### 3.2 PLC component fields

Each PLC component should contain:

- Component ID
- Project ID
- Version ID
- Category code
- Display name
- Percentage
- Applicability basis
- Active/Inactive within the version
- Display order
- Internal note, if required

Examples of applicability basis may include:

- Derived from Plot characteristics
- Derived from boundaries/open sides
- Manually selected during authorised Plot setup
- Project-level applicability rule

The exact commercial categories must come from authorised Project setup. Developers must not invent them.

### 3.3 Stable category code

The category code must remain stable across versions.

Example:

```text
ROAD_FACING
PARK_FACING
CORNER
```

The display label may change, but deduplication and historical comparison must use the stable category code.

### 3.4 Published versions are immutable

After a PLC version is published:

- It must not be edited in place.
- It must not be deleted.
- A change requires a new version.
- The earlier version becomes historical/superseded.
- Existing Hold and Booking snapshots remain unchanged.

### 3.5 One current published version

At any moment, a Project should have only one current PLC version applicable to new inventory actions.

Publishing a new version must be atomic:

1. Validate the new version.
2. Publish the new version.
3. Close the prior current version.
4. Make the new version current.
5. Preserve complete history.

---

## 4. Plot-Side PLC Applicability

### 4.1 Plot characteristics used by PLC

Plot setup already contains information that may affect PLC, including:

- Plot Number
- Plot Type
- Width
- Length
- Calculated Area
- Exact Area Override for irregular Plot
- North boundary
- South boundary
- East boundary
- West boundary
- Road width when a boundary is Road
- Adjacent Plot Number when boundary is another Plot
- Park Facing
- Derived facing/open-side information
- Restriction
- Lifecycle status

PLC applicability should be derived from approved Plot characteristics wherever possible.

### 4.2 Derived versus manual applicability

The system should distinguish between:

- **Derived component:** automatically determined from approved Plot data.
- **Manual component:** selected by an authorised user because the commercial rule cannot be derived reliably.

Every manual selection or removal should have:

- Actor
- Date/time
- Reason
- Before value
- After value

### 4.3 Recalculation for non-transactional inventory

For inventory that is still Available or Not Active:

- Use the latest current published PLC version.
- Recalculate effective PLC when:
  - A new PLC version is published.
  - Relevant Plot characteristics are changed through an authorised correction.
  - Manual PLC applicability is changed.

This recalculation must not alter any frozen Hold or Booking snapshot.

---

## 5. Effective PLC Calculation

### 5.1 Calculation steps

For a Plot and PLC version:

1. Load all applicable PLC components.
2. Group them by stable category code.
3. Keep one component per category code.
4. Validate that duplicate entries for the same category do not conflict.
5. Sum the unique percentages.
6. Store or display the effective percentage.
7. Store the component breakdown used in the calculation.

Pseudocode:

```text
applicable_components = getApplicableComponents(plot, plc_version)

unique_components = deduplicateByCategoryCode(applicable_components)

effective_plc = sum(component.percentage for component in unique_components)
```

### 5.2 Conflicting duplicate configuration

If the same category code appears more than once in the same PLC version with different percentages, publishing must be blocked.

Example:

```text
ROAD_FACING = 2%
ROAD_FACING = 3%
```

Result:

```text
Validation Error — Conflicting PLC percentage for category ROAD_FACING
```

### 5.3 No silent fallback

If PLC configuration is incomplete or contradictory:

- Do not silently select a percentage.
- Do not default to another Project’s PLC.
- Do not infer a commercial rule.
- Block the affected publish or transaction and show a clear error.

---

## 6. PLC Version Behaviour by Plot Status

### 6.1 Setup / Not Active

- Uses the latest current published PLC version.
- PLC may be recalculated before Project activation.
- No frozen transaction snapshot exists.

### 6.2 Available

- Uses the latest current published PLC version.
- The displayed PLC may change when a new PLC version is published.
- No historical transaction right is created merely by viewing an Available Plot.

### 6.3 Hold

At Hold creation:

- Freeze the effective PLC percentage.
- Freeze the complete component breakdown.
- Freeze the PLC version ID.
- Store the snapshot time.
- Store the Customer and Plot references.
- Do not recalculate that Hold snapshot after a later PLC version change.

### 6.4 Booking Request

At Booking Request submission:

- Freeze the PLC snapshot inside the Booking Request review version.
- While Accounts review is pending, the PLC snapshot cannot be silently edited.

Snapshot source:

- When the Booking Request originates from an active Hold, carry forward that Hold PLC snapshot.
- When there is no Hold, freeze the current effective PLC at Booking Request submission.

Any change to the frozen PLC requires cancellation of the pending review version and creation of a new Booking Request version under the approved Booking Request snapshot rules.

### 6.5 Approved Booking

After Booking approval:

- The approved PLC snapshot becomes the permanent Booking PLC snapshot.
- Later PLC version changes do not alter the Booking.
- Historical reports must use the Booking snapshot, not the latest Project version.

### 6.6 Payment Completed and Delivered

- Continue using the approved Booking PLC snapshot.
- PLC is not recalculated merely because payment reaches 100% or the Booking becomes Delivered.
- Any correction must follow the controlled PLC correction process and preserve history.

---

## 7. PLC Snapshot Structure

Every frozen PLC snapshot should store:

- Snapshot ID
- Snapshot type
- Project ID
- Plot ID
- Customer/Person ID, where applicable
- Hold ID, where applicable
- Booking Request version ID, where applicable
- Booking ID, where applicable
- Change Plot request ID, where applicable
- PLC version ID
- Total PLC percentage
- Snapshot date/time
- Created by/System actor
- Current/active indicator
- Superseded by, where applicable

Snapshot types may include:

```text
Hold
Booking Request
Booking
Change Plot Temporary
Change Plot Approved
```

### 7.1 Snapshot component breakdown

Store each component used in the snapshot:

- Snapshot component ID
- Snapshot ID
- Category code
- Display name at the time
- Percentage at the time
- Applicability source
- Relevant Plot side or characteristic, if useful
- Deduplication key
- Included in total: Yes/No
- Exclusion reason, when a duplicate side/category was ignored

This prevents later Project configuration changes from changing historical interpretation.

### 7.2 Snapshot immutability

A frozen snapshot must never be updated in place.

A correction creates:

- A new corrected snapshot
- A link to the old snapshot
- A compulsory reason
- Actor
- Date/time
- Old total
- New total
- Old components
- New components

The prior snapshot becomes superseded, not deleted.

---

## 8. PLC During Hold

### 8.1 Hold creation transaction

Hold creation and PLC snapshot creation must occur in the same database transaction.

Either both succeed or both fail.

### 8.2 Hold extension

Extending a Hold does not create a new PLC snapshot.

The original Hold PLC snapshot continues unless the approved business policy expressly creates a fresh Hold. An expired Hold cannot be revived through a late extension approval.

### 8.3 Hold movement to another Plot

When a Hold moves to another Available Plot for the same Customer:

- Continue the remaining Hold time.
- Freeze the replacement Plot’s current PLC snapshot at movement.
- Preserve the old Plot and old PLC snapshot in History.
- Return the old Plot according to its active restriction.
- Do not overwrite the old snapshot.

---

## 9. PLC During Booking Request

The Booking Request snapshot must include:

- Project
- Plot
- PLC version
- PLC total
- PLC component breakdown
- Customer details
- Ownership shares
- Sold By
- Booking Date
- Customer Type
- Payment schedule

While the request is under Accounts review:

- PLC cannot change silently.
- Project/Plot correction requires a new request version.
- A later Project PLC version must not affect the pending request.
- The Accounts decision must reference the exact frozen review version.

---

## 10. PLC During Change Plot

### 10.1 Submission

For an approved Booking Change Plot:

- Same Project only.
- Transactionally block the replacement Plot.
- Keep the old Plot allocated as Change Plot Under Process.
- Freeze the replacement Plot’s PLC snapshot at submission.
- If the same Customer already held the replacement Plot, use that Hold PLC snapshot.
- Create the required Accounts Verification — Change Plot task.

The temporary replacement snapshot must contain:

- Replacement Plot
- PLC version
- Total PLC
- Components
- Snapshot source
- Submission timestamp
- Customer
- Booking
- Change Plot request

### 10.2 Approval

On approval:

- The same Booking Number continues.
- The replacement PLC snapshot becomes the permanent Booking PLC snapshot.
- Preserve the original Plot PLC snapshot in History.
- Link old and new snapshots to the Change Plot request.
- Recheck commission under the approved rules.
- Do not create a RESALE tag merely because of Change Plot.

### 10.3 Rejection

On rejection:

- Restore the original Booking and Plot state.
- Return the replacement Plot to its previous restriction/state.
- Discard the temporary replacement snapshot from current use.
- Keep the temporary snapshot in History as rejected/superseded.
- Rejection remark is compulsory.

### 10.4 Later Project PLC changes

A PLC version published after Change Plot submission must not alter the temporary replacement snapshot.

---

## 11. PLC Correction

### 11.1 Correction principles

PLC corrections must:

- Never overwrite a published version.
- Never overwrite a Hold snapshot.
- Never overwrite a Booking snapshot.
- Preserve old and new values.
- Require a compulsory reason.
- Record actor and date/time.
- Preserve affected transaction references.

### 11.2 Types of correction

Possible technical correction categories:

```text
Project PLC version correction
Plot applicability correction
Hold snapshot correction
Booking Request snapshot correction
Approved Booking snapshot correction
Change Plot snapshot correction
```

The allowed role and approval path must follow the CRM’s field-level permissions and controlled correction rules. Developers must not create a new approval policy.

### 11.3 Impact review

Before applying a correction to a transactional PLC snapshot, the system should show affected records:

- Hold
- Booking Request
- Booking
- Change Plot
- Payment schedule reference, if linked operationally
- Commission compatibility, where applicable
- Reports and exports

The correction itself must not calculate any rupee impact.

---

## 12. Permissions

### 12.1 Configuration permissions

Only users with authorised Project/Plot setup permissions may:

- Create Draft PLC versions
- Add or edit components in Draft
- Configure Plot applicability
- Preview effective PLC
- Submit/publish according to granted permission

Admin/MD control Project activation and critical correction permissions. PC access remains limited to granted Project/Plot preparation permissions and has no financial approval authority.

### 12.2 Transaction permissions

- CRM may initiate authorised Hold, Booking Request and Change Plot actions.
- Accounts reviews Booking and Change Plot where the approved workflow requires it.
- Member users cannot edit PLC configuration or snapshots.
- Customer portal is out of scope.

### 12.3 Visibility

Authorised operational screens may show:

- Total PLC percentage
- Component breakdown
- PLC version
- Snapshot source
- Snapshot date
- Correction history

Member-facing visibility must follow the approved Member portal permissions and must never expose internal correction controls or restricted data.

---

## 13. Recommended Data Model

## 13.1 `plc_version`

```text
id
project_id
version_number
status
effective_from
effective_to
reason
created_by
created_at
published_by
published_at
superseded_by_version_id
```

### 13.2 `plc_component`

```text
id
plc_version_id
category_code
display_name
percentage
applicability_type
is_active
display_order
created_by
created_at
```

### 13.3 `plot_plc_applicability`

```text
id
plot_id
plc_version_id
category_code
source_type
source_reference
is_applicable
reason
created_by
created_at
```

### 13.4 `plc_snapshot`

```text
id
snapshot_type
project_id
plot_id
person_id
hold_id
booking_request_version_id
booking_id
change_plot_request_id
plc_version_id
total_percentage
status
snapshot_source
created_by
created_at
superseded_by_snapshot_id
```

### 13.5 `plc_snapshot_component`

```text
id
snapshot_id
category_code
display_name
percentage
applicability_source
source_reference
included_in_total
exclusion_reason
```

### 13.6 `plc_audit_event`

```text
id
record_type
record_id
action
old_value_json
new_value_json
reason
actor_id
created_at
```

---

## 14. API Requirements

Recommended endpoints:

```text
POST   /projects/{projectId}/plc-versions
GET    /projects/{projectId}/plc-versions
GET    /projects/{projectId}/plc-versions/{versionId}
POST   /projects/{projectId}/plc-versions/{versionId}/publish
GET    /plots/{plotId}/plc/current
POST   /plots/{plotId}/plc/preview
GET    /holds/{holdId}/plc-snapshot
GET    /booking-requests/{requestId}/plc-snapshot
GET    /bookings/{bookingId}/plc-snapshot
GET    /change-plot/{requestId}/plc-snapshot
POST   /plc-snapshots/{snapshotId}/correct
GET    /plc-snapshots/{snapshotId}/history
```

### 14.1 Idempotency

Critical PLC-changing actions must support idempotency:

- Publish PLC version
- Create Hold snapshot
- Submit Booking Request snapshot
- Submit Change Plot snapshot
- Approve Change Plot snapshot
- Correct PLC snapshot

The same idempotency key must return the original result.

### 14.2 Transactional locking

Use database transactions/locking for:

- Publishing a new current version
- Hold and snapshot creation
- Booking Request and snapshot creation
- Change Plot submission
- Change Plot approval/rejection
- PLC correction

---

## 15. UI Requirements

### 15.1 Project PLC setup screen

Show:

- Current published version
- Draft version
- Version history
- Component list
- Percentage
- Category code
- Applicability basis
- Effective date
- Preview
- Validation errors
- Publish action
- History

### 15.2 Plot PLC panel

Show:

- Current effective PLC
- Component breakdown
- Latest PLC version
- Applicability source
- Duplicate-category deduplication result
- Plot characteristics used
- Preview after Plot changes

### 15.3 Transaction PLC panel

For Hold, Booking and Change Plot show:

- Frozen PLC total
- Frozen component breakdown
- Version
- Snapshot date
- Snapshot source
- Current/historical status
- Correction history, for authorised users

### 15.4 Change Plot comparison

Show side-by-side:

```text
Original Plot PLC
Replacement Plot PLC
Original components
Replacement components
Original snapshot date
Replacement snapshot date
```

No rupee difference should be calculated.

---

## 16. Reports and Exports

PLC reporting should support:

- Project
- Plot
- Current inventory PLC
- PLC version
- Hold PLC snapshot
- Booking PLC snapshot
- Change Plot old PLC
- Change Plot new PLC
- Snapshot source
- Correction status
- Effective date
- Actor and timestamp

Rules:

- Historical Bookings use their frozen snapshot.
- Available inventory uses the latest current PLC.
- Superseded records remain available in authorised audit reports.
- Exports follow masking and export-log requirements.
- No PLC rupee amount is exported because the CRM does not store it.

---

## 17. Migration Requirements

Before go-live migration:

- Import current Project PLC configuration.
- Assign stable category codes.
- Validate duplicate categories.
- Validate percentage precision.
- Recalculate current Available/Not Active Plot PLC.
- Migrate historical Hold/Booking PLC as snapshots where data exists.
- Do not recalculate old transactions using the latest version.
- Reconcile Project, Plot, version, total and component breakdown.
- Produce a signed migration reconciliation report.

If historical component detail is unavailable but a historical total exists:

- Preserve the historical total.
- Mark component detail as unavailable from source migration.
- Do not fabricate a breakdown.

---

## 18. Validation Rules

The system must validate:

- PLC percentage is numeric and non-negative.
- Category code is present and stable.
- One category has one percentage per version.
- Published version cannot be edited.
- Only one current published version exists per Project.
- Snapshot total equals the sum of included unique categories.
- Same category is included only once.
- Snapshot Project and Plot match.
- Hold/Booking snapshot cannot use another Project’s PLC version.
- Change Plot replacement belongs to the same Project.
- Change Plot snapshot source is recorded.
- Correction reason is mandatory.
- Old snapshot remains linked and searchable.
- No PLC operation calculates rupee value.

---

## 19. Required Acceptance Tests

### PLC configuration

1. Create a Draft PLC version with multiple components.
2. Publish a version and confirm it becomes current.
3. Publish a new version and confirm the previous version becomes historical.
4. Confirm a published version cannot be edited.
5. Confirm conflicting duplicate category percentages block publishing.

### PLC calculation

1. One category on one side is charged once.
2. The same category on two sides is still charged once.
3. Two different categories are summed.
4. No applicable category produces 0%.
5. Snapshot total equals the unique component sum.

### Available inventory

1. Available Plot uses the latest PLC version.
2. Not Active Plot uses the latest PLC version.
3. New PLC version updates Available inventory.
4. New PLC version does not update historical snapshots.

### Hold

1. Hold creation freezes version, total and components.
2. PLC version change after Hold does not alter the Hold.
3. Hold extension keeps the original snapshot.
4. Moving Hold to another Plot creates a new replacement snapshot and preserves the old one.

### Booking Request and Booking

1. Booking from Hold carries the Hold PLC snapshot.
2. Direct Booking Request freezes current PLC at submission.
3. PLC cannot be silently edited under Accounts review.
4. A new request version is required to change the frozen PLC.
5. Approved Booking retains the frozen PLC permanently.
6. Delivered continues to use the approved Booking snapshot.

### Change Plot

1. Change Plot freezes the replacement PLC at submission.
2. If the Customer already held the replacement Plot, the Hold PLC snapshot is used.
3. A later PLC version does not alter the pending replacement snapshot.
4. Approval makes the replacement snapshot permanent.
5. Rejection restores the original Booking and preserves the rejected temporary snapshot in History.
6. Old and new PLC values are both visible after approved Change Plot.

### Correction and audit

1. Correction creates a new snapshot and supersedes the old snapshot.
2. Reason, actor and time are compulsory.
3. Old and new component breakdowns remain visible.
4. No record is hard-deleted.
5. Reports use current non-superseded operational records while audit shows full history.

### Security and concurrency

1. Unauthorised users cannot edit PLC configuration.
2. Member users cannot edit snapshots.
3. Two simultaneous publish attempts cannot create two current versions.
4. Repeated snapshot submission with the same idempotency key does not create duplicates.
5. Hold/Booking creation cannot succeed without its required PLC snapshot.

---

## 20. Developer Completion Checklist

Before PLC development is signed off, confirm:

- [ ] PLC is percentage-only.
- [ ] No rupee calculation exists.
- [ ] Stable category codes are implemented.
- [ ] Duplicate categories are charged once.
- [ ] Published versions are immutable.
- [ ] One current version exists per Project.
- [ ] Available/Not Active inventory uses the latest version.
- [ ] Hold snapshot is frozen.
- [ ] Booking Request snapshot is frozen.
- [ ] Approved Booking snapshot is permanent.
- [ ] Change Plot uses the approved replacement snapshot rules.
- [ ] Corrections create a supersession chain.
- [ ] Actor, reason and time are audited.
- [ ] APIs are idempotent.
- [ ] Database operations are transactional.
- [ ] Migration preserves historical PLC.
- [ ] All acceptance tests pass.

---

## 21. Final Implementation Rule

Developers must not:

- Hard-code unapproved PLC categories.
- Multiply the same category by the number of sides.
- Recalculate an old Hold or Booking using a new version.
- Edit a published version in place.
- Overwrite or delete a frozen snapshot.
- Calculate PLC rupee value.
- Infer missing commercial policy.

Any unresolved commercial ambiguity must be raised through a numbered written change request before implementation.
