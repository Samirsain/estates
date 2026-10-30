// One Land Inquiry — Land Inquiry spec §23.6.
//
// The heading, then the same fourteen sections the form has, in the same
// order. An optional value nobody filled in reads "—" rather than disappearing:
// what was not asked and what was answered "no" are different facts.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Row } from "@/components/fact-row";
import { Section as RecordSection } from "@/components/record-section";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { maskMobile } from "@/lib/security/identity";
import { formatIstDate } from "@/lib/tasks";
import {
  RATE_BASIS_LABEL,
  RECEIVED_FROM_LABEL,
  STAGE_LABEL,
  humanise,
  inr,
  metricViews,
  stageVariant,
} from "@/lib/domain/land-inquiry";
import { getLandInquiry } from "@/lib/services/land-inquiry-service";
import InquiryActions from "../inquiry-actions";

export const dynamic = "force-dynamic";

const dash = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);

// Boxes, the way the Member, Customer and Plot profiles read (owner, 29 Oct
// 2026). They pack into columns rather than a grid, so a short box never leaves
// a hole under it; the number keeps the form's order readable down each column.
function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 break-inside-avoid">
      <RecordSection title={`${index}. ${title}`}>{children}</RecordSection>
    </div>
  );
}

// A multi-select answer, listed the way the Project page lists Amenities: no
// pills (those are for links), a small dot hanging in the gap, two columns.
function List({ values }: { values: string[] }) {
  if (!values.length) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 pl-2.5 text-sm text-foreground">
      {values.map((v) => (
        <li key={v} className="relative">
          <span className="absolute -left-2.5 top-[0.55em] h-1 w-1 rounded-full bg-primary/60" />
          {humanise(v)}
        </li>
      ))}
    </ul>
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


  const metric = inquiry.areaSqM ? metricViews(Number(inquiry.areaSqM)) : null;
  const sourceLabel =
    inquiry.sourcePerson?.fullName ??
    (inquiry.receivedFrom === "ANOTHER_DEALER"
      ? maskMobile(inquiry.anotherDealerMobile ?? "")
      : "The company's own sourcing");

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-6xl space-y-4">
        {/* The actions sit on the right of the heading (owner, 29 Oct 2026). */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
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
          </div>
          <InquiryActions
            id={inquiry.id}
            version={inquiry.version}
            status={inquiry.status}
            stage={inquiry.stage}
            archived={inquiry.archivedAt !== null}
            canManage={can(actor.role, "LAND_INQUIRY_MANAGE", actor.extraPermissions)}
            canReopen={can(actor.role, "LAND_INQUIRY_REOPEN", actor.extraPermissions)}
          />
        </header>

        <div className="gap-4 md:columns-2 lg:columns-3">
          <Section index={1} title="Inquiry Details">
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
                    entry.patharNo && `Pathar ${entry.patharNo}`,
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
              value={metric ? `${metric.sqM.toFixed(6)} Sq. Mtr.` : "—"}
              hint={
                metric &&
                `${metric.hectare.toFixed(6)} Hectare · ${metric.sqFt.toFixed(2)} Sq. Ft.`
              }
            />
            <Row
              label="Frontage"
              value={
                inquiry.frontageValue
                  ? `${Number(inquiry.frontageValue)} ${inquiry.frontageUnit === "MTR" ? "Mtr" : "Ft"}`
                  : "—"
              }
            />
            <Row
              label="Approach Road Width"
              value={
                inquiry.roadWidthValue
                  ? `${Number(inquiry.roadWidthValue)} ${inquiry.roadWidthUnit === "MTR" ? "Mtr" : "Ft"}`
                  : "—"
              }
            />
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
            <List values={inquiry.developmentPotential} />
          </Section>

          <Section index={12} title="Documents Received">
            <List values={inquiry.documentsReceived} />
          </Section>

          <Section index={13} title="Evaluation">
            <List values={inquiry.evaluation} />
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
      </div>
    </AppShell>
  );
}
