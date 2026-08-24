# CR-005 — Location Charge components become a fixed catalogue, derived from Plot boundaries

Raised under [`PRD.md`](../PRD.md) §28 and the change-control rule in
[`PHASES.md`](../PHASES.md).

| | |
| --- | --- |
| **Change Request ID** | CR-005 |
| **Raised** | 22 August 2026 |
| **Owner** | _Product Owner — name and signature below_ |
| **Status** | Raised and **implemented on the owner's instruction during the build session.** The signature block below is outstanding |
| **Release target** | To be set by the owner |

**This CR touches inventory, a governed area.** It does not change any
percentage, any entitlement, or the arithmetic of effective PLC. It changes
_where the inputs come from_: who names a category, and who decides that a Plot
qualifies for one. The plain-language summary is [D-05](../DEVIATIONS.md).

---

## 1. What the approved baseline says today

`main-PRD.md` is the binding baseline and it never enumerates PLC categories.

| Clause | Wording |
| --- | --- |
| `main-PRD.md` §16.3 | "PLC is percentage only." |
| `main-PRD.md` §16.3 | "Each distinct PLC component is charged once." |
| `main-PRD.md` §16.3 | "Same category on multiple sides is not charged repeatedly." |
| `main-PRD.md` §8.5 | "Use the visible term **Location Charge (PLC %)**." |
| `main-PRD.md` §16.2 | Plot fields include "North/South/East/West boundary", "Road width when Road", "Adjacent Plot Number when Plot boundary", "Park Facing", "Derived facing/open-side display" |
| `main-PRD.md` §23.1 | "Payment, PLC and commission percentages: exact decimal, up to four decimal places · Plot area: up to four decimal places" |

The developer specification goes further:

| Clause | Wording |
| --- | --- |
| `plc.md` §3.2 | "The actual PLC categories and their percentages must come from authorised Project setup. Developers must not invent them." |
| `plc.md` §3.3 | "The category code must remain stable across versions … `ROAD_FACING` / `PARK_FACING` / `CORNER`" |
| `plc.md` §2.3 | "The calculation must deduplicate by a stable category key, not by the display label." |
| `plc.md` §4.1 | Lists the Plot characteristics PLC may use, boundaries and road width among them |
| `plc.md` §4.2 | Distinguishes a **derived** component from a **manual** one |

---

## 2. Exact approved wording

> **2.1** The Location Charge vocabulary is fixed at four categories. A Project
> configures the percentage for each, and where the category is banded, the
> bands. A Project does not name, add or rename a category.
>
> | Category | Band | Applies when |
> | --- | --- | --- |
> | Road width | a width in feet | the Plot touches a road at least that wide |
> | Open sides | a count of sides | the Plot has at least that many sides not abutting another Plot |
> | Park facing | none | any side faces a park |
> | Playground facing | none | any side faces a playground |
>
> **2.2** A banded category charges exactly one band — the highest the Plot
> reaches. Two side open and Three side open can never both apply to one Plot,
> and two road sides charge one road band, decided by the wider road.
>
> **2.3** A side may be a Road, a Plot, Commercial, Informal Sector, Park,
> Playground, Facilities, Public Utility or Other. Each may carry a reference —
> an adjacent Plot Number, a park number — which is never compulsory. Road width
> is compulsory, because it decides the band rather than describing the side.
>
> **2.3a** An **open side** is any side that does not abut another Plot. A Plot
> is a Plot whatever its type, so Commercial and Informal Sector close a side as
> a Residential one does; a road, park, playground, facility or public utility
> leaves it open.
>
> **2.4** Applicability is derived from the Plot's four recorded boundaries. It
> is not selected per Plot and it is not stored against the Plot. A Plot's
> Location Charge is wrong only if a boundary is wrong, and is corrected by
> correcting that boundary through Edit Plot Details.
>
> **2.5** The displayed name of a component is generated from its category and
> band. It is not typed and not stored.
>
> **2.6** Every other Location Charge rule is unchanged: percentage only, no
> rupee value, each distinct category charged once, Available and Not Active
> inventory using the latest published version, Hold and Booking keeping frozen
> snapshots, and corrections preserving old and new values with reason, actor
> and time.

---

## 3. Why this is raised

Three of the clauses above are unaffected, and one is contradicted.

**Unaffected.** `main-PRD.md` §16.3's three rules all still hold. "Each distinct
component is charged once" and "the same category on multiple sides is not
charged repeatedly" now hold structurally — the calculation keeps at most one
component per category — instead of depending on a person not typing the same
code twice into a free-text cell.

**Unaffected.** `plc.md` §2.3 requires deduplication by a stable key rather than
a display label. That is met more strictly than before: the key is an enum, it
cannot be mistyped, and the label is no longer stored anywhere to drift from it.

**Unaffected.** `plc.md` §4.1 and §4.2 prefer derived applicability, and §4.1
already names boundaries and road width as inputs. This implements the preferred
route rather than departing from it.

**Contradicted.** `plc.md` §3.2 — "Developers must not invent them". The four
categories are fixed in code. They were specified by the owner rather than
invented by development, and `main-PRD.md`, which outranks `plc.md`, enumerates
no categories at all. The rule in `main-PRD.md`'s hierarchy §4 is that a
developer must not choose an easier rule where the baseline is silent, and must
raise a numbered change request. That is what this is.

---

## 4. What no longer exists

- `PlcComponent.code` and `PlcComponent.label` — replaced by `category` and
  `threshold`.
- `Plot.plcComponentCodes` — applicability is derived, never stored.
- `Plot.parkFacing` — a `PARK` boundary says the same thing once instead of
  twice. `main-PRD.md` §16.2 lists Park Facing as a Plot field and it is still
  displayed, under the same clause's "Derived facing/open-side display".
- The free-text **PLC codes** column on the Prepare Inventory grid.
- The **Code** and **Label** fields on Project setup.

## 5. What this closes

- `main-PRD.md` §16.2 calls the four boundaries, road width and adjacent Plot
  Number binding. No screen had ever collected them. The grid now does.
- `main-PRD.md` §8.4 lists **Edit Plot Details** as an action on an Available
  Plot. It had never been built. It now exists, under the §8.7 rules.
- `main-PRD.md` §8.1 — a Commercial Project cannot contain a Residential Plot
  Type. Nothing had enforced it. `prepareInventory` now does.
- `main-PRD.md` §23.1 — Plot area was stored to three decimal places, not four.

## 6. What is deliberately not included

No manual per-Plot override of a derived component, and so no override table.
Every category in §2.1 is derivable from the boundaries, and a second place to
record applicability would be a second thing to keep in step. `plc.md` §4.2's
manual route is satisfied through the boundary itself: Edit Plot Details carries
the actor, the time, the compulsory reason and the before and after values.

Should a future commercial rule prove underivable from the four sides, that is a
new change request and the place for it is a manual-applicability record, not a
free-text code.

---

## 7. Owner signature

| | |
| --- | --- |
| **Approved by** | |
| **Signature** | |
| **Date** | |
