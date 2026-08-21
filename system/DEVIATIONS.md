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

### What was added

A derived line reading, for example, `2 years 5 months as a Member`:

- **Members list** — under the Member name
- **Member portal** — an `Experience` row on the Member's own profile
- **Customers list** — under the Customer name

### Why it is a deviation

The approved documents enumerate these screens and do not include it:

- `DESIGN.md` §12.1 lists the Customer list fields: Customer ID, Name, Mobile,
  City, Customer Type, Aadhaar ending, PAN Available/Not Available.
- `DESIGN.md` §12.2 lists the Customer profile sections, and §13.1 the Member
  profile sections. Neither includes an experience or tenure section.
- Neither `PRD.md` nor `main-PRD.md` defines "experience", "tenure" or
  "customer since" anywhere.

### How it behaves

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

### Where it lives

`experienceSince` in `src/lib/domain/commission.ts`, exercised by
`src/lib/domain/domain.check.ts`.

---

## D-02 · Aadhaar and PAN readable in full by MD and Admin

**Formal record:** [CR-002](./change-requests/CR-002-identity-reveal.md)

**Date:** 21 August 2026
**Approved by:** Product Owner (verbally, during the build session)
**Governed area touched:** identity — see the note below

### What was added

An `Aadhaar / PAN` tab in Administration. The list stays masked; a **Reveal**
action shows the full value to MD and Admin only.

### Why it is recorded here

This is **within** PRD RD-05 rather than a departure from it: the clause already
grants the full value to specifically authorised MD/Admin and requires every
access to be logged. It is recorded because the screen itself is new — the
Administration section in `DESIGN.md` §17 does not enumerate it.

Every reveal writes a `SENSITIVE_ACCESS` security event naming the staff account
that read it and the Person it was read for, so "who looked at whose Aadhaar,
and when" is always answerable. A role without the field permission gets a
`PERMISSION_DENIED` event instead.
