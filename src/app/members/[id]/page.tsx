// Member detail page — /members/[id]
//
// Built in the Customer page's language, because a Member profile and a
// Customer profile are the same kind of screen: who this person is, the facts
// filed under them, and what they have done. Same hero, same Stat strip, same
// card of Rows, same full-width lists underneath.

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { experienceSince } from "@/lib/domain/commission";
import { formatIst } from "@/lib/tasks";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PersonDetailsEditor } from "@/components/person-details-editor";
import { MemberActions } from "./member-actions";
import { ArrowLeft, UserCheck, Users, Layers, ShieldCheck, Banknote, FileText, MapPin } from "lucide-react";

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


const RERA_LABEL: Record<string, string> = {
  REGISTERED: "Registered",
  PENDING: "Pending",
  EXPIRED: "Expired",
  NOT_APPLICABLE: "Not Applicable",
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  DEACTIVATED: "Deactivated",
};
const ELIGIBILITY_LABEL: Record<string, string> = {
  MILESTONE_PENDING: "Milestone Pending",
  READY: "Ready",
  ON_HOLD: "On Hold",
};
const PAYMENT_LABEL: Record<string, string> = {
  NOT_PAID: "Not Paid",
  PAID: "Paid",
  PAID_EARLY: "Paid Early",
  CANCELLED: "Cancelled",
  ACCOUNTS_ADJUSTMENT_REQUIRED: "Accounts Adjustment Required",
};

/**
 * Profile, RERA and Bank are the same kind of thing — a short list of facts
 * about one person — so they are one card three times over: same heading, same
 * rows, same order of weight.
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

/**
 * The label is the question and the value is the answer, so the answer carries
 * the weight. `hint` is for what qualifies the answer rather than being it, and
 * stays quiet underneath.
 */
function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className="block text-sm font-semibold text-foreground">
          {value}
        </span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

/** The header's facts, in the same voice as the cards below. */
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
    <div className="min-w-[7.5rem]">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * One row of a network list: the identifier the relationship is filed under,
 * the name that confirms it, and the band it sits in.
 */
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
  note?: string | null;
  band: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <span className="min-w-0">
        <Link href={href} className="font-semibold text-primary hover:underline">
          {code}
        </Link>
        <span className="block text-[11px] text-muted-foreground">
          {name}
          {note ? ` · ${note}` : ""}
        </span>
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{band}</span>
    </li>
  );
}

/** DIRECT, INVITE_OVERRIDE — read as words, not as constants. */
const humanise = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireStaff();
  const { id } = await params;

  const member = await db.memberProfile.findUnique({
    where: { id },
    include: {
      person: true,
      invitedByMember: { include: { person: true } },
      invitedMembers: { include: { person: true }, orderBy: { invitePosition: "asc" } },
      portalAccount: { select: { status: true, lastLoginAt: true } },
    },
  });

  if (!member) notFound();

  const [commissions, banks, royaltyLinkedCustomers] = await Promise.all([
    db.commissionRecord.findMany({
      where: { beneficiaryPersonId: member.personId },
      include: {
        booking: { include: { project: true, plot: true } },
        acquisition: { include: { plot: { include: { project: true } } } },
      },
      orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.bankDetail.findMany({
      where: { personId: member.personId },
      orderBy: { createdAt: "desc" },
    }),
    db.customerProfile.findMany({
      where: { royaltyLinkedMemberId: member.id },
      include: { person: true },
      orderBy: { royaltyPosition: "asc" },
    }),
  ]);

  const experience = experienceSince(member.activationDate);
  // BANK_FULL is not consulted here: this page only ever prints the last four
  // digits, which is the masked form every screen shows.
  const canManage = can(actor.role, "MEMBER_ACTIVATE");

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Back, and the one thing this page can change: the facts below it.
            RERA, bank and commission hold keep their own guarded flows. */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/members"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Members
          </Link>
          <div className="flex items-start gap-2">
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
            canActivate={can(actor.role, "MEMBER_ACTIVATE", actor.extraPermissions)}
            canDeactivate={can(actor.role, "MEMBER_DEACTIVATE", actor.extraPermissions)}
          />
          {can(actor.role, "PERSON_DETAILS_EDIT", actor.extraPermissions) && (
            <PersonDetailsEditor
              personId={member.personId}
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

        {/* Hero */}
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UserCheck className="h-7 w-7" />
              </div>
              <div>
                {/* Who they are: the name, the id it is filed under, and the
                    two states asked about a Member — one line, not three
                    stacked sentences. */}
                <h1 className="text-2xl font-bold tracking-tight">{member.person.fullName}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">{member.memberId}</span>
                  <Badge variant={member.status === "ACTIVE" ? "success" : "destructive"}>
                    {STATUS_LABEL[member.status] ?? member.status}
                  </Badge>
                  {member.commissionHold && <Badge variant="warning">Commission hold</Badge>}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-3 md:pr-2">
              {experience && <Stat label="Member for" value={experience.label} />}
              <Stat
                label="Invite position"
                value={member.invitePosition ? `Position ${member.invitePosition}` : "Not assigned"}
                hint={member.inviteRatePercent ? `${member.inviteRatePercent.toFixed(2)}% band` : undefined}
              />
              {member.invitedByMember && (
                <Stat
                  label="Invited by"
                  // The Member ID is what the invitation is filed under, so it
                  // leads and the name confirms it.
                  value={
                    <Link
                      href={`/members/${member.invitedByMemberId}`}
                      className="text-primary hover:underline"
                    >
                      {member.invitedByMember.memberId}
                    </Link>
                  }
                  hint={member.invitedByMember.person.fullName}
                />
              )}
            </div>
          </div>

          {member.commissionHold && member.commissionHoldReason && (
            <p className="max-w-prose text-xs text-amber-800">{member.commissionHoldReason}</p>
          )}
        </Card>

        {/* Who they are, how they are registered, where the money goes — three
            lists of facts, so three of the same card side by side. */}
        <div className="grid gap-4 md:grid-cols-3">
          <Section title="Profile" icon={<UserCheck className="h-3.5 w-3.5" />}>
            <Row label="Mobile" value={member.person.primaryMobile} />
            {member.person.altMobile && (
              <Row label="Alternate Mobile" value={member.person.altMobile} />
            )}
            <Row label="Email" value={member.person.email ?? "—"} />
            {/* A blank Date of Birth or Address is shown rather than hidden:
                the gap is the reason Edit details exists. */}
            <Row label="Date of Birth" value={bornOn(member.person.dateOfBirth)} />
            <Row label="City" value={member.person.city ?? "—"} />
            <Row label="Address" value={member.person.addressLine ?? "—"} />
            <Row
              label="Activated"
              value={member.activationDate ? formatIst(member.activationDate.toISOString()) : "—"}
            />
          </Section>

          <Section title="RERA" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
            <Row
              label="Status"
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
              hint={member.reraNotApplicableReason ?? undefined}
            />
            <Row label="Number" value={member.reraNumber ?? "—"} />
            <Row
              label="Expiry"
              value={member.reraExpiryDate ? formatIst(member.reraExpiryDate.toISOString()) : "—"}
            />
          </Section>

          <Section title="Bank" icon={<Banknote className="h-3.5 w-3.5" />}>
            {banks.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {canManage ? "No bank details recorded." : "None recorded."}
              </p>
            ) : (
              banks.map((b) => (
                // The account is the fact; its verification qualifies it, so
                // the badge rides with the number.
                <div key={b.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <Row
                    label="Account"
                    value={`•••• ${b.accountLastFour}`}
                    hint={
                      <>
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
                        {b.verifiedAt && ` ${formatIst(b.verifiedAt.toISOString())}`}
                      </>
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

        {/* Their network: who they brought in, on both counters. */}
        <div className="grid gap-4 md:grid-cols-2">
          <Section
            title={`Members Invited (${member.invitedMembers.length})`}
            icon={<Users className="h-3.5 w-3.5" />}
          >
            {member.invitedMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y divide-border/50 text-xs">
                {member.invitedMembers.map((m) => (
                  <NetworkRow
                    key={m.id}
                    href={`/members/${m.id}`}
                    code={m.memberId}
                    name={m.person.fullName}
                    note={m.status === "ACTIVE" ? null : "Deactivated"}
                    band={`Pos ${m.invitePosition ?? "—"} · ${m.inviteRatePercent?.toFixed(2) ?? "—"}%`}
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
              <ul className="divide-y divide-border/50 text-xs">
                {royaltyLinkedCustomers.map((c) => (
                  <NetworkRow
                    key={c.id}
                    href={`/customers/${c.id}`}
                    code={c.customerId}
                    name={c.person.fullName}
                    note={`${c.loyaltySlotsConsumed}/3 Loyalty slots used`}
                    band={
                      c.royaltyPosition
                        ? `Pos ${c.royaltyPosition} · ${c.royaltyRatePercent?.toFixed(2)}%`
                        : "Provisional"
                    }
                  />
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Commission Records */}
        <Section title="Commission Records" icon={<Layers className="h-3.5 w-3.5" />}>
          {commissions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No commission records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-xs">
                <thead className="border-b border-border/50 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2">Booking</th>
                    <th className="pb-2">Project · Plot</th>
                    <th className="pb-2">Type</th>
                    <th className="w-[5rem] pb-2 pr-6 text-right">%</th>
                    <th className="pb-2">Eligibility</th>
                    <th className="pb-2">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 align-baseline">
                  {commissions.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {c.booking ? (
                            <Link
                              href={`/bookings/${c.booking.id}`}
                              className="text-primary hover:underline"
                            >
                              {c.booking.bookingNumber ?? c.booking.requestNo}
                            </Link>
                          ) : (
                            (c.acquisition?.acquisitionNo ?? "—")
                          )}
                        </span>
                        {/* Superseded is said once, as a word. Fading the whole
                            row said it twice and made it hard to read. */}
                        {!c.isCurrent && (
                          <span className="ml-2 rounded border border-border/60 px-1 text-[10px] text-muted-foreground">
                            Superseded
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        {(() => {
                          const plot = c.booking?.plot ?? c.acquisition?.plot ?? null;
                          const project =
                            c.booking?.project.name ?? c.acquisition?.plot?.project.name ?? "—";
                          const label = plot
                            ? `${plot.plotType.replaceAll("_", " ")} ${plot.plotNumber}`
                            : (c.acquisition?.propertyNumber ?? "—");
                          return (
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="min-w-0">
                                <span className="block">{project}</span>
                                <span className="block text-[11px] text-muted-foreground">
                                  {plot ? (
                                    <Link
                                      href={`/plots/${plot.id}`}
                                      className="text-primary hover:underline"
                                    >
                                      {label}
                                    </Link>
                                  ) : (
                                    label
                                  )}
                                </span>
                              </span>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-2">{humanise(c.type)}</td>
                      {/* The rate carries its unit and its own width; without
                          them "3.00" sat against "Milestone Pending" and read
                          as one value. */}
                      <td className="py-2 pr-6 text-right font-medium tabular-nums">
                        {c.percent.toFixed(2)}%
                      </td>
                      <td className="py-2">
                        {ELIGIBILITY_LABEL[c.eligibility] ?? c.eligibility}
                        {c.holdReason && (
                          <span className="block text-[11px] text-amber-700">
                            {c.holdReason.replaceAll("_", " ").toLowerCase()}
                          </span>
                        )}
                      </td>
                      <td className="py-2">{PAYMENT_LABEL[c.payment] ?? c.payment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
