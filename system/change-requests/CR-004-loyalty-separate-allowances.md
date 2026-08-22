# CR-004 — Loyalty Bonus split into two separate three-deal allowances

Raised under [`PRD.md`](../PRD.md) §28 and the change-control rule in
[`PHASES.md`](../PHASES.md).

| | |
| --- | --- |
| **Change Request ID** | CR-004 |
| **Raised** | 22 August 2026 |
| **Owner** | _Product Owner — name and signature below_ |
| **Status** | Raised. **Not implemented.** Awaiting the owner's signature before any code is written |
| **Release target** | To be set by the owner |

**This CR changes a commission entitlement in a governed area.** It raises the
maximum number of Loyalty Bonuses one Customer may earn in a lifetime from three
to six. It must not be treated as approved until signed, and nothing is built
until then.

---

## 1. What the approved baseline says today

A Customer earns Loyalty Bonus by one of two routes, and today they share a
single lifetime allowance of three.

| Clause | Wording |
| --- | --- |
| `PRD.md` §6.5 | "Combined lifetime maximum: three Loyalty Bonuses." |
| `PRD.md` §6.5 | "The three may be any combination of introduced-buyer sales and repeat personal purchases." |
| `main-PRD.md` §14.5 | "One combined lifetime maximum of three Loyalty Bonuses per Customer." |
| `main-PRD.md` §14.5 | "The three may be any combination of introduced-buyer deals and repeat personal purchases." |
| `main-PRD.md` §25 | "Customer closes sale for different buyer … 1% … **Lifetime Loyalty limit applies**" |
| `main-PRD.md` §27 test 61 | "Customer lifetime Loyalty count never exceeds three." |
| `PHASES.md` Phase 4 | "Loyalty maximum three lifetime slots" |

The word doing the work in every one of these is **combined**. A Customer who
closes three sales for different buyers has no Loyalty left for their own repeat
purchase, and the reverse is equally true.

---

## 2. Exact approved wording

> **2.1** Loyalty Bonus has two separate lifetime allowances, one for each
> qualifying route:
>
> - **Introduced-buyer allowance** — three Loyalty Bonuses for closing a
>   qualifying sale for a different buyer.
> - **Repeat-purchase allowance** — three Loyalty Bonuses for buying another
>   Plot personally and directly through 3% Club.
>
> **2.2** The two allowances are independent. Consuming one does not reduce the
> other. One Customer may therefore earn up to six Loyalty Bonuses in a
> lifetime, of which no more than three may come from either route.
>
> **2.3** Neither allowance resets annually. Both are lifetime limits.
>
> **2.4** Every other Loyalty rule is unchanged: the rate stays 1%, the
> milestone stays 100% Payment Received, a first personal purchase still earns
> no repeat-purchase Loyalty, a Customer still cannot close their own purchase
> for Loyalty, and Loyalty combined with Royalty remains subject to the 4%
> overall cap on a single sale.
>
> **2.5** A Loyalty-qualifying Booking cancelled before legal completion
> reopens the slot **in the allowance it was consumed from**, not in the other.
>
> **2.6** The clauses in `PRD.md` §6.5, `main-PRD.md` §14.5, the `main-PRD.md`
> §25 matrix note and `main-PRD.md` §27 test 61 that describe a single combined
> maximum of three are withdrawn and replaced by 2.1 to 2.5.

---

## 3. Affected screens, data and statuses

### Screens

| Screen | Change |
| --- | --- |
| Members → Network | The Loyalty count shown for an introduced Customer becomes two counts, one per allowance |
| Member portal → Network | The same, in the Member-safe form: positions and bands only, no Customer identity (PRD §23.1) |
| Bookings → Commission | The refusal message when an allowance is exhausted must name **which** allowance, or it will read as wrong to the user who can see the other one is free |
| Reports → Commission | Any Loyalty count column becomes two |

### Data

The route is already distinguished everywhere except the counter. Commission
records already carry `LOYALTY/INTRODUCED_BUYER/1%@100` against beneficiary role
`CLOSING_CUSTOMER`, and `LOYALTY/REPEAT_PURCHASE/1%@100` against
`REPEAT_PURCHASE_CUSTOMER`. Only the entitlement is shared.

| Object | Change |
| --- | --- |
| `OpportunityKind` enum | `LOYALTY` becomes `LOYALTY_INTRODUCED` and `LOYALTY_REPEAT` |
| `CommissionOpportunity.slotIndex` | Still 1–3, now per kind rather than across both |
| `CustomerProfile.loyaltySlotsConsumed` | Becomes two counters, one per allowance |
| `constraints.sql` `loyalty_slots_max_three` | Becomes one bound per counter |
| `constraints.sql` `opportunity_slot_bounds` | The `LOYALTY → 1..3` rule applies to both new kinds |
| `constraints.sql` `one_consumed_opportunity_per_slot` | **Unchanged.** It is keyed on `(kind, subjectPersonId, slotIndex)`, so splitting the kind gives each allowance its own three slots without touching the index |

### Statuses

No Booking, Plot, payment or commission **status** changes. Eligibility and
payment states are untouched; only how many times a Customer may reach them.

---

## 4. Permission impact

None. No role gains or loses an action, and no approval path changes. Loyalty is
generated by rule at the 100% milestone, not granted by a person.

**What the owner is accepting is cost, not access.** The maximum lifetime
Loyalty exposure per Customer doubles, from 3% to 6% of sale value spread across
up to six deals. The 4% per-sale cap is unaffected: it bounds the components of
one sale, and this CR changes how many separate sales may carry a Loyalty
component, not how much any single sale may carry.

---

## 5. Migration impact

**None expected.** This is a new business starting with an empty database — the
position `GO-LIVE-EVIDENCE.md` records when it marks go-live gate 6 not
applicable. If no Loyalty opportunity has been consumed before this ships, the
enum split is a schema change over empty rows.

**If any Loyalty has been consumed by then**, the migration must map each
existing `LOYALTY` opportunity to the allowance it belongs to. The commission
record's `ruleVersion` already carries that fact — `INTRODUCED_BUYER` or
`REPEAT_PURCHASE` — so the mapping is derivable and must not be guessed. Any row
whose route cannot be determined from its `ruleVersion` is an exception to be
decided by Accounts, not defaulted.

`CustomerProfile.loyaltySlotsConsumed` is rebuilt from the opportunity rows
rather than carried across, which is what the existing `loyalty_slots_rebuilt`
reconciliation rule already does.

---

## 6. Acceptance-test impact

**Changed** — these assert the combined maximum and must be rewritten to the new
rule:

- `main-PRD.md` §27 test 61 — "Customer lifetime Loyalty count never exceeds
  three" becomes a per-allowance assertion
- `commission.check.ts` — the exhaustion path, which today consumes three of one
  route and expects the other route to be refused. Under this CR it must expect
  the other route to still be **available**
- `reconcile.ts` `loyalty_slots_rebuilt` — the cap of three applies per
  allowance
- The `loyalty_slots_max_three` database constraint test

**New** — the rules this CR creates need their own evidence:

- Three introduced-buyer Loyalty Bonuses do not block a repeat-purchase Loyalty
- Three repeat-purchase Loyalty Bonuses do not block an introduced-buyer Loyalty
- Neither allowance exceeds three
- A cancellation before legal completion reopens the slot in the allowance it
  came from, and leaves the other allowance untouched (clause 2.5)
- Concurrent milestone events cannot consume a duplicate slot in either
  allowance — the existing Phase 4 concurrency test, run per allowance

**Unchanged:** the 1% rate, the 100% milestone, the 4% cap, the first-personal-
purchase exclusion, the self-purchase refusal, and the merge rule that rebuilds
Loyalty from unique qualifying events (PRD §22, test 19) — which now rebuilds
two counts instead of one.

---

## 7. Implementation reference

Nothing is implemented. These are the places the change will land once signed.

| | |
| --- | --- |
| Rule | `src/lib/domain/commission.ts` — `MAX_LOYALTY_SLOTS`, `loyaltyAvailable`, the two Loyalty branches |
| Entitlement | `src/lib/services/commission-service.ts` — `consumedSlots`, the `maxSlots` lookup, the exhaustion message |
| Schema | `prisma/schema.prisma` — `OpportunityKind`, `CustomerProfile.loyaltySlotsConsumed` |
| Constraints | `prisma/constraints.sql` — `loyalty_slots_max_three`, `opportunity_slot_bounds` |
| Reconciliation | `src/lib/migration/reconcile.ts` — `loyalty_slots_rebuilt` |
| Evidence | `prisma/commission.check.ts` |

---

## 8. Owner sign-off

By signing, the owner:

1. approves the wording in section 2 as a requirement of the system;
2. withdraws the combined-maximum clauses in `PRD.md` §6.5, `main-PRD.md` §14.5,
   the `main-PRD.md` §25 matrix note and `main-PRD.md` §27 test 61; and
3. accepts the cost stated in section 4 — that the maximum lifetime Loyalty
   exposure per Customer doubles from three deals to six.

| | |
| --- | --- |
| Name | |
| Role | |
| Date | |
| Signature | |
