// Customer detail page — /customers/[id]
//
// Built to system/change-requests/custmer-profile.md, top to bottom: Header ›
// Summary › Contact · Identity · Bank › Bookings › Property Activity ›
// Loyalty & Commission. Alerts are badges beside Back and History opens from
// the History button, both as on the Member profile. Left out on the owner's instruction: the
// Merged banner, the active-and-waiting bank accounts change, Add Task and
// Record Payment.

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can, canViewField } from "@/lib/security/permissions";
import { maskAadhaar, maskMobile, maskPan } from "@/lib/security/identity";
import {
  eligibilityLabel,
  experienceSince,
  payoutStep,
} from "@/lib/domain/commission";
import { PayoutCell } from "@/app/members/[id]/payout-button";
import { validateFinalBuyers } from "@/lib/domain/completion";
import { formatIst, formatIstDateTime } from "@/lib/tasks";
import { auditHistory, mergeHistory, newestFirst, type HistoryItem } from "@/lib/profile-history";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PersonDetailsEditor } from "@/components/person-details-editor";
import { PersonLink } from "@/components/person-link";
import { Row } from "@/components/fact-row";
import { Section, Stat } from "@/components/record-section";
import { AccountNumber, IdentityFacts } from "@/components/protected-identity";
import { MergeButton } from "./merge-button";
import { RecordTermsButton, VerifyAadhaarButton } from "./closer-conditions";
import HistoryButton from "@/app/members/[id]/history-button";
import { BankAccounts } from "./bank-accounts";
import {
  AlertTriangle,
  ArrowLeft,
  ShieldCheck,
  User,
  MapPin,
  Layers,
} from "lucide-react";

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

/**
 * PENDING → "Pending", NOT_AVAILABLE → "Not available". AVAILABLE says
 * nothing the number above it has not already said, so it says nothing.
 */
function statusWord(status: string): string | undefined {
  if (status === "AVAILABLE") return undefined;
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
}

/** BOOKED → Booked, PAYMENT_COMPLETED → Payment completed. */
const words = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replaceAll("_", " ");

/** RESIDENTIAL → Residential. */
const titleWords = (v: string) =>
  v.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** RGE-026 — the number is what a Plot is known by; its type is said where it is listed. */
const plotName = (p: { plotNumber: string }) => p.plotNumber;

/** A Hold runs 72 hours (HOLD_HOURS); its last day is when somebody has to act on it. */
const HOLD_EXPIRING_MS = 24 * 3_600_000;

function timeLeft(ms: number): string {
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
  return `${hours}h ${Math.floor((ms % 3_600_000) / 60_000)}m left`;
}

const SUB = "block text-[11px] text-muted-foreground";
/** Every table on the page centres each column under its heading (owner, 28 Oct 2026). */
const CTH = "px-2 pb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const CTD = "px-2 py-2.5 text-center align-middle";


export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireStaff();
  const { id } = await params;

  // A contact number is masked on a shared screen, but MD and Admin run the
  // business off it, so they read it whole (PRD RD-05 covers the encrypted
  // values only — this one is a mask, not a protection).
  const contact = (value: string) =>
    canViewField(actor.role, "MOBILE_FULL") ? value : maskMobile(value);

  const customer = await db.customerProfile.findUnique({
    where: { id },
    include: {
      person: { include: { memberProfile: { select: { id: true, memberId: true, status: true } } } },
      royaltyLinkedMember: { include: { person: true } },
      royaltyLinkFirstBooking: { select: { id: true, bookingNumber: true, requestNo: true } },
      termsAcceptances: { orderBy: { acceptedOn: "desc" } },
    },
  });

  if (!customer) notFound();

  const personId = customer.personId;
  const bookingRef = { id: true, bookingNumber: true, requestNo: true } as const;

  const [
    holds,
    bookings,
    banks,
    commissions,
    audit,
    merges,
    customerChanges,
    endedShares,
  ] = await Promise.all([
    db.hold.findMany({
      where: { personId },
      include: { plot: { include: { project: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.booking.findMany({
      where: {
        OR: [{ primaryPersonId: personId }, { parties: { some: { personId } } }],
      },
      include: {
        project: true,
        plot: true,
        soldByPerson: {
          select: {
            id: true,
            fullName: true,
            memberProfile: { select: { memberId: true } },
            customerProfile: { select: { customerId: true } },
          },
        },
        parties: {
          where: { effectiveTo: null },
          include: {
            person: {
              select: { fullName: true, aadhaarStatus: true, dateOfBirth: true, addressLine: true },
            },
          },
        },
        completions: { where: { reopenedAt: null } },
        cancellations: true,
        changePlotRequests: { include: { fromPlot: true, toPlot: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    db.bankDetail.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
    }),
    db.commissionRecord.findMany({
      where: { beneficiaryPersonId: personId, isCurrent: true },
      // The Loyalty table names the Project, the Plot and who bought it.
      include: {
        booking: {
          select: {
            ...bookingRef,
            primaryPersonId: true,
            project: { select: { name: true } },
            plot: { select: { id: true, plotNumber: true } },
            primaryPerson: { select: { fullName: true, customerProfile: { select: { id: true, customerId: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.auditEvent.findMany({
      where: { entity: "Person", entityId: personId },
      orderBy: { at: "desc" },
      take: 100,
    }),
    db.personMergeRequest.findMany({
      where: { OR: [{ survivingPersonId: personId }, { mergedPersonId: personId }] },
      include: {
        survivingPerson: { select: { fullName: true } },
        mergedPerson: { select: { fullName: true } },
      },
    }),
    db.primaryCustomerChange.findMany({
      where: { OR: [{ fromPersonId: personId }, { toPersonId: personId }] },
      include: { booking: { select: bookingRef } },
    }),
    // Effective-dated share rows that have ended — the old share stays for History.
    db.bookingParty.findMany({
      where: { personId, effectiveTo: { not: null } },
      include: { booking: { select: bookingRef } },
    }),
  ]);

  const now = Date.now();

  // The Bookings this Customer is buying on: approved, and they are the
  // Primary or an Additional Customer. Being only a final registration buyer
  // is shown on the Booking's own row, not as a property of theirs.
  const deals = bookings.filter(
    (b) =>
      b.bookingNumber &&
      (b.primaryPersonId === personId ||
        b.parties.some((p) => p.personId === personId && p.kind === "COMMERCIAL"))
  );

  const firstBookingDate = bookings.at(-1)?.submittedAt ?? null;
  const experience = experienceSince(firstBookingDate);

  /* ---------------------------------------------------------------- alerts */

  // Paid in full, and the papers still have nobody complete to go to.
  const detailsDue = deals.filter(
    (b) =>
      b.status === "PAYMENT_COMPLETED" &&
      !validateFinalBuyers(
        b.parties
          .filter((p) => p.kind === "FINAL_REGISTRATION")
          .map((p) => ({
            personId: p.personId,
            sharePercent: p.sharePercent?.toString() ?? null,
            aadhaarRecorded: p.person.aadhaarStatus !== "PENDING",
            dateOfBirth: p.person.dateOfBirth,
            address: p.person.addressLine,
          }))
      ).ok
  );
  // The engine's own hold reasons, so the alert says exactly what it says.
  const blockedPayouts = commissions.filter(
    (c) =>
      c.payment === "NOT_PAID" &&
      (c.holdReason === "AADHAAR_PENDING" || c.holdReason === "BANK_VERIFICATION_PENDING")
  );
  const expiringHolds = holds.filter(
    (h) => h.status === "ACTIVE" && h.expiresAt.getTime() - now <= HOLD_EXPIRING_MS
  );
  const canCompleteDetails = can(actor.role, "FINAL_BUYER_RECORD", actor.extraPermissions);
  const canPayCommission = can(actor.role, "COMMISSION_PROCESS", actor.extraPermissions);

  /* --------------------------------------------------------------- history */

  const history = newestFirst([
    { at: customer.createdAt, title: `Customer profile created · ${customer.customerId}` },
    ...auditHistory(audit, contact),
    ...mergeHistory(merges, personId),
    ...customerChanges.map((c) => ({
      at: c.decidedAt ?? c.requestedAt,
      title: `Primary Customer change on ${c.booking.bookingNumber ?? c.booking.requestNo}`,
      detail: `${c.toPersonId === personId ? "To this Customer" : "Away from this Customer"} · ${words(c.status)} — ${c.reason}`,
      by: c.decidedByRef ?? c.requestedByRef,
    })),
    ...endedShares.map((p) => ({
      at: p.effectiveTo!,
      title: `${p.kind === "FINAL_REGISTRATION" ? "Final buyer" : "Ownership"} share ended on ${
        p.booking.bookingNumber ?? p.booking.requestNo
      }`,
      detail:
        [
          `${p.sharePercent ? p.sharePercent.toFixed(2) : "100.00"}% as ${
            p.role === "PRIMARY" ? "Primary" : "Additional"
          } Customer`,
          p.changeReason,
        ]
          .filter(Boolean)
          .join(" — "),
      by: p.actorRef,
    })),
  ]);

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-5xl space-y-4">
        {/* Back on the left; this Customer's own actions on the right. The
            owner took Start Enquiry, View Available Plots, Hold a Plot and
            Start Booking off this profile on 28 Oct 2026. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/customers"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Customers
            </Link>
            {/* What needs action, as short badges beside Back — where the
                Member profile shows Recovery pending. The badge names the work
                and the Plot; the rest is in its tooltip. */}
            {detailsDue.map((b) => {
              const why = `${b.bookingNumber} · ${b.project.name} is paid in full; final buyer details are not complete.`;
              const badge = (
                <Badge variant="warning" className={`gap-1 ${canCompleteDetails ? "hover:underline" : ""}`}>
                  <AlertTriangle className="h-3 w-3" />
                  Complete Details · {plotName(b.plot)}
                </Badge>
              );
              return canCompleteDetails ? (
                <Link key={b.id} href={`/bookings/${b.id}`} title={why}>
                  {badge}
                </Link>
              ) : (
                <span key={b.id} title={why}>
                  {badge}
                </span>
              );
            })}
            {/* One badge per reason, however many payouts it holds. */}
            {(["AADHAAR_PENDING", "BANK_VERIFICATION_PENDING"] as const).map((reason) => {
              const held = blockedPayouts.filter((c) => c.holdReason === reason);
              if (held.length === 0) return null;
              const what = held
                .map(
                  (c) =>
                    `${c.type === "LOYALTY" ? "Loyalty Points" : `${words(c.type)} commission`}${
                      c.booking ? ` on ${c.booking.bookingNumber ?? c.booking.requestNo}` : ""
                    }`
                )
                .join(", ");
              return (
                <span key={reason} title={`Holds the ${what}.`}>
                  <Badge variant="warning" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {reason === "AADHAAR_PENDING" ? "Aadhaar Pending" : "Bank not verified"}
                  </Badge>
                </span>
              );
            })}
            {expiringHolds.map((h) => (
              <Link
                key={h.id}
                href={`/plots/${h.plot.id}`}
                title={`${h.plot.project.name} · ${plotName(h.plot)} — ${timeLeft(h.expiresAt.getTime() - now)}`}
              >
                <Badge variant="warning" className="gap-1 hover:underline">
                  <AlertTriangle className="h-3 w-3" />
                  Hold expiring · {plotName(h.plot)}
                </Badge>
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* History opens over the page, as on the Member profile; it took
                Record Payment's place on 28 Oct 2026. */}
            <HistoryButton
              rows={history.map((h) => ({ at: formatIstDateTime(h.at), title: h.title, detail: h.detail, by: h.by }))}
            />
            {can(actor.role, "PERSON_MERGE", actor.extraPermissions) && (
              <MergeButton
                person={{
                  id: personId,
                  label: [
                    customer.person.fullName,
                    customer.customerId,
                    customer.person.memberProfile?.memberId,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                }}
              />
            )}
            {can(actor.role, "PERSON_DETAILS_EDIT", actor.extraPermissions) && (
              <PersonDetailsEditor
                personId={customer.personId}
                bank={banks[0] ?? null}
                canEnterBank={can(actor.role, "BANK_DETAILS_ENTER", actor.extraPermissions)}
                person={{
                  fullName: customer.person.fullName,
                  mobile: customer.person.primaryMobile,
                  altMobile: customer.person.altMobile ?? "",
                  email: customer.person.email ?? "",
                  city: customer.person.city ?? "",
                  addressLine: customer.person.addressLine ?? "",
                  dateOfBirth: customer.person.dateOfBirth
                    ? customer.person.dateOfBirth.toISOString().slice(0, 10)
                    : "",
                }}
              />
            )}
          </div>
        </div>

        {/* Header and Summary — who they are, and the answers beside it on the
            same row, laid out as the Member profile lays out its own. */}
        <Card className="p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <User className="h-6 w-6" />
            </div>
            {/* Never narrower than the name and ID: when five answers sat
                beside it, a shrinkable block broke "Vikas Bansal" over two lines. */}
            <div className="min-w-fit flex-1">
              <h1 className="text-2xl font-bold tracking-tight">{customer.person.fullName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">{customer.customerId}</span>
                {/* The same Person, filed as a Member too. */}
                {customer.person.memberProfile && (
                  <Link href={`/members/${customer.person.memberProfile.id}`}>
                    <Badge variant="purple" className="hover:underline">
                      Also a Member · {customer.person.memberProfile.memberId}
                    </Badge>
                  </Link>
                )}
              </div>
            </div>

            {/* Two answers, the same count and gap as the Member profile. The
                owner dropped Recovery, Properties and Closing Loyalty Points
                from here on 28 Oct 2026. */}
            <dl className="flex flex-wrap gap-x-10 gap-y-3">
              {/* Shaped like the Member profile's "Member for": how long, then
                  the day it started. */}
              <Stat
                label="Customer for"
                value={experience?.ago ?? "—"}
                hint={firstBookingDate ? `First booking on ${formatIst(firstBookingDate)}` : "No booking yet"}
              />
              {/* CR-002 — the Member who was Sold By on the first qualifying
                  purchase; CR-003's nobody when that purchase was sold by the 3%
                  Club or a Customer.

                  Shaped like the Member profile's "Invited by", which answers the
                  same question on that side: the Member ID and name together as
                  the value, and a hint only when there is something more to say. */}
              {customer.royaltyLinkedMember ? (
                <Stat
                  label="Royalty linked to"
                  value={
                    <Link
                      href={`/members/${customer.royaltyLinkedMember.id}`}
                      className="text-primary hover:underline"
                    >
                      <span className="block">{customer.royaltyLinkedMember.memberId}</span>
                      <span className="block text-foreground">{customer.royaltyLinkedMember.person.fullName}</span>
                    </Link>
                  }
                  // An unconfirmed link can still move to a different Member.
                  hint={customer.royaltyLinkFinalAt ? undefined : "Provisional"}
                />
              ) : customer.royaltyLinkFirstBookingId ? (
                <Stat
                  label="Royalty linked to"
                  value="None"
                  hint="Not sold by a Member"
                />
              ) : (
                <Stat label="Royalty linked to" value="—" hint="No qualifying purchase" />
              )}
            </dl>
          </div>
        </Card>

        {/* Who they are, how they prove it, where the money goes. */}
        <div className="grid gap-4 md:grid-cols-3">
          <Section fill title="Contact" icon={<User className="h-3.5 w-3.5" />}>
            <Row label="Mobile" value={contact(customer.person.primaryMobile)} />
            {customer.person.altMobile && (
              <Row label="Alternate Mobile" value={contact(customer.person.altMobile)} />
            )}
            <Row label="Email" value={customer.person.email ?? "—"} />
            {/* A blank Date of Birth or Address is shown rather than hidden:
                the gap is the reason Edit details exists. */}
            <Row label="Date of Birth" value={bornOn(customer.person.dateOfBirth)} />
            <Row label="City" value={customer.person.city ?? "—"} />
            <Row label="Address" value={customer.person.addressLine ?? "—"} />
          </Section>

          <Section fill title="Identity" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
            {/* Either the number or the reason there is not one — never
                "Not recorded" with "Pending" underneath saying it twice. */}
            <IdentityFacts
              personId={customer.personId}
              canReveal={canViewField(actor.role, "AADHAAR_FULL")}
              aadhaarMasked={
                customer.person.aadhaarLastFour
                  ? maskAadhaar(customer.person.aadhaarLastFour)
                  : (statusWord(customer.person.aadhaarStatus) ?? "—")
              }
              aadhaarHint={
                customer.person.aadhaarLastFour
                  ? statusWord(customer.person.aadhaarStatus)
                  : undefined
              }
              panMasked={
                customer.person.panMasked
                  ? maskPan(customer.person.panMasked)
                  : (statusWord(customer.person.panStatus) ?? "—")
              }
              panHint={
                customer.person.panMasked ? statusWord(customer.person.panStatus) : undefined
              }
            />
            {/* v2.1 §22, §77 — a Sold By Customer needs verified KYC and
                accepted Customer Terms; the two steps sit here with Identity. */}
            {customer.person.aadhaarStatus === "AVAILABLE" && ["ACCOUNTS", "MD"].includes(actor.role) && (
              <div className="flex justify-end">
                <VerifyAadhaarButton personId={customer.personId} />
              </div>
            )}
            <Row
              label="Customer Terms"
              value={
                customer.termsAcceptances[0]
                  ? `${customer.termsAcceptances[0].termsVersion} · ${formatIst(customer.termsAcceptances[0].acceptedOn)}`
                  : "Not accepted"
              }
            />
            {["CRM", "MD"].includes(actor.role) && (
              <div className="flex justify-end">
                <RecordTermsButton customerProfileId={customer.id} />
              </div>
            )}
          </Section>

          {/* The newest account; the others open under "Show N more". */}
          <BankAccounts
            accounts={banks.map((b) => ({
              id: b.id,
              body: (
                <div>
                  <Row
                    label="Account"
                    value={
                      <AccountNumber
                        bankDetailId={b.id}
                        lastFour={b.accountLastFour}
                        canReveal={canViewField(actor.role, "BANK_FULL")}
                      />
                    }
                    hint={
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
                    }
                  />
                  <Row label="IFSC" value={b.ifsc} />
                  <Row label="Bank" value={b.bankName} />
                  <Row label="Branch" value={b.branchName ?? "—"} />
                  <Row label="Holder name" value={b.accountHolder} />
                </div>
              ),
            }))}
          />
        </div>

        {/* Bookings (was Properties until 28 Oct 2026) — one row per Booking they are buying on. */}
        <Section title={`Bookings (${deals.length})`} icon={<MapPin className="h-3.5 w-3.5" />}>
          {deals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No approved Bookings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-xs">
                <thead className="border-b border-border/50">
                  <tr>
                    <th className={CTH}>Booking</th>
                    <th className={CTH}>Project &amp; Plot</th>
                    <th className={CTH}>Status</th>
                    <th className={CTH}>Ownership</th>
                    <th className={CTH}>Sold By</th>
                    <th className={CTH}>Completion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {deals.map((b) => {
                    const commercial = b.parties.filter((p) => p.kind === "COMMERCIAL");
                    const finals = b.parties.filter((p) => p.kind === "FINAL_REGISTRATION");
                    const mine = commercial.find((p) => p.personId === personId);
                    // The final registration buyer is worth a line only where
                    // it is not simply the people who booked.
                    const finalDiffers =
                      finals.length > 0 &&
                      (finals.length !== commercial.length ||
                        finals.some((f) => !commercial.some((c) => c.personId === f.personId)));
                    const seller = b.soldByPerson;
                    const sellerCode =
                      b.soldByType === "MEMBER"
                        ? seller?.memberProfile?.memberId
                        : seller?.customerProfile?.customerId;
                    const done = b.completions[0];
                    const doneOn = done?.allotmentDate ?? done?.registryDate ?? null;
                    return (
                      <tr key={b.id}>
                        <td className={CTD}>
                          <Link
                            href={`/bookings/${b.id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {b.bookingNumber}
                          </Link>
                        </td>
                        <td className={CTD}>
                          <Link
                            href={`/plots/${b.plot.id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {b.plot.plotNumber}
                          </Link>
                          <span className={SUB}>
                            {titleWords(b.plot.plotType)} · {b.project.name}
                          </span>
                        </td>
                        <td className={CTD}>
                          <span className="font-medium">{words(b.status)}</span>
                          <span className={`${SUB} tabular-nums`}>
                            {b.paymentReceivedPercent.toFixed(2)}% received
                          </span>
                        </td>
                        <td className={CTD}>
                          <span className="font-medium">
                            {mine?.role === "ADDITIONAL" ? "Additional" : "Primary"}
                            <span className="tabular-nums">
                              {" · "}
                              {mine
                                ? mine.sharePercent
                                  ? `${mine.sharePercent.toFixed(2)}%`
                                  : "100%"
                                : "—"}
                            </span>
                          </span>
                          {finalDiffers && (
                            <span className={SUB}>
                              Final buyer:{" "}
                              {finals.map((f, i) => (
                                <span key={f.id}>
                                  {i > 0 && ", "}
                                  <PersonLink personId={f.personId} name={f.person.fullName} />
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className={CTD}>
                          {b.soldByType === "THREE_PERCENT_CLUB" || !seller ? (
                            <span className="font-medium">3% Club</span>
                          ) : (
                            <>
                              <PersonLink
                                personId={seller.id}
                                name={sellerCode ?? seller.fullName}
                                as={b.soldByType === "MEMBER" ? "member" : undefined}
                                className="font-semibold"
                              />
                              {sellerCode && <span className={SUB}>{seller.fullName}</span>}
                            </>
                          )}
                        </td>
                        <td className={CTD}>
                          {done ? (
                            <>
                              <span className="font-medium">
                                {done.route === "ALLOTMENT" ? "Allotment" : "Registry"}
                                {doneOn ? ` · ${formatIst(doneOn)}` : ""}
                              </span>
                              <span className={SUB}>Delivered {formatIst(done.deliveredAt)}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Loyalty Points — the commission table alone (owner, 27 Oct 2026):
            the Loyalty counts and the Royalty link moved off this card, and
            the closer conditions live with Identity. */}
        <Section title="Loyalty Points" icon={<Layers className="h-3.5 w-3.5" />}>
          <div>
            {commissions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No commission records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-xs">
                <thead className="border-b border-border/50">
                  <tr>
                    <th className={CTH}>Booking ID</th>
                    <th className={CTH}>Project &amp; Plot</th>
                    <th className={CTH}>Buyer</th>
                    <th className={CTH}>%</th>
                    <th className={CTH}>Eligibility</th>
                    <th className={CTH}>Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {commissions.map((c) => (
                    <tr key={c.id}>
                      <td className={CTD}>
                        {c.booking ? (
                          <Link
                            href={`/bookings/${c.booking.id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {c.booking.bookingNumber ?? c.booking.requestNo}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={CTD}>
                        {c.booking ? (
                          <>
                            <Link
                              href={`/plots/${c.booking.plot.id}`}
                              className="font-semibold text-primary hover:underline"
                            >
                              {plotName(c.booking.plot)}
                            </Link>
                            <span className={SUB}>{c.booking.project.name}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      {/* Who bought: "Self" on a repeat purchase, the closed
                          Customer's name and ID on a Customer-closing one. */}
                      <td className={CTD}>
                        {c.beneficiaryRole === "REPEAT_PURCHASE_CUSTOMER" ||
                        (c.booking && c.booking.primaryPersonId === personId) ? (
                          <span className="font-medium">Self</span>
                        ) : !c.booking ? (
                          "—"
                        ) : (
                          // The Customer ID on top, opening their profile; the name under it.
                          <>
                            {c.booking.primaryPerson.customerProfile && (
                              <Link
                                href={`/customers/${c.booking.primaryPerson.customerProfile.id}`}
                                className="block font-semibold text-primary hover:underline"
                              >
                                {c.booking.primaryPerson.customerProfile.customerId}
                              </Link>
                            )}
                            <span className={SUB}>{c.booking.primaryPerson.fullName}</span>
                          </>
                        )}
                        {/* A Customer who is also a Member can earn other commission here too. */}
                        {c.type !== "LOYALTY" && <span className={SUB}>{words(c.type)} commission</span>}
                      </td>
                      <td className={`${CTD} font-medium tabular-nums`}>
                        {c.percent.toFixed(2)}%
                      </td>
                      <td className={CTD}>
                        {eligibilityLabel(c.eligibility)}
                        {c.holdReason && (
                          <span className="block text-[11px] text-amber-700">{c.holdReason === "RECOVERY_OUTSTANDING"
                            ? "Recovery Pending"
                            : c.holdReason === "RECOVERY_CIRCUMVENTION_REVIEW"
                              ? "Recovery Review"
                              : words(c.holdReason)}</span>
                        )}
                      </td>
                      {/* The Member profile's Payout: Paid with its date, or Mark
                          Paid / Pay Early for whoever can take that step. */}
                      <td className={CTD}>
                        <PayoutCell
                          payment={c.payment}
                          paidOn={c.paidOn}
                          step={payoutStep(c, actor.role, canPayCommission)}
                          awaitingMd={!!c.earlyRequestedAt && !c.earlyApprovedAt}
                          recordId={c.id}
                          buying={!!c.acquisitionId}
                          label={`${c.type === "LOYALTY" ? "Loyalty Points" : words(c.type)} ${c.percent.toFixed(2)}% · ${
                            c.booking?.bookingNumber ?? c.booking?.requestNo ?? ""
                          }`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </Section>
      </div>
    </AppShell>
  );
}
