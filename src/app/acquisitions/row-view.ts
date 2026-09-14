// One query and one mapping for an Acquisition, read by the list and by a
// single deal's page. Two copies of this drift the day one of them gains a
// field, and the page that missed it shows a quietly different record.

import { Prisma } from "@prisma/client";
import type { AcquisitionRowView } from "./types";

export const acquisitionInclude = {
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
} satisfies Prisma.AcquisitionInclude;

type AcquisitionWithRelations = Prisma.AcquisitionGetPayload<{
  include: typeof acquisitionInclude;
}>;

export function toAcquisitionRow(a: AcquisitionWithRelations): AcquisitionRowView {
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
    arrangedBy: a.arrangedByPerson ? a.arrangedByPerson.fullName : "3% Club",
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
  };
}
