// Everything the Bookings screen needs, list or one Booking — DESIGN.md §10.
// Both routes render the same client, so both load the same props; a page file
// may not export anything but a page, hence this module.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import { listBookings } from "@/lib/services/booking-service";
import { locationChargeLabel } from "@/lib/domain/inventory";
import type { BookableView, BookingRowView } from "./bookings-client";

/**
 * What the Booking form needs wherever it opens — the Bookings screen, and Plot
 * Inventory's own Book button. It lives here rather than in two loaders so the
 * bookable-Plot rule is written once.
 */
export async function loadBookingFormData() {
  const [bookable, people, members] = await Promise.all([
    // A Booking Request starts from an Available Plot or from a live Hold
    // (PRD §11.1). Anything else is already committed.
    db.plot.findMany({
      where: {
        status: { in: ["AVAILABLE", "HOLD"] },
        restriction: "NONE",
        project: { status: { not: "SETUP_NOT_ACTIVE" } },
      },
      include: {
        project: true,
        boundaries: true,
        holds: { where: { status: "ACTIVE" }, include: { person: true }, take: 1 },
      },
      orderBy: [{ project: { name: "asc" } }, { plotNumber: "asc" }],
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
      take: 300,
    }),
    db.memberProfile.findMany({
      where: { status: "ACTIVE" },
      include: { person: true },
      orderBy: { memberId: "asc" },
    }),
  ]);

  const bookablePlots: BookableView[] = bookable.map((p) => ({
    id: p.id,
    projectId: p.projectId,
    projectName: p.project.name,
    plotNumber: p.plotNumber,
    plotType: p.plotType.replaceAll("_", " "),
    status: p.status,
    widthFt: p.widthFt?.toString() ?? null,
    lengthFt: p.lengthFt?.toString() ?? null,
    areaSqFt: p.areaSqFt.toString(),
    areaSqYd: p.areaSqYd.toDecimalPlaces(2).toString(),
    locationCharge: locationChargeLabel(p.boundaries),
    holdId: p.holds[0]?.id ?? null,
    holdPersonId: p.holds[0]?.personId ?? null,
    holdPersonName: p.holds[0]?.person.fullName ?? null,
  }));

  return {
    bookable: bookablePlots,
    people: people.map((p) => ({
      id: p.id,
      fullName: p.fullName,
      mobileMasked: maskMobile(p.primaryMobile),
      customerId: p.customerProfile?.customerId ?? null,
      memberId: p.memberProfile?.memberId ?? null,
    })),
    members: members.map((m) => ({
      personId: m.personId,
      memberId: m.memberId,
      fullName: m.person.fullName,
    })),
  };
}

/** One Booking as every list prints it. */
export const bookingRow = (b: Awaited<ReturnType<typeof listBookings>>[number]): BookingRowView => ({
    id: b.id,
    requestNo: b.requestNo,
    bookingNumber: b.bookingNumber,
    project: b.project.name,
    plotNumber: b.plot.plotNumber,
    plotType: b.plot.plotType,
    plotWidthFt: b.plot.widthFt?.toString() ?? null,
    plotLengthFt: b.plot.lengthFt?.toString() ?? null,
    plotAreaSqFt: b.plot.areaSqFt.toString(),
    primaryCustomer: b.primaryPerson.fullName,
    primaryCustomerId: b.primaryPerson.customerProfile?.customerId ?? null,
    primaryCustomerPersonId: b.primaryPersonId,
    // Approved Changes §19 / acceptance 20 — frozen when commission was first
    // generated, at Accounts approval. Null on a Booking never approved.
    originalClassification: b.originalClassification,
    // The buyer's Member ID only where they hold an Active Member profile now.
    // Null keeps an ordinary Booking silent about a distinction it does not have.
    buyerMemberIdNow:
      b.primaryPerson.memberProfile?.status === "ACTIVE"
        ? b.primaryPerson.memberProfile.memberId
        : null,
    soldByType: b.soldByType,
    soldByName: b.soldByPerson?.fullName ?? null,
    soldByCode:
      b.soldByType === "MEMBER"
        ? (b.soldByPerson?.memberProfile?.memberId ?? null)
        : b.soldByType === "CUSTOMER"
          ? (b.soldByPerson?.customerProfile?.customerId ?? null)
          : null,
    soldByPersonId: b.soldByPersonId ?? null,
    status: b.status,
    activeProcess: b.activeProcess,
    paymentReceivedPercent: b.paymentReceivedPercent.toFixed(2),
    bookingDate: b.bookingDate.toISOString(),
    submittedAt: b.submittedAt.toISOString(),
    submittedByRef: b.submittedByRef,
    pendingReviewVersion: b.reviewVersions[0]?.version ?? null,
});

export async function loadBookingsProps() {
  const actor = await requireStaff();
  const [bookings, form] = await Promise.all([listBookings(), loadBookingFormData()]);

  return {
    role: actor.role,
    actorName: actor.name,
    staffAccountId: actor.staffAccountId,
    staffRef: actor.staffAccountId,
    rows: bookings.map(bookingRow),
    ...form,
    permissions: {
      submit: can(actor.role, "BOOKING_REQUEST_SUBMIT"),
      decide: can(actor.role, "BOOKING_DECIDE"),
      cancel: can(actor.role, "BOOKING_CANCEL_REQUEST"),
      confirmPayment: can(actor.role, "PAYMENT_RECEIVED_CONFIRM"),
      correctPayment: can(actor.role, "PAYMENT_CORRECT"),
      reviseSchedule: can(actor.role, "SCHEDULE_REVISE"),
      decideSchedule: can(actor.role, "SCHEDULE_DECIDE"),
      changeShares: can(actor.role, "OWNERSHIP_SHARE_CHANGE"),
      decideCancellation: can(actor.role, "CANCELLATION_DECIDE"),
      raiseChangePlot: can(actor.role, "CHANGE_PLOT_RAISE"),
      decideChangePlot: can(actor.role, "CHANGE_PLOT_DECIDE"),
      raiseCustomerChange: can(actor.role, "PRIMARY_CUSTOMER_CHANGE_RAISE"),
      approveCustomerChange: can(actor.role, "PRIMARY_CUSTOMER_CHANGE_APPROVE"),
      processCommission: can(actor.role, "COMMISSION_PROCESS"),
      // AC-03 — MD alone, not Admin. Paid Early bypasses the eligibility
      // conditions, so the approval is deliberately narrower than full access.
      approvePaidEarly: actor.role === "MD",
      raiseSoldBy: can(actor.role, "SOLD_BY_CORRECTION_RAISE"),
      approveSoldBy: can(actor.role, "SOLD_BY_CORRECTION_APPROVE"),
      recordFinalBuyers: can(actor.role, "FINAL_BUYER_RECORD"),
      recordCompletion: can(actor.role, "COMPLETION_RECORD"),
      reopenDelivered: can(actor.role, "DELIVERY_REOPEN"),
    },
  };
}
