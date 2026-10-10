// Bank details — prd-corrections.md §14.3; prd-complete §19.4.
// CRM enters, Accounts verifies, and the existing verified bank stays active
// while the replacement is Pending. A pending replacement never puts every
// Ready commission on hold by itself (PRD §14.3).

import { db } from "@/lib/db";
import { blindIndex, encryptSensitive } from "@/lib/security/identity";
import { blocked, lockKey, runCommand, type Tx } from "./command";
import { closeTasksFor, ensureTask } from "./task-service";

/** IFSC is four letters, a zero, then six alphanumerics. */
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function normaliseAccount(raw: string): string {
  const value = raw.replace(/\s/g, "");
  if (!/^\d{6,20}$/.test(value)) {
    throw new Error("Enter a bank account number of 6 to 20 digits.");
  }
  return value;
}

/**
 * CP §57; SSOT §94 — the normalised account identity: the bank (the IFSC's
 * four letters) and the account digits, so a branch change is the same account.
 */
export function bankAccountIndex(ifsc: string, accountDigits: string): string {
  return blindIndex(`${ifsc.slice(0, 4).toUpperCase()}:${accountDigits}`);
}

/**
 * CP §57 — the other, unmerged Persons this account is already verified for.
 * Taken under a lock on the account so two entries cannot both pass (UAT SYS-11).
 */
async function verifiedElsewhere(tx: Tx, personId: string, index: string) {
  await lockKey(tx, `bank-account:${index}`);
  const person = await tx.person.findUniqueOrThrow({ where: { id: personId }, select: { survivingPersonId: true } });
  const root = person.survivingPersonId ?? personId;
  const holders = await tx.bankDetail.findMany({
    where: {
      accountBlindIndex: index,
      status: "VERIFIED",
      personId: { not: personId },
      person: { id: { not: root }, OR: [{ survivingPersonId: null }, { survivingPersonId: { not: root } }] },
    },
    select: { person: { select: { fullName: true } } },
  });
  return holders.map((h) => h.person.fullName);
}

/** PRD §14.3 — the beneficiary condition is a currently Verified bank. */
export async function hasVerifiedBank(tx: Tx, personId: string): Promise<boolean> {
  return (await tx.bankDetail.count({ where: { personId, status: "VERIFIED" } })) > 0;
}

export async function enterBankDetails(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  personId: string;
  accountHolder: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  ifsc: string;
  /** CP §57 — proof of the joint holders, when this account is genuinely shared with another Person. */
  jointAccountProof?: string;
}) {
  const ifsc = args.ifsc.replace(/\s/g, "").toUpperCase();
  if (!IFSC.test(ifsc)) blocked("Enter a valid IFSC, for example HDFC0001234.");
  if (!args.accountHolder.trim() || !args.bankName.trim() || !args.branchName?.trim()) {
    blocked("Account Holder, Bank Name and Branch Name are all required.");
  }

  let accountNumber: string;
  try {
    accountNumber = normaliseAccount(args.accountNumber);
  } catch (error) {
    blocked(error instanceof Error ? error.message : "Invalid account number.");
  }

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "BANK_DETAILS_ENTER",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { personId: args.personId, ifsc },
    },
    async (tx) => {
      const index = bankAccountIndex(ifsc, accountNumber);
      const holders = await verifiedElsewhere(tx, args.personId, index);
      const proof = args.jointAccountProof?.trim() || null;
      if (holders.length > 0 && !proof) {
        blocked(
          `This account is already verified for ${holders.join(", ")}. One verified bank account = one Person. ` +
            "If it is a genuine joint account, record the proof of the joint holders for a separate Accounts/MD approval."
        );
      }
      // CP §57, §78 — a shared joint account waits for a separate approval; the
      // Person's current verified account stays active meanwhile.
      if (holders.length > 0) {
        await tx.bankDetail.updateMany({
          where: { personId: args.personId, status: "PENDING" },
          data: { status: "SUPERSEDED", reason: `Replaced on ${new Date().toISOString()}` },
        });
        const pending = await tx.bankDetail.create({
          data: {
            personId: args.personId,
            accountHolder: args.accountHolder.trim(),
            bankName: args.bankName.trim(),
            branchName: args.branchName.trim(),
            accountCipher: encryptSensitive(accountNumber),
            accountLastFour: accountNumber.slice(-4),
            ifsc,
            accountBlindIndex: index,
            jointAccountProof: proof,
            enteredByRef: args.actorRef,
          },
        });
        const person = await tx.person.findUniqueOrThrow({ where: { id: args.personId }, select: { fullName: true } });
        await ensureTask(tx, {
          recordKind: "Person",
          recordId: args.personId,
          recordName: `${person.fullName} · bank ••${pending.accountLastFour}`,
          purpose: "BANK_VERIFICATION",
          title: "Joint Bank Account Exception — Approval",
          assigneeRole: "ACCOUNTS",
          dueAt: new Date(),
          decision: true,
          latestResult: `Also verified for ${holders.join(", ")}. Check the proof of the joint holders, then verify or reject.`,
        });
        return {
          result: { bankDetailId: pending.id, accountLastFour: pending.accountLastFour, jointExceptionPending: true },
          audit: {
            entity: "Person",
            entityId: args.personId,
            action: "BANK_JOINT_EXCEPTION_REQUESTED",
            after: { bankName: pending.bankName, accountLastFour: pending.accountLastFour, ifsc, sharedWith: holders },
            reason: proof,
          },
        };
      }

      // Saving is the whole of it. The details reaching this form have been
      // checked before they get here, so a second Accounts decision only held
      // up a payment on an account nobody doubted — the owner removed the
      // step. The record still supersedes rather than overwrites, so the
      // account that was paid to last month is still on file.
      await tx.bankDetail.updateMany({
        where: { personId: args.personId, status: { in: ["VERIFIED", "PENDING"] } },
        data: { status: "SUPERSEDED", reason: `Replaced on ${new Date().toISOString()}` },
      });

      const now = new Date();
      const detail = await tx.bankDetail.create({
        data: {
          personId: args.personId,
          accountHolder: args.accountHolder.trim(),
          bankName: args.bankName.trim(),
          branchName: args.branchName?.trim() || null,
          accountCipher: encryptSensitive(accountNumber),
          accountLastFour: accountNumber.slice(-4),
          ifsc,
          accountBlindIndex: index,
          enteredByRef: args.actorRef,
          status: "VERIFIED",
          verifiedByRef: args.actorRef,
          verifiedAt: now,
        },
      });

      return {
        result: { bankDetailId: detail.id, accountLastFour: detail.accountLastFour, jointExceptionPending: false },
        audit: {
          entity: "Person",
          entityId: args.personId,
          action: "BANK_DETAILS_ENTERED",
          // The full account number never reaches audit (PRD §17.1).
          after: { bankName: detail.bankName, accountLastFour: detail.accountLastFour, ifsc },
        },
      };
    }
  );
}

/**
 * PRD §14.3 — Accounts verifies. On approval the new details become active and
 * the old ones remain History; maker and checker are different accounts.
 */
export async function decideBankDetails(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  bankDetailId: string;
  approve: boolean;
  note: string;
}) {
  if (!args.note.trim()) blocked("A compulsory remark is required on the Accounts decision.");

  return runCommand(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "BANK_DETAILS_DECIDE",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { bankDetailId: args.bankDetailId, approve: args.approve },
    },
    async (tx) => {
      const detail = await tx.bankDetail.findUniqueOrThrow({ where: { id: args.bankDetailId } });
      if (detail.status !== "PENDING") {
        blocked(`These bank details are already ${detail.status.toLowerCase()}.`);
      }
      if (detail.enteredByRef === args.actorRef) {
        blocked("Bank details must be verified by a different staff account.");
      }
      // CP §57 — still one account = one Person unless the joint exception is on file.
      const holders =
        args.approve && detail.accountBlindIndex
          ? await verifiedElsewhere(tx, detail.personId, detail.accountBlindIndex)
          : [];
      if (holders.length > 0 && !detail.jointAccountProof) {
        blocked(`This account is already verified for ${holders.join(", ")}; it needs a joint-account exception with proof.`);
      }

      if (args.approve) {
        // The previously verified bank becomes History, never a deletion.
        await tx.bankDetail.updateMany({
          where: { personId: detail.personId, status: "VERIFIED" },
          data: { status: "SUPERSEDED", reason: `Replaced on ${new Date().toISOString()}` },
        });
        await tx.bankDetail.update({
          where: { id: detail.id },
          data: {
            status: "VERIFIED",
            verifiedByRef: args.actorRef,
            verifiedAt: new Date(),
            reason: args.note,
          },
        });
      } else {
        await tx.bankDetail.update({
          where: { id: detail.id },
          data: { status: "SUPERSEDED", reason: `Rejected — ${args.note}` },
        });
      }

      await closeTasksFor(
        tx,
        "Person",
        detail.personId,
        args.actorRef,
        args.approve ? `Verified — ${args.note}` : `Rejected — ${args.note}`,
        "BANK_VERIFICATION"
      );

      return {
        result: { bankDetailId: detail.id, status: args.approve ? "VERIFIED" : "SUPERSEDED" },
        audit: {
          entity: "Person",
          entityId: detail.personId,
          action: args.approve
            ? holders.length > 0
              ? "BANK_JOINT_EXCEPTION_APPROVED"
              : "BANK_DETAILS_VERIFIED"
            : "BANK_DETAILS_REJECTED",
          after: { accountLastFour: detail.accountLastFour, sharedWith: holders },
          reason: args.note,
        },
      };
    }
  );
}

/** DESIGN §12.2 — lists show the last four only; the full value stays protected. */
export function listBankDetails(personId: string) {
  return db.bankDetail.findMany({
    where: { personId },
    select: {
      id: true,
      accountHolder: true,
      bankName: true,
      branchName: true,
      accountLastFour: true,
      ifsc: true,
      status: true,
      enteredByRef: true,
      verifiedByRef: true,
      verifiedAt: true,
      reason: true,
      jointAccountProof: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
