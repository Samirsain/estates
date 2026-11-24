# CR-028 to CR-032 — Owner rulings of 24 November 2026

**Owner:** 3% Club (owner's written instructions, 24 Nov 2026)
**Status:** Raised, implemented on the owner's instruction — awaiting signature
**Release target:** next release after 24 Nov 2026; migration `20261124100000_booking_without_customer`

These five changes supersede the rules they name, for the functionality they
describe only. Everything else in the v3.1 baseline is unchanged.

---

## CR-028 — PLC Version is optional

**Exact approved wording.** "PLC Version must not be a mandatory requirement for any
project, plot, or booking … Do not automatically create dummy or default PLC
Versions. Do not force existing projects to configure PLC Versions."

**Supersedes.** PLC spec §6.3–6.4 and PRD §16.3 where they refuse a Hold, Booking
Request or Change Plot because the Project has no published PLC version.

**What changes.** A Project with no published PLC version freezes no PLC snapshot:
the Hold, Booking or Change Plot carries none (`plcSnapshotId` was already
nullable). A Project with a published version works exactly as before, including
the refusal of an incomplete PLC configuration. No PLC card is shown on the Plot
or Booking page of a Project without PLC.

- **Affected:** `plc-service.freezePlcSnapshot`, Hold, Booking Request, Change Plot; Plot and Booking pages.
- **Permission impact:** none. **Migration impact:** none.
- **Acceptance tests:** create a Project without PLC; add Plots; Hold and Book one; a Project with PLC still freezes its snapshot.

## CR-029 — A Plot may be booked before its Customer is known

**Exact approved wording.** "Make customer selection optional during plot booking
when a valid member is associated with the booking … Do not create fake customer
records … Assigning a customer must update the existing booking rather than
creating a new booking."

**Supersedes.** PRD §12.1 "exactly one Primary Customer" at submission, for a
Booking Sold By a Member.

**What changes.**

- A Booking Request with no buyers is accepted only when Sold By is **Member**
  (an active Member, checked as before). No Person or Customer is created;
  `Booking.primaryPersonId` is null. A held Plot is still booked for the Customer on the Hold.
- It is approved, numbered and paid like any Booking. The Plot follows the normal
  lifecycle and `one_active_booking_per_plot` still allows one live Booking per Plot.
- The Member's Direct commission is generated as for any third-party Member sale.
  Royalty, repeat-purchase Loyalty, the Trip Reference credit and the buyer's
  classification wait for the Customer.
- **Add Customer** (Booking page, Plot page, Member profile) puts an existing or
  new Customer — joint buyers and shares allowed — on the same Booking. Its number,
  date, Plot, Member, payments, history and commission records stay. The
  classification freezes from the buyer's standing at that moment; on an approved
  Booking the Royalty, Trip and commission engines run again, and an unchanged
  commission record is kept, never written twice. A buyer who contradicts the
  Sold By (an Active Member under another Member) is refused.
- Until a Customer is added: no Buyback, Primary Customer change, ownership-share
  change, final buyers, Allotment or Registry; a Sold By Correction must stay a Member.
- The Member profile lists the Booking with **Customer Pending** in the Customer
  column (status, payment, plot size and date as for any Booking) and an Add Customer link.

- **Affected:** `Booking.primaryPersonId` (nullable), booking, commission, trip, royalty, completion, acquisition, change-plot, report and task services; Booking, Plot, Member, Customer, Calculator and Buyback screens.
- **Permission impact:** Add Customer needs `BOOKING_REQUEST_SUBMIT`.
- **Migration impact:** `ALTER TABLE "Booking" ALTER COLUMN "primaryPersonId" DROP NOT NULL` — rewrites no row.
- **Acceptance tests:** book under a Member with no Customer; it shows on the Member profile as Customer Pending; record a payment; add an existing Customer; add a new Customer; history, payments and the Booking Number are unchanged; commission is not duplicated; a second Booking on the same Plot is refused.

## CR-030 — MD is the highest authority

**Exact approved wording.** "No valid business action performed by the MD should
require approval from Accounts, CRM, PC, another MD, or any other staff account …
Remove maker-checker and self-approval restrictions specifically for the MD role
… If an operation requires an approval record for system consistency, create the
appropriate approved record automatically with the MD recorded as the approving authority."

**Supersedes.** PRD §3.3 / §11.2 maker-checker for the MD role only.

**What changes.**

- `selfReviewRefused` (permissions.ts) is the one maker-checker rule: it refuses
  self-approval for every role except MD, read from the signed-in session's role.
  It replaces the ten separate checks (Booking decision, Primary Customer change,
  cancellation, Change Plot, Buyback decision, Payment Given correction, payment
  correction, schedule revision, bank verification, Person Merge).
- MD's own Booking Request (new or resent), payment plan change, main buyer change
  and Sold By Correction are approved at once as MD: the review record is written
  with MD as the decider and the note "Confirmed directly by MD." MD's cancellation
  completes at once when nothing was received; with a payment to refund, MD enters
  the refund's Payment Reference on the same Booking. MD's payment steps already
  ran at once (10 Nov 2026).
- Change Plot and Buyback still need their data before approval (the applicable
  percentage and new schedule; 20% Payment Given). MD enters it and approves
  directly; no other account is involved.
- `can()` already gave MD every Action. Other roles keep their tick lists and
  every maker-checker rule. Audit entries record each MD step as before.

- **Affected:** permissions.ts, seven services, Booking server actions, Review dialog.
- **Permission impact:** MD only. **Migration impact:** none.
- **Acceptance tests:** MD books and it is Booked at once; MD approves its own request; MD cancels without another account; CRM and Accounts still cannot approve their own.

## CR-031 — + Add City on the booking form

**Exact approved wording.** "Users should be able to add a new city directly from the
booking form without leaving the booking process … Prevent duplicate cities using
case-insensitive matching … Do not require a separate approval."

**Supersedes.** City Master (17 Nov 2026) "MD adds new cities under Administration → Cities", for these forms.

**What changes.** "+ Add City" under the City field opens an inline form: City Name
(required) and State (optional — the states already on the list, most-used
first). Spaces are tidied, the name is checked as any city's, the code is made
automatically. A name already on the list in any case is selected instead of
added; an Inactive one is refused with a message. The database index
`City_name_lower_key` holds the line. The new city is selected, and the form's
other entries are kept. Shown on the Booking and Hold Customer rows, Add Enquiry,
Add Member and the Customer/Member detail editor. A booking without a Customer
asks for no city.

- **Permission impact:** any account holding a form that asks for a city (Booking, Hold, Enquiry, Member, Person details, Staff).
- **Migration impact:** none.

## CR-032 — No limit on Plots per Customer

**Exact approved wording.** "Completely remove the maximum 3 open plot positions
restriction for customers across the entire CRM … Do not replace the existing limit
of 3 with another fixed limit … Remove the customer plot limit exception workflow."

**Supersedes.** PRD §10.6, §10.7 (first bullet), Part B §8.2 and acceptance item 8;
design.md's three-position message.

**What changes.** `MAX_OPEN_POSITIONS`, `checkOpenPositions`,
`openPositionCount` and `countOpenPositions` are deleted, with their calls in
Hold, Member Hold Request, Booking Request, resend and Add Customer. There was no
database constraint for it. Each Plot stays protected on its own: `canAllocate`,
the Plot lock and `one_active_booking_per_plot`.

- **Permission impact:** none. **Migration impact:** none.
- **Acceptance tests:** a Customer with three open positions holds or books a fourth (and the hundredth); no MD exception is asked for.
