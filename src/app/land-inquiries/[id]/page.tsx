// One Land Inquiry — Land Inquiry spec §23.6.
//
// The summary first, then the same fourteen sections the form has, in the same
// order. An optional value nobody filled in reads "—" rather than disappearing:
// what was not asked and what was answered "no" are different facts.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import { formatIstDate } from "@/lib/tasks";
import {
  RATE_BASIS_LABEL,
  RECEIVED_FROM_LABEL,
  STAGE_LABEL,
  metricViews,
} from "@/lib/domain/land-inquiry";
import { getLandInquiry } from "@/lib/services/land-inquiry-service";
import InquiryActions from "../inquiry-actions";
import { humanise } from "../land-inquiry-form";
import { inr, stageVariant } from "../land-inquiries-client";

export const dynamic = "force-dynamic";

const dash = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/40 py-1.5 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-xs">{value}</span>
    </div>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">
        <span className="mr-2 tabular-nums text-muted-foreground">{index}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function LandInquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireStaff();
  const { id } = await params;
  const inquiry = await getLandInquiry(id);
  // Spec §26.4 — a record the caller may not see is simply not found. The
  // response never says a hidden one exists.
  if (!inquiry) notFound();

  const staff = await db.staffAccount.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, staffAccountId: true, role: true, person: { select: { fullName: true } } },
    orderBy: { staffAccountId: "asc" },
  });

  const primary = inquiry.owners.find((o) => o.isPrimary) ?? inquiry.owners[0] ?? null;
  const metric = inquiry.areaSqM ? metricViews(Number(inquiry.areaSqM)) : null;
  const sourceLabel =
    inquiry.sourcePerson?.fullName ??
    (inquiry.receivedFrom === "ANOTHER_DEALER"
      ? maskMobile(inquiry.anotherDealerMobile ?? "")
      : "The company's own sourcing");

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-5xl space-y-3">
        <header>
          <Link
            href="/land-inquiries"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Land Inquiries
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{inquiry.inquiryNo}</h1>
            <Badge variant={inquiry.status === "WORKING" ? "info" : "secondary"}>
              {inquiry.status === "WORKING" ? "Working" : "Closed"}
            </Badge>
            <Badge variant={stageVariant(inquiry.stage)}>{STAGE_LABEL[inquiry.stage]}</Badge>
            {inquiry.archivedAt && <Badge variant="outline">Archived</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatIstDate(inquiry.inquiryDate)} · {RECEIVED_FROM_LABEL[inquiry.receivedFrom]} ·{" "}
            {sourceLabel} · {primary?.ownerName ?? "no owner recorded"} ·{" "}
            {[inquiry.district, inquiry.tehsil].filter(Boolean).join(" / ") || "no location"} ·{" "}
            {inquiry.assignedTo
              ? `${inquiry.assignedTo.staffAccountId} · ${inquiry.assignedTo.person.fullName}`
              : "unassigned"}
          </p>
        </header>

        <InquiryActions
          id={inquiry.id}
          version={inquiry.version}
          status={inquiry.status}
          stage={inquiry.stage}
          assignedToId={inquiry.assignedToId}
          archived={inquiry.archivedAt !== null}
          canManage={can(actor.role, "LAND_INQUIRY_MANAGE", actor.extraPermissions)}
          canReopen={can(actor.role, "LAND_INQUIRY_REOPEN", actor.extraPermissions)}
          canArchive={can(actor.role, "LAND_INQUIRY_ARCHIVE", actor.extraPermissions)}
          canReassign={can(actor.role, "WORK_REASSIGN", actor.extraPermissions)}
          staff={staff.map((s) => ({
            id: s.id,
            label: `${s.staffAccountId} · ${s.person.fullName} · ${s.role}`,
          }))}
        />

        <Section index={1} title="Inquiry Details">
          <Row label="Inquiry No." value={inquiry.inquiryNo} />
          <Row label="Date" value={formatIstDate(inquiry.inquiryDate)} />
          <Row label="Received From" value={RECEIVED_FROM_LABEL[inquiry.receivedFrom]} />
          <Row
            label="Source"
            value={
              inquiry.sourcePerson ? (
                <Link
                  href={`/people/${inquiry.sourcePerson.id}`}
                  className="text-primary hover:underline"
                >
                  {[
                    inquiry.sourcePerson.memberProfile?.memberId,
                    inquiry.sourcePerson.customerProfile?.customerId,
                    inquiry.sourcePerson.fullName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Link>
              ) : (
                sourceLabel
              )
            }
          />
          <Row label="Status" value={inquiry.status === "WORKING" ? "Working" : "Closed"} />
          <Row label="Inquiry Stage" value={STAGE_LABEL[inquiry.stage]} />
          <Row
            label="Assigned To"
            value={
              inquiry.assignedTo
                ? `${inquiry.assignedTo.staffAccountId} · ${inquiry.assignedTo.person.fullName}`
                : "—"
            }
          />
        </Section>

        <Section index={2} title="Land Owner Details">
          {inquiry.owners.length === 0 ? (
            <p className="text-xs text-muted-foreground">No owner recorded yet.</p>
          ) : (
            inquiry.owners.map((owner) => (
              <Row
                key={owner.id}
                label={owner.isPrimary ? "Primary Owner" : "Additional Owner"}
                value={`${owner.ownerName}${owner.mobile ? ` · ${maskMobile(owner.mobile)}` : ""}`}
              />
            ))
          )}
        </Section>

        <Section index={3} title="Location">
          <Row label="District" value={dash(inquiry.district)} />
          <Row label="Tehsil" value={dash(inquiry.tehsil)} />
          <Row label="Exact Location" value={dash(inquiry.exactLocation)} />
          <Row
            label="Google Map Pin"
            value={
              inquiry.latitude && inquiry.longitude ? (
                <a
                  className="text-primary hover:underline"
                  href={`https://www.google.com/maps?q=${inquiry.latitude},${inquiry.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {String(inquiry.latitude)}, {String(inquiry.longitude)}
                </a>
              ) : (
                "—"
              )
            }
          />
        </Section>

        <Section index={4} title="Jamabandi Details">
          {inquiry.jamabandiEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Jamabandi reference recorded.</p>
          ) : (
            inquiry.jamabandiEntries.map((entry) => (
              <Row
                key={entry.id}
                label={`Row ${entry.sortOrder}`}
                value={[
                  entry.murbbaNo && `Murbba ${entry.murbbaNo}`,
                  entry.patwarNo && `Patwar ${entry.patwarNo}`,
                  entry.khasraNo && `Khasra ${entry.khasraNo}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))
          )}
        </Section>

        <Section index={5} title="Land Details">
          <Row label="Bigha" value={dash(inquiry.areaBigha && Number(inquiry.areaBigha))} />
          <Row label="Biswa" value={dash(inquiry.areaBiswa && Number(inquiry.areaBiswa))} />
          <Row
            label="Metric Area"
            value={
              metric
                ? `${metric.sqM.toFixed(6)} Sq. Mtr. · ${metric.hectare.toFixed(6)} Hectare · ${metric.sqFt.toFixed(2)} Sq. Ft.`
                : "—"
            }
          />
          <Row label="Dimensions" value={dash(inquiry.dimensions)} />
          <Row
            label="Frontage"
            value={
              inquiry.frontageValue
                ? `${Number(inquiry.frontageValue)} ${inquiry.frontageUnit === "MTR" ? "Mtr" : "Ft"}`
                : "—"
            }
          />
          <Row
            label="Road Width"
            value={
              inquiry.roadWidthValue
                ? `${Number(inquiry.roadWidthValue)} ${inquiry.roadWidthUnit === "MTR" ? "Mtr" : "Ft"}`
                : "—"
            }
          />
          <Row label="Shape" value={dash(inquiry.shape)} />
          <Row label="Boundaries" value={dash(inquiry.boundaries)} />
        </Section>

        <Section index={6} title="Land Category / Use">
          <Row label="Category" value={inquiry.landCategory ? humanise(inquiry.landCategory) : "—"} />
          <Row label="Current Land Use" value={dash(inquiry.currentLandUse)} />
          <Row label="Master Plan / Zonal Use" value={dash(inquiry.masterPlanZonalUse)} />
        </Section>

        <Section index={7} title="Conversion / Approval">
          <Row label="90A Status" value={humanise(inquiry.status90A)} />
          <Row label="Land Conversion Status" value={humanise(inquiry.landConversionStatus)} />
          <Row label="Change of Land Use Status" value={humanise(inquiry.changeLandUseStatus)} />
          <Row label="Patta / Lease Status" value={humanise(inquiry.pattaLeaseStatus)} />
        </Section>

        <Section index={8} title="Legal Check">
          <Row label="Registry / Sale Deed Available" value={humanise(inquiry.registrySaleDeedAvailable)} />
          <Row label="Mutation Complete" value={humanise(inquiry.mutationComplete)} />
          <Row label="Mortgage / Bank Charge" value={humanise(inquiry.mortgageBankCharge)} />
          <Row label="Court Case / Stay" value={humanise(inquiry.courtCaseStay)} />
          <Row label="Family Dispute" value={humanise(inquiry.familyDispute)} />
          <Row label="Acquisition Notice" value={humanise(inquiry.acquisitionNotice)} />
          <Row label="Government Restriction" value={humanise(inquiry.governmentRestriction)} />
        </Section>

        <Section index={9} title="Access & Site Condition">
          <Row label="Approach Road" value={humanise(inquiry.approachRoad)} />
          <Row label="Road Type" value={dash(inquiry.roadType)} />
          <Row label="Electricity" value={humanise(inquiry.electricity)} />
          <Row label="Water" value={humanise(inquiry.water)} />
          <Row label="Sewerage" value={humanise(inquiry.sewerage)} />
          <Row label="Existing Construction" value={humanise(inquiry.existingConstruction)} />
          <Row label="Encroachment" value={humanise(inquiry.encroachment)} />
          <Row label="Possession Status" value={dash(inquiry.possessionStatus)} />
        </Section>

        <Section index={10} title="Commercial Details">
          <Row
            label="Owner Asking Rate"
            value={
              inquiry.ownerAskingRate
                ? `${inr(inquiry.ownerAskingRate.toFixed(2))} · ${RATE_BASIS_LABEL[inquiry.ownerAskingRateBasis!]}`
                : "—"
            }
          />
          <Row
            label="Total Asking Value"
            value={inquiry.totalAskingValue ? inr(inquiry.totalAskingValue.toFixed(2)) : "—"}
          />
          <Row
            label="Negotiable"
            value={inquiry.negotiable === null ? "Unknown" : inquiry.negotiable ? "Yes" : "No"}
          />
          <Row
            label="DLC Rate"
            value={
              inquiry.dlcRate
                ? `${inr(inquiry.dlcRate.toFixed(2))} · ${RATE_BASIS_LABEL[inquiry.dlcRateBasis!]}`
                : "—"
            }
          />
          <Row
            label="Expected Purchase Rate"
            value={
              inquiry.expectedPurchaseRate
                ? `${inr(inquiry.expectedPurchaseRate.toFixed(2))} · ${RATE_BASIS_LABEL[inquiry.expectedPurchaseRateBasis!]}`
                : "—"
            }
          />
          <Row label="Payment Expectation" value={dash(inquiry.paymentExpectation)} />
          <p className="mt-2 text-[11px] text-muted-foreground">
            Pre-acquisition figures. They reach no Booking, Payment, Commission, payout or refund.
          </p>
        </Section>

        <Section index={11} title="Development Potential">
          <p className="text-xs">
            {inquiry.developmentPotential.length
              ? inquiry.developmentPotential.map(humanise).join(" · ")
              : "—"}
          </p>
        </Section>

        <Section index={12} title="Documents Received">
          <p className="text-xs">
            {inquiry.documentsReceived.length
              ? inquiry.documentsReceived.map(humanise).join(" · ")
              : "—"}
          </p>
        </Section>

        <Section index={13} title="Evaluation">
          <p className="text-xs">
            {inquiry.evaluation.length ? inquiry.evaluation.map(humanise).join(" · ") : "—"}
          </p>
        </Section>

        <Section index={14} title="Inquiry Stage">
          <Row label="Status" value={inquiry.status === "WORKING" ? "Working" : "Closed"} />
          <Row label="Stage" value={STAGE_LABEL[inquiry.stage]} />
          <Row label="Recorded by" value={inquiry.createdByRef} />
          <Row label="Last updated by" value={inquiry.updatedByRef} />
          <Row label="Version" value={inquiry.version} />
          {inquiry.archivedAt && (
            <Row
              label="Archived"
              value={`${formatIstDate(inquiry.archivedAt)} · ${inquiry.archivedByRef}`}
            />
          )}
        </Section>
      </div>
    </AppShell>
  );
}
