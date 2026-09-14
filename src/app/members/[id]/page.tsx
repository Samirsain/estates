// Member detail page — /members/[id]
//
// Built to system/change-requests/Member_Profile_Revised_Requirements.md, top to
// bottom: Header › Summary › Contact & Identity › RERA › Bank › Network › Deals
// › Commission › Member Access › History. A profile and a place to manage the
// Member — deliberately not an alert dashboard, so there is no Alerts section,
// no RERA countdown and no Terms version on the page.

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can, canViewField } from "@/lib/security/permissions";
import { maskAadhaar, maskMobile, maskPan } from "@/lib/security/identity";
import { isLocked } from "@/lib/security/auth";
import {
  anniversaryDay,
  eligibilityLabel,
  experienceSince,
  type CommissionType,
} from "@/lib/domain/commission";
import { MEMBER_TERMS_VERSION } from "@/lib/terms";
import { formatIst, formatIstDateTime, istDay } from "@/lib/tasks";
import { auditHistory, mergeHistory, newestFirst } from "@/lib/profile-history";
import { TYPE_LABEL } from "@/app/acquisitions/types";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PersonDetailsEditor } from "@/components/person-details-editor";
import { PersonLink } from "@/components/person-link";
import { Row } from "@/components/fact-row";
import { AccountNumber, IdentityValue } from "@/components/protected-identity";
import { MergeButton } from "@/app/customers/[id]/merge-button";
import { MemberActions } from "./member-actions";
import { AddTaskButton } from "./add-task-button";
import PortalAccess from "./portal-access";
import {
  ArrowLeft,
  Banknote,
  FileText,
  History,
  KeyRound,
  Layers,
  MapPin,
  ShieldCheck,
  UserCheck,
  Users,
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
const PAYMENT_LABEL: Record<string, string> = {
  NOT_PAID: "Not Paid",
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  CANCELLED: "Cancelled",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Accounts Adjustment Required",
};

/** CR-014 — a cycle is positions 1 to 9. */
const CYCLE_SIZE = 9;

/** One table style for every table on the page. */
const TH = "pb-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const TD = "py-2.5 pr-4 align-top";
const SUB = "block text-[11px] text-muted-foreground";

/** Every block on the page is the same card: a quiet title, then its content. */
function Section({
  title,
  icon,
  aside,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

/** A Summary answer: the label is quiet, the answer is not. */
function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0 md:px-4 md:first:pl-0">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
      {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** One row of a network list: the id, the name under it, the band opposite. */
function NetworkRow({
  href,
  code,
  name,
  note,
  band,
}: {
  href: string;
  code: string;
  name: string;
  note?: React.ReactNode;
  band: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <Link href={href} className="font-semibold text-primary hover:underline">
          {code}
        </Link>
        <span className={SUB}>{name}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
        {note}
        {band}
      </span>
    </li>
  );
}

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ commissions?: string }>;
}) {
  const actor = await requireStaff();
  const [{ id }, { commissions: commissionView }] = await Promise.all([params, searchParams]);
  // Superseded records are hidden by default; ?commissions=all shows them.
  const showAllCommissions = commissionView === "all";

  // The same masking rule as every other screen: MD and Admin read a mobile
  // whole, everyone else sees it masked.
  const contact = (value: string) =>
    canViewField(actor.role, "MOBILE_FULL") ? value : maskMobile(value);

  const member = await db.memberProfile.findUnique({
    where: { id },
    include: {
      person: { include: { customerProfile: { select: { id: true, customerId: true } } } },
      invitedByMember: { include: { person: true } },
      invitedMembers: { include: { person: true }, orderBy: { invitePosition: "asc" } },
      portalAccount: {
        select: { status: true, lastLoginAt: true, lockedUntil: true, failedAttempts: true },
      },
      performanceCycles: { orderBy: [{ kind: "asc" }, { cycleNumber: "asc" }] },
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
  ] = await Promise.all([
    db.commissionRecord.findMany({
      where: {
        beneficiaryPersonId: personId,
        ...(showAllCommissions ? {} : { isCurrent: true }),
      },
      include: {
        booking: { include: { project: true, plot: true } },
        acquisition: { include: { plot: { include: { project: true } } } },
      },
      orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.bankDetail.findMany({ where: { personId }, orderBy: { createdAt: "desc" } }),
    db.customerProfile.findMany({
      where: { royaltyLinkedMemberId: member.id },
      include: { person: true },
      orderBy: { royaltyPosition: "asc" },
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
  ]);

  const experience = experienceSince(member.activationDate);
  const canManage = can(actor.role, "MEMBER_ACTIVATE", actor.extraPermissions);

  // The account that is current: the verified one, or the one waiting when
  // nothing is verified yet. Replaced accounts are in History.
  const bank =
    banks.find((b) => b.status === "VERIFIED") ?? banks.find((b) => b.status === "PENDING") ?? null;

  /* ---------------------------------------------------------------- cycles */

  const activationDay = member.activationDate ? istDay(member.activationDate) : null;
  const todayDay = istDay(new Date());
  // RD-02 — the anniversary is the activation date's, 29 Feb falling to 28 Feb.
  const nextAnniversary = (() => {
    if (!activationDay) return null;
    const year = Number(todayDay.slice(0, 4));
    const thisYear = anniversaryDay(activationDay, year);
    return thisYear > todayDay ? thisYear : anniversaryDay(activationDay, year + 1);
  })();
  const latestCycleIds = new Set(
    (["INVITE", "ROYALTY"] as const)
      .map((kind) => member.performanceCycles.filter((c) => c.kind === kind).at(-1)?.id)
      .filter(Boolean)
  );

  /* ---------------------------------------------------------------- access */

  const portal = member.portalAccount;
  const portalLocked = portal
    ? isLocked({ failedAttempts: portal.failedAttempts, lockedUntil: portal.lockedUntil })
    : false;
  const portalState = !portal
    ? null
    : portal.status !== "ACTIVE"
      ? "Disabled"
      : portalLocked
        ? "Locked"
        : "Active";
  const termsAccepted = member.termsAcceptances.some((t) => t.version === MEMBER_TERMS_VERSION);

  /* ------------------------------------------------------------- deals */

  const requestsAndEnquiries = [
    ...holdRequests.map((r) => ({
      id: r.id,
      kind: "Hold Request",
      plot: r.plot.plotNumber,
      plotId: r.plot.id,
      project: r.plot.project.name,
      buyer: r.person.fullName,
      buyerId: r.person.id,
      status: words(r.status),
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
      status: words(e.status),
      at: e.createdAt,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

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

  const filterLink = (active: boolean) =>
    active
      ? "rounded-md bg-secondary px-2 py-0.5 font-semibold text-foreground"
      : "px-2 py-0.5 text-muted-foreground hover:text-foreground";

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Back on the left; what staff can do to this Member on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/members"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Members
          </Link>
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
            />
            {can(actor.role, "PERSON_DETAILS_EDIT", actor.extraPermissions) && (
              <PersonDetailsEditor
                personId={personId}
                bank={banks[0] ?? null}
                canEnterBank={can(actor.role, "BANK_DETAILS_ENTER", actor.extraPermissions)}
                person={{
                  fullName: member.person.fullName,
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
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <UserCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
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
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-y-4 border-t border-border/60 pt-4 md:grid-cols-4 md:divide-x md:divide-border/60">
            <Stat label="Member for" value={experience?.label ?? "—"} />
            <Stat
              label="Activated on"
              value={member.activationDate ? formatIst(member.activationDate) : "—"}
              hint={member.activationDate ? undefined : "Not activated"}
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
                    {member.invitedByMember.memberId}
                  </Link>
                ) : (
                  "3% Club"
                )
              }
              hint={member.invitedByMember?.person.fullName ?? "No inviting Member"}
            />
            <Stat
              label="Invite position"
              value={member.invitePosition ? `Position ${member.invitePosition}` : "3% Club"}
              hint={
                member.invitePosition && member.inviteRatePercent
                  ? `${member.inviteRatePercent.toFixed(2)}% band`
                  : "No Invite position taken"
              }
            />
          </dl>
        </Card>

        {/* 3 Contact & Identity · 4 RERA · 5 Bank */}
        <div className="grid gap-4 md:grid-cols-3">
          <Section title="Contact" icon={<UserCheck className="h-3.5 w-3.5" />}>
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
          <Section title="RERA & Aadhaar" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
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
          </Section>

          <Section title="Bank & PAN" icon={<Banknote className="h-3.5 w-3.5" />}>
            {bank ? (
              <>
                <Row label="Bank" value={bank.bankName} />
                <Row label="Holder" value={bank.accountHolder} />
                {/* No status line: bank details are verified as they are
                    entered, so it only ever said "Verified". */}
                <Row
                  label="Account"
                  value={
                    <AccountNumber
                      bankDetailId={bank.id}
                      lastFour={bank.accountLastFour}
                      canReveal={canViewField(actor.role, "BANK_FULL")}
                    />
                  }
                />
                <Row label="IFSC" value={bank.ifsc} />
                <Row label="Branch" value={bank.branchName ?? "—"} />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No bank details recorded.</p>
            )}
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
        </div>

        {/* 6 Network */}
        <div className="grid gap-4 md:grid-cols-2">
          <Section
            title={`Members Invited (${member.invitedMembers.length})`}
            icon={<Users className="h-3.5 w-3.5" />}
          >
            {member.invitedMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y divide-border/40 text-xs">
                {member.invitedMembers.map((m) => (
                  <NetworkRow
                    key={m.id}
                    href={`/members/${m.id}`}
                    code={m.memberId}
                    name={m.person.fullName}
                    note={m.status === "ACTIVE" ? null : <Badge variant="destructive">Deactivated</Badge>}
                    band={
                      m.invitePosition
                        ? `Pos ${m.invitePosition} · ${m.inviteRatePercent?.toFixed(2) ?? "—"}%`
                        : "—"
                    }
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section
            title={`Royalty Linked Customers (${royaltyLinkedCustomers.length})`}
            icon={<Users className="h-3.5 w-3.5" />}
          >
            {royaltyLinkedCustomers.length === 0 ? (
              <p className="text-xs text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y divide-border/40 text-xs">
                {royaltyLinkedCustomers.map((c) => (
                  <NetworkRow
                    key={c.id}
                    href={`/customers/${c.id}`}
                    code={c.customerId}
                    name={c.person.fullName}
                    note={
                      <Badge variant={c.royaltyLinkFinalAt ? "success" : "outline"}>
                        {c.royaltyLinkFinalAt ? "Final" : "Provisional"}
                      </Badge>
                    }
                    band={
                      c.royaltyPosition
                        ? `Pos ${c.royaltyPosition} · ${c.royaltyRatePercent?.toFixed(2) ?? "—"}%`
                        : "—"
                    }
                  />
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Invite & Royalty Cycles" icon={<Layers className="h-3.5 w-3.5" />}>
          {member.performanceCycles.length === 0 ? (
            <p className="text-xs text-muted-foreground">No cycle has opened yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-xs">
                <thead className="border-b border-border/50">
                  <tr>
                    <th className={TH}>Counter</th>
                    <th className={TH}>Cycle</th>
                    <th className={TH}>Opened on</th>
                    <th className={TH}>Progress</th>
                    <th className={TH}>Completed</th>
                    <th className={TH}>Status</th>
                    <th className={`${TH} pr-0`}>Next anniversary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {member.performanceCycles.map((c) => (
                    <tr key={c.id}>
                      <td className={`${TD} font-medium`}>{c.kind === "INVITE" ? "Invite" : "Royalty"}</td>
                      <td className={`${TD} tabular-nums`}>#{c.cycleNumber}</td>
                      <td className={TD}>{formatIst(c.openedOn)}</td>
                      <td className={`${TD} tabular-nums`}>
                        {c.positionsFilled} of {CYCLE_SIZE} filled
                      </td>
                      <td className={`${TD} tabular-nums`}>{c.positionsComplete}</td>
                      <td className={TD}>
                        <Badge variant={c.status === "UPGRADE_ELIGIBLE" ? "success" : "outline"}>
                          {c.status === "UPGRADE_ELIGIBLE" ? "Upgrade Eligible" : "In progress"}
                        </Badge>
                      </td>
                      <td className={`${TD} pr-0`}>
                        {latestCycleIds.has(c.id) && nextAnniversary ? formatIst(nextAnniversary) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* 7 Deals */}
        <Section
          title={`Bookings Sold by this Member (${soldBookings.length})`}
          icon={<FileText className="h-3.5 w-3.5" />}
        >
          {soldBookings.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Bookings sold yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-xs">
                <thead className="border-b border-border/50">
                  <tr>
                    <th className={TH}>Booking</th>
                    <th className={TH}>Plot</th>
                    <th className={TH}>Customer</th>
                    <th className={TH}>Status</th>
                    <th className={`${TH} pr-0 text-right`}>Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {soldBookings.map((b) => (
                    <tr key={b.id}>
                      <td className={TD}>
                        <Link href={`/bookings/${b.id}`} className="font-semibold text-primary hover:underline">
                          {b.bookingNumber ?? b.requestNo}
                        </Link>
                      </td>
                      <td className={TD}>
                        <Link href={`/plots/${b.plot.id}`} className="font-semibold text-primary hover:underline">
                          {b.plot.plotNumber}
                        </Link>
                        <span className={SUB}>{b.project.name}</span>
                      </td>
                      <td className={TD}>
                        <PersonLink
                          personId={b.primaryPerson.id}
                          name={b.primaryPerson.customerProfile?.customerId ?? b.primaryPerson.fullName}
                          className="font-semibold"
                        />
                        {b.primaryPerson.customerProfile && (
                          <span className={SUB}>{b.primaryPerson.fullName}</span>
                        )}
                      </td>
                      <td className={`${TD} font-medium`}>{statusWords(b.status)}</td>
                      <td className={`${TD} pr-0 text-right tabular-nums`}>
                        {b.paymentReceivedPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title={`Hold Requests & Enquiries (${requestsAndEnquiries.length})`}
          icon={<MapPin className="h-3.5 w-3.5" />}
        >
          {requestsAndEnquiries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Hold Requests or Enquiries yet.</p>
          ) : (
            <ul className="divide-y divide-border/40 text-xs">
              {requestsAndEnquiries.map((r) => (
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
                    <span className="text-foreground">{r.status}</span> · {formatIst(r.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 8 Commission — percentages only, never a rupee amount. */}
        <Section
          title="Commission Records"
          icon={<Layers className="h-3.5 w-3.5" />}
          aside={
            <div className="flex gap-1 text-[11px]">
              <Link href={`/members/${member.id}`} scroll={false} className={filterLink(!showAllCommissions)}>
                Current
              </Link>
              <Link
                href={`/members/${member.id}?commissions=all`}
                scroll={false}
                className={filterLink(showAllCommissions)}
              >
                All
              </Link>
            </div>
          }
        >
          {commissions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No commission records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-xs">
                <thead className="border-b border-border/50">
                  <tr>
                    <th className={TH}>Booking</th>
                    <th className={TH}>Plot</th>
                    <th className={TH}>Type</th>
                    <th className={`${TH} text-right`}>%</th>
                    <th className={`${TH} text-right`}>Milestone</th>
                    <th className={TH}>Eligibility</th>
                    <th className={`${TH} pr-0`}>Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {commissions.map((c) => {
                    const plot = c.booking?.plot ?? c.acquisition?.plot ?? null;
                    const project = c.booking?.project.name ?? c.acquisition?.plot?.project.name ?? null;
                    return (
                      <tr key={c.id}>
                        <td className={TD}>
                          {c.booking ? (
                            <Link
                              href={`/bookings/${c.booking.id}`}
                              className="font-semibold text-primary hover:underline"
                            >
                              {c.booking.bookingNumber ?? c.booking.requestNo}
                            </Link>
                          ) : c.acquisition ? (
                            <Link
                              href={`/acquisitions/${c.acquisition.id}`}
                              className="font-semibold text-primary hover:underline"
                            >
                              {TYPE_LABEL[c.acquisition.type] ?? "Buyback / Resale"}
                            </Link>
                          ) : (
                            "—"
                          )}
                          {!c.isCurrent && <span className={SUB}>Superseded</span>}
                        </td>
                        <td className={TD}>
                          {plot ? (
                            <Link href={`/plots/${plot.id}`} className="font-medium text-primary hover:underline">
                              {plot.plotNumber}
                            </Link>
                          ) : (
                            <span className="font-medium">{c.acquisition?.propertyNumber ?? "—"}</span>
                          )}
                          {project && <span className={SUB}>{project}</span>}
                          {plot && <span className={SUB}>{titleWords(plot.plotType)}</span>}
                        </td>
                        <td className={`${TD} font-medium`}>{words(c.type)}</td>
                        <td className={`${TD} text-right font-medium tabular-nums`}>{c.percent.toFixed(2)}%</td>
                        <td className={`${TD} text-right tabular-nums`}>{c.milestonePercent.toFixed(0)}%</td>
                        <td className={TD}>
                          {eligibilityLabel(c.eligibility, c.type as CommissionType)}
                          {c.holdReason && (
                            <span className="block text-[11px] text-amber-700">{words(c.holdReason)}</span>
                          )}
                        </td>
                        <td className={`${TD} pr-0`}>
                          {PAYMENT_LABEL[c.payment] ?? c.payment}
                          {c.paidOn && <span className={SUB}>Paid {formatIst(c.paidOn)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* 9 Member Access · 10 History */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <Section title="Member Access" icon={<KeyRound className="h-3.5 w-3.5" />}>
            {portal ? (
              <div className="space-y-3">
                <div>
                  <Row
                    label="Portal account"
                    value={
                      <Badge variant={portalState === "Active" ? "success" : "destructive"}>{portalState}</Badge>
                    }
                  />
                  <Row
                    label="Last login"
                    value={portal.lastLoginAt ? formatIstDateTime(portal.lastLoginAt) : "Never"}
                  />
                  <Row label="Terms accepted" value={termsAccepted ? "Yes" : "No"} />
                </div>
                {canManage && (
                  <PortalAccess memberProfileId={member.id} memberId={member.memberId} locked={portalLocked} />
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No portal account yet.</p>
            )}
          </Section>

          <Section title="History" icon={<History className="h-3.5 w-3.5" />}>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
            ) : (
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
            )}
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
