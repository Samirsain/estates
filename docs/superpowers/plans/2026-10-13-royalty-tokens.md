# Royalty Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-credit/one-gift Royalty Relationship Reward with pooled, whole-number Royalty Tokens held in an append-only ledger. Each Project sets its own token rate, and each Member has one balance that may go negative.

**Architecture:** The rate becomes a field on the existing MD-approved Project settings version. It is frozen onto each Booking Request version, exactly like Direct/Loyalty. A qualifying event creates a `RoyaltyAward` (PENDING), and the award posts to `TokenLedgerEntry` only when release conditions allow. Spending is a `TokenRedemption`. `TokenAllocation` records which awards fund which redemption, oldest first. A deficit is a recorded redemption that is not fully funded, so later earnings clear it through the same allocation. Pure rules live in `src/lib/domain/tokens.ts`; every write lives in `src/lib/services/royalty-service.ts` under one advisory lock per Member.

**Tech Stack:** Next.js 15 app router + server actions, Prisma 5 / PostgreSQL, node `assert` check scripts (`*.check.ts`).

**Spec:** `docss/11. Royalty_Tokens_Implementation_Handoff.md` (the owner-approved handoff, 12 Oct 2026). It supersedes the Gift wording in docss 1, 3, 5, 6.2 and 7 only.

## Global Constraints

- Whole tokens only: `Int` columns, 1 … 1,000,000 per award rate and per redemption (`MAX_TOKENS = 1_000_000`), enforced in the domain, the service and a DB `CHECK`.
- One balance per Member across all Projects; no Project wallets anywhere on screen.
- Member-facing figures are exactly **Tokens earned**, **Tokens spent** and **Token balance**, with balance = earned − spent. A signed negative balance is shown as-is.
- No expiry, no cash, no transfer, no rupee value, no reward selection/pricing/ordering/delivery workflow.
- Recording spending: CRM or Admin only (the existing fulfilment roles). Members can read only their own figures and history.
- Append-only ledger: corrections are new linked entries with actor and reason; nothing is overwritten or deleted outside the test purge and reset scripts.
- Never substitute a missing rate: a Booking Request cannot freeze a settings version that has no token rate.
- Recommendation 5 (legacy conversion) is excluded. Mock data is reseeded, not converted.
- Local commits only; no push or PR (standing owner instruction).

## Decisions taken from the docs (owner said: decide from docs, do not ask)

1. **Rate is required on every new settings version** (Admin prepares, MD approves), entered on the create form and on "Prepare new version". The handoff says "number of tokens per qualifying Royalty when creating a Project, with authorised editing afterward", and editing a Project's settings is already the Admin → MD version flow. There is no "Disabled" option, because the handoff gives every Project a number. Legacy versions with a NULL rate block new Booking Requests with a clear message.
2. **The non-family recipient safeguard is kept for redemptions** (handoff §2 "preserve existing non-cash recipient safeguards where applicable to externally arranged fulfilment"). A redemption names its recipient: Self, Spouse, Parent, Child, Sibling or Non-family with a name. A non-family redemption waits for MD (NT10) and posts only on approval, after the availability is rechecked.
3. **Consumption is permanent**: an award's `consumedAt` is set the first time any of its tokens funds a redemption or a deficit, and is never cleared, even if that redemption is later corrected. A consumed award keeps the Customer's lifetime opportunity consumed after reversal, relinking or merge. Only that same award may come back, by requalifying its own Booking.
4. **Holds**: Recovery Outstanding, Member Deactivated, Buyback stable-completion pending and the staff-conflict/circumvention reviews keep a PENDING award unposted. On a RELEASED award, the same hold *restricts* it: its tokens stay counted in "earned" but cannot fund spending or a deficit. Recording a redemption also refuses outright while the Member is deactivated, owes a Recovery or is a merged-away identity.
5. **Correcting an erroneous redemption** is Admin or MD with a compulsory reason. This matches the existing inviter-correction authority; recording stays CRM/Admin.
6. **Redemption date** is a business day (`YYYY-MM-DD`, IST, not in the future), stored as `@db.Date`, separate from the immutable `recordedAt`.

## Review Focus

1. Redemption amount typed as `12.5`, `0`, `-3`, `1e3` or `99999999`: refuse with a reason. Pinned in Task 1 (domain) and Task 5 (service).
2. A redemption date of `2026-02-30`, an empty date or tomorrow in IST near midnight: refuse. Pinned in Task 1.
3. A double-clicked "Record" (same key) and two different keys at the same instant: one redemption, never overspent. Pinned in Task 5 (race test).
4. A Member deactivated or owing a Recovery *after* tokens were released: figures unchanged, spending refused with the reason. Pinned in Task 5.
5. A Project whose Active version predates tokens (NULL rate): the Booking Request is refused with "no Royalty token rate", not awarded 0. Pinned in Task 3.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/domain/tokens.ts` (new) | Pure rules: quantity/day validation, FIFO allocation, ledger → figures, sign per kind |
| `src/lib/domain/network.ts` (new) | Pure invite-cycle detection |
| `src/lib/domain/domain.check.ts` | Unit checks for both |
| `prisma/schema.prisma` | Drop `RoyaltyProgrammeVersion`, `RoyaltyCredit(+Event)`; add `RoyaltyAward(+Event)`, `TokenLedgerEntry`, `TokenRedemption`, `TokenAllocation`; `royaltyTokensPerAward` on settings version and Booking |
| `prisma/migrations/20261013120000_royalty_tokens/migration.sql` (new) | The DDL, plus CHECKs, partial unique index and append-only trigger |
| `prisma/constraints.sql` | Same CHECKs/indexes/trigger, idempotent; old Royalty Credit/Programme constraints removed |
| `src/lib/services/royalty-programme-service.ts` | **Deleted** |
| `src/lib/services/royalty-service.ts` | Rewritten: link → award sync, release, reversal, restoration, settle/allocation, redemption commands, read model |
| `src/lib/services/commission-settings-service.ts`, `project-service.ts`, `commission-service.ts`, `booking-service.ts` | Rate in settings; freeze on submit/resubmit; NULL-rate refusal |
| `src/lib/services/network-service.ts`, `trip-service.ts` | Self/cycle refusal at activation and inviter correction |
| `merge-service.ts`, `recovery-service.ts`, `control-review-service.ts`, `acquisition-service.ts`, `benefit-control-service.ts`, `task-service.ts`, `src/lib/tasks.ts`, `src/lib/jobs.ts`, `src/lib/rewards-overview.ts`, `report-service.ts`, `src/lib/migration/reconcile.ts` | Callers moved from Credit/Gift to Award/Token |
| `src/app/members/royalty-actions.ts`, `src/app/members/[id]/royalty-tokens.tsx` (replaces `royalty-credits.tsx`), `src/app/members/[id]/page.tsx` | Staff token section |
| `src/app/portal/page.tsx`, `portal-client.tsx` | Member token section |
| `src/app/projects/**`, `customers/[id]/page.tsx`, `bookings/*`, `calculator/*`, `rewards/page.tsx`, `dashboard/reward-cards.tsx`, `administration/*`, `reports/reports-client.tsx` | Rate display/entry; Gift wording and Programme admin removed |
| `prisma/royalty.check.ts` | Rewritten: acceptance checks 1–7 plus link cases kept |
| `prisma/members-empty.check.ts` (new) | Acceptance check 8 on a Project-free database |
| other `prisma/*.check.ts`, `seed.ts`, `seed-commission.ts`, `mock-v2-seed.ts`, `check-cleanup.ts`, `reset-data.ts`, `package.json` | Rate in fixtures, new tables in purge/reset, new script |
| `docss/1, 3, 4, 5, 6.2, 6.3, 7, 9, 10, SYSTEM_GUIDE` | Token flow, supersession notes |

---

### Task 1: Pure token and network rules

**Files:**
- Create: `src/lib/domain/tokens.ts`, `src/lib/domain/network.ts`
- Test: `src/lib/domain/domain.check.ts` (append)

**Interfaces — Produces:**
- `MAX_TOKENS: 1_000_000`
- `validateTokenQuantity(label: string, value: unknown): Check`
- `validateBusinessDay(label: string, day: string, today: string): Check`
- `type LedgerKind = "AWARD_POSTED" | "AWARD_REVERSED" | "REDEMPTION" | "REDEMPTION_CORRECTED"`; `LEDGER_SIGN: Record<LedgerKind, 1 | -1>`
- `tokenFigures(entries: readonly { kind: LedgerKind; tokens: number }[]): { earned: number; spent: number; balance: number }`
- `allocate(funding: readonly { awardId: string; free: number }[], needs: readonly { redemptionId: string; unfunded: number }[]): { awardId: string; redemptionId: string; tokens: number }[]`
- `createsInviteCycle(memberId: string, inviterId: string, inviterOf: (id: string) => string | null): boolean`

- [ ] **Step 1: Write the failing checks** (append to `domain.check.ts`, importing from `./tokens.ts` and `./network.ts`)

```ts
/* ---------------------------------------------- Royalty Tokens (docss/11) */
assert.ok(validateTokenQuantity("Tokens", 12).ok);
for (const bad of [0, -3, 12.5, Number.NaN, 1e7, "12" as unknown]) {
  assert.ok(!validateTokenQuantity("Tokens", bad).ok, `refuses ${String(bad)}`);
}
assert.ok(validateTokenQuantity("Tokens", MAX_TOKENS).ok);
assert.ok(validateBusinessDay("Redemption date", "2026-10-13", "2026-10-13").ok);
for (const bad of ["2026-10-14", "2026-02-30", "13/10/2026", "", "1999-12-31"]) {
  assert.ok(!validateBusinessDay("Redemption date", bad, "2026-10-13").ok, `refuses ${bad}`);
}
// FIFO: oldest award first; one award may part-fund; a need may span awards.
assert.deepEqual(
  allocate([{ awardId: "A", free: 10 }, { awardId: "B", free: 20 }], [{ redemptionId: "R1", unfunded: 12 }]),
  [{ awardId: "A", redemptionId: "R1", tokens: 10 }, { awardId: "B", redemptionId: "R1", tokens: 2 }]
);
assert.deepEqual(allocate([{ awardId: "A", free: 5 }], [{ redemptionId: "R1", unfunded: 3 }, { redemptionId: "R2", unfunded: 4 }]), [
  { awardId: "A", redemptionId: "R1", tokens: 3 },
  { awardId: "A", redemptionId: "R2", tokens: 2 },
]);
assert.deepEqual(allocate([{ awardId: "A", free: 0 }], [{ redemptionId: "R1", unfunded: 3 }]), []);
// Handoff example: earn 30, spend 25, invalidate 10 → 20 / 25 / −5; earn 20 → 15.
const ex = [
  { kind: "AWARD_POSTED" as const, tokens: 10 },
  { kind: "AWARD_POSTED" as const, tokens: 20 },
  { kind: "REDEMPTION" as const, tokens: -25 },
  { kind: "AWARD_REVERSED" as const, tokens: -10 },
];
assert.deepEqual(tokenFigures(ex), { earned: 20, spent: 25, balance: -5 });
assert.deepEqual(tokenFigures([...ex, { kind: "AWARD_POSTED", tokens: 20 }]), { earned: 40, spent: 25, balance: 15 });
assert.deepEqual(tokenFigures([...ex, { kind: "REDEMPTION_CORRECTED", tokens: 25 }]), { earned: 20, spent: 0, balance: 20 });
// Invite cycles: A ← B ← C. Making C the inviter of A closes a loop; self is a loop.
const up = new Map([["B", "A"], ["C", "B"]]);
const inviterOf = (id: string) => up.get(id) ?? null;
assert.ok(createsInviteCycle("A", "C", inviterOf));
assert.ok(createsInviteCycle("A", "A", inviterOf));
assert.ok(!createsInviteCycle("D", "C", inviterOf));
```

- [ ] **Step 2: Run, expect FAIL** — `node --import ./prisma/alias-loader.mjs src/lib/domain/domain.check.ts` → `Cannot find module './tokens.ts'`.

- [ ] **Step 3: Implement `src/lib/domain/tokens.ts`**

```ts
// Royalty Tokens — the pure rules (docss/11 §1, §2). Whole tokens only; the
// service decides who may act and holds the per-Member lock.
import type { Check } from "./booking.ts";

const ok: Check = { ok: true };
const fail = (reason: string): Check => ({ ok: false, reason });

/** docss/11 §2 — every token quantity is bounded to what the Int columns and CHECKs accept. */
export const MAX_TOKENS = 1_000_000;

export function validateTokenQuantity(label: string, value: unknown): Check {
  if (typeof value !== "number" || !Number.isInteger(value)) return fail(`${label} must be a whole number of tokens.`);
  if (value <= 0) return fail(`${label} must be more than 0.`);
  if (value > MAX_TOKENS) return fail(`${label} cannot be more than ${MAX_TOKENS.toLocaleString("en-IN")}.`);
  return ok;
}

/** A business day as YYYY-MM-DD: a real calendar day, not after `today` (IST), not before 2000. */
export function validateBusinessDay(label: string, day: string, today: string): Check {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail(`${label} must be a date.`);
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return fail(`${label} is not a real date.`);
  if (day > today) return fail(`${label} cannot be a future date.`);
  if (day < "2000-01-01") return fail(`${label} is too far in the past.`);
  return ok;
}

export type LedgerKind = "AWARD_POSTED" | "AWARD_REVERSED" | "REDEMPTION" | "REDEMPTION_CORRECTED";

/** The sign every entry of a kind carries, so a stored amount can never point the wrong way. */
export const LEDGER_SIGN: Record<LedgerKind, 1 | -1> = {
  AWARD_POSTED: 1,
  AWARD_REVERSED: -1,
  REDEMPTION: -1,
  REDEMPTION_CORRECTED: 1,
};

/**
 * docss/11 §1 — net valid released earnings and net completed spending after
 * traceable reversals. Balance is their difference and may be negative.
 */
export function tokenFigures(entries: readonly { kind: LedgerKind; tokens: number }[]) {
  let earned = 0;
  let spent = 0;
  for (const e of entries) {
    if (e.kind === "AWARD_POSTED" || e.kind === "AWARD_REVERSED") earned += e.tokens;
    else spent -= e.tokens;
  }
  return { earned, spent, balance: earned - spent };
}

/**
 * docss/11 §1 — oldest released tokens first, with the caller's stable order as
 * the tie-break; the same attribution clears a deficit. `funding` and `needs`
 * arrive already ordered oldest first.
 */
export function allocate(
  funding: readonly { awardId: string; free: number }[],
  needs: readonly { redemptionId: string; unfunded: number }[]
): { awardId: string; redemptionId: string; tokens: number }[] {
  const left = funding.map((f) => ({ ...f }));
  const out: { awardId: string; redemptionId: string; tokens: number }[] = [];
  for (const need of needs) {
    let rest = need.unfunded;
    for (const f of left) {
      if (rest === 0) break;
      const take = Math.min(rest, f.free);
      if (take <= 0) continue;
      out.push({ awardId: f.awardId, redemptionId: need.redemptionId, tokens: take });
      f.free -= take;
      rest -= take;
    }
  }
  return out;
}
```

- [ ] **Step 4: Implement `src/lib/domain/network.ts`**

```ts
// Who invited whom — the pure rule (docss/11 §3).

/**
 * Would recording `inviterId` as the inviter of `memberId` close a loop?
 * Walks up from the proposed inviter. Meeting the Member is a loop; meeting an
 * already-seen Member is a loop that exists already, refused rather than walked
 * forever.
 */
export function createsInviteCycle(memberId: string, inviterId: string, inviterOf: (id: string) => string | null): boolean {
  const seen = new Set<string>();
  for (let at: string | null = inviterId; at; at = inviterOf(at)) {
    if (at === memberId || seen.has(at)) return true;
    seen.add(at);
  }
  return false;
}
```

- [ ] **Step 5: Run, expect PASS** — same command → `domain.check.ts OK`.
- [ ] **Step 6: Commit** — `git add src/lib/domain/tokens.ts src/lib/domain/network.ts src/lib/domain/domain.check.ts && git commit -m "feat: Royalty Tokens — pure allocation, figures, validation and invite-cycle rules"`

---

### Task 2: Schema, migration and DB constraints

**Files:** `prisma/schema.prisma`, `prisma/migrations/20261013120000_royalty_tokens/migration.sql`, `prisma/constraints.sql`, `prisma/check-cleanup.ts`, `prisma/reset-data.ts`

**Interfaces — Produces (Prisma models):**

```prisma
// ProjectCommissionVersion
  /// docss/11 §1 — whole tokens a qualifying Royalty earns on a Booking that froze this version.
  /// Required on every version prepared since tokens; NULL only on older ones, which a
  /// Booking Request refuses to freeze.
  royaltyTokensPerAward Int?

// Booking  (replaces royaltyProgrammeVersionId / royaltyProgrammeVersion / royaltyCredit)
  /// docss/11 §1 — the token rate frozen with each Booking Request version; Accounts approves it.
  royaltyTokensPerAward Int?
  royaltyAward          RoyaltyAward?

enum RoyaltyAwardState { PENDING RELEASED REVERSED }

model RoyaltyAward {
  id                   String                   @id @default(uuid())
  customerProfileId    String
  customerProfile      CustomerProfile          @relation(fields: [customerProfileId], references: [id])
  memberProfileId      String
  memberProfile        MemberProfile            @relation(fields: [memberProfileId], references: [id])
  triggerBookingId     String                   @unique
  triggerBooking       Booking                  @relation(fields: [triggerBookingId], references: [id])
  /// The Booking Request version Accounts approved.
  bookingReviewVersion Int
  projectId            String
  project              Project                  @relation(fields: [projectId], references: [id])
  /// The saved rate, copied from the Booking; never changes.
  tokens               Int
  state                RoyaltyAwardState        @default(PENDING)
  qualificationRoute   RewardQualificationRoute
  holdReason           RewardHoldReason?
  qualifiedAt          DateTime                 @default(now())
  /// How many times it has posted (restorations post again); the ledger cycle.
  postings             Int                      @default(0)
  releasedAt           DateTime?
  /// First time any of its tokens funded spending or a deficit. Never cleared.
  consumedAt           DateTime?
  reversedAt           DateTime?
  reversalReason       String?
  createdAt            DateTime                 @default(now())
  updatedAt            DateTime                 @updatedAt
  events               RoyaltyAwardEvent[]
  ledger               TokenLedgerEntry[]
  allocations          TokenAllocation[]
  @@index([memberProfileId, state])
  @@index([customerProfileId])
}

model RoyaltyAwardEvent {
  id String @id @default(uuid())
  awardId String
  award RoyaltyAward @relation(fields: [awardId], references: [id])
  at DateTime @default(now())
  actorRef String
  action String
  fromState String?
  toState String?
  reason String?
  @@index([awardId, at])
}

enum TokenEntryKind { AWARD_POSTED AWARD_REVERSED REDEMPTION REDEMPTION_CORRECTED }

model TokenLedgerEntry {
  id              String            @id @default(uuid())
  memberProfileId String
  memberProfile   MemberProfile     @relation(fields: [memberProfileId], references: [id])
  kind            TokenEntryKind
  /// Signed by kind (LEDGER_SIGN); a CHECK enforces it.
  tokens          Int
  awardId         String?
  award           RoyaltyAward?     @relation(fields: [awardId], references: [id])
  /// The award's posting cycle for AWARD_* entries.
  cycle           Int?
  redemptionId    String?
  redemption      TokenRedemption?  @relation(fields: [redemptionId], references: [id])
  /// The entry this one reverses.
  reversesEntryId String?           @unique
  reversesEntry   TokenLedgerEntry? @relation("TokenReversal", fields: [reversesEntryId], references: [id])
  reversedBy      TokenLedgerEntry? @relation("TokenReversal")
  actorRef        String
  reason          String?
  at              DateTime          @default(now())
  @@unique([awardId, kind, cycle])
  @@unique([redemptionId, kind])
  @@index([memberProfileId, at])
}

enum TokenRedemptionState { AWAITING_MD RECORDED REJECTED CORRECTED }

model TokenRedemption {
  id               String               @id @default(uuid())
  memberProfileId  String
  memberProfile    MemberProfile        @relation(fields: [memberProfileId], references: [id])
  tokens           Int
  /// The business day it was redeemed (IST), separate from recordedAt.
  redeemedOn       DateTime             @db.Date
  recipient        RewardRecipient
  recipientName    String?
  reference        String?
  state            TokenRedemptionState
  /// The submitting command's idempotency key: a retry is never a second redemption.
  requestKey       String               @unique
  recordedByRef    String
  recordedAt       DateTime             @default(now())
  decidedByRef     String?
  decidedAt        DateTime?
  decisionNote     String?
  correctedByRef   String?
  correctedAt      DateTime?
  correctionReason String?
  ledger           TokenLedgerEntry[]
  allocations      TokenAllocation[]
  @@index([memberProfileId, state])
}

model TokenAllocation {
  id              String          @id @default(uuid())
  memberProfileId String
  awardId         String
  award           RoyaltyAward    @relation(fields: [awardId], references: [id])
  redemptionId    String
  redemption      TokenRedemption @relation(fields: [redemptionId], references: [id])
  tokens          Int
  createdAt       DateTime        @default(now())
  voidedAt        DateTime?
  voidReason      String?
  @@index([awardId])
  @@index([redemptionId])
  @@index([memberProfileId])
}
```

Relations to add: `CustomerProfile.royaltyAwards RoyaltyAward[]` (replaces `royaltyCredits`), `MemberProfile.royaltyAwards`, `tokenLedger`, `tokenRedemptions` (replaces `royaltyCredits`), `Project.royaltyAwards`. Remove `RoyaltyProgrammeVersion`, `RoyaltyCredit`, `RoyaltyCreditEvent`, `RoyaltyCreditState`. Keep `RewardHoldReason`, `RewardRecipient` and `RewardQualificationRoute` (Trip and the Royalty link share them).

- [ ] **Step 1:** Edit `schema.prisma` as above; `npx prisma validate` → valid.
- [ ] **Step 2:** Generate the DDL against the isolated test DB: `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261013120000_royalty_tokens/migration.sql`, then append the constraints block from Step 3 so `migrate deploy` ships them too.
- [ ] **Step 3:** In `constraints.sql`, delete the "part 2 — Royalty Gift" block (credit/programme indexes and stamps) and add:

```sql
-- ------------------------------------------------ Royalty Tokens (docss/11)
ALTER TABLE "ProjectCommissionVersion" DROP CONSTRAINT IF EXISTS "royalty_tokens_range";
ALTER TABLE "ProjectCommissionVersion" ADD CONSTRAINT "royalty_tokens_range"
  CHECK ("royaltyTokensPerAward" IS NULL OR "royaltyTokensPerAward" BETWEEN 1 AND 1000000);
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_royalty_tokens_range";
ALTER TABLE "Booking" ADD CONSTRAINT "booking_royalty_tokens_range"
  CHECK ("royaltyTokensPerAward" IS NULL OR "royaltyTokensPerAward" BETWEEN 1 AND 1000000);
ALTER TABLE "RoyaltyAward" DROP CONSTRAINT IF EXISTS "royalty_award_shape";
ALTER TABLE "RoyaltyAward" ADD CONSTRAINT "royalty_award_shape" CHECK (
  "tokens" BETWEEN 1 AND 1000000 AND "postings" >= 0
  AND ("state" <> 'RELEASED' OR ("releasedAt" IS NOT NULL AND "postings" > 0))
  AND ("state" <> 'REVERSED' OR "reversedAt" IS NOT NULL));
-- SSOT §74 — one live award per Customer (the one lifetime opportunity).
CREATE UNIQUE INDEX IF NOT EXISTS "one_live_royalty_award_per_customer"
  ON "RoyaltyAward" ("customerProfileId") WHERE "state" <> 'REVERSED';
ALTER TABLE "TokenLedgerEntry" DROP CONSTRAINT IF EXISTS "token_entry_shape";
ALTER TABLE "TokenLedgerEntry" ADD CONSTRAINT "token_entry_shape" CHECK (
  abs("tokens") BETWEEN 1 AND 1000000
  AND (("kind" IN ('AWARD_POSTED', 'REDEMPTION_CORRECTED')) = ("tokens" > 0))
  AND (("kind" IN ('AWARD_POSTED', 'AWARD_REVERSED')) = ("awardId" IS NOT NULL AND "cycle" IS NOT NULL))
  AND (("kind" IN ('REDEMPTION', 'REDEMPTION_CORRECTED')) = ("redemptionId" IS NOT NULL)));
-- Append-only: an entry is never changed. (Purge/reset scripts may still delete test data.)
CREATE OR REPLACE FUNCTION token_ledger_no_update() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Token ledger entries are append-only; record a reversal instead.'; END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS token_ledger_append_only ON "TokenLedgerEntry";
CREATE TRIGGER token_ledger_append_only BEFORE UPDATE ON "TokenLedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION token_ledger_no_update();
ALTER TABLE "TokenRedemption" DROP CONSTRAINT IF EXISTS "token_redemption_shape";
ALTER TABLE "TokenRedemption" ADD CONSTRAINT "token_redemption_shape" CHECK (
  "tokens" BETWEEN 1 AND 1000000
  AND ("recipient" = 'SELF' OR length(btrim(coalesce("recipientName", ''))) > 0)
  AND ("state" <> 'CORRECTED' OR ("correctedAt" IS NOT NULL AND length(btrim(coalesce("correctionReason", ''))) > 0)));
ALTER TABLE "TokenAllocation" DROP CONSTRAINT IF EXISTS "token_allocation_positive";
ALTER TABLE "TokenAllocation" ADD CONSTRAINT "token_allocation_positive" CHECK ("tokens" BETWEEN 1 AND 1000000);
```

- [ ] **Step 4:** `check-cleanup.ts`: replace the Royalty Credit purge with awards (by trigger booking or member), their events, ledger entries, allocations and redemptions of purged Members (delete order: allocations → ledger → redemptions → award events → awards). `reset-data.ts`: same tables, and drop `royaltyProgrammeVersion`.
- [ ] **Step 5:** On the test DB: `npx prisma db push --skip-generate && npm run db:constraints && npx prisma generate` → success; `npx tsc --noEmit` now lists every caller to fix (expected; fixed in Tasks 3–7).
- [ ] **Step 6:** Commit with Task 3 (the tree does not type-check until callers move).

---

### Task 3: Token rate in Project settings and the Booking freeze

**Files:** `src/lib/services/commission-settings-service.ts`, `src/lib/services/project-service.ts`, `src/lib/services/commission-service.ts`, `src/lib/services/booking-service.ts`, `src/lib/jobs.ts`; delete `src/lib/services/royalty-programme-service.ts`; `prisma/seed.ts`, `prisma/seed-commission.ts`, every `prisma/*.check.ts` and `prisma/mock-v2-seed.ts` call that prepares a version.

**Interfaces:**
- `CommissionVersionInput` gains `royaltyTokensPerAward: number` (required).
- `freezeAtSubmission(...)` returns `royaltyTokensPerAward: number` instead of `royaltyProgrammeVersionId`.
- `reviewSnapshot({... royaltyTokensPerAward: number })` replaces `royaltyProgrammeVersionId`.

- [ ] **Step 1: Failing check** in `prisma/commission-settings.check.ts`: `prepareCommissionDraft({...terms, royaltyTokensPerAward: 0})` rejects `/Royalty tokens/`; `2.5` rejects; `10` saves and the row stores 10. In `prisma/booking.check.ts`: create a version row with `royaltyTokensPerAward: null` made ACTIVE through the DB, then `submitBookingRequest` rejects `/no Royalty token rate/`; with a rate of 10 the Booking stores `royaltyTokensPerAward = 10` and the review snapshot carries it; after a new version with 20 is activated, the earlier request is unchanged and a resubmission (`editBookingRequest`) freezes 20.
- [ ] **Step 2: Implement.**
  - `checkPreparable`: `const rate = validateTokenQuantity("Royalty tokens per qualifying purchase", input.royaltyTokensPerAward); if (!rate.ok) blocked(rate.reason);`
  - `termsData`: `royaltyTokensPerAward: t.royaltyTokensPerAward`.
  - `sendCommissionVersion` task text: `` `. Royalty ${version.royaltyTokensPerAward} tokens` `` after Loyalty.
  - `decideCommissionVersion` audit `after`: `royaltyTokensPerAward: version.royaltyTokensPerAward`.
  - `freezeAtSubmission`: drop `liveRoyaltyProgramme`; `if (version.royaltyTokensPerAward === null) blocked("This Project's approved settings have no Royalty token rate. Admin must prepare a new settings version with one and MD approve it before a Booking Request can be submitted.");` return `royaltyTokensPerAward: version.royaltyTokensPerAward`.
  - `booking-service.ts`: in the four writes and both `reviewSnapshot` calls replace `royaltyProgrammeVersionId` with `royaltyTokensPerAward`; the type field becomes `/** docss/11 — the Royalty token rate this request version froze. */ royaltyTokensPerAward: number;`.
  - `jobs.ts`: drop `activateDueRoyaltyProgrammes`.
  - Delete `royalty-programme-service.ts`.
  - Fixtures: every prepared version passes `royaltyTokensPerAward: 10` (mock seed: Project A 10, B 20, C 15, D 10, E 5); `seed.ts`/`seed-commission.ts` direct creates get `royaltyTokensPerAward: 10`.
- [ ] **Step 3: Run** `npm run commission-settings:check && npm run booking:check` on the test DB → OK.
- [ ] **Step 4: Commit** (together with Task 2's schema): `feat: Royalty Tokens — schema, rate on Project settings, frozen per Booking Request version`.

---

### Task 4: Award lifecycle — qualification, release, holds, reversal, restoration

**Files:** `src/lib/services/royalty-service.ts` (rewrite), `src/lib/services/network-service.ts`, `merge-service.ts`, `recovery-service.ts`, `control-review-service.ts`, `acquisition-service.ts`, `benefit-control-service.ts`

**Interfaces — Produces (royalty-service):**
- `AWARD_RECORD_KIND = "Royalty Award"`, `REDEMPTION_RECORD_KIND = "Token Redemption"`, `NOMINEE_APPROVAL_PURPOSE = "REWARD_NOMINEE_APPROVAL"`
- `originalPurchasesOf(tx, personId)` (unchanged)
- `syncRoyaltyReward(tx, customerPersonId, actorRef): Promise<string | null>`. The link → award sync is the same entry point the rest of the code already calls.
- `refreshAward(tx, awardId, actorRef): Promise<void>`: recompute the hold, post if PENDING and clear, then settle.
- `refreshAwardsOfMember(tx, memberPersonId, actorRef): Promise<number>` (replaces `refreshCreditsOfMember`)
- `refreshAwardOfBooking(tx, bookingId, actorRef): Promise<void>` (replaces `refreshCreditOfBooking`)
- `reverseLiveAward(tx, customerProfileId, actorRef, reason): Promise<void>` (replaces `reverseUndeliveredCredit`)
- `touchesConsumedAward(tx, bookingId): Promise<boolean>` (replaces `touchesDeliveredGift`; a Sold By Correction touching a consumed award needs MD)
- internal: `lockMember(tx, memberProfileId)` = `lockKey(tx, \`royalty-tokens:${id}\`)`; `settleMember(tx, memberProfileId)`; `postAward`; `reverseAward`.

**Rules (each with its check in Task 6):**
1. *Qualification*: same as today. The original Primary Customer's link must be final with a Member. The candidate is the earliest (by Booking Number) original purchase other than the first, Sold By 3% Club, not cancelled, with `royaltyTokensPerAward` set, that qualifies by 100% Payment Received or by an Approved Buyback after 25%. If the opportunity is unused, the first such candidate creates the award (or reuses the reversed row for the same Booking, keeping its saved `tokens`) as PENDING. The Customer's `royaltyOpportunityConsumedAt` is set and an event is recorded. A merged-away identity, or one whose merged identity already consumed it, earns nothing (as today).
2. *Restoration of a consumed award*: if the opportunity is consumed and no award is live, only the consumed award itself may come back. That happens when its own Booking qualifies again and the link is still final to the same Member. Same row, same `tokens`, state PENDING, event `RESTORED`.
3. *Validity*: a live (PENDING/RELEASED) award stays only while the link is final to its Member and its Booking still qualifies. Otherwise `reverseAward` runs with the reason.
4. *`reverseAward`* (under member lock): if RELEASED, insert `AWARD_REVERSED` (−tokens, `cycle = postings`, `reversesEntryId` = that cycle's `AWARD_POSTED` id), void its active allocations (`voidReason`), then settle. In every case set state REVERSED, `reversedAt`, `reversalReason`, `holdReason = null`. If `consumedAt` is null, reopen the Customer's opportunity; otherwise it stays consumed. Exactly once: an already-REVERSED award returns early, and `@@unique([awardId, kind, cycle])` backs it.
5. *Hold* (first applying): Recovery Outstanding (`outstandingRecovery`), Member Deactivated, `BUYBACK_STABLE_COMPLETION_PENDING` (route needs it, Booking below 100%, no stable Buyback), then `controlHoldReason({ recordKind: "Royalty Award", ... })`.
6. *`refreshAward`* (under member lock): skip REVERSED. Store the hold if it changed (event `HELD`/`CLEARED`). If PENDING and clear, post: `postings + 1`, insert `AWARD_POSTED` (+tokens, cycle), RELEASED, `releasedAt = now`, event `POSTED`. Then settle.
7. *`settleMember`* (caller holds lock): funding = RELEASED awards with `holdReason = null` and free > 0, ordered by `releasedAt, id`. Needs = RECORDED redemptions with unfunded > 0, ordered by `recordedAt, id`. `allocate()`, insert the rows, and set `consumedAt = now` on every funding award used that has none.
8. *Lock order*: the Customer lock (`royalty:<customerProfileId>`, taken by sync) comes before the Member lock. Nothing takes a Customer lock while holding a Member lock.

Callers:
- `network-service.relinkAfterSoldByCorrection`: `reverseUndeliveredCredit` → `reverseLiveAward`.
- `merge-service.dedupeAfterMerge`: of two consumed opportunities, call `reverseLiveAward` on the later one. Being a duplicate makes it invalid, so it reverses even if spent (spec §1), and the deficit stays non-cash.
- `recovery-service`: `refreshCreditsOfMember` → `refreshAwardsOfMember`.
- `control-review-service.refreshBenefit`: `"Royalty Award"` → `refreshAward`.
- `acquisition-service`: `refreshCreditOfBooking` → `refreshAwardOfBooking`.
- `benefit-control-service.BenefitRef.recordKind`: `"Royalty Credit"` → `"Royalty Award"`.
- `booking-service` Sold By Correction: `touchesDeliveredGift` → `touchesConsumedAward`.

- [ ] Steps: write the Task 6 cases for rules 1–8 first (they fail against the stub), implement, run `npm run royalty:check`, commit `feat: Royalty Tokens — awards earn, post, hold, reverse and restore through an append-only ledger`.

---

### Task 5: Redemptions, corrections and the read model

**Files:** `src/lib/services/royalty-service.ts`, `src/app/members/royalty-actions.ts` (rewrite)

**Interfaces — Produces:**
- `recordTokenRedemption(args: Actor & { memberProfileId: string; tokens: number; redeemedOn: string; recipient: RewardRecipient; recipientName: string; reference: string }): Promise<{ redemptionId: string; state: "RECORDED" | "AWAITING_MD" }>`
- `decideTokenRedemption(args: Actor & { redemptionId: string; approve: boolean; note: string })`: MD only.
- `correctTokenRedemption(args: Actor & { redemptionId: string; reason: string })`: Admin or MD.
- `tokenPosition(tx, memberProfileId): Promise<{ earned: number; spent: number; balance: number; available: number; restricted: number; memberHold: string | null }>`
- `tokenBlockers(position): string[]`: staff-facing reasons.
- `memberTokenView(memberProfileId, audience: "STAFF" | "MEMBER")`: figures, redemptions (MEMBER: RECORDED only, `{ tokens, redeemedOn }`), STAFF extras (all redemptions with state/recipient/reference/correction, awards with Booking/Customer/Project/tokens/state/hold/consumed, `canRecordUpTo`, blockers).
- `"use server"` actions: `recordTokenRedemptionAction`, `decideTokenRedemptionAction`, `correctTokenRedemptionAction`, `tokenAvailabilityAction(memberProfileId)` (read-only pre-check for staff before they finalise the external redemption).

**Rules:**
1. `recordTokenRedemption`: roles CRM/ADMIN; `validateTokenQuantity`; `validateBusinessDay(redeemedOn, istDay(now))`; recipient name required unless SELF; `assertIndependent` against the Member's Person. Then `runCommand` (`TOKEN_REDEMPTION_RECORD`), and inside it:
   - Lock the Member and refuse a merged-away identity.
   - `refreshAward` every live award, which rechecks the holds and may post.
   - Read `tokenPosition`. Refuse on `memberHold`, or when `tokens > available`, with the blockers as the message.
   - NON_FAMILY: insert AWAITING_MD and raise an NT10 task to MD. No ledger entry.
   - Otherwise insert RECORDED (`requestKey = idempotencyKey`), insert the `REDEMPTION` entry (−tokens), then settle (fully funded by construction).
   - Audit.
2. `decideTokenRedemption`: MD only, `assertIndependent`, compulsory note. Under the lock, the redemption must be AWAITING_MD. Approve repeats rule 1's refresh and position check, then records it. Reject sets REJECTED. Either way the NT10 task closes.
3. `correctTokenRedemption`: Admin/MD, compulsory reason. Under the lock the redemption must be RECORDED. Insert `REDEMPTION_CORRECTED` (+tokens, `reversesEntryId` = its `REDEMPTION` entry), void its allocations, set CORRECTED with who/when/why, then settle, which may fund older deficits. `consumedAt` on the awards stays.
4. `tokenPosition`:
   - `earned`, `spent` and `balance` come from `tokenFigures` over the Member's ledger.
   - `free(award) = tokens − Σ active allocations` for RELEASED awards.
   - `available = Σ free(holdReason = null) − Σ unfunded(RECORDED)`.
   - `restricted = Σ free(holdReason ≠ null)`.
   - `memberHold` is DEACTIVATED, RECOVERY_OUTSTANDING or MERGED_AWAY.

- [ ] Steps: write the Task 6 redemption/race/position cases first, implement, run, commit `feat: Royalty Tokens — record, approve, correct redemptions with FIFO provenance`.

---

### Task 6: Acceptance checks (spec §5, cases 1–7) — `prisma/royalty.check.ts` rewrite

Keep the harness (`TAG = "ZZ-ROY"`, `person`, `member`, `plot`, `book`, `pay`, `buyback`). Drop the Programme helpers. Add `project(code, rate)`, which creates a Project with a published PLC and an approved version at `rate` through the services. Add `position(memberProfileId)` and `invariants(memberProfileId)`. `invariants` asserts:
- Σ active allocations ≤ tokens for every award, and ≤ the amount for every redemption.
- No eligible free tokens while a RECORDED redemption is unfunded.
- `Σ ledger = earned − spent`.
- Every REVERSED award has as many `AWARD_REVERSED` entries as postings.

Cases (each an `assert` block):
1. **Pooling.** Member M links two Customers (first purchase Sold By M, paid 100%). Each makes a Club-direct repeat: one in Project A (rate 10), one in Project B (20), each paid 100%. Then: earned 30, spent 0, balance 30, with no approval step. Record 12 (SELF, today): earned 30, spent 12, balance 18. The Member view lists `{ tokens: 12, redeemedOn: today }`, and allocations are A:10, B:2 (FIFO by release).
2. **Frozen rate.** A request on Project A is submitted, A gets a new approved version at 20, then the request is approved and paid: the award is 10. A new request on A freezes 20.
3. **Holds and Buyback.**
   - A repeat at 30% with an Approved Buyback gives a PENDING award held `BUYBACK_STABLE_COMPLETION_PENDING`; figures are unchanged. Payment Given 100% plus papers returned: posted once (one `AWARD_POSTED`); a second `refreshAward` adds nothing.
   - Deactivate M: a redemption is refused `/inactive|Deactivated/` and the figures are unchanged. Reactivate: allowed.
   - With an open Recovery for M: refused `/Recovery/`.
4. **Idempotency and races.**
   - The same `idempotencyKey` twice gives one redemption.
   - Re-running `syncRoyaltyReward` and `refreshAward` five times adds no entries.
   - Two `recordTokenRedemption` calls with different keys, each for the full available amount, run via `Promise.allSettled`: exactly one fulfils and `invariants` holds.
   - A redemption raced against `cancelBooking` + `decideCancellation` of a funding award's Booking: whichever wins, `invariants` holds and the reversal entry exists exactly once.
5. **Cancellation timing.**
   - Before release (Buyback-pending award, Buyback cancelled): award REVERSED, no ledger entries, opportunity reopened.
   - After release, before spending (payment corrected below 100%): one `AWARD_REVERSED`, earned back to its prior value, opportunity reopened.
   - After partial spending, using the spec example: awards 10 then 20, spend 25, invalidate the 10. Earned 20, spent 25, balance −5, the 10-award `consumedAt` set and its opportunity still consumed. A new 20 award gives balance 15, with an allocation of 5 from it to the deficit and its `consumedAt` set.
   - After full spending: reversal recorded once; spending refused while the balance is ≤ 0.
6. **Requalification and corrections.**
   - A reversed unconsumed award whose Booking pays back to 100% returns as the same row with the same tokens.
   - A consumed reversed award requalifies to the same row and posts a second cycle.
   - Correcting a redemption gives back exactly its tokens and leaves `consumedAt` set.
   - A Sold By Correction on the first purchase of a Customer whose award was consumed moves no tokens to the new Member, and the opportunity stays consumed.
   - Merging two Customers who each consumed an opportunity reverses the later award once, and the survivor shows one consumed opportunity.
7. **Boundaries.**
   - Grep-style asserts that there is no expiry job for tokens and no cash or Recovery row created by a deficit (`recovery.count` unchanged).
   - No API moves tokens between Members (the service exposes none, and a redemption only debits its own Member).
   - `recordTokenRedemption` as role `ACCOUNTS` or `MEMBER` is refused.
   - `memberTokenView` of Member X never includes Member Y's rows.
   - The portal page reads only `requireMember().memberProfileId` (source assert in `security.check.ts`).

Kept from the old file, with their token equivalents: ROY-01/02/03/07/08/09/10/13, BB-05/06/09, COR-06, and the ROYALTY report (now `tokens` and `awardState`, no rate/amount/percent column).

- [ ] Run on the test DB: `npm run royalty:check` → `royalty.check.ts OK`. Commit with Task 5.

---

### Task 7: Members without Projects; self-referral and cycles

**Files:** `src/lib/services/network-service.ts` (`activateMember`), `src/lib/services/trip-service.ts` (`correctInviter`), `prisma/members-empty.check.ts` (new), `package.json` (`members-empty:check`)

- [ ] **Step 1 (failing check)** `members-empty.check.ts` refuses to run unless `project.count() === 0` (it is for the Project-free database). It then:
  - creates A, then B invited by A, then C invited by B (`createAndActivateMember` through the service);
  - shows `memberTokenView` figures 0/0/0 for each, and that `royaltyAward.count`, `tokenLedgerEntry.count` and `tripCredit.count` are 0;
  - checks that `correctInviter(A → C)` is refused `/loop|cycle/` and `correctInviter(A → A)` is refused;
  - checks that activating an existing Person with `invitedByMemberId` equal to their own profile is refused.
- [ ] **Step 2:** In `activateMember`, before writing:
  - `if (person.memberProfile && args.invitedByMemberId === person.memberProfile.id) blocked("A Member cannot be their own inviter.");`
  - `if (person.memberProfile && args.invitedByMemberId && createsInviteCycle(person.memberProfile.id, args.invitedByMemberId, inviterOf)) blocked("That inviter would make a loop in who invited whom.");`
  - `inviterOf` comes from `tx.memberProfile.findMany({ select: { id: true, invitedByMemberId: true } })` as a Map. Mark it `// ponytail: loads every Member's inviter; walk by query if the network outgrows memory`.
  - Do the same in `correctInviter` inside its transaction.
- [ ] **Step 3:** Create the empty DB, then run: `createdb crm_empty`, `db push`, constraints, and `npm run members-empty:check` with `DATABASE_URL` pointing at it → OK.
- [ ] **Step 4:** Commit: `feat: refuse self-referral and invite cycles; verify Members on a Project-free database`.

---

### Task 8: Staff screens

**Files:**
- `src/app/projects/[id]/commission-settings.tsx`, `src/app/projects/[id]/page.tsx`, `src/app/projects/actions.ts`, `src/app/projects/projects-client.tsx`
- `src/app/members/[id]/royalty-tokens.tsx` (new; delete `royalty-credits.tsx`), `src/app/members/[id]/page.tsx`, `src/app/members/[id]/trip-section.tsx`
- `src/app/customers/[id]/page.tsx`
- `src/app/bookings/load.ts`, `src/app/bookings/bookings-client.tsx`, `src/app/bookings/actions.ts`
- `src/app/calculator/page.tsx`, `src/app/calculator/calculator-client.tsx`
- `src/app/rewards/page.tsx`, `src/app/dashboard/reward-cards.tsx`, `src/lib/rewards-overview.ts`
- `src/app/administration/page.tsx`; delete `royalty-programmes.tsx` and `royalty-actions.ts`
- `src/app/reports/reports-client.tsx`, `src/lib/services/report-service.ts`
- `src/lib/tasks.ts`, `src/lib/services/task-service.ts`, `src/lib/migration/reconcile.ts`

**Changes by screen:**
- **Project settings card and form.**
  - `CommissionVersionView` gains `royaltyTokensPerAward: number | null`. The `Terms` "Royalty Gift Programme (company-wide)" row becomes Section "Royalty Tokens": "Tokens per qualifying Royalty" shows N, or "Not set — Booking Requests blocked" when null.
  - `useCommercialRewardsDraft` gets a `Field label="Royalty tokens per qualifying purchase"` (`inputMode="numeric"`). It starts from `start?.royaltyTokensPerAward ?? ""` and its problem text comes from `validateTokenQuantity`. The value is sent as `royaltyTokensPerAward: Number(x)`.
  - The `royaltyProgramme` prop and `RoyaltyProgrammeRef` are removed. The history summary adds `· Royalty N`.
- **Member profile.**
  - The Section "Royalty Tokens" renders `<RoyaltyTokens view={memberTokenView(id, "STAFF")} role />`.
  - It shows the three figures (signed balance), then "Tokens spent" listing each RECORDED redemption's tokens and date (plus recipient/reference for staff), then AWAITING_MD and CORRECTED/REJECTED rows marked.
  - Buttons: "Record redemption" (CRM/Admin). Its dialog shows "Up to N tokens can be recorded now", or the blockers, from `tokenAvailabilityAction`; it collects tokens, date, recipient (+name), reference. "Approve"/"Reject" for MD on AWAITING_MD rows. "Correct" for Admin/MD on RECORDED rows (reason required).
  - Then an "Awards (internal)" table: Customer, Booking, Project, tokens, state, hold reason, consumed. It has no total.
  - `REWARD_HOLD_LABEL` moves to this file; `trip-section.tsx` and `rewards/page.tsx` import it from here.
  - The linked-customers line "can still earn a Gift" becomes "can still earn tokens".
- **Customer profile.** "Royalty opportunity" is Consumed/Unused, with a hint of the award state and `N tokens`, or "Tokens for the linked Member on the first Club-direct repeat purchase".
- **Bookings.** The focus row shows `Royalty tokens N` (the frozen rate). The reward summary row becomes `kind: "Royalty Tokens"`, with detail `N tokens · state · hold`.
- **Calculator.** The page loads each Project's Active `royaltyTokensPerAward`. The note becomes "Royalty: N tokens per qualifying purchase (non-cash)".
- **Rewards page.** The tab "Royalty Gifts" becomes "Royalty Tokens". It lists awards PENDING or restricted (Member, Customer, Booking, tokens, hold) and redemptions AWAITING_MD.
- **Dashboard.** The cards become "Royalty awards on hold" and "Token redemptions awaiting MD". `rewardCounts` returns `royaltyAwardsHeld` and `redemptionsAwaitingMd`.
- **Administration.** The Programme section is removed.
- **Reports.** ROYALTY columns: customer, linked Member, relationship, finalised by, opportunity, trigger booking, project, `awardTokens`, `awardState`, `holdReason`. The label note becomes "…and the Royalty tokens it led to".
- **tasks.ts / task-service.** The kinds "Royalty Award" and "Token Redemption" route to the Member page. The "Royalty Programme" kind is dropped.
- **reconcile.ts.** The Gift checks become token invariants (the Task 6 `invariants` logic), reported per Member.

- [ ] Steps: implement; `npx tsc --noEmit` → clean; commit `feat: Royalty Tokens — staff screens, reports, dashboard; Gift Programme admin removed`.

---

### Task 9: Member portal

**Files:** `src/app/portal/page.tsx`, `src/app/portal/portal-client.tsx`, `src/lib/security/security.check.ts`

- `PortalData`:
  - `royaltyCredits` is replaced by `tokens: { earned: number; spent: number; balance: number; redemptions: { tokens: number; redeemedOn: string }[]; notice: string | null }`.
  - These come from `memberTokenView(member.memberProfileId, "MEMBER")`. `notice` is Member-safe:
    - "Spending is paused while your membership is inactive."
    - "Spending is paused while an amount is being recovered."
    - "Some tokens are under review and cannot be used yet."
    - "Your balance is below zero by N tokens. Tokens you earn next will cover this first."
- Rewards tab:
  - "Royalty Relationship Reward" keeps the relationship counts, with "Can still earn tokens".
  - The Gift cards become three figure tiles (Tokens earned / Tokens spent / Token balance, signed), then "Tokens spent" with one row per redemption (tokens, date), then `notice`.
  - Copy: "Tokens are earned when a final linked Customer's first direct personal purchase through 3% Club qualifies. They do not expire and have no cash value."
- `security.check.ts`: assert that the portal source never selects `royaltyAward` or `tokenRedemption` without the Member's own id. Assert on `memberTokenView(member.memberProfileId`.
- [ ] `npm run check` → OK; commit `feat: Member portal shows Tokens earned, spent and balance`.

---

### Task 10: Mock data and documentation

**Files:**
- Fixtures: `prisma/mock-v2-seed.ts`, `docss/9. Business_Model_v2_Mock_Data_Key.md` (rewritten by the seed)
- Docs: `docss/1`, `docss/3. …Change_Pack`, `docss/3. …Master Handoff Pack`, `docss/2`, `docss/4`, `docss/5`, `docss/6.2`, `docss/6.3`, `docss/7`, `docss/8`, `docss/10`, `docss/SYSTEM_GUIDE.md`

- **Mock seed:**
  - Drop RGP. Rates: A 10, B 20, C 15, D 10, E 5.
  - M-005 (Pooja) earns 10 from A (C-009's Club-direct repeat at 100%) and 20 from B (RR-002 repeat in B at 100%), then 12 is recorded as spent (SELF): **30 / 12 / 18**.
  - RR-003 has a Buyback-pending award (held, not counted).
  - M-001 shows the spec's negative example: awards 10 + 20, spend 25, the 10-award Booking cancelled, giving **20 / 25 / −5**.
  - One non-family redemption waits for MD.
  - The wipe also removes token rows for its own Members. The seed refuses a production DB via the existing `assertCheckDatabase`; there is no unconditional reset.
- **Docs:**
  - `docss/1`, `3 Change Pack`, `5`, `6.2`, `7`, `10` and `SYSTEM_GUIDE`: rewrite the Royalty reward sections to the token flow (rate per Project version, frozen per request version, pending → posted, holds, pooled balance, redemption recording, deficits, permanent consumption). Every changed section is headed "Royalty Tokens (docss/11 supersedes the Gift wording)".
  - `6.2` becomes "Royalty Token Terms", with its content strictly from docss/11; `6.3` index updated.
  - `2`, `3 Master Handoff Pack`, `4` and `8` get a top-of-file supersession note naming the sections that are now token-based. `4` UAT Royalty cases point to docss/11 §5.
  - `docss/9` is regenerated by the seed.
- [ ] Run `npm run seed:mock-v2` on the test DB → completes; commit `chore: token mock fixtures and documentation`.

---

### Task 11: Full verification

- [ ] `npm run check` (tasks, security, domain unit checks + `tsc --noEmit`) → all OK.
- [ ] On the isolated DB (`postgresql://postgres@localhost:55432/crm_test`, schema via `db push` + `db:constraints` + `db:seed`): `node --env-file=.env prisma/db.check.ts` and every `*:check` in `db:check`. Expected: all OK except the pre-existing `plc:check` failure (a Project Code trigger missing from `constraints.sql`; it fails identically before this work).
- [ ] `npm run members-empty:check` on `crm_empty` → OK.
- [ ] `npm run build:check` → compiles.
- [ ] Screens: `next dev` on the isolated DB after `seed:mock-v2`.
  - As Admin: the Project create form needs the token rate, and the settings card shows it.
  - As CRM: the M-005 profile shows 30 / 12 / 18; recording 19 is refused and 18 is accepted.
  - As MD: the M-001 profile shows −5 and approve/reject works.
  - As Member M-005 in the portal: three figures and the redemption row.
- [ ] Report exact commands and results; nothing unrun is claimed.
