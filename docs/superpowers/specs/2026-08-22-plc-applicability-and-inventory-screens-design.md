# PLC applicability, snapshot evidence, and the inventory screens

**Date:** 22 August 2026
**Status:** Design approved in session. Not implemented.
**Governing spec:** [`system/plc.md`](../../../system/plc.md) §4, §7, §13, §15
**Read with:** `PRD.md` §16, `DESIGN.md` §7, `main-PRD.md` §8.5

---

## 1. What this covers

Three gaps left open when the PLC version lifecycle shipped, plus the two
screens they land on.

| | |
| --- | --- |
| **#4** | Snapshot component breakdown carries no applicability source and no side evidence (`plc.md` §7.1) |
| **#5** | Plot applicability is a bare `String[]` with no per-code record (`plc.md` §4.2, §13.3) |
| **#6** | PLC percentages are `Decimal(6,3)` where the spec and the rest of this codebase use `Decimal(7,4)` (`plc.md` §2.1) |
| **Plot Inventory screen** | Row actions are an unstructured pile of buttons; `DESIGN.md` §7.2's Plot detail does not exist; the Prepare Inventory grid takes PLC as free text |
| **Projects screen** | Card layout, and the create form's fields |

The Loyalty entitlement change is **not** here. It is
[CR-004](../../../system/change-requests/CR-004-loyalty-separate-allowances.md)
and waits on the owner's signature.

---

## 2. Decisions taken, and why

These were settled in session. They are recorded because each one shrank the
work, and a later reader will otherwise wonder why the spec is smaller than
`plc.md` §13.3 implies.

| Decision | Consequence |
| --- | --- |
| Applicability stays **manual**. No derivation, no suggestion | `sourceType` has one value today. It is still stored, because a snapshot frozen now must be able to say "this was chosen by hand" if derivation ever arrives |
| Side evidence comes **from the Plot's own boundaries**, automatically | Staff never re-enter what `PlotBoundary` already holds. This records evidence; it takes no decision, so the manual rule stands |
| Applicability is **version-independent** | No `plc_version_id` on the applicability row. Publishing a new version stays one atomic action instead of a copy-forward over every Plot, and §4.3's recalculation keeps working by construction |
| The applicability **table is worth building**, for the per-code reason | Actor, time and before/after already reach `AuditEvent` through `runCommand`. The table earns its place on the one thing that trail cannot hold: why this component applies to this Plot |
| Row actions live **entirely in a `⋯` menu** | No primary button. The row stays quiet; the menu orders items with the most likely first |
| Plot detail is an **inline panel**, not a route | Matches Bookings (`loadBookingDetail`, `bookings-client.tsx:246`). This application has no dynamic routes |
| Project Code leaves the **UI only** | The column, its uniqueness, reports, exports and the whole check-script tagging convention are untouched |
| "Setup / Not Active" changes **label only** | No enum, no migration, no CR. The screens and the PRD diverge in wording, so it is recorded as a deviation |
| `MIXED` leaves the **form only** | The enum value survives for `acquisition-service.ts:111` and existing rows |

---

## 3. Data model

### 3.1 `PlotPlcApplicability` — new

Replaces `Plot.plcComponentCodes String[]`.

```prisma
model PlotPlcApplicability {
  id           String                 @id @default(uuid())
  plotId       String
  plot         Plot                   @relation(fields: [plotId], references: [id], onDelete: Cascade)
  categoryCode String
  isApplicable Boolean                @default(true)
  sourceType   PlcApplicabilitySource @default(MANUAL)
  /// Why this component applies to this Plot. Optional in bulk entry,
  /// editable afterwards on the Plot's PLC panel.
  reason       String?
  actorRef     String
  createdAt    DateTime               @default(now())
  updatedAt    DateTime               @updatedAt

  @@unique([plotId, categoryCode])
  @@index([plotId, isApplicable])
}

enum PlcApplicabilitySource {
  MANUAL
}
```

Current state, updated in place. Change history goes to `AuditEvent`, written
in the same transaction by `runCommand` — the trail already carries actor,
time, reason and before/after, which is exactly what `plc.md` §4.2 asks for. A
second bespoke history table would duplicate it.

A row with `isApplicable = false` is a recorded removal, not a deletion.

### 3.2 Snapshot breakdown — richer

`PlcSnapshot.components` is JSON. Each entry gains three fields:

```ts
{
  code, label, percent,              // as today
  applicabilitySource: "MANUAL",
  sideEvidence: "North, East — Road" | null,
  includedInTotal: true,
  exclusionReason: null,
}
```

`sideEvidence` is composed at freeze time from `PlotBoundary` and
`Plot.parkFacing` — the sides that would justify this category, recorded as
evidence rather than used as a decision.

**`includedInTotal` and `exclusionReason` will always be `true` and `null`.**
`plc.md` §7.1 asks for them so a duplicate side can be shown as ignored, but
checkbox entry makes a duplicate structurally impossible: a checkbox cannot be
ticked twice. They are stored so the shape matches the spec and so a future
per-side entry model has somewhere to write. This is stated here so a reader
comparing the data to §7.1 finds an answer rather than an empty column.

### 3.3 Precision

`Decimal(6,3)` → `Decimal(7,4)` on:

- `PlcComponent.percent`
- `PlcSnapshot.totalPercent`
- `ChangePlotRequest.plcPercent`

Every other percentage in this schema is already `Decimal(7,4)` — payment,
ownership shares, commission, milestone, applied percent. These three are the
outliers, so `plc.md` §2.1 and the codebase point the same way.

**Stored at four places, displayed at two.** `2.0000%` is noise on a screen.
Display trims trailing zeros to a minimum of two decimals, and shows more only
when the value carries more.

### 3.4 Project — two new columns

```prisma
city      String?
amenities String?   // one per line; rendered as bullets
```

Both informational. Neither affects inventory, commission or payment.

### 3.5 Migration

One migration carries all of it:

1. Create `PlotPlcApplicability` and the `PlcApplicabilitySource` enum.
2. Backfill one row per `(plotId, code)` from `Plot.plcComponentCodes`, with
   `sourceType = MANUAL` and `actorRef = 'MIGRATION'`.
3. Drop `Plot.plcComponentCodes`.
4. Widen the three decimal columns. Widening precision is lossless.
5. Add `Project.city` and `Project.amenities`.

Existing `PlcSnapshot.components` JSON is **not** rewritten. A snapshot frozen
before this migration keeps the breakdown it froze; the new fields appear on
snapshots frozen afterwards. Backfilling side evidence into historical
snapshots would be inventing a fact that was never recorded, which §17 forbids
in the same breath as "do not fabricate a breakdown".

---

## 4. Effective PLC

Unchanged in substance. `buildPlcSnapshot()` in `src/lib/domain/inventory.ts`
stays the single place effective PLC is computed; its first argument becomes the
applicable codes read from `PlotPlcApplicability` instead of the dropped array.

Everything that reads it — `hold-service`, `booking-service`,
`change-plot-service`, `inventory-service`, the plots list — changes only where
it sources the codes.

Effective PLC for Available / Not Active inventory is still derived on read and
never stored, so publishing a version updates the inventory list by
construction (`plc.md` §4.3).

---

## 5. Plot Inventory screen

### 5.1 Row actions

One `⋯` menu per row, in the column `DESIGN.md` §7.1 names **Next action**. No
primary button. Items are state-appropriate, most likely first.

| Plot state | Menu |
| --- | --- |
| Not Available | Make Available · Restriction… · Edit Plot Details |
| Available | Hold · Start Booking → · Restriction… · Edit Plot Details |
| Hold | **Book** · Extend Hold · Cancel Hold · Edit Plot Details |
| Waiting for Booking Approval | View request → |
| Booked | Open Booking → |
| Payment Completed | Open Booking → |
| Delivered | View completion → |

`→` items are links into `/bookings`, not actions. This is how the dead
`Start Booking` button — permanently disabled with the tooltip "Booking Requests
arrive in Phase 3", years after Phase 3 shipped — becomes true. `Book` on a held
Plot is new: `DESIGN.md` §7.3 lists it and it has never existed.

**Deliberately not on this screen:**

- **Approve / Reject extension.** A maker-checker decision under `PRD.md` §8.5.
  Deciding it inline, from a row that shows neither who asked nor why, is the
  thing maker-checker exists to prevent. It belongs to the Dashboard task queue.
- **Cancel Booking, Change Plot, Prepare Allotment/Registry, Follow-up.**
  `DESIGN.md` §7.3 lists them among Plot state actions, but each operates on a
  Booking. They live in `/bookings`, where the parties, schedule, payments,
  commission and review versions are visible. The menu offers `Open Booking →`
  instead of acting blind.
- **Any combined "Make Available and Hold".** `DESIGN.md` §7.4 forbids it in
  those words.

### 5.2 Plot detail

An inline panel, opened from the row, loaded by a `loadPlotDetail(plotId)`
server action. Same shape as the Booking detail.

`DESIGN.md` §7.2's eight sections: Overview · Dimensions and boundaries · PLC ·
Current allocation · Customer/Booking link · Payment progress · Commission
summary · Restriction and lifecycle history.

The **PLC section** is where applicability is edited one Plot at a time:
each component as a checkbox with its percentage, the per-code reason field, the
live effective total, the version it resolves against, and the deduplicated
breakdown.

### 5.3 Prepare Inventory grid

Bulk entry stays in the grid — `PRD.md` §16.4 asks for the Excel-style
preparation, and 500 Plots cannot be set up one panel at a time.

| Today | Becomes |
| --- | --- |
| PLC as free text, `ROAD_FACING,CORNER` | A checkbox per component with a live row total |
| `− Row` removes the last row, whichever you were editing | A delete control on each row; `− Row` goes |
| `− Row` silently does nothing at one row | The button no longer exists |
| A row with data but no Plot No. is dropped on submit, unannounced | The row is marked, the message is explicit, submit waits |
| Server error appears as a banner with no row named | The offending row is highlighted |
| `Back` discards a filled grid without asking | Confirms when the grid has content |

**Adding rows in bulk.** A Project of 100 Plots means pressing `+ Row`
ninety-nine times today, because it adds exactly one. It is replaced by a count
and one button — `[ 10 ] Add rows` — defaulting to ten and capped at a hundred
per press, so a hundred blank rows arrive at once and each Plot is then filled
in separately.

Nothing else about entry changes. There is no row selection and no bulk action
bar: the difficulty was reaching a hundred rows, not doing one thing to many of
them. Rows are still submitted together, and the grid still fails whole rather
than saving half — the deliberate rule in `inventory-service.ts`.

**Park facing is labelled, not linked.** `Plot.parkFacing` is a fact about the
Plot (`PRD.md` §16.2 lists it); `PARK_FACING` is a charge that may or may not
apply. They look identical in the grid today and that is a real source of
confusion. The columns are relabelled — *Park facing (Plot characteristic)* and
*Location charge components* — so the difference reads at a glance. No logic
connects them: ticking Park does not tick `PARK_FACING`, because applicability
is manual.

---

## 6. Projects screen

### 6.1 Card

```
┌───────────────────────────────────────────────────┐
│  Green Valley Phase 2                  Unreleased │
│  Residential · Jaipur                             │
│  Vaishali Nagar — Shree Developers Pvt Ltd        │
│                                                   │
│  RERA RAJ/P/2024/0142    120 Plots    PLC v3      │
│                                                   │
│  Road facing 2.00%   Park facing 1.50%            │
│  Corner 1.00%                                     │
│                                                   │
│  Amenities                                        │
│  • Clubhouse   • 24×7 water   • Landscaped park   │
│                                                   │
│                            [PLC versions]    [⋯]  │
└───────────────────────────────────────────────────┘
```

The name is read first. Place sits together — `type · city`, then
`location — company` — instead of scattering across three rows. RERA, plot count
and PLC version share one strip because all three answer "one number about this
Project". No Project Code anywhere.

An **External Resale Property Group** (`PRD.md` §11.6) is a container, not a
development Project, so its card shows the name, the type and that label alone —
no plots, no PLC, no amenities.

### 6.2 Create form

**Removed:** Project Code, RERA expiry date, and `Mixed` from the type list.

Project Code is generated from the name — `Green Valley` → `GRN-01`, next free
number on collision. The column keeps its unique constraint and stays the key in
reports and exports, because `Project.name` carries no uniqueness and two
Projects may share one.

Removing the Project RERA expiry breaks nothing: `RERA_EXPIRY_REMINDER` reads
`memberProfile.reraExpiryDate` only (`jobs.ts:211`), and `PRD.md` §26 already
excludes any Project RERA operational block.

**Added:** City, and Amenities as a text area — one amenity per line, rendered
as bullets on the card. The plainest form bullet data can take; no repeater UI.

**Unchanged:** name, type, developer, location, RERA number, External Resale
Property Group, and the PLC components.

### 6.3 Edit Project — new

There is no way to change a Project today. `project-service.ts` offers
`createProject` and `setProjectLifecycle` and nothing else, so a name typed
wrongly at setup stays wrong for the life of the Project. This is a gap, not a
convenience.

Opened from the card's `⋯` menu.

**Editable:** name, type, developer, location, city, amenities, RERA number.

Project **type** is editable because a Plot carries its own Plot Type — Project
uniqueness is `(projectId, plotType, plotNumber)` — so the Project's type is a
label over the inventory rather than a rule inside it.

**Not editable, and each for its own reason:**

- **Project Code.** It is generated, hidden from the UI, and the key that ties
  a report or an export back to a Project. Once an export has left the building,
  changing the code breaks the way back to what it described.
- **External Resale Property Group.** `PRD.md` §11.6 makes this the difference
  between a development Project and an acquisition container. Flipping it after
  Plots or acquisitions exist changes what those existing records mean.

**Lifecycle keeps its own action.** It already has one, it carries its own
compulsory reason, and moving a Project to Active is a release decision rather
than an edit.

A **compulsory reason** on every edit, matching `setProjectLifecycle` and
`revisePlcRules`, which both demand one. The command runs through `runCommand`
like every other, so `AuditEvent` records the actor, the time, the reason and
the before/after — which is how "who renamed this Project, and why" stays
answerable.

Permission is `PROJECT_SETUP`, the same one that creates a Project. No new
permission.

---

## 7. Terminology

Two visible-term changes, both display only, both recorded in `DEVIATIONS.md`:

| Term | Today | Becomes | Approved wording says |
| --- | --- | --- | --- |
| PLC | "Location Charge (PLC %)" | **"Plot Location Charge (PLC %)"** | `main-PRD.md` §8.5 — "Use the visible term Location Charge (PLC %)" |
| Project lifecycle | "Setup / Not Active" | **"Unreleased"** | `PRD.md` §16.1, `main-PRD.md` §16.1 |

Both contradict an explicit instruction in an approved document, so neither may
be treated as silent. The enum value `SETUP_NOT_ACTIVE` does not change.

A note for whoever writes the deviation: the Plot restriction
`NOT_YET_RELEASED` already displays as "Not Yet Released". A Project reading
"Unreleased" beside a Plot reading "Not Yet Released" invites the assumption
that they are the same state. They are not — one is a Project lifecycle, the
other a Plot restriction.

---

## 8. Permissions

No permission is added or removed.

Editing applicability is Project/Plot setup work and stays under `PLOT_SETUP`,
which MD, Admin and PC already hold. Correcting a **frozen** snapshot remains
`PLC_SNAPSHOT_CORRECT`, MD and Admin only, unchanged from `plc.md` §12.1.

---

## 9. Evidence

Extends `prisma/plc.check.ts` rather than adding a file:

- Applicability rows survive a component being removed — the row is marked
  inapplicable, never deleted
- Effective PLC is unchanged by the storage move: same codes, same total
- A snapshot frozen after the change carries `sideEvidence` matching the Plot's
  boundaries, and `applicabilitySource = MANUAL`
- A snapshot frozen before the change still reads correctly with the fields
  absent
- Four-decimal percentages round-trip through database, service and display
  without loss
- Publishing a new version still updates Available inventory and still leaves
  every frozen snapshot alone

`security.check.ts` and the permission matrix are untouched — nothing here
changes who may do what.

---

## 10. Out of scope

- **§15.4** Change Plot side-by-side PLC comparison
- **§16** PLC reporting and exports
- A UI trigger for `correctPlcSnapshot()` — the service exists; the button does
  not, and the correction panel belongs with the reporting work
- Any derivation of applicability from Plot characteristics. Turning that on
  changes a commercial rule and would need its own change request
- CR-004, the Loyalty split

---

## 11. Open items

None. Every question this design raised has been answered.

Three ideas were considered for bulk entry and deliberately left out, so that a
later reader does not mistake their absence for an oversight:

- **Row selection with bulk actions** — apply PLC or a Plot Type to many rows
  at once. Not built: the difficulty was reaching a hundred rows, not doing one
  thing to many of them.
- **Plot number ranges** — `A-101` to `A-200` filling a hundred numbered rows.
  Worth revisiting if numbering turns out to be the slow part in use.
- **Saving in batches**, and recovering the valid rows when one cell is wrong.
  Both would overturn the deliberate "fail the whole grid rather than save half
  of it" rule, which is a decision to take on its own evidence, not in passing.
