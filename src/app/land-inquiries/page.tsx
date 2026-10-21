// Land Inquiries — Land Inquiry spec §23.3, §24, §25.
//
// The filters are query parameters and the query runs on the server, so a
// filtered list survives a refresh, can be linked to, and never depends on the
// browser holding the whole table.

import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { formatIstDate } from "@/lib/tasks";
import {
  DEFAULT_PAGE_SIZE,
  listLandInquiries,
  type LandInquiryListFilters,
} from "@/lib/services/land-inquiry-service";
import LandInquiriesClient, { type LandInquiryRowView } from "./land-inquiries-client";

export const dynamic = "force-dynamic";

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

export default async function LandInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireStaff();
  const params = await searchParams;
  const admin = actor.role === "MD";

  const filters: LandInquiryListFilters = {
    q: one(params.q),
    district: one(params.district),
    tehsil: one(params.tehsil),
    khasraNo: one(params.khasraNo),
    status: one(params.status) as LandInquiryListFilters["status"],
    page: Number(one(params.page) ?? 1) || 1,
    pageSize: DEFAULT_PAGE_SIZE,
    // Spec §25 — only MD and Admin may look past the archive.
    includeArchived: admin && one(params.archived) === "1",
  };

  const list = await listLandInquiries(filters);

  const rows: LandInquiryRowView[] = list.rows.map((row) => {
    const primary = row.owners.find((o) => o.isPrimary) ?? row.owners[0] ?? null;
    return {
      id: row.id,
      inquiryNo: row.inquiryNo,
      date: formatIstDate(row.inquiryDate),
      receivedFrom: row.receivedFrom,
      // Spec §2.2 — an Another Dealer inquiry names nobody on file, but it
      // does carry the dealer's own name beside the number now: a column of
      // bare mobiles was nobody anyone could ask about.
      source:
        row.sourcePerson?.fullName ||
        (row.receivedFrom === "ANOTHER_DEALER"
          ? [row.anotherDealerName, row.anotherDealerMobile].filter(Boolean).join(" · ")
          : "3% Club") ||
        "—",
      sourcePersonId: row.sourcePerson?.id ?? null,
      primaryOwner: primary?.ownerName ?? null,
      additionalOwners: Math.max(row.owners.length - 1, 0),
      location: [row.district, row.tehsil].filter(Boolean).join(" / ") || null,
      exactLocation: row.exactLocation,
      // Spec §24 — the metric area if it is known, otherwise what was actually
      // recorded in Bigha and Biswa, otherwise nothing. Never a conversion.
      area: areaLabel(row),
      status: row.status,
      stage: row.stage,
      version: row.version,
      archived: row.archivedAt !== null,
    };
  });

  return (
    <LandInquiriesClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      canManage={can(actor.role, "LAND_INQUIRY_MANAGE", actor.extraPermissions)}
      canReopen={can(actor.role, "LAND_INQUIRY_REOPEN", actor.extraPermissions)}
      canSeeArchived={admin}
      rows={rows}
      page={list.page}
      totalPages={list.totalPages}
      totalRows={list.totalRows}
    />
  );
}

function areaLabel(row: {
  areaSqM: { toFixed(n: number): string } | null;
  areaBigha: { toFixed(n: number): string } | null;
  areaBiswa: { toFixed(n: number): string } | null;
}) {
  if (row.areaSqM) return `${Number(row.areaSqM.toFixed(6))} Sq. Mtr.`;
  const local = [
    row.areaBigha ? `${Number(row.areaBigha.toFixed(6))} Bigha` : null,
    row.areaBiswa ? `${Number(row.areaBiswa.toFixed(6))} Biswa` : null,
  ].filter(Boolean);
  return local.length ? local.join(" · ") : null;
}
