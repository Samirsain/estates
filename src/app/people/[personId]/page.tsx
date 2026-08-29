// Person resolver — /people/[personId]
//
// Every name printed anywhere in the app links here rather than to a profile
// directly. A screen that shows a name knows the Person; it does not know
// whether that Person is a Customer, a Member, or both, and it should not have
// to join two more tables to print one name. This page is where that is decided,
// once.
//
// ?as=member is the caller saying which side of a two-profile Person it meant —
// a Member who sold a Booking is read as a Member even though the same Person
// may also have bought one.

import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/security/current-actor";

export const dynamic = "force-dynamic";

export default async function PersonProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  await requireStaff();
  const { personId } = await params;
  const { as } = await searchParams;

  const [customer, member] = await Promise.all([
    db.customerProfile.findUnique({ where: { personId }, select: { id: true } }),
    db.memberProfile.findUnique({ where: { personId }, select: { id: true } }),
  ]);

  const first = as === "member" ? member : customer;
  const second = as === "member" ? customer : member;
  if (first) redirect(`/${as === "member" ? "members" : "customers"}/${first.id}`);
  if (second) redirect(`/${as === "member" ? "customers" : "members"}/${second.id}`);
  notFound();
}
