// Member detail page — /members/[id]
//
// Built to system/change-requests/Member_Profile_Revised_Requirements.md, top to
// bottom: Header › Summary › Contact & Identity › RERA › Bank › Bookings &
// Benefits (every Booking this Member sold and all it earned them) › Indirect
// Benefits (Rewards with invited Members, Royalty Points with linked Customers,
// side by side; then Commission from other Bookings). History
// opens from the top bar; long lists show their first rows behind "Show more". A profile and a place to manage the
// Member — deliberately not an alert dashboard, so there is no Alerts section,
// no RERA countdown and no Terms version on the page.

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can, canViewField } from "@/lib/security/permissions";
import { maskAadhaar, maskMobile, maskPan } from "@/lib/security/identity";
import { eligibilityLabel, experienceSince, payoutStep } from "@/lib/domain/commission";
import { formatIst, formatIstDateTime, istDay } from "@/lib/tasks";
import { auditHistory, mergeHistory, newestFirst } from "@/lib/profile-history";
import { TYPE_LABEL } from "@/app/acquisitions/types";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PersonDetailsEditor } from "@/components/person-details-editor";
import { PersonLink } from "@/components/person-link";
import { Row } from "@/components/fact-row";
import { Section, Stat } from "@/components/record-section";
import { AccountNumber, IdentityValue } from "@/components/protected-identity";
import { MergeButton } from "@/app/customers/[id]/merge-button";
import { MemberActions } from "./member-actions";
import { AddTaskButton } from "./add-task-button";
import RoyaltyTokens from "./royalty-tokens";
import { memberTokenView } from "@/lib/services/royalty-service";
import TripSection from "./trip-section";
import { PayoutCell } from "./payout-button";
import { tripProgrammes } from "@/lib/trip-view";
import HistoryButton from "./history-button";
import { BankAccounts } from "@/app/customers/[id]/bank-accounts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ShowMore from "./show-more";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Check,
  ChevronDown,
  Coins,
  ListFilter,
  FileText,
  Gift,
  ShieldCheck,
  UserCheck,
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

/** BOOKED → Booked, PAYMENT_COMPLETED → Payment completed. */
const words = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");

/** 1 Hold, 2 Holds. */
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** RESIDENTIAL → Residential. */
const titleWords = (v: string) =>
  v.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const WAITING_STATUS = new Set(["WAITING_FOR_BOOKING_APPROVAL", "REQUEST_PENDING", "PENDING_APPROVAL"]);
const statusWords = (status: string) =>
  WAITING_STATUS.has(status) ? "Waiting approval" : words(status);

const RERA_LABEL: Record<string, string> = {
  REGISTERED: "Registered",
  PENDING: "Pending",
  EXPIRED: "Expired",
  NOT_APPLICABLE: "Not Applicable",
};

/** Hold reasons whose stored name reads badly as words; the rest go through words(). */
const HOLD_LABEL: Record<string, string> = {
  RECOVERY_CIRCUMVENTION_REVIEW: "Recovery Review",
  RECOVERY_OUTSTANDING: "Recovery Pending",
};
const PAYMENT_LABEL: Record<string, string> = {
  NOT_PAID: "Not Paid",
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  CANCELLED: "Cancelled",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Recovery Pending",
};

/** One table style for every table on the page: each column centred under its heading (owner, 28 Oct 2026). */
const TH = "px-2 pb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "px-2 py-2.5 text-center align-middle";
const SUB = "block text-[11px] text-muted-foreground";
// Members Invited: three columns matching the Rewards table (trip-section.tsx).
const INVITED_GRID = "grid grid-cols-[1fr_auto_1fr] items-start gap-x-2";
const INVITED_SLOT = "inline-block w-24 text-center";
// TH without its right padding and left alignment, which would push the columns off.
const INVITED_TH = "pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";


/**
 * The first few rows of a list, and the rest behind "Show more" on the same
 * page. Long lists made the profile hard to read; nothing is dropped.
 */
function ShortList<T>({
  items,
  first,
  render,
}: {
  items: T[];
  first: number;
  render: (item: T) => React.ReactNode;
}) {
  const head = <ul className="divide-y divide-border/40 text-xs">{items.slice(0, first).map(render)}</ul>;
  if (items.length <= first) return head;
  return (
    <ShowMore count={items.length - first}>
      {head}
      <ul className="hidden divide-y divide-border/40 border-t border-border/40 text-xs group-data-[open]/more:block">
        {items.slice(first).map(render)}
      </ul>
    </ShowMore>
  );
}

/**
 * A network list (Members Invited, Royalty Customers): who, with their name
 * under the ID; their first purchase, the Plot with its Project; and one
 * status or nothing. Lined up with the Rewards table above: the sides share
 * the width, so the middle is centred, and Status sits in the same right slot.
 */
function NetworkList({
  who,
  rows,
}: {
  who: string;
  rows: {
    id: string;
    href: string;
    code: string;
    name: string;
    sale: { id: string; plot: string; project: string } | null;
    status: React.ReactNode;
  }[];
}) {
  return (
    <>
      <div className={`${INVITED_GRID} border-b border-border/50 pt-2`}>
        <span className={INVITED_TH}>{who}</span>
        <span className={INVITED_TH + " text-center"}>Plot</span>
        <span className={INVITED_TH + " text-right"}>
          <span className={INVITED_SLOT}>Status</span>
        </span>
      </div>
      <ShortList
        items={rows}
        first={5}
        render={(r) => (
          <li key={r.id} className={`${INVITED_GRID} py-2.5`}>
            <span className="min-w-0">
              <Link href={r.href} className="font-semibold text-primary hover:underline">
                {r.code}
              </Link>
              <span className="block text-[11px] font-medium text-foreground">{r.name}</span>
            </span>
            <span className="whitespace-nowrap text-center">
              {r.sale ? (
                <>
                  <Link href={`/bookings/${r.sale.id}`} className="font-semibold text-primary hover:underline">
                    {r.sale.plot}
                  </Link>
                  <span className="block text-[11px] font-medium text-foreground">{r.sale.project}</span>
                </>
              ) : (
                "—"
              )}
            </span>
            <span className="text-right">
              <span className={`${INVITED_SLOT} font-medium text-emerald-700`}>{r.status}</span>
            </span>
          </li>
        )}
      />
    </>
  );
}

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ctype?: string; cpay?: string; progress?: string }>;
}) {
  const actor = await requireStaff();
  const [{ id }, { ctype, cpay, progress }] = await Promise.all([params, searchParams]);

  // The same masking rule as every other screen: MD and Admin read a mobile
  // whole, everyone else sees it masked.
  const contact = (value: string) =>
    canViewField(actor.role, "MOBILE_FULL") ? value : maskMobile(value);

  const member = await db.memberProfile.findUnique({
    where: { id },
    include: {
      person: { include: { customerProfile: { select: { id: true, customerId: true } } } },
      invitedByMember: { include: { person: true } },
      invitedMembers: { include: { person: true }, orderBy: { activationDate: "asc" } },
      termsAcceptances: { select: { version: true, acceptedAt: true } },
    },
  });

  if (!member) notFound();
  const personId = member.personId;

  const [
    commissions,
    banks,
    royaltyLinkedCustomers,
    soldBookings,
    holdRequests,
    enquiries,
    audit,
    merges,
    tasks,
    tokens,
    tripCredits,
    tripBuckets,
    referenceWins,
    openRecoveries,
  ] = await Promise.all([
    db.commissionRecord.findMany({
      where: {
        beneficiaryPersonId: personId,
        // Current records only; the profile no longer shows superseded ones.
        isCurrent: true,
      },
      include: {
        booking: {
          include: {
            project: true,
            plot: true,
            primaryPerson: { include: { customerProfile: { select: { customerId: true } } } },
          },
        },
        acquisition: {
          include: {
            plot: { include: { project: true } },
            sellerPerson: { include: { customerProfile: { select: { customerId: true } } } },
          },
        },
      },
      orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.bankDetail.findMany({ where: { personId }, orderBy: { createdAt: "desc" } }),
    db.customerProfile.findMany({
      where: { royaltyLinkedMemberId: member.id },
      include: {
        person: true,
        // CP §68 — the first purchase that made the relationship.
        royaltyLinkFirstBooking: { select: { id: true, plot: { select: { plotNumber: true } }, project: { select: { name: true } } } },
        // The points this Member earned through the Customer, for Royalty Customers.
        royaltyAwards: { where: { memberProfileId: member.id, state: { not: "REVERSED" } }, select: { tokens: true, state: true } },
      },
      orderBy: { royaltyLinkFinalAt: "asc" },
    }),
    db.booking.findMany({
      where: { soldByType: "MEMBER", soldByPersonId: personId },
      include: {
        project: true,
        plot: true,
        primaryPerson: { include: { customerProfile: { select: { customerId: true } } } },
      },
      orderBy: { submittedAt: "desc" },
      take: 100,
    }),
    db.holdRequest.findMany({
      where: { memberId: member.id },
      include: { plot: { include: { project: true } }, person: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.enquiry.findMany({
      where: { sourceMemberId: member.id },
      include: { plot: true, project: true, person: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.auditEvent.findMany({
      where: {
        OR: [
          { entity: "Person", entityId: personId },
          { entity: "MemberProfile", entityId: member.id },
        ],
      },
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
    db.task.findMany({
      where: { recordKind: "Member", recordId: member.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    // docss/11 — the Member's Royalty Tokens: figures, spending, the awards behind them.
    memberTokenView(id, "STAFF"),
    // SSOT §40, §47; CP §68 — the Trip credits and buckets this Member owns.
    db.tripCredit.findMany({
      where: { memberProfileId: id },
      select: {
        id: true,
        projectId: true,
        programmeCode: true,
        creditType: true,
        state: true,
        bucketId: true,
        expiresAt: true,
        qualificationRoute: true,
        qualifiedAt: true,
        createdAt: true,
        reversalReason: true,
        sourceBooking: { select: { id: true, bookingNumber: true, plot: { select: { plotNumber: true } } } },
        introducedMember: { select: { id: true, memberId: true, person: { select: { fullName: true } } } },
        settingsVersion: { select: { tripTotalTarget: true, tripMinOwnCredits: true, tripMaxReferenceCredits: true, tripTermsVersionRef: true } },
      },
    }),
    db.tripBucket.findMany({
      where: { memberProfileId: id },
      include: { reward: true },
      orderBy: { openedAt: "desc" },
    }),
    // Each invited Member's first sale for Members Invited: the Booking that
    // used their Reference opportunity (SSOT §49), else their earliest live sale.
    db.booking.findMany({
      where: {
        OR: [
          { id: { in: member.invitedMembers.map((m) => m.referenceWinningBookingId).filter((b): b is string => !!b) } },
          {
            soldByType: "MEMBER",
            soldByPersonId: { in: member.invitedMembers.map((m) => m.personId) },
            status: { in: ["BOOKED", "PAYMENT_COMPLETED", "DELIVERED", "BUYBACK_COMPLETED"] },
          },
        ],
      },
      select: { id: true, soldByPersonId: true, plot: { select: { plotNumber: true } }, project: { select: { name: true } } },
      orderBy: { bookingDate: "asc" },
    }),
    db.recovery.findMany({ where: { personId, status: "OUTSTANDING" }, orderBy: { dueOn: "asc" } }),
  ]);

  // Royalty Customers shows only those who acted after their first purchase:
  // bought again themselves, or sold a Plot to someone (Sold By Customer).
  const customerActivity = await db.booking.findMany({
    where: {
      approvedAt: { not: null },
      status: { notIn: ["CANCELLED", "REQUEST_REJECTED", "REQUEST_CANCELLED"] },
      OR: [
        { primaryPersonId: { in: royaltyLinkedCustomers.map((c) => c.personId) } },
        { soldByType: "CUSTOMER", soldByPersonId: { in: royaltyLinkedCustomers.map((c) => c.personId) } },
      ],
    },
    select: { id: true, primaryPersonId: true, soldByType: true, soldByPersonId: true },
  });

  const experience = experienceSince(member.activationDate);
  const canPayCommission = can(actor.role, "COMMISSION_PROCESS", actor.extraPermissions);
  const canManage = can(actor.role, "MEMBER_ACTIVATE", actor.extraPermissions);

  // An invited Member's first sale: the one that used their Reference, else
  // their earliest (the list arrives oldest first).
  const firstSale = (m: { personId: string; referenceWinningBookingId: string | null }) =>
    referenceWins.find((b) => b.id === m.referenceWinningBookingId) ??
    referenceWins.find((b) => b.soldByPersonId === m.personId);

  // The account that is current: the verified one, or the one waiting when
  // nothing is verified yet. The Bank card opens on it.
  const bank =
    banks.find((b) => b.status === "VERIFIED") ?? banks.find((b) => b.status === "PENDING") ?? null;

  /* ------------------------------------------------------------- deals */

  // A Booking Request has no Booking number until Accounts approve it, and a
  // rejected or withdrawn one never becomes a Booking at all — none of them
  // is a sale yet, so they wait in "In progress", not in the Bookings table.
  const REQUEST_STATUS = new Set(["REQUEST_PENDING", "REQUEST_REJECTED", "REQUEST_CANCELLED"]);
  const bookingRequests = soldBookings.filter((b) => REQUEST_STATUS.has(b.status));
  const realBookings = soldBookings.filter((b) => !REQUEST_STATUS.has(b.status));
  const REQUEST_WORDS: Record<string, string> = {
    REQUEST_PENDING: "Waiting approval",
    REQUEST_REJECTED: "Rejected",
    REQUEST_CANCELLED: "Cancelled",
  };

  const requestsAndEnquiries = [
    ...bookingRequests.map((b) => ({
      id: b.id,
      kind: "Booking Request",
      plot: b.plot.plotNumber,
      plotId: b.plot.id as string | null,
      project: b.project.name,
      buyer: b.primaryPerson.customerProfile?.customerId ?? b.primaryPerson.fullName,
      buyerId: b.primaryPerson.id,
      condition: REQUEST_WORDS[b.status] ?? words(b.status),
      // The REQ number is off the screens (ID Guide §5): Plot, buyer and date say which.
      ref: null as string | null,
      at: b.submittedAt,
    })),
    ...holdRequests.map((r) => ({
      id: r.id,
      kind: "Hold Request",
      plot: r.plot.plotNumber,
      plotId: r.plot.id,
      project: r.plot.project.name,
      buyer: r.person.fullName,
      buyerId: r.person.id,
      condition: r.status === "WITHDRAWN" ? "Cancelled" : words(r.status),
      ref: null,
      at: r.createdAt,
    })),
    ...enquiries.map((e) => ({
      id: e.id,
      kind: "Enquiry",
      plot: e.plot?.plotNumber ?? "General",
      plotId: e.plot?.id ?? null,
      project: e.project.name,
      buyer: e.person.fullName,
      buyerId: e.person.id,
      condition: words(e.status),
      ref: null,
      at: e.createdAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  // In progress filters by condition (Expired, Pending, …), on the URL like the
  // commission chips; the Filter menu lists only the conditions this Member has.
  const conditions = [...new Set(requestsAndEnquiries.map((r) => r.condition))].sort();
  const activeCondition = conditions.includes(progress ?? "") ? progress! : null;
  const shownProgress = activeCondition
    ? requestsAndEnquiries.filter((r) => r.condition === activeCondition)
    : requestsAndEnquiries;

  /* --------------------------------------------------------------- history */

  const history = newestFirst([
    ...auditHistory(audit, contact),
    ...mergeHistory(merges, personId),
    ...member.termsAcceptances.map((t) => ({ at: t.acceptedAt, title: "Terms accepted on the portal" })),
    ...tasks.map((t) => ({
      at: t.createdAt,
      title: `Task added — ${t.title}`,
      detail: `Due ${formatIstDateTime(t.dueAt)} · ${t.status === "COMPLETED" ? "Completed" : "Pending"}${
        t.urgent ? " · Urgent" : ""
      }`,
    })),
  ]);

  /* CR — the Commission block filters by kind of benefit, on the URL so the
     page stays a server component. Only the kinds this Member actually holds
     get a chip; a fixed row of five would leave two or three dead buttons on
     most profiles. */
  const commissionTypes = [...new Set(commissions.map((c) => c.type))].sort();
  const activeType = commissionTypes.includes(ctype as (typeof commissionTypes)[number])
    ? ctype
    : null;
  // The payment filter: Hold is an unpaid line On Hold, Not Paid every other
  // unpaid one, so each line sits under exactly one of the four.
  const PAY_FILTER: Record<string, { label: string; test: (c: (typeof commissions)[number]) => boolean }> = {
    NOT_PAID: { label: "Not Paid", test: (c) => c.payment === "NOT_PAID" && c.eligibility !== "ON_HOLD" },
    HOLD: { label: "Hold", test: (c) => c.payment === "NOT_PAID" && c.eligibility === "ON_HOLD" },
    PAID: { label: "Paid", test: (c) => c.payment === "PAID" },
    PAID_EARLY: { label: "Paid Early", test: (c) => c.payment === "PAID_EARLY" },
  };
  const activePay = cpay && PAY_FILTER[cpay] ? cpay : null;
  const shownCommissions = commissions.filter(
    (c) => (!activeType || c.type === activeType) && (!activePay || PAY_FILTER[activePay].test(c))
  );
  // Every filter rides on the URL, so changing one keeps the others' choice.
  const filterHref = (next: Partial<Record<"ctype" | "cpay" | "progress", string | null>>) => {
    const state = { ctype: activeType ?? null, cpay: activePay, progress: activeCondition, ...next };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(state)) if (value) query.set(key, value);
    return `/members/${member.id}${query.size ? `?${query}` : ""}`;
  };
  const commissionHref = (type: string | null) => filterHref({ ctype: type });

  /* Booking Commission — every Booking this Member sold, with the commission
     lines each one earned them (under the type filter). Reward credit and
     Royalty Points stay in their own cards below, not repeated here. */
  const soldIds = new Set(soldBookings.map((b) => b.id));
  // A Buyback or Resale of a Booking carries its Buying Commission on the
  // Acquisition; it reads on the row of the Booking it came from.
  const bookingOf = (c: { bookingId: string | null; acquisition: { sourceBookingId: string | null } | null }) =>
    c.bookingId ?? c.acquisition?.sourceBookingId ?? null;
  const onSold = (c: Parameters<typeof bookingOf>[0]) => {
    const id = bookingOf(c);
    return id !== null && soldIds.has(id);
  };
  const linesOn = (bookingId: string) => shownCommissions.filter((c) => bookingOf(c) === bookingId);
  // Commission that is not on a Booking this Member sold: a Buyback or Resale
  // they handled belongs with their deals; a line on someone else's Booking
  // (a Reference, Loyalty) is an indirect benefit.
  // A type (Buying, Direct…) or payment chosen narrows the table to the
  // Bookings that carry it, instead of listing every Booking with an empty cell.
  const shownBookings =
    activeType || activePay ? realBookings.filter((b) => linesOn(b.id).length > 0) : realBookings;
  const acquisitionLines = shownCommissions.filter((c) => c.acquisition && !onSold(c));

  /* One row shape for both kinds of deal, so a Buyback or Resale this Member
     arranged reads in the same table and columns as a Booking they sold: the
     seller stands where the Customer does, Payment Given where Received does. */
  type DealRow = {
    id: string;
    href: string;
    ref: string;
    at: Date;
    project: string;
    plotId: string | null;
    plotNumber: string;
    plotType: string | null;
    person: { id: string; fullName: string; customerProfile: { customerId: string } | null };
    personRole: string | null;
    status: string;
    /** A Buyback or Resale's own status ("Approved"), on the line under it. */
    statusSub?: string;
    payment: string;
    lines: Line[];
  };
  const dealRows: DealRow[] = [
    ...shownBookings.map((b) => ({
      id: b.id,
      href: `/bookings/${b.id}`,
      ref: b.bookingNumber ?? "Booking Request",
      at: b.submittedAt,
      project: b.project.name,
      plotId: b.plot.id as string | null,
      plotNumber: b.plot.plotNumber,
      plotType: b.plot.plotType as string | null,
      person: b.primaryPerson,
      personRole: null,
      status: statusWords(b.status),
      payment: `${b.paymentReceivedPercent.toFixed(2)}% received`,
      lines: linesOn(b.id),
    })),
    ...acquisitionLines.map((c) => {
      const a = c.acquisition!;
      return {
        id: c.id,
        href: `/acquisitions/${a.id}`,
        ref: TYPE_LABEL[a.type] ?? "Buyback / Resale",
        at: a.submittedAt,
        project: a.plot?.project.name ?? a.propertyName ?? "—",
        plotId: a.plot?.id ?? null,
        plotNumber: a.plot?.plotNumber ?? a.propertyNumber ?? "—",
        plotType: a.plot?.plotType ?? null,
        person: a.sellerPerson,
        personRole: "Seller",
        status: TYPE_LABEL[a.type] ?? "Buyback / Resale",
        statusSub: statusWords(a.status),
        payment: `${a.paymentGivenPercent.toFixed(2)}% given`,
        lines: [c],
      };
    }),
  ].sort((x, y) => y.at.getTime() - x.at.getTime());
  const otherBookingLines = shownCommissions.filter((c) => c.bookingId && !soldIds.has(c.bookingId));

  const current = commissions.filter((c) => c.isCurrent && (onSold(c) || c.acquisition));
  const paid = (c: (typeof current)[number]) => c.payment === "PAID" || c.payment === "PAID_EARLY";
  const commissionSummary = [
    `${current.filter(paid).length} commission paid`,
    `${current.filter((c) => !paid(c) && c.eligibility === "READY").length} ready to pay`,
    `${current.filter((c) => !paid(c) && c.eligibility === "ON_HOLD").length} on hold`,
    `${current.filter((c) => !paid(c) && c.eligibility === "MILESTONE_PENDING").length} payment pending`,
  ].join(" · ");

  /* Indirect Benefits — who this Member brought in. */
  const royaltyActive = royaltyLinkedCustomers.filter((c) =>
    customerActivity.some(
      (b) =>
        (b.primaryPersonId === c.personId && b.id !== c.royaltyLinkFirstBookingId) ||
        (b.soldByType === "CUSTOMER" && b.soldByPersonId === c.personId)
    )
  );
  // A Royalty Customer's status, on every row: the points earned through them
  // ("10 Points") with Earned under it once posted; otherwise Pending — an
  // award not yet posted, or none yet.
  const pointsFrom = (awards: { tokens: number; state: string }[]) => {
    const released = awards.filter((a) => a.state === "RELEASED").reduce((n, a) => n + a.tokens, 0);
    const pending = awards.filter((a) => a.state === "PENDING").reduce((n, a) => n + a.tokens, 0);
    const n = released || pending;
    return (
      <>
        {n > 0 && <span className="block font-semibold text-foreground">{n} {n === 1 ? "Point" : "Points"}</span>}
        {released ? (
          <span className="block text-emerald-700">Earned</span>
        ) : (
          <span className="block text-amber-700">Pending</span>
        )}
      </>
    );
  };

  type Line = (typeof shownCommissions)[number];
  // When every line in the Booking Commission table is one kind, the heading
  // names it once ("Direct Commission") instead of every line repeating it.
  const dealTypes = new Set(dealRows.flatMap((d) => d.lines.map((l) => l.type)));
  const oneDealType = dealTypes.size === 1 ? [...dealTypes][0] : null;
  /** One commission line: "Direct 3.00% at 25% paid", then "Ready · Paid 12/08/2026". */
  // Where a Payout column stands beside it, the payment state is said there.
  const lineWords = (c: Line, showType = true, showPayment = true) => (
    <span key={c.id} className="block">
      {showType && (
        <>
          <span className="font-medium text-foreground">{words(c.type)}</span>{" "}
        </>
      )}
      <span className="font-semibold tabular-nums text-foreground">{c.percent.toFixed(2)}%</span>
      <span className="text-muted-foreground"> at {c.milestonePercent.toFixed(0)}% paid</span>
      <span className="block">
        {eligibilityLabel(c.eligibility)}
        {showPayment && (
          <>
            {" · "}
            {PAYMENT_LABEL[c.payment] ?? c.payment}
            {c.paidOn && ` ${formatIst(c.paidOn)}`}
          </>
        )}
        {!c.isCurrent && " · Not valid"}
      </span>
      {c.holdReason && (
        <span className="block text-[11px] text-amber-700">{HOLD_LABEL[c.holdReason] ?? words(c.holdReason)}</span>
      )}
    </span>
  );
  /** A commission line on a Booking someone else sold (Reference, Loyalty). */
  const commissionRow = (c: Line) => {
    const plot = c.booking?.plot ?? c.acquisition?.plot ?? null;
    return (
      <li key={c.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
        <span className="min-w-0">
          {c.booking ? (
            <Link href={`/bookings/${c.booking.id}`} className="font-semibold text-primary hover:underline">
              {c.booking.bookingNumber ?? "Booking Request"}
            </Link>
          ) : c.acquisition ? (
            <Link href={`/acquisitions/${c.acquisition.id}`} className="font-semibold text-primary hover:underline">
              {TYPE_LABEL[c.acquisition.type] ?? "Buyback / Resale"}
            </Link>
          ) : null}
          <span className={SUB}>
            {c.booking?.project.name ?? c.acquisition?.plot?.project.name ?? "—"} ·{" "}
            {plot?.plotNumber ?? c.acquisition?.propertyNumber ?? "—"}
          </span>
        </span>
        <span className="text-right">{lineWords(c)}</span>
      </li>
    );
  };
  /** The deals table; called twice so "Show more" opens a second one. */
  // Rows past `first` start hidden and open in place under <ShowMore>.
  const dealTable = (rows: DealRow[], first: number) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[60rem] text-xs">
        <thead className="border-b border-border/50">
          <tr>
            <th className={TH}>Booking</th>
            <th className={TH}>Project</th>
            <th className={TH}>Plot</th>
            <th className={TH}>Customer</th>
            <th className={TH}>Status</th>
            <th className={TH}>Payment</th>
            <th className={TH}>{oneDealType ? `${words(oneDealType)} Commission` : "Commission"}</th>
            {/* The Member's commission payout; "Payment" above is the buyer's. */}
            <th className={TH}>Payout</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map((d, i) => (
            <tr key={d.id} className={i >= first ? "hidden group-data-[open]/more:table-row" : undefined}>
              <td className={TD}>
                <Link href={d.href} className="font-semibold text-primary hover:underline">
                  {d.ref}
                </Link>
                <span className={SUB}>{formatIst(d.at)}</span>
              </td>
              <td className={`${TD} font-medium`}>{d.project}</td>
              <td className={TD}>
                {d.plotId ? (
                  <Link href={`/plots/${d.plotId}`} className="font-semibold text-primary hover:underline">
                    {d.plotNumber}
                  </Link>
                ) : (
                  <span className="font-semibold">{d.plotNumber}</span>
                )}
                {d.plotType && <span className={SUB}>{titleWords(d.plotType)}</span>}
              </td>
              <td className={TD}>
                <PersonLink
                  personId={d.person.id}
                  name={d.person.customerProfile?.customerId ?? d.person.fullName}
                  className="font-semibold"
                />
                <span className={SUB}>
                  {[d.person.customerProfile ? d.person.fullName : null, d.personRole].filter(Boolean).join(" · ")}
                </span>
              </td>
              <td className={`${TD} font-medium`}>
                {d.status}
                {d.statusSub && <span className={SUB}>{d.statusSub}</span>}
              </td>
              <td className={`${TD} tabular-nums`}>{d.payment}</td>
              <td className={TD}>
                {d.lines.length ? (
                  d.lines.map((c) => lineWords(c, !oneDealType, false))
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              {/* One payout per commission line: Paid with its date, else the
                  next step this viewer can take, else what it waits for. */}
              <td className={TD}>
                {d.lines.length === 0 && <span className="text-muted-foreground">—</span>}
                {d.lines.map((c) => (
                  <PayoutCell
                    key={c.id}
                    payment={c.payment}
                    paidOn={c.paidOn}
                    step={payoutStep(c, actor.role, canPayCommission)}
                    awaitingMd={!!c.earlyRequestedAt && !c.earlyApprovedAt}
                    recordId={c.id}
                    buying={!!c.acquisition}
                    label={`${words(c.type)} ${c.percent.toFixed(2)}% · ${d.ref} · ${d.plotNumber}`}
                  />
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const filterLink = (active: boolean) =>
    active
      ? "rounded-md bg-secondary px-2 py-0.5 font-semibold text-foreground"
      : "px-2 py-0.5 text-muted-foreground hover:text-foreground";

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Back on the left; what staff can do to this Member on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/members"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Members
            </Link>
            {/* CP §68 — a safe Recovery indicator, only when one is owed;
                Accounts' notes stay on the Booking. */}
            {openRecoveries.length > 0 && (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {openRecoveries.length === 1
                  ? `Recovery pending · ${openRecoveries[0].recoveryNo} due ${formatIst(openRecoveries[0].dueOn)}`
                  : `${openRecoveries.length} Recoveries pending · next due ${formatIst(openRecoveries[0].dueOn)}`}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {can(actor.role, "TASK_CREATE", actor.extraPermissions) && (
              <AddTaskButton
                record={{ kind: "Member", id: member.id, name: `${member.memberId} · ${member.person.fullName}` }}
              />
            )}
            {can(actor.role, "PERSON_MERGE", actor.extraPermissions) && (
              <MergeButton
                person={{
                  id: personId,
                  label: [member.person.fullName, member.person.customerProfile?.customerId, member.memberId]
                    .filter(Boolean)
                    .join(" · "),
                }}
              />
            )}
            <HistoryButton
              rows={history.map((h) => ({ at: formatIstDateTime(h.at), title: h.title, detail: h.detail, by: h.by }))}
            />
            <MemberActions
              member={{
                id: member.id,
                memberId: member.memberId,
                name: member.person.fullName,
                status: member.status,
                commissionHold: member.commissionHold,
                reraStatus: member.reraStatus,
                reraNumber: member.reraNumber,
                reraExpiryDate: member.reraExpiryDate?.toISOString() ?? null,
                reraNotApplicableReason: member.reraNotApplicableReason,
              }}
              canActivate={canManage}
              canDeactivate={can(actor.role, "MEMBER_DEACTIVATE", actor.extraPermissions)}
              canCorrectInviter={actor.role === "MD"}
            />
            {can(actor.role, "PERSON_DETAILS_EDIT", actor.extraPermissions) && (
              <PersonDetailsEditor
                personId={personId}
                bank={banks[0] ?? null}
                canEnterBank={can(actor.role, "BANK_DETAILS_ENTER", actor.extraPermissions)}
                person={{
                  fullName: member.person.fullName,
                  nickname: member.person.nickname ?? "",
                  mobile: member.person.primaryMobile,
                  altMobile: member.person.altMobile ?? "",
                  email: member.person.email ?? "",
                  city: member.person.city ?? "",
                  addressLine: member.person.addressLine ?? "",
                  dateOfBirth: member.person.dateOfBirth
                    ? member.person.dateOfBirth.toISOString().slice(0, 10)
                    : "",
                }}
              />
            )}
          </div>
        </div>

        {/* 1 Header · 2 Summary */}
        <Card className="p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight">{member.person.fullName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{member.memberId}</span>
                <Badge variant={member.status === "ACTIVE" ? "success" : "destructive"}>
                  {member.status === "ACTIVE" ? "Active" : "Deactivated"}
                </Badge>
                {member.commissionHold && <Badge variant="warning">Commission Hold</Badge>}
                {/* The same Person, filed as a Customer too. */}
                {member.person.customerProfile && (
                  <Link href={`/customers/${member.person.customerProfile.id}`}>
                    <Badge variant="purple" className="hover:underline">
                      Also a Customer · {member.person.customerProfile.customerId}
                    </Badge>
                  </Link>
                )}
              </div>
              {member.commissionHold && member.commissionHoldReason && (
                <p className="mt-1 max-w-prose text-xs text-amber-800">
                  Hold reason: {member.commissionHoldReason}
                </p>
              )}
              {member.legacyMemberIds.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Old Member IDs: {member.legacyMemberIds.join(", ")}
                </p>
              )}
            </div>

            <dl className="flex flex-wrap gap-x-10 gap-y-3">
              <Stat
                label="Member for"
                value={experience?.ago ?? "—"}
                hint={member.activationDate ? `Activated on ${formatIst(member.activationDate)}` : "Not activated"}
              />
              {/* No inviting Member means they came in through the 3% Club. */}
              <Stat
                label="Invited by"
                value={
                  member.invitedByMember ? (
                    <Link
                      href={`/members/${member.invitedByMember.id}`}
                      className="text-primary hover:underline"
                    >
                      <span className="block">{member.invitedByMember.memberId}</span>
                      <span className="block text-foreground">{member.invitedByMember.person.fullName}</span>
                    </Link>
                  ) : (
                    "3% Club"
                  )
                }
                hint={member.invitedByMember ? undefined : "No inviting Member — joined directly"}
              />
            </dl>
          </div>
        </Card>

        {/* 3 Contact & Identity · 4 RERA · 5 Bank */}
        <div className="grid gap-4 md:grid-cols-3">
          <Section fill title="Contact" icon={<UserCheck className="h-3.5 w-3.5" />}>
            <Row label="Nickname" value={member.person.nickname ?? "—"} />
            <Row label="Mobile" value={contact(member.person.primaryMobile)} />
            {member.person.altMobile && (
              <Row label="Alternate Mobile" value={contact(member.person.altMobile)} />
            )}
            <Row label="Email" value={member.person.email ?? "—"} />
            <Row label="Date of Birth" value={bornOn(member.person.dateOfBirth)} />
            <Row label="City" value={member.person.city ?? "—"} />
            <Row label="Address" value={member.person.addressLine ?? "—"} />
          </Section>

          {/* Aadhaar sits with RERA and PAN with the bank, so the three cards
              carry an even share of the page. Last four and status; the full
              number only to MD and Admin, and every read is logged. */}
          <Section fill title="Identity" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
            {/* Every RERA row says RERA. A bare "Status" sat above Aadhaar in the
                same card and read as Aadhaar's status. */}
            <Row
              label="RERA"
              value={
                <Badge
                  variant={
                    member.reraStatus === "REGISTERED" || member.reraStatus === "NOT_APPLICABLE"
                      ? "success"
                      : "destructive"
                  }
                >
                  {RERA_LABEL[member.reraStatus] ?? member.reraStatus}
                </Badge>
              }
            />
            {member.reraStatus === "NOT_APPLICABLE" ? (
              // Not Applicable has no number or expiry to show, only its reason.
              <Row label="Reason" value={member.reraNotApplicableReason ?? "—"} />
            ) : (
              <>
                <Row label="RERA Number" value={member.reraNumber ?? "—"} />
                <Row
                  label="RERA Expiry"
                  value={member.reraExpiryDate ? formatIst(member.reraExpiryDate) : "—"}
                />
              </>
            )}
            <Row
              label="Aadhaar"
              value={
                <IdentityValue
                  personId={personId}
                  field="aadhaar"
                  canReveal={canViewField(actor.role, "AADHAAR_FULL")}
                  masked={
                    member.person.aadhaarLastFour
                      ? maskAadhaar(member.person.aadhaarLastFour)
                      : "Not recorded"
                  }
                />
              }
              hint={words(member.person.aadhaarStatus)}
            />
            <Row
              label="PAN"
              value={
                <IdentityValue
                  personId={personId}
                  field="pan"
                  canReveal={canViewField(actor.role, "AADHAAR_FULL")}
                  masked={member.person.panMasked ? maskPan(member.person.panMasked) : "Not recorded"}
                />
              }
              hint={words(member.person.panStatus)}
            />
          </Section>

          {/* The current account first; the others open under "Show N more",
              as on the Customer profile. No status line on a Verified one:
              bank details are verified as they are entered, so it only ever
              said "Verified". Any other status is named, so a replaced
              account never reads as the current one. */}
          <BankAccounts
            accounts={[...(bank ? [bank] : []), ...banks.filter((b) => b !== bank)].map((b) => ({
              id: b.id,
              body: (
                <>
                  <Row
                    label="Account"
                    value={
                      <AccountNumber
                        bankDetailId={b.id}
                        lastFour={b.accountLastFour}
                        canReveal={canViewField(actor.role, "BANK_FULL")}
                      />
                    }
                    hint={b.status === "VERIFIED" ? undefined : words(b.status)}
                  />
                  <Row label="IFSC" value={b.ifsc} />
                  <Row label="Bank" value={b.bankName} />
                  <Row label="Branch" value={b.branchName ?? "—"} />
                  <Row label="Holder name" value={b.accountHolder} />
                </>
              ),
            }))}
          />
        </div>

        {/* 6 Booking Commission — every Booking this Member sold, and all it
            earned them in commission. */}
        <Section
          title={`Booking Commission (${realBookings.length})`}
          icon={<FileText className="h-3.5 w-3.5" />}
          aside={
              <div className="flex flex-wrap items-center justify-end gap-1 text-[11px]">
                {commissionTypes.length > 1 && (
                  <>
                    <Link href={commissionHref(null)} scroll={false} className={filterLink(!activeType)}>
                      All
                    </Link>
                    {commissionTypes.map((type) => (
                      <Link
                        key={type}
                        href={commissionHref(type)}
                        scroll={false}
                        className={filterLink(activeType === type)}
                      >
                        {words(type)}
                      </Link>
                    ))}
                    <span aria-hidden className="mx-1 h-3 w-px bg-border" />
                  </>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="xs" variant="outline" className={activePay ? "border-primary/50 text-primary" : ""}>
                      <ListFilter className="mr-1 h-3.5 w-3.5" />
                      {activePay ? PAY_FILTER[activePay].label : "Filter"}
                      <ChevronDown className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {[null, ...Object.keys(PAY_FILTER)].map((key) => (
                      <DropdownMenuItem key={key ?? "all"} asChild>
                        <Link href={filterHref({ cpay: key })} scroll={false}>
                          <Check className={`mr-1.5 h-3.5 w-3.5 ${activePay === key ? "" : "invisible"}`} />
                          {key ? PAY_FILTER[key].label : "All"}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
          }
        >
          {realBookings.length + acquisitionLines.length === 0 && !activePay ? (
            <p className="text-xs text-muted-foreground">No Bookings sold yet.</p>
          ) : dealRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No deal of this Member matches
              {activeType ? ` ${words(activeType)}` : ""}
              {activePay ? ` · ${PAY_FILTER[activePay].label}` : ""}.
            </p>
          ) : (
            <>
              <p className="pb-2 text-[11px] text-muted-foreground">
                {realBookings.length} Bookings
                {acquisitionLines.length > 0 && ` · ${acquisitionLines.length} Buyback / Resale`} · {commissionSummary}
              </p>
              {dealRows.length > 8 ? (
                <ShowMore count={dealRows.length - 8}>{dealTable(dealRows, 8)}</ShowMore>
              ) : (
                dealTable(dealRows, dealRows.length)
              )}
            </>
          )}

          {/* Not Bookings yet: what is still on the way to a sale. */}
          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <p className="text-sm font-semibold text-foreground">
                Booking &amp; Enquiry Requests
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  {count(bookingRequests.length, "Booking")} · {count(holdRequests.length, "Hold")} ·{" "}
                  {count(enquiries.length, "Enquiry", "Enquiries")}
                </span>
              </p>
              {conditions.length > 1 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="xs" variant="outline" className={activeCondition ? "border-primary/50 text-primary" : ""}>
                      <ListFilter className="mr-1 h-3.5 w-3.5" />
                      {activeCondition ?? "Filter"}
                      <ChevronDown className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {[null, ...conditions].map((c) => (
                      <DropdownMenuItem key={c ?? "all"} asChild>
                        <Link href={filterHref({ progress: c })} scroll={false}>
                          <Check className={`mr-1.5 h-3.5 w-3.5 ${activeCondition === c ? "" : "invisible"}`} />
                          {c ?? "All"}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {shownProgress.length === 0 ? (
              <p className="text-xs text-muted-foreground">No Hold Requests or Enquiries yet.</p>
            ) : (
              <ShortList
                items={shownProgress}
                first={5}
                render={(r) => (
                  <li
                    key={r.id}
                    className="flex flex-col gap-1 py-2.5 sm:grid sm:grid-cols-[7.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                  >
                    <span>
                      <Badge variant={r.kind === "Enquiry" ? "info" : "warning"}>{r.kind}</Badge>
                    </span>
                    <span className="min-w-0 truncate">
                      {r.plotId ? (
                        <Link href={`/plots/${r.plotId}`} className="font-medium text-primary hover:underline">
                          {r.plot}
                        </Link>
                      ) : (
                        <span className="font-medium">{r.plot}</span>
                      )}
                      <span className="text-muted-foreground">
                        {" · "}
                        {r.project} · for{" "}
                      </span>
                      <PersonLink personId={r.buyerId} name={r.buyer} />
                    </span>
                    <span className="text-[11px] text-muted-foreground sm:text-right">
                      {r.ref && `${r.ref} · `}
                      <span className="text-foreground">{r.condition}</span> · {formatIst(r.at)}
                    </span>
                  </li>
                )}
              />
            )}
          </div>
        </Section>

        {/* 7 Indirect Benefits — two cards side by side, as Contact & Identity.
            Each holds its benefit and the people who feed it: invited Members
            bring the Reward's References, linked Customers bring the Points. */}
        {/* gap-y-0 at md: the two cards share three subgrid rows (title, body,
            list), so the hairline above each list sits at the same height. */}
        <div className="grid gap-4 md:grid-cols-2 md:gap-y-0">
          {/* SSOT §40, §65; CP §68 — the Sales & Reference Trip Reward. */}
          <Section
            title="Rewards"
            icon={<Gift className="h-3.5 w-3.5" />}
            below={
              <>
                <p className="text-sm font-semibold text-foreground">
                  Members Invited ({member.invitedMembers.length})
                </p>
                {member.invitedMembers.length === 0 ? (
                  <p className="pt-1 text-xs text-muted-foreground">None yet.</p>
                ) : (
                  // SSOT §38 — only a Reference that was used says so; otherwise blank.
                  <NetworkList
                    who="Member"
                    rows={member.invitedMembers.map((m) => {
                      const sale = firstSale(m);
                      return {
                        id: m.id,
                        href: `/members/${m.id}`,
                        code: m.memberId,
                        name: m.person.fullName,
                        sale: sale ? { id: sale.id, plot: sale.plot.plotNumber, project: sale.project.name } : null,
                        status: m.referenceOpportunityConsumedAt ? "Reference Used" : "",
                      };
                    })}
                  />
                )}
              </>
            }
          >
            <TripSection
              programmes={await tripProgrammes(tripCredits, tripBuckets)}
              canDeliver={actor.role === "CRM" || actor.role === "MD"}
            />
          </Section>

          {/* docss/11 — Royalty Tokens: one pooled, non-cash balance. */}
          <Section
            title="Royalty Points"
            icon={<Coins className="h-3.5 w-3.5" />}
            below={
              <>
                <p className="text-sm font-semibold text-foreground">Royalty Customers ({royaltyActive.length})</p>
                {royaltyActive.length === 0 ? (
                  <p className="pt-1 text-xs text-muted-foreground">None yet.</p>
                ) : (
                  // CP §68 — a link earns once: the points, Earned or Pending.
                  <NetworkList
                    who="Customer"
                    rows={royaltyActive.map((c) => ({
                      id: c.id,
                      href: `/customers/${c.id}`,
                      code: c.customerId,
                      name: c.person.fullName,
                      sale: c.royaltyLinkFirstBooking
                        ? {
                            id: c.royaltyLinkFirstBooking.id,
                            plot: c.royaltyLinkFirstBooking.plot.plotNumber,
                            project: c.royaltyLinkFirstBooking.project.name,
                          }
                        : null,
                      status: pointsFrom(c.royaltyAwards),
                    }))}
                  />
                )}
              </>
            }
          >
            <RoyaltyTokens
              role={actor.role}
              memberProfileId={member.id}
              view={tokens}
            />
          </Section>
        </div>

        {otherBookingLines.length > 0 && (
          <Section title="Commission from other Bookings" icon={<Banknote className="h-3.5 w-3.5" />}>
            <ShortList items={otherBookingLines} first={5} render={commissionRow} />
          </Section>
        )}
      </div>
    </AppShell>
  );
}

