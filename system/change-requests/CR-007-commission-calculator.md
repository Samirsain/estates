# CR-007 — A Commission Calculator inside the CRM

Raised under [`prd-corrections.md`](../prd-corrections.md) §28 and the change-control rule in
[`delivery-phases.md`](../delivery-phases.md).

| | |
| --- | --- |
| **Change Request ID** | CR-007 |
| **Raised** | 29 August 2026 |
| **Amended** | 10 September 2026 — §2.2 and §6, so the wording describes what was approved |
| **Owner** | _Product Owner — name and signature below_ |
| **Status** | **Approved in principle** by the Product Owner on 10 September 2026, in the build session. **Implemented** — see §8. The signature block in §7 is the formal record and is still to be signed |
| **Release target** | Shipped on the build branch; release set by the owner |

**This CR touches commission, a governed area, and reopens an express owner
exclusion.** It changes no rate, no band, no milestone and no entitlement. It
adds a screen that runs the existing engine against figures a person types in,
and shows what the engine would produce, without writing anything.

Because it reopens an exclusion the owner made by name, it follows CR-004's
precedent rather than CR-005's: section 7 is the record that closes it.

**The order of events is recorded rather than tidied.** The screen was built on
3 September 2026 (commit `93941ef`) before this CR was decided, and extended on
10 September 2026. The owner's approval followed on 10 September 2026, in the
build session, and is written into §8. A reviewer comparing dates will see the
code first and the approval second; that is what happened.

---

## 1. What the approved baseline says today

The calculator is not an oversight. It was named and removed, four times over.

| Clause | Wording |
| --- | --- |
| `prd-complete.md` §30 | "Standalone calculator" — listed under "deliberately excluded or ignored by the owner… A vendor must not add them without a later approved change request" |
| `prd-complete.md` §2 | "Standalone CRM calculator" — out of scope |
| `prd-complete.md` §27 | "Calculator -> remove" — struck from the module list |
| `prd-corrections.md` §26 | The same exclusions "must not be added without a future approved change request" |
| `architecture.md` §1 | "A standalone quotation calculator" — what this system is not |
| `design.md` §1 | "Do not reintroduce removed top-level modules, Customer portal, service requests, document uploads, standalone calculator or rupee values." |

Two further clauses bind the *shape* of anything approved here.

| Clause | Wording |
| --- | --- |
| `architecture.md` §1 | "All rupee values and statutory accounting remain outside the CRM. The CRM stores percentages, statuses, dates, references, beneficiaries, relationships and audit facts." |
| `prd-complete.md` RD-01 | "No rupee conversion or value calculation is performed in CRM." |

And one clause already asks for something close to it, in a single place.

| Clause | Wording |
| --- | --- |
| `design.md` §14.4 | Sold By correction: "Show before/after attribution and **calculated commission components**." |

---

## 2. Exact approved wording

> **2.1** A **Commission Calculator** screen exists for staff. It answers one
> question: *given these facts about a sale, which commission lines would the
> engine produce, to whom, at what rate, and payable at which milestone.*
>
> **2.2** *(Amended 10 September 2026. The clause as first raised read: "The
> Calculator is **percentage only**. It never accepts a rupee amount, never
> displays one, and never converts one." The owner approved the arithmetic below
> in its place; the original is kept here so the change is visible.)*
>
> The Calculator takes a **rate** and an **Authorised Discount**, and works out
> the **Commissionable Sale Value** exactly as CR-017 defines it:
>
> > (Base Property Value + Applicable PLC Value) − Authorised Discount
>
> Every commission percentage is then a share of that value. The rupee exists
> **only in the browser**: no rupee is stored, none is sent to the server, and
> no rupee column is added to the schema. `architecture.md` §1's "All rupee
> values and statutory accounting remain outside the CRM" and `prd-complete.md`
> RD-01's "No rupee conversion or value calculation is performed in CRM" stand
> for everything the CRM **keeps**; CR-017's own heading —
> "Commissionable Sale Value **outside CRM**" — is the worksheet this screen
> runs, in the browser, so a quote can be given while the buyer is in the room.
>
> `plc-location-charge.md` §2.1 is unchanged where it binds: PLC is stored as a
> percentage, and no PLC amount, plot value, rate or total price is written
> anywhere.
>
> **2.3** The Calculator **writes nothing**. It creates no Commission Record,
> consumes no slot, moves no counter position, and raises no Commission Conflict.
> Nothing it displays is stored, and nothing it displays is evidence.
>
> **2.4** The Calculator uses **the same engine** as a real sale. It does not
> restate the rates, the band table, the milestones or the 4% ceiling in a second
> place. A rule changed for sales is changed for the Calculator in the same edit,
> because there is only one implementation.
>
> **2.5** Its inputs are the facts that already decide a commission: the Project
> and Plot, who closed the sale, the buyer, and a payment-received percentage to
> test against. Where a real Member or Customer is chosen, their **live** counter
> positions and used slots are read; the Calculator does not invite a person to
> invent a position.
>
> **2.6** Its output is the same breakdown a Booking shows: one line per
> component, each with its type, beneficiary, rate, milestone, and whether that
> milestone is met at the percentage entered. Where the engine would produce
> nothing, it says which rule stopped it — a used slot, position 10 or beyond, no
> introducer, or the 4% ceiling.
>
> **2.7** Every figure on the screen is marked as an estimate that binds nobody.
> A commission is earned by verified payment on a real sale, never by this screen.
>
> **2.8** Permission follows the commission screens: the roles that may read a
> Booking's commission breakdown may open the Calculator. It grants no role a
> figure they could not already read on a real Booking.

---

## 3. Why this is raised

**The exclusion is express, so silence is not available.** `prd-complete.md` §4 —
"a developer must not choose an older or easier rule when Version 3.0 is silent"
— does not apply here, because the baseline is not silent. It names the
calculator and removes it. Only an approved change request reopens that.

**What the owner excluded and what is asked for may not be the same thing.** The
excluded item is described as a *standalone quotation calculator* — a pricing
tool, of the kind that quotes a buyer a rupee figure. What this CR asks for is a
read-only preview of the commission engine, in percentages, with no quotation and
no money in it. The owner is asked to decide whether that distinction holds. If
it does not, this CR is withdrawn and the exclusion stands.

**One clause already asks for the output.** `design.md` §14.4 requires the
calculated commission components to be shown before and after a Sold By
correction. That is this screen, scoped to one correction. The rules are already
implemented, tested (`commission-rules-and-test-plan.md`) and rendered; what is missing is a
place to ask the question without a live Booking to ask it against.

**The risk it removes.** Today a CRM or Accounts user answering "what will this
Member earn" reads the band table and the entitlement rules by hand. That
arithmetic is the one thing the system exists to do correctly, and doing it on
paper is where a wrong number reaches a Member.

---

## 4. What no longer exists

Nothing. No screen is removed, no field is dropped, no stored value changes.

The line "Calculator" in `prd-complete.md` §27's removed-module list and in §30's
exclusion list would need the owner's amendment on approval, and `design.md` §1's
sentence would keep "rupee values" while losing "standalone calculator".

## 5. What this closes

- `design.md` §14.4 — "Show before/after attribution and calculated commission
  components" is satisfied by a component that exists, rather than by one written
  a second time for that screen alone.
- The band table, the two counters, the entitlement slots and the 4% ceiling
  become answerable on screen instead of by hand from
  `commission-rules-and-test-plan.md` §2, §3 and §7.

## 6. What is deliberately not included

- **No rupee anywhere it lasts.** *(Amended 10 September 2026. As first raised
  this read "No rupee, in or out. Not as an input, not as an output, not as a
  hint.")* The rate, the discount and every figure derived from them live in the
  browser for as long as the tab is open. Nothing is stored, nothing is posted to
  a server action, and no rupee column exists in the schema. What the owner
  excluded was a quotation tool the company would run its pricing on; what this
  is, is the Accounts worksheet of CR-017, done on screen instead of on paper.
- **No saving, sharing, printing or exporting a result.** A saved estimate is an
  estimate someone will later treat as a commitment.
- **No invented positions or slots.** The Calculator reads the counters; it does
  not let a user type "assume position 3".
- **No Member-portal access.** Members see their own earned commissions in the
  portal. A screen that projects future earnings from figures a person types is
  not something to put in front of the person who would be paid.
- **No second copy of the rules.** If the Calculator ever needs a rule the engine
  does not have, that is a change to the engine and a new change request, not a
  branch inside a preview screen.

---

## 7. Owner signature

| | |
| --- | --- |
| **Approved by** | Product Owner — approved verbally in the build session |
| **Signature** | _to be signed by the owner; this line is not filled in on anyone's behalf_ |
| **Date** | 10 September 2026 (verbal) |

---

## 8. What was built, and when

| Date | What |
| --- | --- |
| 3 September 2026 | Commit `93941ef` — Plot Rate & Area Calculator: rate, area, the engine's commission breakdown. Client-side, writes nothing |
| 10 September 2026 | Authorised Discount (percentage or figure); the CR-017 Commissionable Sale Value, with PLC added and the discount taken off the two together; every commission a share of that value; the figure written out in words; the four commissions always listed, N/A where none is earned |

**Where it lives.** `src/app/calculator/page.tsx`,
`src/app/calculator/calculator-client.tsx`, and the pure arithmetic in
`src/lib/domain/rate-calculator.ts` — `calculateRate()`, `buildQuote()` and
`rupeesInWords()`.

**How it is checked.** `src/lib/domain/domain.check.ts` asserts the pack's own
worked example from `mock-data-v2.md` §24 — base 50,00,000 plus 4% PLC
(2,00,000) less a 1,00,000 discount is 51,00,000 — along with the discount's
refusals, its floor at zero, and the words the figure is written in.

**Also recorded as** [D-07](../approved-deviations.md#d-07--the-plot-rate--area-calculator-works-in-rupees-and-applies-cr-017)
in `approved-deviations.md`, which is the plain-language summary of the same
thing.
