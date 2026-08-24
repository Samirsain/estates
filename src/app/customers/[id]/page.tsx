// Customer detail page — /customers/[id]
// Full profile: identity, property activity, Aadhaar/PAN, bank details, loyalty.

import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";
import { canViewField } from "@/lib/security/permissions";
import { maskAadhaar, maskMobile, maskPan } from "@/lib/security/identity";
import { experienceSince } from "@/lib/domain/commission";
import { formatIst } from "@/lib/tasks";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ArrowLeft,
  Activity,
  ShieldCheck,
  Banknote,
  Star,
  User,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ACTIVITY_VARIANT: Record<string, "info" | "warning" | "success"> = {
  Enquiry: "info",
  Hold: "warning",
  Booking: "success",
};

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-right text-xs font-medium ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
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

  const [enquiries, holds, bookings, loyalty, banks] = await Promise.all([
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
    db.commissionOpportunity.findMany({
      where: { kind: "LOYALTY", subjectPersonId: personId },
      orderBy: { slotIndex: "asc" },
    }),
    db.bankDetail.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const activity = [
    ...enquiries.map((e) => ({
      kind: "Enquiry" as const,
      reference: e.enquiryNo,
      project: e.project.name,
      plot: e.plot
        ? `${e.plot.plotType.replaceAll("_", " ")} ${e.plot.plotNumber}`
        : "General",
      status: e.status,
      at: e.createdAt.toISOString(),
    })),
    ...holds.map((h) => ({
      kind: "Hold" as const,
      reference: h.id.slice(0, 8),
      project: h.plot.project.name,
      plot: `${h.plot.plotType.replaceAll("_", " ")} ${h.plot.plotNumber}`,
      status: h.status,
      at: h.createdAt.toISOString(),
    })),
    ...bookings.map((b) => ({
      kind: "Booking" as const,
      reference: b.bookingNumber ?? b.requestNo,
      project: b.project.name,
      plot: `${b.plot.plotType.replaceAll("_", " ")} ${b.plot.plotNumber}`,
      status: b.status,
      at: b.submittedAt.toISOString(),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  const canViewAadhaar = canViewField(actor.role, "AADHAAR_FULL");
  const firstBookingDate = bookings.at(-1)?.submittedAt ?? null;
  const experience = experienceSince(firstBookingDate);

  return (
    <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Back */}
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Customers
        </Link>

        {/* Hero */}
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <User className="h-7 w-7" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">
                    {customer.person.fullName}
                  </h1>
                </div>
                <p className="mt-0.5 font-mono text-sm text-muted-foreground">
                  {customer.customerId}
                </p>
                {customer.customerType && (
                  <p className="text-xs text-muted-foreground">
                    {customer.customerType.replaceAll("_", " ")}
                  </p>
                )}
                {experience && (
                  <p className="text-xs text-muted-foreground">
                    {experience.label} as a Customer
                  </p>
                )}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-1">
              <p>Loyalty: {customer.loyaltySlotsConsumed}/3 slots used</p>
              {customer.originalIntroducedByMember && (
                <p>
                  Introduced by{" "}
                  <Link
                    href={`/members/${customer.originalIntroducedByMember.id}`}
                    className="font-mono text-primary hover:underline"
                  >
                    {customer.originalIntroducedByMember.memberId}
                  </Link>
                </p>
              )}
            </div>
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Profile */}
          <Card className="p-5 space-y-4">
            <Section title="Profile" icon={<User className="h-3.5 w-3.5" />}>
              <Row label="Mobile" value={maskMobile(customer.person.primaryMobile)} />
              {customer.person.altMobile && (
                <Row label="Alt Mobile" value={maskMobile(customer.person.altMobile)} />
              )}
              <Row label="Email" value={customer.person.email ?? "—"} />
              <Row label="City" value={customer.person.city ?? "—"} />
            </Section>
          </Card>

          {/* Identity */}
          <Card className="p-5 space-y-4">
            <Section title="Identity" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
              <p className="text-xs text-muted-foreground">
                Aadhaar is a protected field. Full access is restricted and logged.
              </p>
              <Row
                label="Aadhaar"
                value={
                  <span>
                    {maskAadhaar(customer.person.aadhaarLastFour)}
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {customer.person.aadhaarStatus.charAt(0) +
                        customer.person.aadhaarStatus.slice(1).toLowerCase()}
                    </span>
                  </span>
                }
              />
              <Row
                label="PAN"
                value={
                  customer.person.panMasked
                    ? maskPan(customer.person.panMasked)
                    : customer.person.panStatus === "NOT_AVAILABLE"
                      ? "Not Available"
                      : "—"
                }
                mono
              />
            </Section>
          </Card>
        </div>

        {/* Property Activity */}
        <Card className="p-5 space-y-4">
          <Section title="Property Activity" icon={<Activity className="h-3.5 w-3.5" />}>
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
                      <Badge variant={ACTIVITY_VARIANT[a.kind]}>{a.kind}</Badge>
                      <span className="font-mono">{a.reference}</span>
                      <span className="text-muted-foreground">
                        {a.project} · {a.plot}
                      </span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {a.status.replaceAll("_", " ").toLowerCase()} · {formatIst(a.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>

        {/* Loyalty */}
        <Card className="p-5 space-y-4">
          <Section title="Loyalty Bonus Slots" icon={<Star className="h-3.5 w-3.5" />}>
            <p className="text-xs text-muted-foreground">
              Lifetime maximum of 3 Loyalty Bonuses — from any mix of introduced-buyer sales and
              repeat personal purchases. A slot reopens only if a qualifying sale is cancelled
              before legal completion.
            </p>
            <p className="text-xs font-medium">
              Used: {customer.loyaltySlotsConsumed}/3
            </p>
            {loyalty.length > 0 && (
              <ul className="space-y-1 text-xs">
                {loyalty.map((slot) => (
                  <li key={slot.slotIndex} className="flex justify-between gap-2">
                    <span>Slot {slot.slotIndex}</span>
                    <span className="text-muted-foreground">
                      {slot.status === "CONSUMED"
                        ? `Consumed${slot.consumedAt ? ` · ${formatIst(slot.consumedAt.toISOString())}` : ""}`
                        : `Open${slot.reopenedReason ? ` — ${slot.reopenedReason}` : ""}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>

        {/* Bank Details */}
        <Card className="p-5 space-y-4">
          <Section title="Bank Details" icon={<Banknote className="h-3.5 w-3.5" />}>
            {banks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No bank details recorded.</p>
            ) : (
              <ul className="space-y-2">
                {banks.map((b) => (
                  <li key={b.id} className="rounded-xl border border-border/50 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">{b.accountHolder}</span> · {b.bankName}
                        <span className="block text-muted-foreground">
                          Account ending {b.accountLastFour} · {b.ifsc}
                        </span>
                      </span>
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
                    </div>
                    {b.verifiedAt && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Verified {formatIst(b.verifiedAt.toISOString())}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </Card>
      </div>
    </AppShell>
  );
}
