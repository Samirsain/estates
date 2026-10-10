// Release controls on every benefit — Change Pack §55, §58, §65 (NT08, NT09),
// §78; SSOT §92, §95.
//
// Each engine (Direct/Loyalty/Buying, Trip, Royalty) asks `controlHolds` before
// it lets a benefit go. A staff Person, or a declared close relative of one,
// waits for MD (NT09). A Person who shares a bank account, the primary mobile
// or the address with someone owing a Recovery waits for Accounts/MD (NT08) —
// never denied automatically. The decisions live in control-review-service.

import { db } from "@/lib/db";
import { recordAudit } from "@/lib/security/audit";
import { blocked, type Tx } from "./command";
import { closeTasksFor, ensureTask } from "./task-service";

/** Task record kinds; both open on the Rewards page's Reviews tab. */
export const STAFF_CONFLICT_KIND = "Staff Conflict";
export const CIRCUMVENTION_KIND = "Circumvention Review";
export const STAFF_CONFLICT_PURPOSE = "STAFF_CONFLICT_REVIEW";
export const CIRCUMVENTION_PURPOSE = "RECOVERY_CIRCUMVENTION_REVIEW";

export type BenefitRef = {
  recordKind: "Commission" | "Trip Reward" | "Royalty Credit";
  recordId: string;
  personId: string;
  recordName: string;
};

/** One real person — the survivor and every identity merged into it (SSOT §100). */
export async function identityIds(tx: Tx, personId: string): Promise<string[]> {
  const person = await tx.person.findUniqueOrThrow({ where: { id: personId }, select: { survivingPersonId: true } });
  const root = person.survivingPersonId ?? personId;
  const merged = await tx.person.findMany({ where: { survivingPersonId: root }, select: { id: true } });
  return [root, ...merged.map((p) => p.id)];
}

/** CP §58 — the staff Persons a benefit to this Person conflicts with: themself, or whose declared relative they are. */
export async function conflictStaffOf(tx: Tx, personId: string): Promise<string[]> {
  const ids = await identityIds(tx, personId);
  const [staff, relatives] = await Promise.all([
    tx.staffAccount.findMany({ where: { personId: { in: ids } }, select: { personId: true } }),
    tx.staffRelative.findMany({ where: { relativePersonId: { in: ids }, endedAt: null }, select: { staffPersonId: true } }),
  ]);
  return [...new Set([...staff.map((s) => s.personId), ...relatives.map((r) => r.staffPersonId)])];
}

/** CP §58, NT09 — held until MD approves this benefit; the review is raised once. */
async function staffConflictHeld(tx: Tx, ref: BenefitRef): Promise<boolean> {
  const staffPersonIds = await conflictStaffOf(tx, ref.personId);
  if (staffPersonIds.length === 0) {
    // The declaration ended before MD decided: the review has nothing left to decide.
    const stale = await tx.staffConflictReview.findUnique({
      where: { recordKind_recordId: { recordKind: ref.recordKind, recordId: ref.recordId } },
    });
    if (stale?.status === "PENDING") {
      const note = "The conflict no longer applies — the staff-relative declaration ended.";
      await tx.staffConflictReview.update({
        where: { id: stale.id },
        data: { status: "CANCELLED", decidedByRef: "SYSTEM", decidedAt: new Date(), decisionNote: note },
      });
      await closeTasksFor(tx, STAFF_CONFLICT_KIND, stale.id, "SYSTEM", note, STAFF_CONFLICT_PURPOSE);
    }
    return false;
  }
  const review = await tx.staffConflictReview.upsert({
    where: { recordKind_recordId: { recordKind: ref.recordKind, recordId: ref.recordId } },
    create: { recordKind: ref.recordKind, recordId: ref.recordId, personId: ref.personId, staffPersonIds },
    update: {},
  });
  if (review.status === "APPROVED") return false;
  if (review.status === "PENDING") {
    await ensureTask(tx, {
      recordKind: STAFF_CONFLICT_KIND,
      recordId: review.id,
      recordName: ref.recordName,
      purpose: STAFF_CONFLICT_PURPOSE,
      title: "Staff / Relative Benefit Conflict Review",
      assigneeRole: "MD",
      dueAt: new Date(),
      decision: true,
      latestResult:
        "This benefit would go to staff or a declared close relative of staff. It is held until MD approves; " +
        "the conflicted staff member cannot approve or process it.",
    });
  }
  return true;
}

const digits = (mobile: string | null) => (mobile ?? "").replace(/\D/g, "").slice(-10);
const place = (p: { addressLine: string | null; city: string | null }) =>
  p.addressLine?.trim() ? `${p.addressLine} ${p.city ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";

/**
 * CP §55, NT08 — looks for a Person owing a Recovery who shares a bank account,
 * the primary mobile or the address with this one, opens one review per
 * Recovery found, and says whether any still holds. A Restricted review holds
 * while its Recovery is outstanding; a Cleared one never does.
 */
async function circumventionHeld(tx: Tx, personId: string, recordName: string): Promise<boolean> {
  const ids = await identityIds(tx, personId);
  const recoveries = await tx.recovery.findMany({
    where: { status: "OUTSTANDING", personId: { notIn: ids } },
    include: { person: { select: { primaryMobile: true, addressLine: true, city: true } } },
  });
  if (recoveries.length === 0) return false;

  const subject = await tx.person.findUniqueOrThrow({ where: { id: ids[0] }, select: { primaryMobile: true, addressLine: true, city: true } });
  const indexOf = async (personIds: string[]) =>
    new Set(
      (
        await tx.bankDetail.findMany({
          where: { personId: { in: personIds }, accountBlindIndex: { not: null } },
          select: { accountBlindIndex: true },
        })
      ).map((b) => b.accountBlindIndex!)
    );
  const subjectBanks = await indexOf(ids);

  for (const recovery of recoveries) {
    const indicators: ("BANK_ACCOUNT" | "MOBILE" | "ADDRESS")[] = [];
    if ([...(await indexOf([recovery.personId]))].some((i) => subjectBanks.has(i))) indicators.push("BANK_ACCOUNT");
    if (digits(subject.primaryMobile).length === 10 && digits(subject.primaryMobile) === digits(recovery.person.primaryMobile)) {
      indicators.push("MOBILE");
    }
    if (place(subject) && place(subject) === place(recovery.person)) indicators.push("ADDRESS");
    if (indicators.length === 0) continue;

    const review = await tx.circumventionReview.upsert({
      where: { subjectPersonId_recoveryId: { subjectPersonId: ids[0], recoveryId: recovery.id } },
      create: { subjectPersonId: ids[0], recoveryId: recovery.id, indicators },
      update: {},
    });
    if (review.status === "PENDING_REVIEW") {
      await ensureTask(tx, {
        recordKind: CIRCUMVENTION_KIND,
        recordId: review.id,
        recordName: `${recordName} · ${recovery.recoveryNo}`,
        purpose: CIRCUMVENTION_PURPOSE,
        title: "Recovery Circumvention Review",
        assigneeRole: "ACCOUNTS",
        dueAt: new Date(),
        decision: true,
        latestResult:
          `Shares ${review.indicators.map((i) => i.replace("_", " ").toLowerCase()).join(", ")} with the Person owing ` +
          `${recovery.recoveryNo}. Benefits are held, not denied: clear or restrict with a reason.`,
      });
    }
  }

  return (
    (await tx.circumventionReview.count({
      where: {
        subjectPersonId: { in: ids },
        status: { in: ["PENDING_REVIEW", "RESTRICTED"] },
        recovery: { status: "OUTSTANDING" },
      },
    })) > 0
  );
}

/** Both controls for one benefit; each raises its own review. */
export async function controlHolds(tx: Tx, ref: BenefitRef) {
  const staffConflict = await staffConflictHeld(tx, ref);
  const circumvention = await circumventionHeld(tx, ref.personId, ref.recordName);
  return { staffConflict, circumvention };
}

/** The non-cash engines' hold, after their own: staff conflict first, then circumvention. */
export async function controlHoldReason(tx: Tx, ref: BenefitRef) {
  const holds = await controlHolds(tx, ref);
  if (holds.staffConflict) return "STAFF_CONFLICT_REVIEW" as const;
  if (holds.circumvention) return "RECOVERY_CIRCUMVENTION_REVIEW" as const;
  return null;
}

/**
 * CP §58, §78; UAT CTL-11 — a conflicted staff user never approves or processes
 * a benefit of their own or of their declared relative. The denial is audited
 * outside the refused command so it survives the refusal.
 */
export async function assertIndependent(args: { actorRef: string; actorRole: string; beneficiaryPersonId: string; action: string }) {
  const actor = await db.staffAccount.findUnique({ where: { staffAccountId: args.actorRef }, select: { personId: true } });
  if (!actor) return;
  const ids = await identityIds(db, args.beneficiaryPersonId);
  const related =
    ids.includes(actor.personId) ||
    (await db.staffRelative.count({
      where: {
        endedAt: null,
        OR: [
          { staffPersonId: actor.personId, relativePersonId: { in: ids } },
          { staffPersonId: { in: ids }, relativePersonId: actor.personId },
        ],
      },
    })) > 0;
  if (!related) return;
  await recordAudit({
    actorRef: args.actorRef,
    actorRole: args.actorRole,
    entity: "Person",
    entityId: args.beneficiaryPersonId,
    action: "CONFLICTED_ACTION_DENIED",
    reason: args.action,
  });
  blocked("You are this beneficiary or their declared close relative, so another staff account must do this (CP §58).");
}
