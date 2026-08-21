# Legacy Data Importer — Design

**Date:** 21 August 2026
**Status:** Approved design, ready for an implementation plan
**Phase:** 7 — Migration, Hardening, UAT and Go-Live
**Read with:** [`system/PRD.md`](../../../system/PRD.md) §27, [`system/main-PRD.md`](../../../system/main-PRD.md) §27.3, [`system/ARCHITECTURE.md`](../../../system/ARCHITECTURE.md) §13, [`system/GO-LIVE-EVIDENCE.md`](../../../system/GO-LIVE-EVIDENCE.md)

---

## 1. Purpose

Move the existing v2.3 implementation's data into the approved v3.1 schema once,
safely, with a reconciliation report that can be signed.

This closes the one Phase 7 item the repository deliberately left open. The nine
reconciliation rules in `src/lib/migration/reconcile.ts` already define what a
correct migration looks like; this importer is what produces a database that
passes them.

## 2. Decisions taken

| Decision | Choice |
|---|---|
| Source access | Live connection to the legacy database (or a restored copy) |
| Cutover | One-shot: freeze legacy, import, go live. Rehearsable repeatedly on staging |
| Failure policy | Dry run first, then a strict all-or-nothing load. Production is never half-migrated |
| Duplicate identities | Import both Persons, raise a `PersonMergeRequest` for the MD |
| History | Correct current state in the live tables; legacy history archived verbatim |

## 3. Non-goals

- **No incremental or two-way sync.** Legacy stops taking writes at the freeze.
- **No reconstruction of typed events.** Legacy history is archived as it stands,
  never replayed into `BookingEvent` / `PlotEvent` / `CommissionEvent`. A
  reconstructed event reads as fact while being a guess; the archive is honest
  about what it is.
- **No legacy password migration.** See §6.2.
- **No automatic repair of source data.** Exceptions are reported for humans to
  decide, exactly as `reconcile.ts` does.

## 4. Architecture

Code lives in `src/lib/migration/`, beside the reconciliation rules it must satisfy.

```
src/lib/migration/
  reconcile.ts        (exists) the nine rules; becomes the load's final gate
  legacy-source.ts    the LegacySource interface + the introspected implementation
  mapping.ts          legacy → v3.1 translation tables
  analyse.ts          pass 1: plan every row, classify every exception, write nothing
  load.ts             pass 2: one transaction, reconcile-gated
  archive.ts          legacy history → LegacyRecord

prisma/
  legacy/schema.prisma       introspected source schema (prisma db pull)
  import-dry-run.ts          npm run import:dry-run
  import-load.ts             npm run import:load
  import.check.ts            npm run import:check
```

### 4.1 Reading legacy

`prisma db pull` against the legacy database produces `prisma/legacy/schema.prisma`
and a **second, read-only generated client** at its own output path. This adds no
runtime dependency, gives typed access to the source tables, and yields the
introspected source schema as a document the vendor can sign — which does not
exist today. The legacy client is never used for writes.

### 4.2 Writing the new database

Writes use Prisma model writes against the v3.1 schema, **not** `runCommand`.
Migrated records must land directly in their end state, and the command layer
deliberately refuses that: `submit → decide → pay → complete` is forward-only by
design.

The safety net is therefore the layer beneath the services:

1. every database constraint and trigger in `prisma/constraints.sql`;
2. `settleConstraints` before commit, so deferred triggers fire while rollback is
   still possible;
3. the nine reconciliation rules, run inside the same transaction.

This is a deliberate trade: the importer bypasses workflow enforcement and is
held to the data invariants instead. Nothing else in the system writes this way.

### 4.3 Required refactor

`reconcile()` currently talks to the global `db`. It must accept a client
parameter (`PrismaClient | Prisma.TransactionClient`) so the load can run it on
its open transaction. Small change; it also makes the rules reusable rather than
bound to a global.

## 5. Mapping layer

`src/lib/migration/mapping.ts` holds the translation as plain const tables —
statuses, roles, commission states, plot lifecycles — with two properties:

- **Total, never defaulted.** An unrecognised legacy value maps to nothing and
  raises a hard exception. No `?? "ACTIVE"` fallback exists anywhere in the
  importer: a status nobody planned for must stop the migration, not quietly
  become something plausible.
- **Readable by Accounts.** Each table is `"LEGACY_VALUE": "V31_VALUE"` pairs
  with the governing PRD clause in a comment, so the people signing off can check
  the mapping without reading TypeScript.

### 5.1 Import order

Foreign-key order, and the order the load writes in:

1. Projects, PLC rule versions and components
2. Plots, boundaries, PLC snapshots
3. Persons, then Customer and Member profiles
4. Staff accounts
5. Member portal accounts
6. Enquiries and follow-ups
7. Holds, extension requests, hold requests
8. Bookings → parties → schedule versions → instalments → Payment Received entries
9. Acquisitions → schedule versions → Payment Given entries
10. Commission opportunities, then commission records
11. Tasks
12. `LegacyRecord` archive
13. `PersonMergeRequest` rows for duplicate identities

## 6. Specific mappings

### 6.1 Identity

Aadhaar and PAN arrive as plaintext and are encrypted with `encryptSensitive`
plus a blind index via `blindIndex` on the way in — the same helpers the
application uses, so duplicate detection behaves identically afterwards.

Where a second Person shares an Aadhaar or PAN:

- the second Person imports **without** the number, so no unique constraint breaks;
- the value is preserved in the archive, so nothing is lost;
- a `PersonMergeRequest` is raised for the MD, resolved after go-live through the
  Phase 6 merge workflow, which rebuilds the Loyalty count from unique qualifying
  events.

Shared mobile numbers import unchanged: the schema treats `primaryMobile` as
contact-only and deliberately does not make it unique (PRD §17.1).

### 6.2 Credentials

Legacy password hashes do not migrate. Importing them would carry the old
system's hashing weaknesses into the new one, and the algorithms differ.

- Staff accounts import with a per-account random one-time password.
- MD and Admin re-enrol MFA, which is mandatory for those roles (PRD §3.1).
- Member portal accounts are created with `loginId = memberId` (PRD §17.1) and
  their own one-time password.

**Gap to close before cutover:** the application has no self-service password
reset today — the seed issues a shared initial password. So the importer writes
the one-time credentials to a **separate handout file**, never into the
reconciliation report, the audit trail or any log, for the Admin to distribute
and then delete. Whoever plans the cutover must decide between two options, and
the implementation plan should carry the choice:

1. keep the handout, and have each user change their password at first login
   through an Administration screen (needs a change-password action that does
   not exist yet); or
2. build a self-service reset first, and have the importer issue no passwords at
   all.

Option 2 is cleaner and larger. Neither is in this design's scope; the importer
supports both by keeping credential issuance in one place.
- Customer portal accounts are **not** created — the model no longer exists.
  Their security history goes to the archive, which is what "disabled, not
  deleted" means under a schema that has no such account (main-PRD §27.3.10).

### 6.3 Archive

One new model:

```prisma
model LegacyRecord {
  id           String   @id @default(uuid())
  entity       String   // legacy table name
  legacyId     String   // legacy primary key, as text
  payload      Json     // the legacy row, verbatim
  /// The v3.1 record this belongs to, where one exists.
  linkedEntity String?
  linkedId     String?
  importedAt   DateTime @default(now())

  @@index([entity, legacyId])
  @@index([linkedEntity, linkedId])
}
```

Old Customer and Member IDs additionally populate the existing
`legacyCustomerIds` and `legacyMemberIds` arrays, so they stay searchable from
the profile itself (PRD §22).

## 7. The two passes

### 7.1 Pass 1 — dry run

`npm run import:dry-run` opens both databases read-only, runs every mapper in
analyse mode, and writes a report in the same shape as the reconciliation one:
planned row counts per entity, then exceptions grouped by rule.

It writes nothing, anywhere. It is safe to run against the live legacy database
while staff are still using it — which is how the client finds their data
problems weeks before cutover rather than on the night. Exits non-zero while any
hard exception stands.

### 7.2 Pass 2 — load

`npm run import:load` refuses to start unless the target is at its seeded
baseline — staff accounts, projects and PLC rules from `prisma/seed.ts`, and no
Person, Enquiry, Hold, Booking, Acquisition or commission record. Then:

1. re-runs the analysis in-process and aborts if any hard exception has appeared
   since the last dry run;
2. opens one transaction and writes entities in the order of §5.1;
3. runs `SET CONSTRAINTS ALL IMMEDIATE`;
4. runs `reconcile()` on that same transaction;
5. throws on any reconciliation exception, rolling the whole migration back;
6. otherwise commits and writes the signed record-count report.

### 7.3 Rehearsal

`npm run import:load -- --reset` truncates the operating tables before loading.
It is gated behind an environment variable set only on staging, so no stray flag
can wipe production.

## 8. Exception taxonomy

**Hard — the load will not run:**

- an unmapped legacy value in any mapping table
- a Plot with more than one live allocation
- a Booking with no Plot or no Person
- Payment entries that do not sum to the stored progress percentage
- a duplicate Booking Number
- a Delivered Booking with no completion data
- a commission that cannot be expressed as an eligibility + payment pair

**Soft — recorded, import proceeds:**

- duplicate Aadhaar or PAN → second Person imports without it, merge request raised
- shared mobile numbers → imported as contact-only
- final buyers missing date of birth or address → imported, CRM task raised;
  completion stays blocked until fixed, which the Phase 6 rules already enforce
- legacy fields with no home in v3.1 → archive only

**One case worth naming:** a legacy commission marked paid with no verifiable
payment reference imports as `ACCOUNTS_ADJUSTMENT_REQUIRED`, not `PAID`. That
state exists precisely for a record whose payment needs Accounts to look again,
so the migration uses it rather than inventing a flag or asserting a payment
nobody can evidence.

Every soft exception lands in a post-import work queue that Day 1 begins with:
merge requests for the MD, incomplete buyer details for CRM, adjustments for
Accounts.

## 9. Testing

The legacy reader sits behind one `LegacySource` interface with two
implementations — the introspected client, and a fixture source. That is what
makes the importer testable before the client's database is ever available.

`prisma/import.check.ts` feeds the fixture deliberately hostile rows: a duplicate
Aadhaar across two records, two live Bookings on one Plot, a legacy status nobody
mapped, and a paid commission with no reference. It asserts that:

- the dry run classifies each exception correctly, hard versus soft;
- the load refuses while a hard exception stands;
- after a clean load, `reconcile()` returns zero exceptions;
- the archive rows, the merge request and the Accounts adjustment are all present.

A second check asserts **mapping totality**: every legacy enum value the
introspected schema knows about has an entry in `mapping.ts`. The day someone
adds a status to the old system, that test fails rather than the migration.

Both run as `npm run import:check`, wired into `npm run db:check` alongside the
other phase checks. The totality check needs `prisma/legacy/schema.prisma` to
exist; where it does not — a developer machine with no legacy access — it skips
with a stated reason rather than passing silently.

## 10. Stated assumption

This is sized for a legacy database in the tens of thousands of rows per table,
where the whole load fits comfortably in one transaction.

If the real row counts prove an order of magnitude larger, the design changes in
exactly one place: per-entity transactions with a resumable checkpoint instead of
a single commit, with reconciliation run after the last batch rather than inside
the transaction. The trade is explicit — a failure would then leave a partial
database that `--reset` must clear before retrying. Confirm the row counts during
the first dry run against real data, before building the load pass.

## 11. Acceptance

The migration is complete when, on the production target:

1. `npm run import:dry-run` reports zero hard exceptions;
2. `npm run import:load` commits;
3. `npm run reconcile` reports zero exceptions;
4. the record-count report matches the legacy counts for every protected entity,
   allowing for the documented soft exceptions;
5. `npm run db:check` passes against the migrated database.

That set is the evidence for go-live gate 6 in PRD §27.
