// One query and one mapping for an Acquisition, read by the list and by a
// single deal's page. Two copies of this drift the day one of them gains a
// field, and the page that missed it shows a quietly different record.

import { Prisma } from "@prisma/client";
import type { AcquisitionRowView } from "./types";

// The Customer ID / Member ID a Person is known by, for the Parties box.
const withCodes = {
  include: { customerProfile: { select: { customerId: true } }, memberProfile: { select: { memberId: true } } },
} as const;

export const acquisitionInclude = {
  plot: { include: { project: true } },
  sellerPerson: withCodes,
  arrangedByPerson: withCodes,
  sourceBooking: { include: { plot: true, project: true } },
  paymentEntries: {
    include: { externalReference: true },
    orderBy: { recordedAt: "desc" },
  },
  scheduleVersions: {
    where: { status: "ACTIVE" },
    include: { instalments: { orderBy: { seq: "asc" } } },
  },
  commissions: { where: { isCurrent: true }, include: { beneficiaryPerson: withCodes } },
} satisfies Prisma.AcquisitionInclude;

type Coded = {
  customerProfile: { customerId: string } | null;
  memberProfile: { memberId: string } | null;
};
/** A seller is first a Customer; whoever arranges or earns is first a Member. */
const customerFirst = (p: Coded) => p.customerProfile?.customerId ?? p.memberProfile?.memberId ?? null;
const memberFirst = (p: Coded) => p.memberProfile?.memberId ?? p.customerProfile?.customerId ?? null;

type AcquisitionWithRelations = Prisma.AcquisitionGetPayload<{
  include: typeof acquisitionInclude;
}>;

export function toAcquisitionRow(a: AcquisitionWithRelations): AcquisitionRowView {
  // Owner 3 Nov — the date each instalment was given: the latest confirmed
  // entry that put money on its seq (allocations are by seq, as on a Booking).
  const givenOnBySeq = new Map<number, Date>();
  for (const e of a.paymentEntries) {
    if (e.status !== "CONFIRMED") continue;
    for (const al of e.allocations as { seq: number; percent: string }[]) {
      const last = givenOnBySeq.get(al.seq);
      if (Number(al.percent) > 0 && (!last || e.paidOn > last)) givenOnBySeq.set(al.seq, e.paidOn);
    }
  }

  return {
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
    plotId: a.plot?.id ?? null,
    plotType: a.plot ? a.plot.plotType : null,
    location: a.location,
    seller: a.sellerPerson.fullName,
    sellerPersonId: a.sellerPersonId,
    sellerCode: customerFirst(a.sellerPerson),
    arrangedBy: a.arrangedByPerson ? a.arrangedByPerson.fullName : "3% Club",
    arrangedByPersonId: a.arrangedByPersonId ?? null,
    arrangedByCode: a.arrangedByPerson ? memberFirst(a.arrangedByPerson) : null,
    arrangedByType: a.arrangedByType,
    sourceBooking: a.sourceBooking
      ? `${a.sourceBooking.bookingNumber ?? "Booking Request"} · ${a.sourceBooking.project.name} ${a.sourceBooking.plot.plotNumber}`
      : null,
    purchaseDate: a.purchaseDate.toISOString(),
    paymentGivenPercent: a.paymentGivenPercent.toFixed(2),
    // SSOT §61 — the papers back where required, and Stable Buyback Completion.
    documentsReturnRequired: a.documentsReturnRequired,
    documentsReturnedAt: a.documentsReturnedAt?.toISOString() ?? null,
    stableCompletedAt: a.stableCompletedAt?.toISOString() ?? null,
    remark: a.remark,
    decisionNote: a.decisionNote,
    closedReason: a.closedReason,
    submittedByRef: a.submittedByRef,
    instalments: (a.scheduleVersions[0]?.instalments ?? []).map((i) => ({
      seq: i.seq,
      scheduled: i.scheduledPercent.toFixed(2),
      received: i.receivedPercent.toFixed(2),
      dueDate: i.dueDate.toISOString(),
      givenOn: givenOnBySeq.get(i.seq)?.toISOString() ?? null,
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
          recordId: a.commissions[0].id,
          earlyApproved: a.commissions[0].earlyApprovedAt !== null,
          beneficiary: a.commissions[0].beneficiaryPerson.fullName,
          beneficiaryPersonId: a.commissions[0].beneficiaryPersonId,
          beneficiaryCode: memberFirst(a.commissions[0].beneficiaryPerson),
          percent: a.commissions[0].percent.toFixed(2),
          eligibility: a.commissions[0].eligibility,
          payment: a.commissions[0].payment,
        }
      : null,
  };
}
