"use server";

// Customer server actions — design.md §12; prd-complete §6.
// The Customer has no portal (PRD §1.3); this is the staff-side profile only.

import { requireStaff } from "@/lib/security/current-actor";
import { canViewField } from "@/lib/security/permissions";
import { recordAudit } from "@/lib/security/audit";
import { decryptSensitive, maskAadhaar, maskPan } from "@/lib/security/identity";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { CommandError } from "@/lib/services/command";
import { recordCustomerTermsAcceptance, verifyAadhaar } from "@/lib/services/customer-closer-service";

export type CloserActionResult = { ok: true } | { ok: false; error: string };

const asResult = (error: unknown): CloserActionResult => ({
  ok: false,
  error: error instanceof CommandError || error instanceof Error ? error.message : "Action failed.",
});

/** v2.1 §22 — CRM records the Customer Terms version a Customer accepted. */
export async function recordCustomerTermsAction(
  customerProfileId: string,
  termsVersion: string,
  acceptedOn: string,
  key: string
): Promise<CloserActionResult> {
  const actor = await requireStaff();
  try {
    await recordCustomerTermsAcceptance({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      customerProfileId,
      termsVersion,
      acceptedOn: new Date(`${acceptedOn}T00:00:00+05:30`),
    });
    revalidatePath(`/customers/${customerProfileId}`);
    return { ok: true };
  } catch (error) {
    return asResult(error);
  }
}

/** v2.1 §22, §77 — Accounts marks a recorded Aadhaar as Verified. */
export async function verifyAadhaarAction(personId: string, key: string): Promise<CloserActionResult> {
  const actor = await requireStaff();
  try {
    await verifyAadhaar({
      idempotencyKey: key,
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      personId,
    });
    revalidatePath("/customers");
    return { ok: true };
  } catch (error) {
    return asResult(error);
  }
}

/**
 * PRD RD-05, ARCHITECTURE §9.3 — the full Aadhaar is available only to
 * specifically authorised MD/Admin users, and every access is logged.
 */
export async function revealAadhaarAction(
  personId: string
): Promise<{ ok: true; aadhaar: string } | { ok: false; error: string }> {
  const actor = await requireStaff();
  if (!canViewField(actor.role, "AADHAAR_FULL")) {
    await recordAudit({
      actorRef: actor.staffAccountId,
      actorRole: actor.role,
      entity: "Person",
      entityId: personId,
      action: "AADHAAR_REVEAL_DENIED",
    });
    return { ok: false, error: `${actor.role} is not permitted to view a full Aadhaar number.` };
  }

  const person = await db.person.findUnique({
    where: { id: personId },
    select: { aadhaarCipher: true },
  });
  if (!person?.aadhaarCipher) return { ok: false, error: "No Aadhaar is recorded." };

  await recordAudit({
    actorRef: actor.staffAccountId,
    actorRole: actor.role,
    entity: "Person",
    entityId: personId,
    action: "AADHAAR_REVEALED",
  });
  return { ok: true, aadhaar: decryptSensitive(person.aadhaarCipher) };
}

/**
 * DESIGN §12.2 — Overview, Invited By, Property Activity, Aadhaar & PAN, Bank
 * Details, Loyalty and History, all for one Customer.
 */
export async function loadCustomerDetail(customerProfileId: string) {
  await requireStaff();

  const customer = await db.customerProfile.findUnique({
    where: { id: customerProfileId },
    include: {
      person: true,
      royaltyLinkedMember: { include: { person: true } },
    },
  });
  if (!customer) return null;

  const personId = customer.personId;
  const [enquiries, holds, bookings, banks] = await Promise.all([
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
    royaltyLinkedMember: customer.royaltyLinkedMember
      ? `${customer.royaltyLinkedMember.memberId} · ${customer.royaltyLinkedMember.person.fullName}`
      : null,
    royaltyLinkProvisional: customer.royaltyLinkFinalAt === null,
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
