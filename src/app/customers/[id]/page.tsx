// Customer detail page — /customers/[id]
// Full profile: identity, property activity, Aadhaar/PAN and bank details.

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { maskAadhaar, maskMobile, maskPan } from "@/lib/security/identity";
import { experienceSince } from "@/lib/domain/commission";
import { formatIst } from "@/lib/tasks";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PersonDetailsEditor } from "@/components/person-details-editor";
import {
  ArrowLeft,
  ShieldCheck,
  Banknote,
  User,
  FileText,
  Clock,
  MapPin,
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

/**
 * Anything waiting on somebody's decision says the same two words here as on
 * the Plot, the Booking and the Acquisition. Everything else is the enum read
 * as words.
 */
const WAITING_STATUS = new Set(["WAITING_FOR_BOOKING_APPROVAL", "REQUEST_PENDING", "PENDING_APPROVAL"]);
const statusWords = (status: string) =>
  WAITING_STATUS.has(status) ? "waiting approval" : status.replaceAll("_", " ").toLowerCase();

const ACTIVITY_VARIANT: Record<string, "info" | "warning" | "success"> = {
  Enquiry: "info",
  Hold: "warning",
  Booking: "success",
};

/**
 * Profile, Identity and Bank are the same kind of thing — a short list of
 * facts about one person — so they are one card three times over: same
 * heading, same rows, same order of weight.
 */
function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

/**
 * The label is the question and the value is the answer, so the answer is what
 * carries the weight: a mobile number, an Aadhaar, an account. `hint` is for
 * what qualifies the answer rather than being it — a verification state — and
 * stays quiet underneath.
 */
function Row({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right">
        <span
          className={`block text-sm font-semibold text-foreground ${mono ? "font-mono" : ""}`}
        >
          {value}
        </span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

/**
 * The header's facts, in the same voice as the cards below: the label is
 * quiet, the fact is not. Four muted sentences of the same size stacked in a
 * corner read as a paragraph nobody finishes.
 */
function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    // A floor width, so three stats read as three columns rather than three
    // boxes each sized by the length of its own answer.
    <div className="min-w-[7.5rem]">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireStaff();
  const { id } = await params;

  const customer = await db.customerProfile.findUnique({
    where: { id },
    include: {
      person: true,
      originalIntroducedByMember: { include: { person: true } },
    },
  });

  if (!customer) notFound();

  const personId = customer.personId;

  const [enquiries, holds, bookings, banks] = await Promise.all([
    db.enquiry.findMany({
      where: { personId },
      include: { project: true, plot: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
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
      include: { project: true, plot: true },
      orderBy: { submittedAt: "desc" },
      take: 50,
    }),
    db.bankDetail.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const activity = [
    ...enquiries.map((e) => ({
      kind: "Enquiry" as const,
      project: e.project.name,
      plot: e.plot
        ? `${e.plot.plotType.replaceAll("_", " ")} ${e.plot.plotNumber}`
        : "General",
      plotId: e.plot?.id ?? null,
      href: null,
      status: e.status,
      at: e.createdAt.toISOString(),
    })),
    ...holds.map((h) => ({
      kind: "Hold" as const,
      project: h.plot.project.name,
      plot: `${h.plot.plotType.replaceAll("_", " ")} ${h.plot.plotNumber}`,
      plotId: h.plot.id,
      href: null,
      status: h.status,
      at: h.createdAt.toISOString(),
    })),
    ...bookings.map((b) => ({
      kind: "Booking" as const,
      project: b.project.name,
      plot: `${b.plot.plotType.replaceAll("_", " ")} ${b.plot.plotNumber}`,
      plotId: b.plot.id,
      href: `/bookings/${b.id}`,
      status: b.status,
      at: b.submittedAt.toISOString(),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const firstBookingDate = bookings.at(-1)?.submittedAt ?? null;
  const experience = experienceSince(firstBookingDate);

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Back, and the one thing this page can change: the facts below it.
            Aadhaar, PAN and bank keep their own guarded flows. */}
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/customers"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Customers
          </Link>
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

        {/* Hero */}
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <User className="h-7 w-7" />
              </div>
              <div>
                {/* Who they are: the name, the id it is filed under, and what
                    kind of Customer — one line, not three stacked sentences. */}
                <h1 className="text-2xl font-bold tracking-tight">
                  {customer.person.fullName}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    {customer.customerId}
                  </span>
                  {customer.customerType && (
                    <Badge variant="outline">
                      {customer.customerType.replaceAll("_", " ")}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-3 md:pr-2">
              {experience && <Stat label="Customer for" value={experience.label} />}
              <Stat
                label="Loyalty slots"
                value={`${customer.loyaltySlotsConsumed} of 3 used`}
              />
              {customer.originalIntroducedByMember && (
                <Stat
                  label="Introduced by"
                  // The Member ID is what the introduction is filed under, so
                  // it leads and the name confirms it.
                  value={
                    <Link
                      href={`/members/${customer.originalIntroducedByMember.id}`}
                      className="font-mono text-primary hover:underline"
                    >
                      {customer.originalIntroducedByMember.memberId}
                    </Link>
                  }
                  hint={customer.originalIntroducedByMember.person.fullName}
                />
              )}
            </div>
          </div>
        </Card>

        {/* Who they are, how they prove it, where the money goes — three lists
            of facts, so three of the same card side by side. Bank used to sit
            at the bottom of the page in a shape of its own. */}
        <div className="grid gap-4 md:grid-cols-3">
          <Section title="Profile" icon={<User className="h-3.5 w-3.5" />}>
            <Row label="Mobile" value={maskMobile(customer.person.primaryMobile)} mono />
            {customer.person.altMobile && (
              <Row label="Alt Mobile" value={maskMobile(customer.person.altMobile)} mono />
            )}
            <Row label="Email" value={customer.person.email ?? "—"} />
            {/* A blank Date of Birth or Address is shown rather than hidden:
                the gap is the reason Edit details exists. */}
            <Row label="Date of Birth" value={bornOn(customer.person.dateOfBirth)} />
            <Row label="City" value={customer.person.city ?? "—"} />
            <Row label="Address" value={customer.person.addressLine ?? "—"} />
          </Section>

          <Section title="Identity" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
            {/* Either the number or the reason there is not one — never
                "Not recorded" with "Pending" underneath saying it twice. */}
            <Row
              label="Aadhaar"
              value={
                customer.person.aadhaarLastFour
                  ? maskAadhaar(customer.person.aadhaarLastFour)
                  : (statusWord(customer.person.aadhaarStatus) ?? "—")
              }
              hint={
                customer.person.aadhaarLastFour
                  ? statusWord(customer.person.aadhaarStatus)
                  : undefined
              }
              mono={!!customer.person.aadhaarLastFour}
            />
            <Row
              label="PAN"
              value={
                customer.person.panMasked
                  ? maskPan(customer.person.panMasked)
                  : (statusWord(customer.person.panStatus) ?? "—")
              }
              hint={
                customer.person.panMasked ? statusWord(customer.person.panStatus) : undefined
              }
              mono={!!customer.person.panMasked}
            />
          </Section>

          <Section title="Bank" icon={<Banknote className="h-3.5 w-3.5" />}>
            {banks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No bank details recorded.</p>
            ) : (
              banks.map((b) => (
                // The account is the fact; who verified it and when qualifies
                // it, so the badge rides with the number rather than opposite
                // it across a box of its own.
                <div key={b.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <Row
                    label="Account"
                    value={`•••• ${b.accountLastFour}`}
                    hint={
                      <>
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
                        {b.verifiedAt && ` ${formatIst(b.verifiedAt.toISOString())}`}
                      </>
                    }
                    mono
                  />
                  <Row label="IFSC" value={b.ifsc} mono />
                  <Row label="Bank" value={b.bankName} />
                  <Row label="Branch" value={b.branchName ?? "—"} />
                  <Row label="Holder" value={b.accountHolder} />
                </div>
              ))
            )}
          </Section>
        </div>

        {/* Property Activity */}
        <Section title="Property Activity">
          {activity.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No Enquiries, Holds or Bookings yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/50 text-xs">
              {activity.map((a, index) => (
                <li
                  key={index}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <span className="flex items-center gap-2">
                    {/* The kind, as a mark rather than a word repeated down the
                        column — the badge beside it already says which. */}
                    {a.kind === "Booking" ? (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : a.kind === "Hold" ? (
                      <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <Badge variant={ACTIVITY_VARIANT[a.kind]}>{a.kind}</Badge>
                    <span className="text-muted-foreground">
                      {a.href ? (
                        <Link href={a.href} className="text-primary hover:underline">
                          {a.project}
                        </Link>
                      ) : (
                        a.project
                      )}
                      {" · "}
                      {a.plotId ? (
                        <Link href={`/plots/${a.plotId}`} className="text-primary hover:underline">
                          {a.plot}
                        </Link>
                      ) : (
                        a.plot
                      )}
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {statusWords(a.status)} · {formatIst(a.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

      </div>
    </AppShell>
  );
}
