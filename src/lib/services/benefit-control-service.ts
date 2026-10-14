// Release controls on every benefit — Change Pack §55, §58, §65 (NT08, NT09),
// §78; SSOT §92, §95.
//
// Each engine (Direct/Loyalty/Buying, Trip, Royalty) asks `controlHolds` before
// it lets a benefit go. A Person who shares a bank account, the primary mobile
// or the address with someone owing a Recovery waits for Accounts/MD (NT08) —
// never denied automatically. The decision lives in control-review-service.
//
// There is no staff-conflict hold (NT09): the owner ruled on 14 Oct 2026 that a
// sale by staff is a 3% Club sale, and staff or their family buying as a
// Customer or joining as a Member earn like anyone else, with no MD approval.

import { db } from "@/lib/db";
import { recordAudit } from "@/lib/security/audit";
import { blocked, type Tx } from "./command";
import { ensureTask } from "./task-service";

/** Task record kind; it opens on the Rewards page's Reviews tab. */
export const CIRCUMVENTION_KIND = "Circumvention Review";
export const CIRCUMVENTION_PURPOSE = "RECOVERY_CIRCUMVENTION_REVIEW";

export type BenefitRef = {
  recordKind: "Commission" | "Trip Reward" | "Royalty Award";
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
        title: "Check Recovery Link",
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

/** The release control for one benefit; it raises its own review. */
export async function controlHolds(tx: Tx, ref: BenefitRef) {
  return { circumvention: await circumventionHeld(tx, ref.personId, ref.recordName) };
}

/** The non-cash engines' hold, after their own. */
export async function controlHoldReason(tx: Tx, ref: BenefitRef) {
  const holds = await controlHolds(tx, ref);
  return holds.circumvention ? ("RECOVERY_CIRCUMVENTION_REVIEW" as const) : null;
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
