// Land Inquiries — Land Inquiry spec §23.3, §24, §25.
//
// The filters are query parameters and the query runs on the server, so a
// filtered list survives a refresh, can be linked to, and never depends on the
// browser holding the whole table.

import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { db } from "@/lib/db";
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
  const admin = actor.role === "MD" || actor.role === "ADMIN";

  const filters: LandInquiryListFilters = {
    q: one(params.q),
    district: one(params.district),
    tehsil: one(params.tehsil),
    khasraNo: one(params.khasraNo),
    receivedFrom: one(params.receivedFrom) as LandInquiryListFilters["receivedFrom"],
    status: one(params.status) as LandInquiryListFilters["status"],
    stage: one(params.stage) as LandInquiryListFilters["stage"],
    assignedToId: one(params.assignedToId),
    dateFrom: one(params.dateFrom),
    dateTo: one(params.dateTo),
    page: Number(one(params.page) ?? 1) || 1,
    pageSize: DEFAULT_PAGE_SIZE,
    // Spec §25 — only MD and Admin may look past the archive.
    includeArchived: admin && one(params.archived) === "1",
  };

  const [list, staff] = await Promise.all([
    listLandInquiries(filters),
    db.staffAccount.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, staffAccountId: true, role: true, person: { select: { fullName: true } } },
      orderBy: { staffAccountId: "asc" },
    }),
  ]);

  const rows: LandInquiryRowView[] = list.rows.map((row) => {
    const primary = row.owners.find((o) => o.isPrimary) ?? row.owners[0] ?? null;
    return {
      id: row.id,
      inquiryNo: row.inquiryNo,
      date: formatIstDate(row.inquiryDate),
      receivedFrom: row.receivedFrom,
      // Spec §2.2 — an Another Dealer inquiry has a number and no name,
      // because that is genuinely all the company was given.
      source:
        row.sourcePerson?.fullName ??
        (row.receivedFrom === "ANOTHER_DEALER" ? row.anotherDealerMobile : "3% Club") ??
        "—",
      primaryOwner: primary?.ownerName ?? null,
      additionalOwners: Math.max(row.owners.length - 1, 0),
      location: [row.district, row.tehsil].filter(Boolean).join(" / ") || null,
      exactLocation: row.exactLocation,
      // Spec §24 — the metric area if it is known, otherwise what was actually
      // recorded in Bigha and Biswa, otherwise nothing. Never a conversion.
      area: areaLabel(row),
      askingRate: row.ownerAskingRate ? row.ownerAskingRate.toFixed(2) : null,
      askingRateBasis: row.ownerAskingRateBasis,
      status: row.status,
      stage: row.stage,
      assignedTo: row.assignedTo
        ? `${row.assignedTo.staffAccountId} · ${row.assignedTo.person.fullName}`
        : null,
      archived: row.archivedAt !== null,
    };
  });

  return (
    <LandInquiriesClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      canManage={can(actor.role, "LAND_INQUIRY_MANAGE", actor.extraPermissions)}
      canSeeArchived={admin}
      rows={rows}
      page={list.page}
      totalPages={list.totalPages}
      totalRows={list.totalRows}
      staff={staff.map((s) => ({
        id: s.id,
        label: `${s.staffAccountId} · ${s.person.fullName} · ${s.role}`,
      }))}
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
