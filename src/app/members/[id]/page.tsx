// Member detail page — /members/[id]
// Shows everything about one Member: profile, RERA, network, commissions, bank.

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can, canViewField } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import { experienceSince } from "@/lib/domain/commission";
import { formatIst } from "@/lib/tasks";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Building2, CheckCircle2, Clock, UserCheck, Users, Layers, ShieldCheck, Banknote, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

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

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-right text-xs font-medium ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

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

  const commissions = await db.commissionRecord.findMany({
    where: { beneficiaryPersonId: member.personId },
    include: {
      booking: { include: { project: true, plot: true } },
      acquisition: { include: { plot: { include: { project: true } } } },
    },
    orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  const banks = await db.bankDetail.findMany({
    where: { personId: member.personId },
    orderBy: { createdAt: "desc" },
  });

  const introducedCustomers = await db.customerProfile.findMany({
    where: { originalIntroducedByMemberId: member.id },
    include: { person: true },
    orderBy: { introducedPosition: "asc" },
  });

  const experience = experienceSince(member.activationDate);
  const canViewBank = canViewField(actor.role, "BANK_FULL");
  const canManage = can(actor.role, "MEMBER_ACTIVATE");

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Back navigation */}
        <Link
          href="/members"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Members
        </Link>

        {/* Hero Card */}
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <UserCheck className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">{member.person.fullName}</h1>
                  <Badge variant={member.status === "ACTIVE" ? "success" : "destructive"}>
                    {STATUS_LABEL[member.status] ?? member.status}
                  </Badge>
                </div>
                <p className="mt-0.5 font-mono text-sm text-muted-foreground">{member.memberId}</p>
                {experience && (
                  <p className="text-xs text-muted-foreground">{experience.label} as a Member</p>
                )}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-1">
              {member.activationDate && <p>Activated {formatIst(member.activationDate.toISOString())}</p>}
              {member.portalAccount?.lastLoginAt && (
                <p>Portal last login {formatIst(member.portalAccount.lastLoginAt.toISOString())}</p>
              )}
              {member.portalAccount && (
                <p>Portal: {member.portalAccount.status === "ACTIVE" ? "Enabled" : "Disabled"}</p>
              )}
            </div>
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Profile */}
          <Card className="p-5 space-y-4">
            <Section title="Profile" icon={<Building2 className="h-3.5 w-3.5" />}>
              <Row label="Mobile" value={maskMobile(member.person.primaryMobile)} />
              {member.person.altMobile && <Row label="Alt Mobile" value={maskMobile(member.person.altMobile)} />}
              <Row label="Email" value={member.person.email ?? "—"} />
              <Row label="City" value={member.person.city ?? "—"} />
              <Row label="Address" value={member.person.addressLine ?? "—"} />
            </Section>
          </Card>

          {/* RERA */}
          <Card className="p-5 space-y-4">
            <Section title="RERA" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
              <Row
                label="Status"
                value={
                  <Badge variant={
                    member.reraStatus === "REGISTERED" || member.reraStatus === "NOT_APPLICABLE"
                      ? "success"
                      : "destructive"
                  }>
                    {RERA_LABEL[member.reraStatus] ?? member.reraStatus}
                  </Badge>
                }
              />
              <Row label="RERA Number" value={member.reraNumber ?? "—"} mono />
              <Row
                label="Expiry"
                value={member.reraExpiryDate ? formatIst(member.reraExpiryDate.toISOString()) : "—"}
              />
              {member.reraNotApplicableReason && (
                <Row label="Not Applicable Reason" value={member.reraNotApplicableReason} />
              )}
            </Section>

            {member.commissionHold && (
              <div className="rounded-xl border border-amber-300/40 bg-amber-50/60 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> Commission Hold Active
                </p>
                {member.commissionHoldReason && <p className="mt-0.5">{member.commissionHoldReason}</p>}
              </div>
            )}
          </Card>
        </div>

        {/* Network */}
        <Card className="p-5 space-y-5">
          <Section title="Network" icon={<Users className="h-3.5 w-3.5" />}>
            <div className="text-xs space-y-1">
              <Row
                label="Invited By"
                value={
                  member.invitedByMember
                    ? `${member.invitedByMember.memberId} · ${member.invitedByMember.person.fullName}`
                    : "—"
                }
              />
              <Row
                label="Position &amp; Band"
                value={
                  member.invitePosition
                    ? `Position ${member.invitePosition} · ${member.inviteRatePercent?.toFixed(2)}%`
                    : "Not assigned"
                }
              />
            </div>

            {member.invitedMembers.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Members Invited ({member.invitedMembers.length})
                </p>
                <ul className="divide-y divide-border/50 text-xs">
                  {member.invitedMembers.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <Link href={`/members/${m.id}`} className="font-mono font-semibold text-primary hover:underline">
                          {m.memberId}
                        </Link>
                        {" · "}{m.person.fullName}
                        {m.status !== "ACTIVE" && (
                          <span className="ml-2 text-[11px] text-muted-foreground">Deactivated</span>
                        )}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        Pos {m.invitePosition} · {m.inviteRatePercent?.toFixed(2)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {introducedCustomers.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Customers Introduced ({introducedCustomers.length})
                </p>
                <ul className="divide-y divide-border/50 text-xs">
                  {introducedCustomers.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <Link href={`/customers/${c.id}`} className="font-mono font-semibold text-primary hover:underline">
                          {c.customerId}
                        </Link>
                        {" · "}{c.person.fullName}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {c.introducedPosition ? `Pos ${c.introducedPosition} · ${c.introducedRatePercent?.toFixed(2)}%` : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        </Card>

        {/* Commission */}
        <Card className="p-5 space-y-4">
          <Section title="Commission Records" icon={<Layers className="h-3.5 w-3.5" />}>
            {commissions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No commission records yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-xs">
                  <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/50">
                    <tr>
                      <th className="pb-2">Booking</th>
                      <th className="pb-2">Project · Plot</th>
                      <th className="pb-2">Type</th>
                      <th className="pb-2 text-right">%</th>
                      <th className="pb-2">Eligibility</th>
                      <th className="pb-2">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {commissions.map((c) => (
                      <tr key={c.id} className={c.isCurrent ? "" : "opacity-50"}>
                        <td className="py-2">
                          {c.booking?.bookingNumber ?? c.booking?.requestNo ?? c.acquisition?.acquisitionNo ?? "—"}
                          {!c.isCurrent && (
                            <span className="ml-2 rounded border border-border/60 px-1 text-[10px]">Superseded</span>
                          )}
                        </td>
                        <td className="py-2">
                          {c.booking?.project.name ?? c.acquisition?.plot?.project.name ?? "—"}
                          <span className="block text-[11px] text-muted-foreground">
                            {c.booking
                              ? `${c.booking.plot.plotType.replaceAll("_", " ")} ${c.booking.plot.plotNumber}`
                              : c.acquisition?.plot
                                ? `${c.acquisition.plot.plotType.replaceAll("_", " ")} ${c.acquisition.plot.plotNumber}`
                                : c.acquisition?.propertyNumber ?? "—"}
                          </span>
                        </td>
                        <td className="py-2">{c.type}</td>
                        <td className="py-2 text-right tabular-nums font-medium">{c.percent.toFixed(2)}</td>
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
        </Card>

        {/* Bank Details */}
        {(banks.length > 0 || canManage) && (
          <Card className="p-5 space-y-4">
            <Section title="Bank Details" icon={<Banknote className="h-3.5 w-3.5" />}>
              {banks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No bank details recorded.</p>
              ) : (
                <ul className="space-y-2">
                  {banks.map((b) => (
                    <li key={b.id} className="rounded-xl border border-border/50 p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <span className="font-medium">{b.accountHolder}</span>
                          {" · "}{b.bankName}
                          <span className="block text-muted-foreground">
                            Account ending {b.accountLastFour} · {b.ifsc}
                          </span>
                        </span>
                        <Badge variant={b.status === "VERIFIED" ? "success" : b.status === "PENDING" ? "warning" : "outline"}>
                          {b.status.charAt(0) + b.status.slice(1).toLowerCase()}
                        </Badge>
                      </div>
                      {b.verifiedAt && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Verified {formatIst(b.verifiedAt.toISOString())}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
