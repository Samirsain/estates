// One Buyback or Purchase for Resale, in full.
//
// The deal used to open as a panel inside its own list row, which meant the
// whole record had to fit in the space under a table. It has a page now, and
// the list row links to it.

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import { canViewField } from "@/lib/security/permissions";
import { acquisitionInclude, toAcquisitionRow } from "../row-view";
import AcquisitionDetailClient from "./detail-client";

export const dynamic = "force-dynamic";

export default async function AcquisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff("REPORT_VIEW");
  // MD and Admin read a contact number whole; everyone else gets the mask.
  const fullMobile = canViewField(actor.role, "MOBILE_FULL");

  const [acquisition, people] = await Promise.all([
    db.acquisition.findUnique({ where: { id }, include: acquisitionInclude }),
    // Only the Buying Commission dialog needs these, and only on a live deal —
    // but the picker is rendered by the same client, so they travel with it.
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
      take: 500,
    }),
  ]);

  if (!acquisition) notFound();

  return (
    <AcquisitionDetailClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      permissions={{
        create: can(actor.role, "ACQUISITION_CREATE", actor.extraPermissions),
        decide: can(actor.role, "ACQUISITION_DECIDE", actor.extraPermissions),
        cancel: can(actor.role, "ACQUISITION_CANCEL", actor.extraPermissions),
        confirmGiven: can(actor.role, "PAYMENT_GIVEN_CONFIRM", actor.extraPermissions),
        correctGiven: can(actor.role, "PAYMENT_CORRECT", actor.extraPermissions),
        recordCommission: can(actor.role, "BUYING_COMMISSION_RECORD", actor.extraPermissions),
      }}
      row={toAcquisitionRow(acquisition)}
      people={people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        mobileMasked: fullMobile ? p.primaryMobile : maskMobile(p.primaryMobile),
        customerId: p.customerProfile?.customerId ?? null,
        memberId: p.memberProfile?.memberId ?? null,
      }))}
    />
  );
}
