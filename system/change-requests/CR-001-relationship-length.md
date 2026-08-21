# CR-001 — Relationship length shown for Members and Customers

Raised under [`PRD.md`](../PRD.md) §28 and the change-control rule in
[`PHASES.md`](../PHASES.md).

| | |
| --- | --- |
| **Change Request ID** | CR-001 |
| **Raised** | 21 August 2026 |
| **Owner** | _Product Owner — name and signature below_ |
| **Status** | Raised. Implemented on `main`; awaiting the owner's signature |
| **Release target** | First production release (go-live) |

---

## 1. Exact approved wording

The following is the requirement text. It is what the system implements and what
the acceptance tests are written against.

> **1.1** The CRM shows how long a relationship has run, expressed in whole years
> and whole months — for example `2 years 5 months`.
>
> **1.2** For a **Member**, the period is counted from the Member Activation
> Date. It uses the same anniversary rule as the annual counters in RD-02:
> a Member activated on 29 February completes a year on 28 February in a
> non-leap year.
>
> **1.3** For a **Customer**, the period is counted from the Booking Date of
> their earliest **approved** Booking, meaning a Booking Number was issued. A
> Booking that was later cancelled still counts, because the relationship began
> when it was approved. A person counts as a buyer whether they were the Primary
> Customer or an Additional Customer on that Booking.
>
> **1.4** The value is derived whenever it is displayed and is never stored. No
> job, no manual edit and no migration step maintains it, and it can never become
> stale.
>
> **1.5** Where there is no anchor date the field is shown empty and never as
> `0 years`. That is: a Member who has not been activated, and a Customer who has
> no approved Booking.
>
> **1.6** The value is display only. It confers no entitlement and is not an
> input to any commission, payment, inventory, identity, permission or completion
> rule.

---

## 2. Affected screens, data and statuses

### Screens

| Screen | Change |
| --- | --- |
| Members list | A line under the Member name: `2 years 5 months as a Member` |
| Member portal — profile | An `Experience` row beside the Activation date |
| Customers list | A line under the Customer name: `3 years 5 months as a Customer` |

These screens are enumerated in [`DESIGN.md`](../DESIGN.md) §12.1, §12.2 and
§13.1, and none of those lists includes this field. That is the gap this CR
closes.

### Data

**No schema change. No new column, table or index.** The value is computed from
two dates that already exist:

- `MemberProfile.activationDate`
- `Booking.bookingDate`, reached through `BookingParty` for the Person

### Statuses

None. No status, transition or lifecycle is added, removed or altered.

---

## 3. Permission impact

**None.** No new permission, and no change to any existing one.

The field appears wherever the viewer may already see that Member or Customer
row. It exposes no buyer-private data, so the Member portal privacy rule in
`PRD.md` §23.1 is unaffected: a Member sees the length of their own membership
and nothing about anybody else.

---

## 4. Migration impact

**None.** Nothing to back-fill, reconcile or map.

Because the value is derived (clause 1.4), a migrated Member or Customer shows a
correct figure the moment their dates arrive. No reconciliation rule in
`ARCHITECTURE.md` §13 changes, and `npm run reconcile` gains no new check.

---

## 5. Acceptance-test impact

Automated, in `src/lib/domain/domain.check.ts`, run by `npm run check`:

| Case | Expected |
| --- | --- |
| No anchor date | Nothing shown |
| Anchor date in the future | Nothing shown |
| Anchor date is today | `Less than a month` |
| 13 months | `1 year 1 month` — singular, not `1 years 1 months` |
| 3 years 4 months | `3 years 4 months` |
| Exactly on the anniversary | `3 years` — months omitted |
| One day short of the second month | `1 month` |
| Activated 29 Feb 2024, on 28 Feb 2025 | 1 year — the same day the counter rolls |
| Activated 29 Feb 2024, on 27 Feb 2025 | 0 years |

Verified on screen for a Member (`2 years 5 months as a Member`) and for a
Customer against a Booking dated 15 March 2023 (`3 years 5 months as a
Customer`).

**No existing acceptance test changes.** The go-live gates in `PRD.md` §27 are
unaffected.

---

## 6. Implementation reference

| | |
| --- | --- |
| Rule | `experienceSince` in `src/lib/domain/commission.ts` |
| Tests | `src/lib/domain/domain.check.ts` |
| Screens | `src/app/members/`, `src/app/customers/`, `src/app/portal/` |
| Commits | `1acadd5` (Members), `92a9582` (Customers) |

---

## 7. Owner sign-off

By signing, the owner approves the wording in section 1 as a requirement of the
system.

| | |
| --- | --- |
| Name | |
| Role | |
| Date | |
| Signature | |
