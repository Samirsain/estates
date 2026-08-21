# 3% Club CRM v3.1

Plotted real-estate CRM built against the approved v3.1 baseline in
[`system/`](./system). Every rule in the code cites the clause it implements.

**Percentage-only financial model.** No rupee value is stored or calculated
anywhere — not in Bookings, payments, commission or acquisitions. That is a
requirement, not a simplification.

---

## What this is, in one paragraph

One Next.js application. The screens, the business rules and the HTTP endpoints
are a single codebase and a single deployment; there is no separate backend
service to run. The only external piece is PostgreSQL (Supabase, Mumbai).

```
Browser ──▶ Next.js (server components, server actions, /api routes)
                        │
                        └──▶ PostgreSQL  ·  constraints + triggers are the last guard
```

---

## Layout

| Path | What lives there |
| --- | --- |
| `src/app/` | Screens. Each module is `page.tsx` (server) + `*-client.tsx` (browser) + `actions.ts` (server actions) |
| `src/lib/domain/` | Pure business rules. No database, no framework — this is what the unit checks exercise |
| `src/lib/services/` | Commands. Every state change runs here, inside one transaction with an idempotency key |
| `src/lib/security/` | Permissions, sessions, password and MFA, Aadhaar/PAN encryption and blind indexing |
| `src/lib/migration/` | The reconciliation rules a migrated database must satisfy |
| `prisma/` | Schema, migrations, the constraints Prisma cannot express, seed, and the check suite |
| `system/` | The approved requirements. `PRD.md` and `main-PRD.md` govern; the code follows them |

---

## Running it locally

```bash
npm install
cp .env.example .env          # then fill in the six secrets
npx prisma migrate deploy
npm run db:constraints        # controls Prisma cannot express
npm run db:seed               # first staff accounts, one project, a few plots
npm run dev
```

Seeded accounts sign in with `STF-0001` … `STF-0008`. MD and Admin need an MFA
code — `npm run db:otp` prints the current one during development.

---

## Verifying it

| Command | What it proves |
| --- | --- |
| `npm run check` | Task rules, the permission matrix, every domain rule, and types. No database |
| `npm run db:check` | The full end-to-end suite: schema, bookings, commission, phase 5, acquisitions, phase 6, phase 7 |
| `npm run reconcile` | The migration record-count and exception report. Non-zero exit while any exception is open |

The database checks write and purge tagged data, so they refuse to run unless
`ALLOW_CHECK_WRITES=true` is set. **A production environment must never set it.**

---

## Operating it

| Command | Use |
| --- | --- |
| `npm run jobs:run [JOB]` | Run the scheduled jobs, or one of them, from the command line |
| `npm run rotate:key` | Re-encrypt protected fields onto a new `SENSITIVE_KEY`. Dry run without `--confirm` |
| `npm run db:constraints` | Re-apply the database controls. Safe to re-run |

The scheduler is not automatic. Until something calls `/api/jobs`, Hold expiry,
payment reminders and RERA alerts do not happen — see
[`system/DEPLOYMENT.md`](./system/DEPLOYMENT.md).

`/api/health` answers 200 only when the database is reachable and every secret is
configured, and it reports the last successful run of each job.

---

## Before go-live

[`system/GO-LIVE-EVIDENCE.md`](./system/GO-LIVE-EVIDENCE.md) maps each of the
twelve gates in `PRD.md` §27 to the command that produces its evidence, and states
plainly which gates this repository cannot satisfy on its own — the legacy data
import, backup rehearsal, UAT, and company ownership of the production accounts.
