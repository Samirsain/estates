// Members — DESIGN.md §13; PRD.md §13, §14.3.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import MembersClient, { type MemberRowView } from "./members-client";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const actor = await requireStaff();

  const [members, activatable] = await Promise.all([
    db.memberProfile.findMany({
      include: {
        person: true,
        invitedByMember: { include: { person: true } },
        portalAccount: { select: { status: true } },
        _count: { select: { invitedMembers: true, introducedCustomers: true } },
      },
      orderBy: { memberId: "asc" },
      take: 300,
    }),
    // A Person can become a Member only once, so anyone already carrying a
    // Member profile is out of the list (main-PRD §7.1).
    db.person.findMany({
      where: { memberProfile: null, mergeStatus: { not: "MERGED_AWAY" } },
      select: { id: true, fullName: true, primaryMobile: true },
      orderBy: { fullName: "asc" },
      take: 300,
    }),
  ]);

  const rows: MemberRowView[] = members.map((m) => ({
    id: m.id,
    memberId: m.memberId,
    personId: m.personId,
    name: m.person.fullName,
    mobileMasked: maskMobile(m.person.primaryMobile),
    city: m.person.city ?? "—",
    status: m.status,
    activationDate: m.activationDate?.toISOString() ?? null,
    invitedBy: m.invitedByMember
      ? `${m.invitedByMember.memberId} · ${m.invitedByMember.person.fullName}`
      : null,
    invitePosition: m.invitePosition,
    inviteRatePercent: m.inviteRatePercent?.toFixed(2) ?? null,
    reraStatus: m.reraStatus,
    reraNumber: m.reraNumber,
    reraExpiryDate: m.reraExpiryDate?.toISOString() ?? null,
    reraNotApplicableReason: m.reraNotApplicableReason,
    commissionHold: m.commissionHold,
    commissionHoldReason: m.commissionHoldReason,
    portalStatus: m.portalAccount?.status ?? null,
    // PRD RD-05 — normal users see the last four digits only.
    aadhaarStatus: m.person.aadhaarStatus,
    panStatus: m.person.panStatus,
    invitedCount: m._count.invitedMembers,
    introducedCount: m._count.introducedCustomers,
  }));

  return (
    <MembersClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      rows={rows}
      activatable={activatable.map((p) => ({
        id: p.id,
        label: `${p.fullName} · ${maskMobile(p.primaryMobile)}`,
      }))}
      permissions={{
        activate: can(actor.role, "MEMBER_ACTIVATE"),
        deactivate: can(actor.role, "MEMBER_DEACTIVATE"),
        enterBank: can(actor.role, "BANK_DETAILS_ENTER"),
        verifyBank: can(actor.role, "BANK_VERIFY"),
        viewFullBank: can(actor.role, "REPORT_VIEW") && (actor.role === "MD" || actor.role === "ADMIN" || actor.role === "ACCOUNTS"),
      }}
    />
  );
}
