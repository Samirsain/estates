// Bookings — DESIGN.md §10, §11.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import { listBookings } from "@/lib/services/booking-service";
import BookingsClient, {
  type BookableView,
  type BookingRowView,
} from "./bookings-client";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  const actor = await requireStaff();

  const [bookings, bookable, people, members] = await Promise.all([
    listBookings(),
    // A Booking Request starts from an Available Plot or from a live Hold
    // (PRD §11.1). Anything else is already committed.
    db.plot.findMany({
      where: {
        lifecycle: { in: ["AVAILABLE", "HOLD"] },
        restriction: "NONE",
        project: { lifecycle: { not: "SETUP_NOT_ACTIVE" } },
      },
      include: {
        project: true,
        holds: { where: { status: "ACTIVE" }, include: { person: true }, take: 1 },
      },
      orderBy: [{ project: { name: "asc" } }, { plotNumber: "asc" }],
      take: 300,
    }),
    db.person.findMany({
      where: { mergeStatus: { not: "MERGED_AWAY" } },
      select: { id: true, fullName: true, primaryMobile: true },
      orderBy: { fullName: "asc" },
      take: 300,
    }),
    db.memberProfile.findMany({
      where: { status: "ACTIVE" },
      include: { person: true },
      orderBy: { memberId: "asc" },
    }),
  ]);

  const rows: BookingRowView[] = bookings.map((b) => ({
    id: b.id,
    requestNo: b.requestNo,
    bookingNumber: b.bookingNumber,
    project: b.project.name,
    plot: `${b.plot.plotType.replaceAll("_", " ")} ${b.plot.plotNumber}`,
    primaryCustomer: b.primaryPerson.fullName,
    soldByType: b.soldByType,
    soldByName: b.soldByPerson?.fullName ?? null,
    status: b.status,
    activeProcess: b.activeProcess,
    paymentReceivedPercent: b.paymentReceivedPercent.toFixed(2),
    bookingDate: b.bookingDate.toISOString(),
    submittedAt: b.submittedAt.toISOString(),
    submittedByRef: b.submittedByRef,
    pendingReviewVersion: b.reviewVersions[0]?.version ?? null,
  }));

  const bookablePlots: BookableView[] = bookable.map((p) => ({
    id: p.id,
    label: `${p.project.name} · ${p.plotType.replaceAll("_", " ")} ${p.plotNumber}`,
    lifecycle: p.lifecycle,
    holdId: p.holds[0]?.id ?? null,
    holdPersonId: p.holds[0]?.personId ?? null,
    holdPersonName: p.holds[0]?.person.fullName ?? null,
  }));

  return (
    <BookingsClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      staffRef={actor.staffAccountId}
      rows={rows}
      bookable={bookablePlots}
      people={people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        mobileMasked: maskMobile(p.primaryMobile),
      }))}
      members={members.map((m) => ({ personId: m.personId, label: `${m.memberId} · ${m.person.fullName}` }))}
      permissions={{
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
        raiseSoldBy: can(actor.role, "SOLD_BY_CORRECTION_RAISE"),
        approveSoldBy: can(actor.role, "SOLD_BY_CORRECTION_APPROVE"),
        recordFinalBuyers: can(actor.role, "FINAL_BUYER_RECORD"),
        recordCompletion: can(actor.role, "COMPLETION_RECORD"),
        reopenDelivered: can(actor.role, "DELIVERY_REOPEN"),
      }}
    />
  );
}
