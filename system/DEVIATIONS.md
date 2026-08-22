# Approved Deviations from the v3.1 Baseline

**Purpose:** anything the running system shows or does that the approved
documents do not describe. Kept so that a reviewer comparing the screens to
[`DESIGN.md`](./DESIGN.md) and [`main-PRD.md`](./main-PRD.md) finds an answer
rather than a surprise.

Both items below are now also raised formally in
[`change-requests/`](./change-requests/) — CR-001 and CR-002 — in the form
[`PRD.md`](./PRD.md) §28 requires. This file is the plain-language summary; the
CRs carry the formal fields and the owner signature block.

This is **not** a substitute for the change-control process in
[`PRD.md`](./PRD.md) §28. That process governs changes affecting commission,
payment, inventory, identity, permissions or completion, and each one needs a
Change Request ID, owner and exact approved wording.

Of the two below, **D-01 touches none of those areas** — it is display only.
**D-02 touches identity**, so its change request is required rather than
optional, and neither may be treated as approved until its owner signature is in
place.

---

## D-01 · Relationship length shown for Members and Customers

**Formal record:** [CR-001](./change-requests/CR-001-relationship-length.md)

**Date:** 21 August 2026
**Approved by:** Product Owner (verbally, during the build session)
**Governed area touched:** none — display only

### What was added (D-01)

A derived line reading, for example, `2 years 5 months as a Member`:

- **Members list** — under the Member name
- **Member portal** — an `Experience` row on the Member's own profile
- **Customers list** — under the Customer name

### Why it is a deviation (D-01)

The approved documents enumerate these screens and do not include it:

- `DESIGN.md` §12.1 lists the Customer list fields: Customer ID, Name, Mobile,
  City, Customer Type, Aadhaar ending, PAN Available/Not Available.
- `DESIGN.md` §12.2 lists the Customer profile sections, and §13.1 the Member
  profile sections. Neither includes an experience or tenure section.
- Neither `PRD.md` nor `main-PRD.md` defines "experience", "tenure" or
  "customer since" anywhere.

### How it behaves (D-01)

- **Never stored.** Computed from a date on every read, so it stays correct on
  its own. A stored "3 years" would be wrong the day the fourth anniversary
  passed, with nothing to correct it.
- **Member** counts from the Member Activation Date — the same anchor RD-02 uses
  for the annual counters, and it shares `anniversaryDay` with them, so a Member
  activated on 29 February gains a year on 28 February in a non-leap year,
  exactly when their counter rolls.
- **Customer** counts from their first **approved** Booking, meaning a Booking
  Number was issued. A Booking later cancelled still counts: the relationship
  did begin then. An Additional Customer counts as a buyer, not only the Primary
  Customer.
- Shows nothing at all where there is no anchor — an unactivated Member, or a
  Customer who has enquired but never had a Booking approved. It never shows
  "0 years".

### Where it lives (D-01)

`experienceSince` in `src/lib/domain/commission.ts`, exercised by
`src/lib/domain/domain.check.ts`.

---

## D-02 · Aadhaar and PAN readable in full by MD and Admin

**Formal record:** [CR-002](./change-requests/CR-002-identity-reveal.md)

**Date:** 21 August 2026
**Approved by:** Product Owner (verbally, during the build session)
**Governed area touched:** identity — see the note below

### What was added (D-02)

An `Aadhaar / PAN` tab in Administration. The list stays masked; a **Reveal**
action shows the full value to MD and Admin only.

### Why it is recorded here (D-02)

This is **within** PRD RD-05 rather than a departure from it: the clause already
grants the full value to specifically authorised MD/Admin and requires every
access to be logged. It is recorded because the screen itself is new — the
Administration section in `DESIGN.md` §17 does not enumerate it.

Every reveal writes a `SENSITIVE_ACCESS` security event naming the staff account
that read it and the Person it was read for, so "who looked at whose Aadhaar,
and when" is always answerable. A role without the field permission gets a
`PERMISSION_DENIED` event instead.

---

## D-03 · Three visible terms differ from the approved wording

**Date:** 22 August 2026
**Approved by:** Product Owner (during the build session)
**Governed area touched:** none — display only

### What changed (D-03)

| Screens now read | Approved documents say |
| --- | --- |
| **Plot Location Charge (PLC %)** | `main-PRD.md` §8.5 — "Use the visible term **Location Charge (PLC %)**"; `DESIGN.md` §7.1 lists the column as `Location Charge (PLC %)` |
| **Unreleased** | `PRD.md` §16.1 and `main-PRD.md` §16.1 list the Project status as **Setup / Not Active** |
| **Area sq ft**, on the irregular-Plot field | `main-PRD.md` §16.2 calls it **Exact Area Override** |

### Why it is recorded (D-03)

`main-PRD.md` §8.5 does not merely use a term, it instructs which term to show.
Departing from it is small, but it is a departure from an explicit instruction,
and a reviewer comparing the screens to the documents should find an answer here
rather than a surprise.

### How it behaves (D-03)

All three are labels. `ProjectLifecycle.SETUP_NOT_ACTIVE` is unchanged in the
database, in the API and in every rule; only the string rendered beside it
differs. No migration, no permission change, no status transition affected.

The one place the new wording leaves the screen layer is the refusal a user
reads when a Plot cannot be held: "The Project is still Unreleased and cannot
accept a Hold or Booking." A blocked reason is shown verbatim (`DESIGN.md` §5.4),
so it has to speak the same language as the badge above it.

**One thing to watch.** The Plot restriction `NOT_YET_RELEASED` displays as
"Not Yet Released". A Project reading "Unreleased" beside a Plot reading "Not
Yet Released" invites the assumption that they are the same state. They are not:
one is a Project lifecycle, the other a Plot restriction, and a Plot may be Not
Yet Released inside an Active Project.

### Where it lives (D-03)

`LIFECYCLE_LABEL` in `src/app/projects/projects-client.tsx`; the refusal in
`src/lib/domain/inventory.ts`; the PLC headings in
`src/app/plots/plots-client.tsx` and `src/app/bookings/bookings-client.tsx`.

The third is the Prepare Inventory and Edit Plot Details field in
`src/app/plots/plots-client.tsx`. The word "Exact" was doing no work for the
person filling the form — they are typing an area, and the field only appears
once they have said the Plot is irregular. `Plot.exactAreaSqFt` and
`exactAreaReason` keep their names in the database and in every rule; the
compulsory reason is unchanged.

---

## D-04 · Project Code is generated, and no longer typed

**Date:** 22 August 2026
**Approved by:** Product Owner (during the build session)
**Governed area touched:** inventory — see the note below

### What changed (D-04)

The New Project form no longer asks for a Project Code. It is derived from the
name — `Green Valley` becomes `GRN-01`, and a repeated stem takes the next
number. The Project card no longer shows it.

The Project RERA expiry date is gone from the form and from the database. The
`Mixed` option is gone from the type list.

### Why it is recorded rather than raised as a change request (D-04)

No approved document enumerates the Project's fields — `PRD.md` §16.1 defines
the Project lifecycle and `main-PRD.md` §16.1 repeats it, but neither names a
Project Code, a RERA expiry or a Mixed type. These are implementation choices,
so changing them alters no approved requirement.

Removing the Project RERA expiry breaks nothing that reads it:
`RERA_EXPIRY_REMINDER` works from `MemberProfile.reraExpiryDate`, and `PRD.md`
§26 already excludes any Project RERA operational block from scope.

`ProjectType.MIXED` leaves the form only. The enum value survives, because
`acquisition-service.ts` accepts it and any existing Project carrying it must
keep displaying correctly.

### What did not change (D-04)

**The `projectCode` column stays, and stays unique.** `Project.name` carries no
uniqueness, so two Projects may share a name; the code remains the key that ties
a report or an export back to the Project it described. It is hidden from the
person entering data, not removed from the system.

### Where it lives (D-04)

`generateProjectCode` in `src/lib/services/project-service.ts`; the form in
`src/app/projects/projects-client.tsx`; migration
`prisma/migrations/20260823090000_project_card_fields`.

---

## D-05 · Location Charge components are a fixed catalogue, derived from boundaries

**Formal record:** [CR-005](./change-requests/CR-005-plc-catalogue-and-derivation.md)

**Date:** 22 August 2026
**Approved by:** Product Owner (during the build session)
**Governed area touched:** inventory — the change request is therefore required,
not optional

### What changed (D-05)

Two things, and they are one idea seen from either end.

**Nobody types a code any more.** Project setup used to ask for a category code
(`ROAD_FACING`), a display label and a percentage. It now offers four
categories, and asks only for a percentage — plus a band where the category
takes one:

| Category | Band | Reads as |
| --- | --- | --- |
| Road width | feet | `Road 60 ft & above`, `Road 40 – 59 ft` |
| Open sides | a count | `Two side open`, `Three side open`, `Four side open` |
| Park facing | none | `Park facing` |
| Playground facing | none | `Playground facing` |

The label is generated from the category and the band, so two Projects cannot
describe the same band in two different ways.

**Nobody selects applicability per Plot either.** The Prepare Inventory grid's
free-text `PLC codes` column is gone. In its place the grid asks what each of
the four sides faces — the fields `main-PRD.md` §16.2 lists as binding and that
no screen had ever collected. Effective PLC is read from those sides:

- the widest Road the Plot touches picks one road band, once, however many sides
  are roads;
- the count of sides that do not abut another Plot picks one open-sides band,
  so `Three side open` and `Two side open` can never both apply. A Plot closes a
  side whatever its type, so Commercial and Informal Sector count as closed;
- a park side charges Park facing once, and a playground side Playground facing.

Area and Location Charge now fill in as the row is typed, from the same two
domain rules the server runs on save.

### Why it is a deviation (D-05)

`plc.md` §3.2 says "The actual PLC categories and their percentages must come
from authorised Project setup. Developers must not invent them", and §3.3 shows
`ROAD_FACING` / `PARK_FACING` / `CORNER` as the example codes. Fixing four
categories in code reads against the letter of that.

It is recorded rather than resisted because the categories here were specified
by the owner, not invented by development, and because `main-PRD.md` — the
binding baseline — never enumerates PLC categories at all. §16.3 states only
that PLC is a percentage, that each distinct component is charged once, and that
the same category on multiple sides is not charged repeatedly. All three still
hold, and the second and third now hold *by construction* rather than by asking
a person not to type the same code twice.

`plc.md` §2.3 requires deduplication by a stable category key rather than by
display label. That requirement is met exactly: the key is the category enum, it
survives a label change, and the label is no longer stored at all.

### What this removed (D-05)

`Plot.plcComponentCodes` and `Plot.parkFacing` are both dropped.

The codes column stored a decision that had to be kept in step with the
boundaries by hand; nothing now stores applicability, so the two cannot drift.
`main-PRD.md` §16.2 lists **Park Facing** as a Plot field, and it is still shown
— derived from a `PARK` boundary rather than from a separate flag that could
contradict the sides recorded beside it. The migration moves an existing
`parkFacing = true` onto a free side rather than discarding it.

`BoundaryKind` gains `PLAYGROUND`, `COMMERCIAL`, `INFORMAL_SECTOR`,
`FACILITIES` and `PUBLIC_UTILITY`. `PlotBoundary.adjacentPlotNumber` widens into
`reference`, which any kind may carry and none is required to: the old column
required a Plot Number whenever the side was a Plot, and knowing a Plot sits on
the east side is worth recording even when nobody knows which Plot. Road width
stays compulsory — it decides a band rather than describing a side.

### What this added (D-05)

**Edit Plot Details** (`main-PRD.md` §8.4) existed in the approved documents but
had never been built, so a wrong road width was wrong for the life of the Plot.
It is now a command under the §8.7 correction rules: a compulsory reason, old
and new values in History, and revalidation of PLC. The revalidation needs no
code of its own — effective PLC derives from the boundaries on every read, so an
Available Plot is correct the moment the correction saves. A frozen Hold or
Booking snapshot is deliberately not moved (`plc.md` §7.2); the screen reports
that it no longer matches, and correcting it stays the separate audited decision
it already was.

`prepareInventory` also now enforces `main-PRD.md` §8.1 — a Commercial Project
cannot contain a Residential Plot — which nothing had checked.

### Precision (D-05)

`main-PRD.md` §23.1 sets four decimal places for percentages **and for Plot
area**. Percentages were at three and area at three. Both are now at four, with
display still normalising to two unless the value carries more.

### Where it lives (D-05)

`buildPlcSnapshot`, `validatePlcComponents`, `plcComponentLabel` and
`PLC_CATEGORIES` in `src/lib/domain/inventory.ts`; `freezePlcSnapshot` in
`src/lib/services/plc-service.ts`; `updatePlotDetails` in
`src/lib/services/inventory-service.ts`; the grid and the Edit Plot Details
dialog in `src/app/plots/plots-client.tsx`; the category picker in
`src/app/projects/projects-client.tsx`; migration
`prisma/migrations/20260824090000_plc_categories`.
