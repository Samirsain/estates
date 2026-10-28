// Investor Leads (the PotentialInvestor table) — people who may invest later: a name, a mobile, an optional second one and a city.

import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { maskMobile } from "@/lib/security/identity";
import { canViewField } from "@/lib/security/permissions";
import { formatIstDate } from "@/lib/tasks";
import PotentialInvestorsClient from "./potential-investors-client";

export const dynamic = "force-dynamic";

export default async function PotentialInvestorsPage() {
  const actor = await requireStaff();

  const investors = await db.potentialInvestor.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  // Masked like the Customers list: only MD reads the number whole.
  const fullMobile = canViewField(actor.role, "MOBILE_FULL");

  return (
    <PotentialInvestorsClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      rows={investors.map((i) => ({
        id: i.id,
        name: i.fullName,
        mobile: fullMobile ? i.mobile : maskMobile(i.mobile),
        altMobile: i.altMobile ? (fullMobile ? i.altMobile : maskMobile(i.altMobile)) : "",
        city: i.city ?? "",
        addedOn: formatIstDate(i.createdAt),
      }))}
    />
  );
}
