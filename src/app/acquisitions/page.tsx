// Acquisitions — Buyback and Purchase for Resale. prd-corrections.md §11; prd-complete §17.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import { canViewField } from "@/lib/security/permissions";
import AcquisitionsClient from "./acquisitions-client";
import { acquisitionInclude, toAcquisitionRow } from "./row-view";

export const dynamic = "force-dynamic";

export default async function AcquisitionsPage() {
  const actor = await requireStaff("REPORT_VIEW");
  // MD and Admin read a contact number whole; everyone else gets the mask.
  const fullMobile = canViewField(actor.role, "MOBILE_FULL");

  const [acquisitions, buybackable, people, resaleGroups] = await Promise.all([
    db.acquisition.findMany({
      include: acquisitionInclude,
      orderBy: { submittedAt: "desc" },
      take: 200,
    }),
    // A Buyback applies to an approved Booking that is not already under another
    // major process (ARCHITECTURE §6.3).
    db.booking.findMany({
      where: {
        status: { in: ["BOOKED", "PAYMENT_COMPLETED", "DELIVERED"] },
        activeProcess: "NONE",
      },
      include: { plot: true, project: true, primaryPerson: true },
      orderBy: { bookingDate: "desc" },
      take: 300,
    }),
    db.person.findMany({
      where: { mergeStatus: { not: "MERGED_AWAY" } },
      select: {
        id: true,
        fullName: true,
        primaryMobile: true,
        customerProfile: { select: { customerId: true } },
        memberProfile: { select: { memberId: true } },
      },
      orderBy: { fullName: "asc" },
      take: 500,
    }),
    // PRD §11.6 — the External Resale Property Group an outside purchase lands in.
    db.project.findMany({
      select: { id: true, name: true, projectCode: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <AcquisitionsClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      permissions={{
        create: can(actor.role, "ACQUISITION_CREATE", actor.extraPermissions),
        decide: can(actor.role, "ACQUISITION_DECIDE", actor.extraPermissions),
        cancel: can(actor.role, "ACQUISITION_CANCEL", actor.extraPermissions),
        confirmGiven: can(actor.role, "PAYMENT_GIVEN_CONFIRM", actor.extraPermissions),
        correctGiven: can(actor.role, "PAYMENT_CORRECT", actor.extraPermissions),
        recordCommission: can(actor.role, "BUYING_COMMISSION_RECORD", actor.extraPermissions),
      }}
      rows={acquisitions.map(toAcquisitionRow)}
      buybackable={buybackable.map((b) => ({
        id: b.id,
        label: `${b.bookingNumber ?? b.requestNo} · ${b.project.name} ${b.plot.plotNumber} · ${b.primaryPerson.fullName}`,
        primaryPersonId: b.primaryPersonId,
      }))}
      people={people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        mobileMasked: fullMobile ? p.primaryMobile : maskMobile(p.primaryMobile),
        customerId: p.customerProfile?.customerId ?? null,
        memberId: p.memberProfile?.memberId ?? null,
      }))}
      resaleGroups={resaleGroups}
    />
  );
}
