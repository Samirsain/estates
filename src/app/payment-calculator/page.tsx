import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { currentStaff } from "@/lib/security/current-actor";
import { paymentCalculatorAccess } from "@/lib/security/payment-calculator-access";
import { PasskeyForm } from "./passkey-form";
import PaymentCalculatorClient from "./payment-calculator-client";

export const dynamic = "force-dynamic";

export default async function PaymentCalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const actor = await currentStaff();
  if (!actor || actor.role !== "MD") notFound();
  const access = await paymentCalculatorAccess(actor);
  if (!access) notFound();
  const { booking } = await searchParams;
  if (access.step === "challenge") {
    return (
      <AppShell role={actor.role} actorName={actor.name} staffAccountId={actor.staffAccountId}>
        <Card className="mx-auto mt-8 max-w-sm p-5">
          <h1 className="text-lg font-semibold">Unlock Payment Calculator</h1>
          <PasskeyForm setup={access.setup} />
        </Card>
      </AppShell>
    );
  }

  // Approved Bookings only — a request has no live plan to pay against. A
  // Plot can carry several historic Bookings, so the Booking is the choice.
  const bookings = await db.booking.findMany({
    where: { bookingNumber: { not: null } },
    orderBy: { bookingNumber: "asc" },
    select: {
      id: true,
      bookingNumber: true,
      status: true,
      paymentReceivedPercent: true,
      project: { select: { name: true, projectCode: true } },
      plot: { select: { plotNumber: true } },
      primaryPerson: { select: { fullName: true, customerProfile: { select: { customerId: true } } } },
    },
  });

  return (
    <PaymentCalculatorClient
      role={actor.role}
      actorName={actor.name}
      staffAccountId={actor.staffAccountId}
      initialBookingId={booking ?? null}
      expiresAt={access.expiresAt}
      bookings={bookings.map((b) => ({
        id: b.id,
        number: b.bookingNumber!,
        project: `${b.project.projectCode} · ${b.project.name}`,
        plot: b.plot.plotNumber,
        customer: b.primaryPerson?.fullName ?? "Customer Pending",
        customerId: b.primaryPerson?.customerProfile?.customerId ?? null,
        status: b.status,
        received: b.paymentReceivedPercent.toFixed(),
      }))}
    />
  );
}
