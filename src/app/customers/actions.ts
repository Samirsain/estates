"use server";

// Customer server actions — DESIGN.md §12; main-PRD §6.
// The Customer has no portal (PRD §1.3); this is the staff-side profile only.

import { requireStaff } from "@/lib/security/current-actor";
import { canViewField } from "@/lib/security/permissions";
import { recordSecurityEvent } from "@/lib/security/audit";
import { decryptSensitive, maskAadhaar, maskPan } from "@/lib/security/identity";
import { db } from "@/lib/db";

/**
 * PRD RD-05, ARCHITECTURE §9.3 — the full Aadhaar is available only to
 * specifically authorised MD/Admin users, and every access is logged.
 */
export async function revealAadhaarAction(
  personId: string
): Promise<{ ok: true; aadhaar: string } | { ok: false; error: string }> {
  const actor = await requireStaff();
  if (!canViewField(actor.role, "AADHAAR_FULL")) {
    await recordSecurityEvent({
      type: "PERMISSION_DENIED",
      identifier: actor.staffAccountId,
      detail: `${actor.role} attempted AADHAAR_FULL`,
    });
    return { ok: false, error: `${actor.role} is not permitted to view a full Aadhaar number.` };
  }

  const person = await db.person.findUnique({
    where: { id: personId },
    select: { aadhaarCipher: true },
  });
  if (!person?.aadhaarCipher) return { ok: false, error: "No Aadhaar is recorded." };

  await recordSecurityEvent({
    type: "SENSITIVE_ACCESS",
    identifier: actor.staffAccountId,
    detail: `AADHAAR_FULL on Person ${personId}`,
  });
  return { ok: true, aadhaar: decryptSensitive(person.aadhaarCipher) };
}

/**
 * DESIGN §12.2 — Overview, Invited By, Property Activity, Aadhaar & PAN, Bank
 * Details, Loyalty Bonus and History, all for one Customer.
 */
export async function loadCustomerDetail(customerProfileId: string) {
  await requireStaff();

  const customer = await db.customerProfile.findUnique({
    where: { id: customerProfileId },
    include: {
      person: true,
      originalIntroducedByMember: { include: { person: true } },
    },
  });
  if (!customer) return null;

  const personId = customer.personId;
  const [enquiries, holds, bookings, loyalty, banks] = await Promise.all([
    db.enquiry.findMany({
      where: { personId },
      include: { project: true, plot: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.hold.findMany({
      where: { personId },
      include: { plot: { include: { project: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.booking.findMany({
      where: { OR: [{ primaryPersonId: personId }, { parties: { some: { personId } } }] },
      include: { project: true, plot: true },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    // PRD §6.5 — the lifetime Loyalty slots, read from the ledger rather than a
    // counter that could drift.
    db.commissionOpportunity.findMany({
      where: { kind: "LOYALTY", subjectPersonId: personId },
      orderBy: { slotIndex: "asc" },
    }),
    db.bankDetail.findMany({
      where: { personId },
      select: {
        id: true,
        bankName: true,
        accountLastFour: true,
        ifsc: true,
        status: true,
        verifiedAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    id: customer.id,
    personId,
    customerId: customer.customerId,
    // PRD RD-05 — masked by default everywhere.
    aadhaarMasked: maskAadhaar(customer.person.aadhaarLastFour),
    aadhaarStatus: customer.person.aadhaarStatus,
    panMasked: customer.person.panMasked ? maskPan(customer.person.panMasked) : null,
    panStatus: customer.person.panStatus,
    introducedBy: customer.originalIntroducedByMember
      ? `${customer.originalIntroducedByMember.memberId} · ${customer.originalIntroducedByMember.person.fullName}`
      : null,
    introducedPosition: customer.introducedPosition,
    introducedRatePercent: customer.introducedRatePercent?.toFixed(2) ?? null,
    loyaltySlots: loyalty.map((o) => ({
      slotIndex: o.slotIndex,
      status: o.status,
      consumedAt: o.consumedAt?.toISOString() ?? null,
      reopenedReason: o.reopenedReason,
    })),
    loyaltyConsumed: loyalty.filter((o) => o.status === "CONSUMED").length,
    banks: banks.map((b) => ({
      id: b.id,
      bankName: b.bankName,
      accountLastFour: b.accountLastFour,
      ifsc: b.ifsc,
      status: b.status,
      verifiedAt: b.verifiedAt?.toISOString() ?? null,
    })),
    activity: [
      ...enquiries.map((e) => ({
        kind: "Enquiry" as const,
        reference: e.enquiryNo,
        project: e.project.name,
        plot: e.plot ? `${e.plot.plotType.replaceAll("_", " ")} ${e.plot.plotNumber}` : "General",
        status: e.status,
        at: e.createdAt.toISOString(),
      })),
      ...holds.map((h) => ({
        kind: "Hold" as const,
        reference: h.id.slice(0, 8),
        project: h.plot.project.name,
        plot: `${h.plot.plotType.replaceAll("_", " ")} ${h.plot.plotNumber}`,
        status: h.status,
        at: h.createdAt.toISOString(),
      })),
      ...bookings.map((b) => ({
        kind: "Booking" as const,
        reference: b.bookingNumber ?? b.requestNo,
        project: b.project.name,
        plot: `${b.plot.plotType.replaceAll("_", " ")} ${b.plot.plotNumber}`,
        status: b.status,
        at: b.submittedAt.toISOString(),
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1)),
  };
}

export type CustomerDetail = NonNullable<Awaited<ReturnType<typeof loadCustomerDetail>>>;
