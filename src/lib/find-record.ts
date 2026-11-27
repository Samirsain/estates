"use server";

// The header search: an exact Customer ID, Member ID, Booking Number, Request
// No. or Plot No. opens that record. Each page still applies its own guard.

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/security/current-actor";
import { can } from "@/lib/security/permissions";
import { PAYMENT_CALCULATOR_PATH, startPaymentCalculatorChallenge } from "@/lib/security/payment-calculator-access";

export async function findRecordAction(query: string): Promise<string | null> {
  const actor = await requireStaff();
  const term = query.trim();
  if (!term) return null;
  if (term === "MDXXX" && can(actor.role, "PAYMENT_CALCULATOR_APPROVE", actor.extraPermissions)) {
    if (!await startPaymentCalculatorChallenge(actor)) return null;
    revalidatePath(PAYMENT_CALCULATOR_PATH);
    return PAYMENT_CALCULATOR_PATH;
  }
  const exact = { equals: term, mode: "insensitive" } as const;

  const customer = await db.customerProfile.findFirst({ where: { customerId: exact }, select: { id: true } });
  if (customer) return `/customers/${customer.id}`;
  const member = await db.memberProfile.findFirst({ where: { memberId: exact }, select: { id: true } });
  if (member) return `/members/${member.id}`;
  const booking = await db.booking.findFirst({
    where: { OR: [{ bookingNumber: exact }, { requestNo: exact }] },
    select: { id: true },
  });
  if (booking) return `/bookings?booking=${booking.id}`;
  // The same Plot No. can exist in several Projects; only a single match opens.
  const plots = await db.plot.findMany({ where: { plotNumber: exact }, select: { id: true }, take: 2 });
  return plots.length === 1 ? `/plots/${plots[0].id}` : null;
}
