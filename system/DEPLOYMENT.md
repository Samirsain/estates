# Deployment

**Read with:** [`GO-LIVE-EVIDENCE.md`](./GO-LIVE-EVIDENCE.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md) §10.

---

## 1. The one rule that matters most

**Put the application and the database in the same region, and put both in
India.** Every screen is server-rendered and reads the database, and a single
Booking approval runs roughly 25 statements inside one transaction. Cross-region
latency is multiplied by that count on every write.

**This is already done.** The project moved from `ap-northeast-1` (Tokyo) to
`ap-south-1` (Mumbai) on 21 August 2026, which took page loads from several
seconds down to normal. Supabase cannot change the region of an existing
project, so it meant a new project and a reload:

```
npx prisma migrate deploy      # baseline + any later migrations
npm run db:constraints         # the controls Prisma cannot express
npm run db:seed                # first MD/Admin accounts only
```

Keep the application in Mumbai too. Hosting it elsewhere would give the latency
straight back.

Storing Aadhaar and PAN, even encrypted, is a second reason to keep the data in
India. That is a practical position, not legal advice — take your own.

---

## 2. Choosing a host

| Situation | Host |
|---|---|
| A persistent Node server in India or Singapore is available | Railway / Render / VPS — the natural fit |
| Only serverless in Mumbai is available | Vercel, on a plan that allows a raised `maxDuration` |
| Someone technical will maintain it | A VPS in Mumbai is cheapest and fastest |

Why a persistent server suits this application: a command may hold a transaction
for up to `COMMAND_TIMEOUT_MS` (20s) after waiting up to `COMMAND_MAX_WAIT_MS`
(10s) for a row lock, so a contested write can legitimately take ~30 seconds. A
10-second function limit cuts that in half. The transaction rolls back cleanly —
nothing is corrupted — but the user sees a failure that need not have happened.

`vercel.json` in the repository root sets `maxDuration: 60`, the `bom1` region and
the cron entries, so the serverless route works where the plan allows it.

---

## 3. Environment

Six secrets, none of which live in the repository:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler**, port 6543, keep `pgbouncer=true` |
| `DIRECT_URL` | Direct connection, port 5432. Migrations only |
| `SESSION_SECRET` | ≥32 characters |
| `SENSITIVE_KEY` | 32 bytes of hex (64 chars) — encrypts Aadhaar, PAN and bank details |
| `BLIND_INDEX_KEY` | 32 bytes of hex — duplicate detection without a searchable plaintext |
| `JOBS_SECRET` | Authenticates the scheduler |

**Generate new values for production.** Development keys must never be reused —
and `SENSITIVE_KEY` in particular cannot be changed casually afterwards, because
everything encrypted with it stops decrypting. There is a rotation tool
(`npm run rotate:key`) but it is a maintenance operation, not a routine one.

Optional: `TRUST_PROXY=true` only when a trusted proxy overwrites
`X-Forwarded-For`; otherwise client-supplied values would enter the audit trail.

---

## 4. The scheduler

Nothing runs the jobs by itself. Until a scheduler is pointed at the endpoint,
Hold expiry, payment reminders and RERA alerts do not happen.

```
POST /api/jobs?job=HOLD_EXPIRY      x-jobs-secret: $JOBS_SECRET
GET  /api/jobs?job=HOLD_EXPIRY      Authorization: Bearer $JOBS_SECRET
```

Omitting `?job` runs the whole catalogue — good on a persistent server, risky on
a capped one. The job names are `HOLD_EXPIRY`, `MEMBER_HOLD_REQUEST_EXPIRY`,
`INSTALMENT_OVERDUE`, `PAYMENT_RECEIVED_REMINDER`, `PAYMENT_GIVEN_REMINDER`,
`BOOKING_DECISION_ALERT`, `RERA_EXPIRY_REMINDER`, `ANNUAL_COUNTER_RESET`.

**Cron schedules are UTC; the business runs on Asia/Kolkata.** The entries in
`vercel.json` fire the daily jobs at 19:30–19:55 UTC, which is 01:00–01:25 IST the
next morning. Expiry jobs run every 15 minutes because a Hold expires at its exact
stored time.

Every run writes a `ScheduledJobRun` row, and `/api/health` reports the last
success per job — that is the monitoring evidence go-live gate 9 asks for.

---

## 5. After deploying

1. Open `/api/health` — expect `200` with `"missingEnv": []` and `database: "up"`.
2. Sign in as the MD and change the seeded password under My Account.
3. Do the same for Admin.
4. Create the real staff accounts from Administration; each gets a one-time
   password and changes it at first sign in.

   The password is now the whole login control — CR-003 removed multi-factor
   authentication. Insist on real passwords, and disable leavers the same day.
5. Create the real Projects and PLC rules, then prepare inventory.
6. Run `npm run reconcile` against production and keep the output — it is the
   signed record-count and exception report.

---

## 6. Ownership (go-live gate 12)

Create the hosting, database, repository and domain accounts **in the company's
name and email**, not a developer's. Transferring them later is avoidable pain,
and the gate explicitly requires company control of production-critical accounts.
