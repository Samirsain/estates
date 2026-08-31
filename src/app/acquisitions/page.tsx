// Acquisitions — Buyback and Purchase for Resale. PRD.md §11; main-PRD §17.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import AcquisitionsClient from "./acquisitions-client";

export const dynamic = "force-dynamic";

export default async function AcquisitionsPage() {
  const actor = await requireStaff("REPORT_VIEW");

  const [acquisitions, buybackable, people, resaleGroups] = await Promise.all([
    db.acquisition.findMany({
      include: {
        plot: { include: { project: true } },
        sellerPerson: true,
        arrangedByPerson: true,
        sourceBooking: { include: { plot: true, project: true } },
        paymentEntries: {
          include: { externalReference: true },
          orderBy: { recordedAt: "desc" },
        },
        scheduleVersions: {
          where: { status: "ACTIVE" },
          include: { instalments: { orderBy: { seq: "asc" } } },
        },
        commissions: { where: { isCurrent: true }, include: { beneficiaryPerson: true } },
      },
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
      rows={acquisitions.map((a) => ({
        id: a.id,
        acquisitionNo: a.acquisitionNo,
        type: a.type,
        status: a.status,
        property: a.plot
          ? `${a.plot.project.name} · ${a.plot.plotType.replaceAll("_", " ")} ${a.plot.plotNumber}`
          : `${a.propertyName ?? "—"} · ${a.propertyNumber ?? "—"}`,
        // An outside purchase has no Plot in inventory, so its own two names
        // stand in the same two columns.
        project: a.plot ? a.plot.project.name : (a.propertyName ?? "—"),
        plotNumber: a.plot ? a.plot.plotNumber : (a.propertyNumber ?? "—"),
        plotType: a.plot ? a.plot.plotType : null,
        location: a.location,
        seller: a.sellerPerson.fullName,
        sellerPersonId: a.sellerPersonId,
        arrangedBy: a.arrangedByPerson
          ? a.arrangedByPerson.fullName
          : "3% Club",
        arrangedByPersonId: a.arrangedByPersonId ?? null,
        arrangedByType: a.arrangedByType,
        sourceBooking: a.sourceBooking
          ? `${a.sourceBooking.bookingNumber ?? a.sourceBooking.requestNo} · ${a.sourceBooking.project.name} ${a.sourceBooking.plot.plotNumber}`
          : null,
        purchaseDate: a.purchaseDate.toISOString(),
        paymentGivenPercent: a.paymentGivenPercent.toFixed(2),
        remark: a.remark,
        decisionNote: a.decisionNote,
        closedReason: a.closedReason,
        submittedByRef: a.submittedByRef,
        instalments: (a.scheduleVersions[0]?.instalments ?? []).map((i) => ({
          seq: i.seq,
          scheduled: i.scheduledPercent.toFixed(2),
          received: i.receivedPercent.toFixed(2),
          dueDate: i.dueDate.toISOString(),
        })),
        entries: a.paymentEntries.map((e) => ({
          id: e.id,
          percent: e.percent.toFixed(2),
          paidOn: e.paidOn.toISOString(),
          status: e.status,
          reference: e.externalReference.rawValue,
          confirmedByRef: e.confirmedByRef,
          reason: e.reason,
        })),
        commission: a.commissions[0]
          ? {
              beneficiary: a.commissions[0].beneficiaryPerson.fullName,
              beneficiaryPersonId: a.commissions[0].beneficiaryPersonId,
              percent: a.commissions[0].percent.toFixed(2),
              eligibility: a.commissions[0].eligibility,
              payment: a.commissions[0].payment,
            }
          : null,
      }))}
      buybackable={buybackable.map((b) => ({
        id: b.id,
        label: `${b.bookingNumber ?? b.requestNo} · ${b.project.name} ${b.plot.plotNumber} · ${b.primaryPerson.fullName}`,
        primaryPersonId: b.primaryPersonId,
      }))}
      people={people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        mobileMasked: maskMobile(p.primaryMobile),
        customerId: p.customerProfile?.customerId ?? null,
        memberId: p.memberProfile?.memberId ?? null,
      }))}
      resaleGroups={resaleGroups}
    />
  );
}
