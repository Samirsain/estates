# Go-Live Evidence Map

**Purpose:** what to run to produce each item of evidence the go-live gates in
[`PRD.md`](./PRD.md) §27 and the acceptance evidence in
[`ARCHITECTURE.md`](./ARCHITECTURE.md) §14 ask for.

Everything below is produced from the running system. Nothing here is a
substitute for the sign-offs, the UAT, or the vendor/company controls the same
sections require.

---

## 1. Commands

| Command | Produces |
| --- | --- |
| `npm run check` | Pure-rule evidence: task rules, security/permission matrix, every domain rule for Phases 2–6, plus a full TypeScript check. No database needed. |
| `npm run db:check` | The full database run: schema/constraint checks, then the Booking, commission, Phase 5, Phase 6 and Phase 7 service checks end to end. |
| `npm run phase7:check` | Hardening evidence on its own: idempotency retry, concurrency, permission abuse, scheduler retry and catch-up, and an exception-free reconciliation. |
| `npm run acquisition:check` | Buyback, Purchase for Resale, Payment Given and Buying Commission end to end: the 20% approval threshold, duplicate detection, deal cancellation under a buyer process, and the milestone stepping back below 100%. |
| `npm run reconcile` | The migration record-count and exception report. Exits non-zero while any exception is open. |
| `npm run db:constraints` | Re-applies every database control Prisma cannot express. Safe to re-run. |

Redirect the reconciliation to a file for the copy that gets signed:

```bash
npm run reconcile > reconciliation-<date>.txt
```

---

## 2. Gate map (PRD §27)

| Gate | Evidence | How |
| --- | --- | --- |
| 1. Signed v3.0 and v3.1 | Owner sign-off | Outside the CRM |
| 2. Field-level permissions and maker-checker | Permission matrix tests; server-side refusal of crafted requests | `npm run check` (matrix), `npm run phase7:check` (abuse) |
| 3. Status transition and restoration tests | Transition table, rejection/cancellation restoration | `npm run check`, `npm run db:check` |
| 4. Commission compatibility, cap and concurrency | 4% cap, entitlement contest under load | `npm run commission:check` |
| 5. Payment Received and Payment Given corrections | Correction supersession on both sides, the 20% approval threshold, and the Buying Commission milestone stepping back | `npm run booking:check`, `npm run phase5:check`, `npm run acquisition:check` |
| 6. Migration rehearsal and signed reconciliation | Record-count and exception report | `npm run reconcile` on the staging copy, then on production |
| 7. Concurrency and idempotency | One allocation under contest; same key returns the original result | `npm run phase7:check` |
| 8. Security/access testing and MD/Admin MFA | MFA enrolment and code verification, sensitive-field masking, no secret in audit | `npm run db:check` (identity), `npm run phase7:check` (audit payload) |
| 9. Scheduled-job retry and recovery monitoring | Catch-up after downtime, repeat run changes nothing, per-job run rows | `npm run phase7:check`; `ScheduledJobRun` table |
| 10. Backup restoration and rollback | Restore rehearsal | Outside the CRM — hosting/operations |
| 11. User training and UAT sign-off | UAT records | Outside the CRM |
| 12. Company control of hosting, repository, domain, backups, credentials | Account ownership | Outside the CRM |

---

## 3. Migration reconciliation rules

`npm run reconcile` checks, per
[`ARCHITECTURE.md`](./ARCHITECTURE.md) §13 and [`main-PRD.md`](./main-PRD.md) §27.3:

| Rule | Clause |
| --- | --- |
| `one_allocation_per_plot` | Every Plot reconciles to one active allocation |
| `booking_plot_state_pairs` | Booking and Plot statuses agree |
| `payment_datasets_separate` | Received and Given stay separate, and each side's stored progress equals its own confirmed entries |
| `commission_integrity` | Supersession links intact, eligibility and payment a separate pair, current sale total within 4% |
| `loyalty_slots_rebuilt` | Loyalty counts equal the unique qualifying events behind them, capped at three |
| `annual_positions_not_renumbered` | A counter-year position is issued once |
| `person_merges_reconciled` | One surviving identity; no merge left undecided |
| `member_id_login` | Portal login equals the Member ID; a deactivated Member has no enabled portal account |
| `delivered_has_completion` | Delivered means exactly one live Allotment/Registry completion |

Exceptions are reported, never repaired: each one is a decision for CRM or
Accounts.

---

## 4. What this repository does not cover

Stated plainly so it is not mistaken for delivered scope:

- **No legacy importer.** Mapping legacy rows into this schema needs the source
  database in front of it; a speculative importer written blind would be wrong
  in exactly the places that matter. The reconciliation rules above are the
  acceptance test any importer must pass.
- **No backup, restore or rollback scripts.** These belong to whoever operates
  the hosting, and gate 10 is their sign-off.
- **No browser/responsive test harness.** Gate 11 covers this through UAT.
