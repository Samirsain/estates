"use server";

// Member and bank server actions — DESIGN.md §12.2, §13; PRD.md §13, §14.3.
// Every action re-checks permission on the server (DESIGN §1).

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { canViewField } from "@/lib/security/permissions";
import { decryptSensitive } from "@/lib/security/identity";
import { recordSecurityEvent } from "@/lib/security/audit";
import { CommandError } from "@/lib/services/command";
import { decideBankDetails, enterBankDetails, listBankDetails } from "@/lib/services/bank-service";
import { applyMemberCommissionHold } from "@/lib/services/commission-service";
import { db } from "@/lib/db";
import {
  activateMember,
  setMemberStatus,
  updateMemberRera,
} from "@/lib/services/network-service";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function toResult(error: unknown): ActionResult {
  if (error instanceof CommandError) return { ok: false, error: error.message };
  return { ok: false, error: error instanceof Error ? error.message : "Action failed." };
}

function refresh() {
  revalidatePath("/members");
  revalidatePath("/dashboard");
}

export async function activateMemberAction(
  input: {
    personId: string;
    invitedByMemberId: string;
    reraStatus: "REGISTERED" | "PENDING" | "EXPIRED" | "NOT_APPLICABLE";
    reraNumber: string;
    reraExpiryDate: string;
    reraNotApplicableReason: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("MEMBER_ACTIVATE");
  try {
    const result = await activateMember({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      personId: input.personId,
      invitedByMemberId: input.invitedByMemberId || null,
      reraStatus: input.reraStatus,
      reraNumber: input.reraNumber || null,
      reraExpiryDate: input.reraExpiryDate ? new Date(input.reraExpiryDate) : null,
      reraNotApplicableReason: input.reraNotApplicableReason || null,
    });
    refresh();
    return {
      ok: true,
      message: result.invitePosition
        ? `Activated as ${result.memberId} at Network position ${result.invitePosition} (${result.inviteRatePercent}% band).`
        : `Activated as ${result.memberId}. No inviting Member was recorded, so no Invite position was taken.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function setMemberStatusAction(
  memberProfileId: string,
  active: boolean,
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff(active ? "MEMBER_ACTIVATE" : "MEMBER_DEACTIVATE");
  try {
    await setMemberStatus({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      memberProfileId,
      active,
      reason,
    });
    refresh();
    return {
      ok: true,
      message: active
        ? "Reactivated. Portal access is restored and unpaid commission eligibility has been rechecked."
        : "Deactivated. Portal access stopped immediately and every unpaid commission is On Hold — Member Deactivated. Paid records stay historical.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function setCommissionHoldAction(
  memberProfileId: string,
  hold: boolean,
  reason: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("MEMBER_DEACTIVATE");
  try {
    await applyMemberCommissionHold({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      memberProfileId,
      hold,
      reason,
    });
    refresh();
    return {
      ok: true,
      message: hold
        ? "Commission Hold applied to every unpaid record. Paid history is untouched."
        : "Commission Hold removed. Affected records were reassessed and the same task resumes.",
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function updateMemberReraAction(
  input: {
    memberProfileId: string;
    status: "REGISTERED" | "PENDING" | "EXPIRED" | "NOT_APPLICABLE";
    reraNumber: string;
    expiryDate: string;
    notApplicableReason: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("MEMBER_ACTIVATE");
  try {
    await updateMemberRera({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      memberProfileId: input.memberProfileId,
      status: input.status,
      reraNumber: input.reraNumber || null,
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      notApplicableReason: input.notApplicableReason || null,
    });
    refresh();
    return { ok: true, message: "RERA updated and unpaid commission eligibility rechecked." };
  } catch (error) {
    return toResult(error);
  }
}

/* -------------------------------------------------------------------- bank */

export async function enterBankDetailsAction(
  input: {
    personId: string;
    accountHolder: string;
    bankName: string;
    accountNumber: string;
    ifsc: string;
  },
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("BANK_DETAILS_ENTER");
  try {
    const result = await enterBankDetails({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      personId: input.personId,
      accountHolder: input.accountHolder,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      ifsc: input.ifsc,
    });
    refresh();
    return {
      ok: true,
      message:
        `Bank details ending ${result.accountLastFour} submitted for Accounts verification. ` +
        `Any existing verified bank stays active until this is approved.`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function decideBankDetailsAction(
  bankDetailId: string,
  approve: boolean,
  note: string,
  key: string
): Promise<ActionResult> {
  const actor = await requireStaff("BANK_VERIFY");
  try {
    await decideBankDetails({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      bankDetailId,
      approve,
      note,
    });
    refresh();
    return {
      ok: true,
      message: approve
        ? "Bank details verified. They are now the active account and the previous one stays in History."
        : "Bank details rejected. The previously verified account is unchanged.",
    };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * PRD §14.3, ARCHITECTURE §9.3 — the full account number is available only to
 * an authorised role, and every access is logged.
 */
export async function revealBankAccountAction(
  bankDetailId: string
): Promise<{ ok: true; accountNumber: string } | { ok: false; error: string }> {
  const actor = await requireStaff();
  if (!canViewField(actor.role, "BANK_FULL")) {
    await recordSecurityEvent({
      type: "PERMISSION_DENIED",
      identifier: actor.staffAccountId,
      detail: `${actor.role} attempted BANK_FULL`,
    });
    return { ok: false, error: `${actor.role} is not permitted to view a full bank account number.` };
  }

  const detail = await db.bankDetail.findUnique({
    where: { id: bankDetailId },
    select: { accountCipher: true, personId: true },
  });
  if (!detail) return { ok: false, error: "Bank details not found." };

  await recordSecurityEvent({
    type: "SENSITIVE_ACCESS",
    identifier: actor.staffAccountId,
    detail: `BANK_FULL on Person ${detail.personId}`,
  });
  return { ok: true, accountNumber: decryptSensitive(detail.accountCipher) };
}

/** Bank history for one Person. Lists always show the last four only. */
export async function loadBankDetails(personId: string) {
  await requireStaff();
  const rows = await listBankDetails(personId);
  return rows.map((r) => ({
    id: r.id,
    accountHolder: r.accountHolder,
    bankName: r.bankName,
    accountLastFour: r.accountLastFour,
    ifsc: r.ifsc,
    status: r.status,
    enteredByRef: r.enteredByRef,
    verifiedByRef: r.verifiedByRef,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type BankDetailView = Awaited<ReturnType<typeof loadBankDetails>>[number];

/** Network and commission detail for one Member (DESIGN §13.1, §13.2). */
export async function loadMemberDetail(memberProfileId: string) {
  await requireStaff();
  const member = await db.memberProfile.findUnique({
    where: { id: memberProfileId },
    include: {
      person: true,
      invitedByMember: { include: { person: true } },
      invitedMembers: { include: { person: true }, orderBy: { invitePosition: "asc" } },
      introducedCustomers: { include: { person: true }, orderBy: { introducedPosition: "asc" } },
    },
  });
  if (!member) return null;

  const commissions = await db.commissionRecord.findMany({
    where: { beneficiaryPersonId: member.personId },
    include: {
      booking: { include: { project: true, plot: true } },
      // Buying Commission hangs off an Acquisition, not a Booking (PRD §11.7).
      acquisition: { include: { plot: { include: { project: true } } } },
    },
    orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return {
    id: member.id,
    personId: member.personId,
    invitedMembers: member.invitedMembers.map((m) => ({
      memberId: m.memberId,
      name: m.person.fullName,
      position: m.invitePosition,
      ratePercent: m.inviteRatePercent?.toFixed(2) ?? null,
      yearStart: m.inviteYearStart?.toISOString() ?? null,
      status: m.status,
    })),
    introducedCustomers: member.introducedCustomers.map((c) => ({
      customerId: c.customerId,
      name: c.person.fullName,
      position: c.introducedPosition,
      ratePercent: c.introducedRatePercent?.toFixed(2) ?? null,
      yearStart: c.introducedYearStart?.toISOString() ?? null,
      loyaltySlotsConsumed: c.loyaltySlotsConsumed,
    })),
    commissions: commissions.map((c) => ({
      id: c.id,
      bookingNumber:
        c.booking?.bookingNumber ?? c.booking?.requestNo ?? c.acquisition?.acquisitionNo ?? "—",
      project: c.booking?.project.name ?? c.acquisition?.plot?.project.name ?? c.acquisition?.propertyName ?? "—",
      plot: c.booking
        ? `${c.booking.plot.plotType.replaceAll("_", " ")} ${c.booking.plot.plotNumber}`
        : c.acquisition?.plot
          ? `${c.acquisition.plot.plotType.replaceAll("_", " ")} ${c.acquisition.plot.plotNumber}`
          : (c.acquisition?.propertyNumber ?? "—"),
      type: c.type,
      percent: c.percent.toFixed(2),
      milestonePercent: c.milestonePercent.toFixed(0),
      eligibility: c.eligibility,
      holdReason: c.holdReason,
      payment: c.payment,
      isCurrent: c.isCurrent,
      closedReason: c.closedReason,
    })),
  };
}

export type MemberDetail = NonNullable<Awaited<ReturnType<typeof loadMemberDetail>>>;
