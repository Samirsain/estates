// Bank details — PRD.md §14.3; main-PRD §19.4.
// CRM enters, Accounts verifies, and the existing verified bank stays active
// while the replacement is Pending. A pending replacement never puts every
// Ready commission on hold by itself (PRD §14.3).

import { db } from "@/lib/db";
import { encryptSensitive } from "@/lib/security/identity";
import { blocked, runCommand, type Tx } from "./command";
import { ensureTask, closeTasksFor } from "./task-service";

/** IFSC is four letters, a zero, then six alphanumerics. */
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function normaliseAccount(raw: string): string {
  const value = raw.replace(/\s/g, "");
  if (!/^\d{6,20}$/.test(value)) {
    throw new Error("Enter a bank account number of 6 to 20 digits.");
  }
  return value;
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
  accountNumber: string;
  ifsc: string;
}) {
  const ifsc = args.ifsc.replace(/\s/g, "").toUpperCase();
  if (!IFSC.test(ifsc)) blocked("Enter a valid IFSC, for example HDFC0001234.");
  if (!args.accountHolder.trim() || !args.bankName.trim()) {
    blocked("Account Holder and Bank Name are required.");
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
      const person = await tx.person.findUniqueOrThrow({ where: { id: args.personId } });

      const pending = await tx.bankDetail.findFirst({
        where: { personId: args.personId, status: "PENDING" },
      });
      if (pending) {
        blocked(
          "A replacement bank entry is already waiting for the Accounts decision. " +
            "Complete that verification before entering another."
        );
      }

      const detail = await tx.bankDetail.create({
        data: {
          personId: args.personId,
          accountHolder: args.accountHolder.trim(),
          bankName: args.bankName.trim(),
          accountCipher: encryptSensitive(accountNumber),
          accountLastFour: accountNumber.slice(-4),
          ifsc,
          enteredByRef: args.actorRef,
        },
      });

      await ensureTask(tx, {
        recordKind: "Person",
        recordId: args.personId,
        recordName: person.fullName,
        purpose: "BANK_VERIFICATION",
        title: "Accounts Verification — Bank Details",
        assigneeRole: "ACCOUNTS",
        dueAt: new Date(),
        decision: true,
        latestResult: `${args.bankName.trim()} ending ${accountNumber.slice(-4)}`,
      });

      return {
        result: { bankDetailId: detail.id, accountLastFour: detail.accountLastFour },
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
        blocked("Bank details must be verified by a different staff account (PRD §3.3).");
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
          action: args.approve ? "BANK_DETAILS_VERIFIED" : "BANK_DETAILS_REJECTED",
          after: { accountLastFour: detail.accountLastFour },
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
      accountLastFour: true,
      ifsc: true,
      status: true,
      enteredByRef: true,
      verifiedByRef: true,
      verifiedAt: true,
      reason: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
