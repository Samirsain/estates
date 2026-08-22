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

## D-03 · Two visible terms differ from the approved wording

**Date:** 22 August 2026
**Approved by:** Product Owner (during the build session)
**Governed area touched:** none — display only

### What changed (D-03)

| Screens now read | Approved documents say |
| --- | --- |
| **Plot Location Charge (PLC %)** | `main-PRD.md` §8.5 — "Use the visible term **Location Charge (PLC %)**"; `DESIGN.md` §7.1 lists the column as `Location Charge (PLC %)` |
| **Unreleased** | `PRD.md` §16.1 and `main-PRD.md` §16.1 list the Project status as **Setup / Not Active** |

### Why it is recorded (D-03)

`main-PRD.md` §8.5 does not merely use a term, it instructs which term to show.
Departing from it is small, but it is a departure from an explicit instruction,
and a reviewer comparing the screens to the documents should find an answer here
rather than a surprise.

### How it behaves (D-03)

Both are labels. `ProjectLifecycle.SETUP_NOT_ACTIVE` is unchanged in the
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
