// Customer detail page — /customers/[id]
//
// Built to system/change-requests/custmer-profile.md, top to bottom: Header ›
// Alerts › Summary › Contact · Identity · Bank › Properties › Property Activity
// › Loyalty & Commission › History. Left out on the owner's instruction: the
// Merged banner, the active-and-waiting bank accounts change, and Add Task.

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can, canViewField } from "@/lib/security/permissions";
import { maskAadhaar, maskMobile, maskPan } from "@/lib/security/identity";
import { eligibilityLabel, experienceSince, type CommissionType } from "@/lib/domain/commission";
import { validateFinalBuyers } from "@/lib/domain/completion";
import { formatIst, formatIstDateTime } from "@/lib/tasks";
import { auditHistory, mergeHistory, newestFirst, type HistoryItem } from "@/lib/profile-history";
import { TYPE_LABEL } from "@/app/acquisitions/types";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PersonDetailsEditor } from "@/components/person-details-editor";
import { PersonLink } from "@/components/person-link";
import { Row } from "@/components/fact-row";
import { AccountNumber, IdentityFacts } from "@/components/protected-identity";
import { MergeButton } from "./merge-button";
import { PaymentButton } from "./payment-button";
import {
  AlertTriangle,
  ArrowLeft,
  ShieldCheck,
  Banknote,
  User,
  FileText,
  Clock,
  MapPin,
  Layers,
  History,
} from "lucide-react";

export const dynamic = "force-dynamic";

/** Stored at UTC midnight, so it is read back in UTC: IST would print 11 Apr. */
const bornOn = (d: Date | null) =>
  d
    ? d.toLocaleDateString("en-IN", {
        timeZone: "UTC",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

/**
 * PENDING → "Pending", NOT_AVAILABLE → "Not available". AVAILABLE says
 * nothing the number above it has not already said, so it says nothing.
 */
function statusWord(status: string): string | undefined {
  if (status === "AVAILABLE") return undefined;
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
}

/** BOOKED → Booked, PAYMENT_COMPLETED → Payment completed. */
const words = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");

/** END_USER → End User, RESIDENTIAL → Residential. */
const titleWords = (v: string) =>
  v.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Anything waiting on somebody's decision says the same two words here as on
 * the Plot, the Booking and the Acquisition. Everything else is the enum read
 * as words.
 */
const WAITING_STATUS = new Set(["WAITING_FOR_BOOKING_APPROVAL", "REQUEST_PENDING", "PENDING_APPROVAL"]);
const statusWords = (status: string) =>
  WAITING_STATUS.has(status) ? "waiting approval" : status.replaceAll("_", " ").toLowerCase();

/** RGE-026 — the number is what a Plot is known by; its type is said where it is listed. */
const plotName = (p: { plotNumber: string }) => p.plotNumber;

/** A Hold runs 72 hours (HOLD_HOURS); its last day is when somebody has to act on it. */
const HOLD_EXPIRING_MS = 24 * 3_600_000;

function timeLeft(ms: number): string {
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  return `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m left`;
}

const PAYMENT_LABEL: Record<string, string> = {
  NOT_PAID: "Not Paid",
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  CANCELLED: "Cancelled",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Accounts Adjustment Required",
};

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

/** One table header style for every table on the page. */
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "py-2.5 pr-4 align-top";
const SUB = "block text-[11px] text-muted-foreground";

/**
 * Every block on the page is the same card: a quiet uppercase title, then the
 * content under it. One shape, so the page reads as one document.
 */
function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

/** A Summary answer: the label is quiet, the answer is not. */
function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 md:px-4 md:first:pl-0">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
      {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireStaff();
  const { id } = await params;

  // A contact number is masked on a shared screen, but MD and Admin run the
  // business off it, so they read it whole (PRD RD-05 covers the encrypted
  // values only — this one is a mask, not a protection).
  const contact = (value: string) =>
    canViewField(actor.role, "MOBILE_FULL") ? value : maskMobile(value);

  const customer = await db.customerProfile.findUnique({
    where: { id },
    include: {
      person: { include: { memberProfile: { select: { id: true, memberId: true } } } },
      royaltyLinkedMember: { include: { person: true } },
      royaltyLinkFirstBooking: { select: { id: true, bookingNumber: true, requestNo: true } },
    },
  });

  if (!customer) notFound();

  const personId = customer.personId;
  const bookingRef = { id: true, bookingNumber: true, requestNo: true } as const;

  const [
    enquiries,
    holds,
    holdRequests,
    bookings,
    banks,
    acquisitions,
    commissions,
    loyaltySlots,
    audit,
    merges,
    customerChanges,
    endedShares,
  ] = await Promise.all([
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
    db.holdRequest.findMany({
      where: { personId },
      include: { plot: { include: { project: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.booking.findMany({
      where: {
        OR: [{ primaryPersonId: personId }, { parties: { some: { personId } } }],
      },
      include: {
        project: true,
        plot: true,
        soldByPerson: {
          select: {
            id: true,
            fullName: true,
            memberProfile: { select: { memberId: true } },
            customerProfile: { select: { customerId: true } },
          },
        },
        parties: {
          where: { effectiveTo: null },
          include: {
            person: {
              select: { fullName: true, aadhaarStatus: true, dateOfBirth: true, addressLine: true },
            },
          },
        },
        completions: { where: { reopenedAt: null } },
        cancellations: true,
        changePlotRequests: { include: { fromPlot: true, toPlot: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    db.bankDetail.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
    }),
    // Buyback / Resale where this Customer is the one selling back.
    db.acquisition.findMany({
      where: { sellerPersonId: personId },
      include: { plot: { include: { project: true } } },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    db.commissionRecord.findMany({
      where: { beneficiaryPersonId: personId, isCurrent: true },
      include: { booking: { select: bookingRef } },
      orderBy: { createdAt: "desc" },
    }),
    // PRD §6.5 — the lifetime Loyalty slots, read from the ledger so each slot
    // names the Booking that took it.
    db.commissionOpportunity.findMany({
      where: { kind: "LOYALTY", subjectPersonId: personId },
      include: { record: { select: { booking: { select: bookingRef } } } },
      orderBy: { slotIndex: "asc" },
    }),
    db.auditEvent.findMany({
      where: { entity: "Person", entityId: personId },
      orderBy: { at: "desc" },
      take: 100,
    }),
    db.personMergeRequest.findMany({
      where: { OR: [{ survivingPersonId: personId }, { mergedPersonId: personId }] },
      include: {
        survivingPerson: { select: { fullName: true } },
        mergedPerson: { select: { fullName: true } },
      },
    }),
    db.primaryCustomerChange.findMany({
      where: { OR: [{ fromPersonId: personId }, { toPersonId: personId }] },
      include: { booking: { select: bookingRef } },
    }),
    // Effective-dated share rows that have ended — the old share stays for History.
    db.bookingParty.findMany({
      where: { personId, effectiveTo: { not: null } },
      include: { booking: { select: bookingRef } },
    }),
  ]);

  const now = Date.now();

  // The Bookings this Customer is buying on: approved, and they are the
  // Primary or an Additional Customer. Being only a final registration buyer
  // is shown on the Booking's own row, not as a property of theirs.
  const deals = bookings.filter(
    (b) =>
      b.bookingNumber &&
      (b.primaryPersonId === personId ||
        b.parties.some((p) => p.personId === personId && p.kind === "COMMERCIAL"))
  );
  const bookedCount = deals.filter((b) =>
    ["BOOKED", "PAYMENT_COMPLETED", "REFUND_PENDING"].includes(b.status)
  ).length;
  const deliveredCount = deals.filter((b) => b.status === "DELIVERED").length;

  // End User or Investor is decided per purchase. The profile column of the
  // same name is written by nothing, so the latest deal answers first — the
  // way the Customers list reads it.
  const customerType = deals[0]?.customerType ?? customer.customerType;

  const firstBookingDate = bookings.at(-1)?.submittedAt ?? null;
  const experience = experienceSince(firstBookingDate);

  /* ---------------------------------------------------------------- alerts */

  // Paid in full, and the papers still have nobody complete to go to.
  const detailsDue = deals.filter(
    (b) =>
      b.status === "PAYMENT_COMPLETED" &&
      !validateFinalBuyers(
        b.parties
          .filter((p) => p.kind === "FINAL_REGISTRATION")
          .map((p) => ({
            personId: p.personId,
            sharePercent: p.sharePercent?.toString() ?? null,
            aadhaarRecorded: p.person.aadhaarStatus !== "PENDING",
            dateOfBirth: p.person.dateOfBirth,
            address: p.person.addressLine,
          }))
      ).ok
  );
  // The engine's own hold reasons, so the alert says exactly what it says.
  const blockedPayouts = commissions.filter(
    (c) =>
      c.payment === "NOT_PAID" &&
      (c.holdReason === "AADHAAR_PENDING" || c.holdReason === "BANK_VERIFICATION_PENDING")
  );
  const expiringHolds = holds.filter(
    (h) => h.status === "ACTIVE" && h.expiresAt.getTime() - now <= HOLD_EXPIRING_MS
  );
  const canCompleteDetails = can(actor.role, "FINAL_BUYER_RECORD", actor.extraPermissions);
  const canConfirmPayment = can(actor.role, "PAYMENT_RECEIVED_CONFIRM", actor.extraPermissions);
  // Same gate as the Plot Inventory row: Booked, with something left to receive.
  const payable = deals.filter(
    (b) => b.status === "BOOKED" && b.paymentReceivedPercent.lessThan(100)
  );

  /* ------------------------------------------------------ property activity */

  const activity: Array<{
    kind: string;
    variant: BadgeVariant;
    project: string;
    plot: string;
    plotId: string | null;
    href: string | null;
    status: string;
    note?: string;
    at: Date;
  }> = [
    ...enquiries.map((e) => ({
      kind: "Enquiry",
      variant: "info" as const,
      project: e.project.name,
      plot: e.plot ? plotName(e.plot) : "General",
      plotId: e.plot?.id ?? null,
      href: null,
      status: statusWords(e.status),
      at: e.createdAt,
    })),
    ...holds.map((h) => ({
      kind: "Hold",
      variant: "warning" as const,
      project: h.plot.project.name,
      plot: plotName(h.plot),
      plotId: h.plot.id,
      href: null,
      // PRD §10.5 — a frozen Hold's timer is not running, so it has no time left.
      status:
        h.status === "ACTIVE"
          ? timeLeft(h.expiresAt.getTime() - now)
          : h.status === "FROZEN"
            ? "paused for Booking approval"
            : statusWords(h.status),
      note:
        [
          h.status === "ACTIVE" ? `expires ${formatIstDateTime(h.expiresAt)}` : null,
          h.extensionCount
            ? `${h.extensionCount} extension${h.extensionCount === 1 ? "" : "s"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined,
      at: h.createdAt,
    })),
    ...holdRequests.map((r) => ({
      kind: "Hold Request",
      variant: "outline" as const,
      project: r.plot.project.name,
      plot: plotName(r.plot),
      plotId: r.plot.id,
      href: null,
      status: statusWords(r.status),
      at: r.createdAt,
    })),
    ...bookings.flatMap((b) => [
      {
        kind: "Booking",
        variant: "success" as const,
        project: b.project.name,
        plot: plotName(b.plot),
        plotId: b.plot.id,
        href: `/bookings/${b.id}`,
        status: statusWords(b.status),
        note: b.bookingNumber ?? b.requestNo,
        at: b.submittedAt,
      },
      ...b.changePlotRequests.map((c) => ({
        kind: "Change Plot",
        variant: "purple" as const,
        project: b.project.name,
        plot: `${plotName(c.fromPlot)} → ${plotName(c.toPlot)}`,
        plotId: c.toPlot.id,
        href: `/bookings/${b.id}`,
        status: statusWords(c.status),
        at: c.requestedAt,
      })),
      ...b.cancellations.map((c) => ({
        kind: "Cancellation",
        variant: "destructive" as const,
        project: b.project.name,
        plot: plotName(b.plot),
        plotId: b.plot.id,
        href: `/bookings/${b.id}`,
        status: statusWords(c.status),
        at: c.requestedAt,
      })),
      ...b.completions.flatMap((c) => [
        {
          kind: c.route === "ALLOTMENT" ? "Allotment" : "Registry",
          variant: "success" as const,
          project: b.project.name,
          plot: plotName(b.plot),
          plotId: b.plot.id,
          href: `/bookings/${b.id}`,
          status: "recorded",
          at: c.allotmentDate ?? c.registryDate ?? c.createdAt,
        },
        {
          kind: "Delivery",
          variant: "success" as const,
          project: b.project.name,
          plot: plotName(b.plot),
          plotId: b.plot.id,
          href: `/bookings/${b.id}`,
          status: "delivered",
          at: c.deliveredAt,
        },
      ]),
    ]),
    ...acquisitions.map((a) => ({
      kind: TYPE_LABEL[a.type] ?? "Buyback / Resale",
      variant: "purple" as const,
      project: a.plot?.project.name ?? a.propertyName ?? "—",
      plot: a.plot ? plotName(a.plot) : (a.propertyNumber ?? "—"),
      plotId: a.plot?.id ?? null,
      href: `/acquisitions/${a.id}`,
      status: statusWords(a.status),
      note: "as seller",
      at: a.submittedAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  /* --------------------------------------------------------------- history */

  // Customer Type is recorded per Booking, so a change is one deal answering
  // differently from the deal before it.
  const typeChanges: HistoryItem[] = [];
  let lastType: string | null = null;
  for (const b of [...deals].reverse()) {
    if (!b.customerType) continue;
    if (lastType && b.customerType !== lastType) {
      typeChanges.push({
        at: b.approvedAt ?? b.submittedAt,
        title: "Customer type changed",
        detail: `${titleWords(lastType)} → ${titleWords(b.customerType)} on ${b.bookingNumber}`,
      });
    }
    lastType = b.customerType;
  }

  const history = newestFirst([
    { at: customer.createdAt, title: `Customer profile created · ${customer.customerId}` },
    ...auditHistory(audit, contact),
    ...mergeHistory(merges, personId),
    ...customerChanges.map((c) => ({
      at: c.decidedAt ?? c.requestedAt,
      title: `Primary Customer change on ${c.booking.bookingNumber ?? c.booking.requestNo}`,
      detail: `${c.toPersonId === personId ? "To this Customer" : "Away from this Customer"} · ${words(c.status)} — ${c.reason}`,
      by: c.decidedByRef ?? c.requestedByRef,
    })),
    ...endedShares.map((p) => ({
      at: p.effectiveTo!,
      title: `${p.kind === "FINAL_REGISTRATION" ? "Final buyer" : "Ownership"} share ended on ${
        p.booking.bookingNumber ?? p.booking.requestNo
      }`,
      detail:
        [
          `${p.sharePercent ? p.sharePercent.toFixed(2) : "100.00"}% as ${
            p.role === "PRIMARY" ? "Primary" : "Additional"
          } Customer`,
          p.changeReason,
        ]
          .filter(Boolean)
          .join(" — "),
      by: p.actorRef,
    })),
    ...typeChanges,
  ]);

  const hasAlerts = detailsDue.length + blockedPayouts.length + expiringHolds.length > 0;

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Back on the left; everything staff can start from this Customer on
            the right, in the order a sale runs. Each one opens the screen that
            already does it, with this Customer chosen. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/customers"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Customers
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {can(actor.role, "ENQUIRY_MANAGE", actor.extraPermissions) && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/enquiries?for=${personId}`}>Start Enquiry</Link>
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link href="/plots?status=AVAILABLE">View Available Plots</Link>
            </Button>
            {can(actor.role, "HOLD_CREATE", actor.extraPermissions) && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/plots?status=AVAILABLE&for=${personId}`}>Hold a Plot</Link>
              </Button>
            )}
            {can(actor.role, "BOOKING_REQUEST_SUBMIT", actor.extraPermissions) && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/bookings?for=${personId}`}>Start Booking</Link>
              </Button>
            )}
            {canConfirmPayment && payable.length > 0 && (
              <PaymentButton
                bookings={payable.map((b) => ({
                  id: b.id,
                  label: `${b.bookingNumber} · ${b.project.name} · ${plotName(b.plot)}`,
                  receivedPercent: b.paymentReceivedPercent.toString(),
                }))}
              />
            )}
            {can(actor.role, "PERSON_MERGE", actor.extraPermissions) && (
              <MergeButton
                person={{
                  id: personId,
                  label: [
                    customer.person.fullName,
                    customer.customerId,
                    customer.person.memberProfile?.memberId,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }}
              />
            )}
            {can(actor.role, "PERSON_DETAILS_EDIT", actor.extraPermissions) && (
              <PersonDetailsEditor
                personId={customer.personId}
                bank={banks[0] ?? null}
                canEnterBank={can(actor.role, "BANK_DETAILS_ENTER", actor.extraPermissions)}
                person={{
                  fullName: customer.person.fullName,
                  mobile: customer.person.primaryMobile,
                  altMobile: customer.person.altMobile ?? "",
                  email: customer.person.email ?? "",
                  city: customer.person.city ?? "",
                  addressLine: customer.person.addressLine ?? "",
                  dateOfBirth: customer.person.dateOfBirth
                    ? customer.person.dateOfBirth.toISOString().slice(0, 10)
                    : "",
                }}
              />
            )}
          </div>
        </div>

        {/* Header and Summary — who they are, then four answers on one line. */}
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <User className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">{customer.person.fullName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{customer.customerId}</span>
                {customerType && <Badge variant="outline">{titleWords(customerType)}</Badge>}
                {/* The same Person, filed as a Member too. */}
                {customer.person.memberProfile && (
                  <Link href={`/members/${customer.person.memberProfile.id}`}>
                    <Badge variant="purple" className="hover:underline">
                      Also a Member · {customer.person.memberProfile.memberId}
                    </Badge>
                  </Link>
                )}
              </div>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-y-4 border-t border-border/60 pt-4 md:grid-cols-4 md:divide-x md:divide-border/60">
            <Stat label="Customer for" value={experience?.label ?? "—"} />
            <Stat label="Properties" value={`${bookedCount} booked · ${deliveredCount} delivered`} />
            <Stat
              label="Loyalty slots"
              value={`${customer.loyaltySlotsConsumed} of 3 used`}
              hint="Lifetime, never resets"
            />
            {/* CR-002 — the Member who was Sold By on the first qualifying
                purchase. Provisional until that purchase is paid in full or
                bought back; CR-003's "No Royalty Member" when that purchase was
                sold by the 3% Club or a Customer. */}
            {customer.royaltyLinkedMember ? (
              <Stat
                label="Royalty linked to"
                value={
                  <Link
                    href={`/members/${customer.royaltyLinkedMember.id}`}
                    className="text-primary hover:underline"
                  >
                    {customer.royaltyLinkedMember.memberId}
                  </Link>
                }
                hint={
                  customer.royaltyLinkFinalAt
                    ? `${customer.royaltyLinkedMember.person.fullName} · Position ${
                        customer.royaltyPosition ?? "—"
                      } at ${customer.royaltyRatePercent?.toFixed(2) ?? "—"}%`
                    : `${customer.royaltyLinkedMember.person.fullName} · Provisional`
                }
              />
            ) : customer.royaltyLinkFirstBookingId ? (
              <Stat
                label="Royalty linked to"
                value="No Royalty Member"
                hint="First purchase sold by 3% Club or a Customer"
              />
            ) : (
              <Stat label="Royalty linked to" value="—" hint="No qualifying purchase yet" />
            )}
          </dl>
        </Card>

        {/* Alerts — only when something is due. */}
        {hasAlerts && (
          <Card className="border-amber-500/40 p-4">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              Needs action
            </h2>
            <ul className="mt-2 divide-y divide-border/50 text-xs">
              {detailsDue.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <span className="font-semibold">Complete Customer Details</span>
                    <span className={SUB}>
                      {b.bookingNumber} · {b.project.name} · {plotName(b.plot)} is paid in full;
                      final buyer details are not complete.
                    </span>
                  </span>
                  {canCompleteDetails && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/bookings/${b.id}`}>Complete details</Link>
                    </Button>
                  )}
                </li>
              ))}
              {blockedPayouts.map((c) => (
                <li key={c.id} className="py-2.5">
                  <span className="font-semibold">
                    {c.holdReason === "AADHAAR_PENDING" ? "Aadhaar Pending" : "Bank not verified"}
                  </span>
                  <span className={SUB}>
                    Holds the {c.type === "LOYALTY" ? "Loyalty Bonus" : `${words(c.type)} commission`}
                    {c.booking ? ` on ${c.booking.bookingNumber ?? c.booking.requestNo}` : ""}.
                  </span>
                </li>
              ))}
              {expiringHolds.map((h) => (
                <li key={h.id} className="py-2.5">
                  <span className="font-semibold">Hold expiring</span>
                  <span className={SUB}>
                    <Link href={`/plots/${h.plot.id}`} className="text-primary hover:underline">
                      {h.plot.project.name} · {plotName(h.plot)}
                    </Link>{" "}
                    — {timeLeft(h.expiresAt.getTime() - now)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Who they are, how they prove it, where the money goes. */}
        <div className="grid gap-4 md:grid-cols-3">
          <Section title="Profile" icon={<User className="h-3.5 w-3.5" />}>
            <Row label="Mobile" value={contact(customer.person.primaryMobile)} />
            {customer.person.altMobile && (
              <Row label="Alternate Mobile" value={contact(customer.person.altMobile)} />
            )}
            <Row label="Email" value={customer.person.email ?? "—"} />
            {/* A blank Date of Birth or Address is shown rather than hidden:
                the gap is the reason Edit details exists. */}
            <Row label="Date of Birth" value={bornOn(customer.person.dateOfBirth)} />
            <Row label="City" value={customer.person.city ?? "—"} />
            <Row label="Address" value={customer.person.addressLine ?? "—"} />
          </Section>

          <Section title="Identity" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
            {/* Either the number or the reason there is not one — never
                "Not recorded" with "Pending" underneath saying it twice. */}
            <IdentityFacts
              personId={customer.personId}
              canReveal={canViewField(actor.role, "AADHAAR_FULL")}
              aadhaarMasked={
                customer.person.aadhaarLastFour
                  ? maskAadhaar(customer.person.aadhaarLastFour)
                  : (statusWord(customer.person.aadhaarStatus) ?? "—")
              }
              aadhaarHint={
                customer.person.aadhaarLastFour
                  ? statusWord(customer.person.aadhaarStatus)
                  : undefined
              }
              panMasked={
                customer.person.panMasked
                  ? maskPan(customer.person.panMasked)
                  : (statusWord(customer.person.panStatus) ?? "—")
              }
              panHint={
                customer.person.panMasked ? statusWord(customer.person.panStatus) : undefined
              }
            />
          </Section>

          <Section title="Bank" icon={<Banknote className="h-3.5 w-3.5" />}>
            {banks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No bank details recorded.</p>
            ) : (
              banks.map((b) => (
                <div key={b.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <Row
                    label="Account"
                    value={
                      <AccountNumber
                        bankDetailId={b.id}
                        lastFour={b.accountLastFour}
                        canReveal={canViewField(actor.role, "BANK_FULL")}
                      />
                    }
                    hint={
                      <Badge
                        variant={
                          b.status === "VERIFIED"
                            ? "success"
                            : b.status === "PENDING"
                              ? "warning"
                              : "outline"
                        }
                      >
                        {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                      </Badge>
                    }
                  />
                  <Row label="IFSC" value={b.ifsc} />
                  <Row label="Bank" value={b.bankName} />
                  <Row label="Branch" value={b.branchName ?? "—"} />
                  <Row label="Holder" value={b.accountHolder} />
                </div>
              ))
            )}
          </Section>
        </div>

        {/* Properties — one row per Booking they are buying on. */}
        <Section title={`Properties (${deals.length})`} icon={<MapPin className="h-3.5 w-3.5" />}>
          {deals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No approved Bookings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-xs">
                <thead className="border-b border-border/50">
                  <tr>
                    <th className={TH}>Booking</th>
                    <th className={TH}>Plot</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>Ownership</th>
                    <th className={TH}>Sold By</th>
                    <th className={`${TH} pr-0`}>Completion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {deals.map((b) => {
                    const commercial = b.parties.filter((p) => p.kind === "COMMERCIAL");
                    const finals = b.parties.filter((p) => p.kind === "FINAL_REGISTRATION");
                    const mine = commercial.find((p) => p.personId === personId);
                    // The final registration buyer is worth a line only where
                    // it is not simply the people who booked.
                    const finalDiffers =
                      finals.length > 0 &&
                      (finals.length !== commercial.length ||
                        finals.some((f) => !commercial.some((c) => c.personId === f.personId)));
                    const seller = b.soldByPerson;
                    const sellerCode =
                      b.soldByType === "MEMBER"
                        ? seller?.memberProfile?.memberId
                        : seller?.customerProfile?.customerId;
                    const done = b.completions[0];
                    const doneOn = done?.allotmentDate ?? done?.registryDate ?? null;
                    return (
                      <tr key={b.id}>
                        <td className={TD}>
                          <Link
                            href={`/bookings/${b.id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {b.bookingNumber}
                          </Link>
                        </td>
                        <td className={TD}>
                          <Link
                            href={`/plots/${b.plot.id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {b.plot.plotNumber}
                          </Link>
                          <span className={SUB}>
                            {titleWords(b.plot.plotType)} · {b.project.name}
                          </span>
                        </td>
                        <td className={TD}>
                          <span className="font-medium">{words(b.status)}</span>
                          <span className={`${SUB} tabular-nums`}>
                            {b.paymentReceivedPercent.toFixed(2)}% received
                          </span>
                        </td>
                        <td className={TD}>
                          <span className="font-medium">
                            {mine?.role === "ADDITIONAL" ? "Additional" : "Primary"}
                            <span className="tabular-nums">
                              {" · "}
                              {mine
                                ? mine.sharePercent
                                  ? `${mine.sharePercent.toFixed(2)}%`
                                  : "100%"
                                : "—"}
                            </span>
                          </span>
                          {finalDiffers && (
                            <span className={SUB}>
                              Final buyer:{" "}
                              {finals.map((f, i) => (
                                <span key={f.id}>
                                  {i > 0 && ", "}
                                  <PersonLink personId={f.personId} name={f.person.fullName} />
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className={TD}>
                          {b.soldByType === "THREE_PERCENT_CLUB" || !seller ? (
                            <span className="font-medium">3% Club</span>
                          ) : (
                            <>
                              <PersonLink
                                personId={seller.id}
                                name={sellerCode ?? seller.fullName}
                                as={b.soldByType === "MEMBER" ? "member" : undefined}
                                className="font-semibold"
                              />
                              {sellerCode && <span className={SUB}>{seller.fullName}</span>}
                            </>
                          )}
                        </td>
                        <td className={`${TD} pr-0`}>
                          {done ? (
                            <>
                              <span className="font-medium">
                                {done.route === "ALLOTMENT" ? "Allotment" : "Registry"}
                                {doneOn ? ` · ${formatIst(doneOn)}` : ""}
                              </span>
                              <span className={SUB}>Delivered {formatIst(done.deliveredAt)}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Property Activity — everything that happened, newest first, in three
            columns: what, where, and how it stands. */}
        <Section title="Property Activity" icon={<Clock className="h-3.5 w-3.5" />}>
          {activity.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Enquiries, Holds or Bookings yet.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-xs">
              {activity.map((a, index) => (
                <li
                  key={index}
                  className="flex flex-col gap-1 py-2.5 sm:grid sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                >
                  <span>
                    <Badge variant={a.variant}>{a.kind}</Badge>
                  </span>
                  <span className="min-w-0 truncate">
                    {a.href ? (
                      <Link href={a.href} className="text-primary hover:underline">
                        {a.project}
                      </Link>
                    ) : (
                      a.project
                    )}
                    <span className="text-muted-foreground"> · </span>
                    {a.plotId ? (
                      <Link href={`/plots/${a.plotId}`} className="font-medium text-primary hover:underline">
                        {a.plot}
                      </Link>
                    ) : (
                      <span className="font-medium">{a.plot}</span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted-foreground sm:text-right">
                    <span className="text-foreground">{a.status}</span> · {formatIst(a.at)}
                    {a.note && <span className="block">{a.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Loyalty & Commission */}
        <div className="grid gap-4 md:grid-cols-2">
          <Section
            title={`Loyalty slots (${customer.loyaltySlotsConsumed} of 3 used)`}
            icon={<Layers className="h-3.5 w-3.5" />}
          >
            <ul className="divide-y divide-border/40 text-xs">
              {[1, 2, 3].map((slot) => {
                const opportunity = loyaltySlots.find((o) => o.slotIndex === slot);
                const booking = opportunity?.record?.booking;
                return (
                  <li key={slot} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="font-medium">Slot {slot}</span>
                    <span className="text-right text-muted-foreground">
                      {opportunity?.status === "CONSUMED" ? (
                        <>
                          {booking ? (
                            <Link
                              href={`/bookings/${booking.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {booking.bookingNumber ?? booking.requestNo}
                            </Link>
                          ) : (
                            "Used"
                          )}
                          {opportunity.consumedAt ? ` · ${formatIst(opportunity.consumedAt)}` : ""}
                        </>
                      ) : opportunity?.reopenedReason ? (
                        `Open again · ${opportunity.reopenedReason}`
                      ) : (
                        "Open"
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section title="First qualifying purchase" icon={<FileText className="h-3.5 w-3.5" />}>
            {customer.royaltyLinkFirstBooking ? (
              <>
                <Row
                  label="Booking"
                  value={
                    <Link
                      href={`/bookings/${customer.royaltyLinkFirstBooking.id}`}
                      className="text-primary hover:underline"
                    >
                      {customer.royaltyLinkFirstBooking.bookingNumber ??
                        customer.royaltyLinkFirstBooking.requestNo}
                    </Link>
                  }
                />
                <Row
                  label="Royalty link"
                  value={
                    customer.royaltyLinkFinalAt
                      ? `Final on ${formatIst(customer.royaltyLinkFinalAt)}`
                      : "Provisional"
                  }
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No qualifying purchase yet.</p>
            )}
          </Section>
        </div>

        <Section title="Commission paid to this Customer" icon={<Layers className="h-3.5 w-3.5" />}>
          {commissions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No commission records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-xs">
                <thead className="border-b border-border/50">
                  <tr>
                    <th className={TH}>Booking</th>
                    <th className={TH}>Type</th>
                    <th className={`${TH} text-right`}>%</th>
                    <th className={TH}>Eligibility</th>
                    <th className={`${TH} pr-0`}>Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {commissions.map((c) => (
                    <tr key={c.id}>
                      <td className={TD}>
                        {c.booking ? (
                          <Link
                            href={`/bookings/${c.booking.id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {c.booking.bookingNumber ?? c.booking.requestNo}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={TD}>{c.type === "LOYALTY" ? "Loyalty Bonus" : words(c.type)}</td>
                      <td className={`${TD} text-right font-medium tabular-nums`}>
                        {c.percent.toFixed(2)}%
                      </td>
                      <td className={TD}>
                        {eligibilityLabel(c.eligibility, c.type as CommissionType)}
                        {c.holdReason && (
                          <span className="block text-[11px] text-amber-700">{words(c.holdReason)}</span>
                        )}
                      </td>
                      <td className={`${TD} pr-0`}>
                        {PAYMENT_LABEL[c.payment] ?? c.payment}
                        {c.paidOn && <span className={SUB}>{formatIst(c.paidOn)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* History — one timeline, newest first. */}
        <Section title="History" icon={<History className="h-3.5 w-3.5" />}>
          <ul className="divide-y divide-border/40 text-xs">
            {history.map((h, index) => (
              <li key={index} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{h.title}</span>
                  {h.detail && <span className={SUB}>{h.detail}</span>}
                </span>
                <span className="text-right text-[11px] text-muted-foreground">
                  {formatIstDateTime(h.at)}
                  {h.by && <span className="block">{h.by}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </AppShell>
  );
}
