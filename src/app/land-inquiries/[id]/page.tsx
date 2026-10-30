// One Land Inquiry — Land Inquiry spec §23.6.
//
// The heading (status and stage are its badges), then the form's seven
// sections in the form's order; the Inquiry Stage box went on 30 Oct (owner). The spec's other six (Land Category, Conversion, Legal Check,
// Access, Commercial Details, Evaluation) left the form on 19 Oct 2026 and the
// page on 30 Oct (owner): nobody can fill them, so they are not shown. Their
// columns stay. An optional value nobody filled in reads "—" rather than
// disappearing: what was not asked and what was answered "no" are different facts.

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
  RECEIVED_FROM_LABEL,
  STAGE_LABEL,
  humanise,
  metricViews,
  stageVariant,
} from "@/lib/domain/land-inquiry";
import { getLandInquiry } from "@/lib/services/land-inquiry-service";
import InquiryActions from "../inquiry-actions";

export const dynamic = "force-dynamic";

const dash = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);

// Boxes, the way the Member, Customer and Plot profiles read (owner, 29 Oct
// 2026), laid out by the owner on 30 Oct. Every box keeps its own height, so a
// short one (no owners yet, one Jamabandi row) never stands half empty. Desktop
// is three independent columns, read left to right along the top, each with a
// tall box and a short one so they end near the same height (owner: no empty
// corner at the bottom right):
//   1 | 2 | 3
//   4 | 5 | 6
//   7 |   |
// Below desktop the columns dissolve (display: contents) and `order` puts the
// boxes back to 1…7: two columns on a tablet, one on a phone.
const ORDER: Record<number, string> = {
  1: "order-1",
  2: "order-2",
  3: "order-3",
  4: "order-4",
  5: "order-5",
  6: "order-6",
  7: "order-7",
};

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 ${ORDER[index]} lg:order-none`}>
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
      ? [inquiry.anotherDealerName, maskMobile(inquiry.anotherDealerMobile ?? "")].filter(Boolean).join(" · ")
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

        <div className="grid items-start gap-4 md:grid-cols-2 lg:flex">
          <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-4">
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

            <Section index={7} title="Documents Received">
              <List values={inquiry.documentsReceived} />
            </Section>
          </div>
          <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-4">
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
          </div>
          <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-4">
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

            <Section index={6} title="Development Potential">
              <List values={inquiry.developmentPotential} />
              <div className="mt-3">
                <Row label="Current Land Use" value={dash(inquiry.currentLandUse)} />
                <Row label="Master Plan / Zonal Use" value={dash(inquiry.masterPlanZonalUse)} />
              </div>
            </Section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
