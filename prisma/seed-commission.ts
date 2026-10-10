// v2.1 §14 — every seeded Project needs an approved commission version before a
// Booking Request can be submitted on it. Direct 3%, Loyalty 1%, so the mock
// scenarios still read naturally (Part 1 design spec §7).
import type { PrismaClient } from "@prisma/client";

export async function ensureActiveCommissionVersion(
  db: PrismaClient,
  projectId: string,
  actorRef: string
): Promise<{ id: string; version: number }> {
  const active = await db.projectCommissionVersion.findFirst({ where: { projectId, status: "ACTIVE" } });
  if (active) return active;
  const latest = await db.projectCommissionVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const now = new Date();
  return db.projectCommissionVersion.create({
    data: {
      projectId,
      version: (latest?.version ?? 0) + 1,
      status: "ACTIVE",
      directEnabled: true,
      directPercent: "3",
      loyaltyEnabled: true,
      loyaltyPercent: "1",
      reason: "Seeded mock settings",
      preparedByRef: actorRef,
      submittedAt: now,
      decidedByRef: actorRef,
      decidedAt: now,
      decisionNote: "Seeded",
      effectiveFrom: now,
    },
  });
}

/**
 * CP §17; SSOT §26 — a Sold By Customer must have verified KYC and accepted
 * Customer Terms before they can be selected. Seeds call this for every closer
 * they use. A closer with no Aadhaar on file gets a mock one first.
 */
export async function ensureCustomerCloserReady(
  db: PrismaClient,
  personId: string,
  actorRef: string,
  mockAadhaar: string
): Promise<void> {
  const { blindIndex, encryptSensitive } = await import("../src/lib/security/identity.ts");
  const person = await db.person.findUniqueOrThrow({
    where: { id: personId },
    include: { customerProfile: { include: { termsAcceptances: { take: 1 } } } },
  });
  if (person.aadhaarStatus !== "VERIFIED") {
    await db.person.update({
      where: { id: personId },
      data:
        person.aadhaarStatus === "PENDING"
          ? {
              aadhaarCipher: encryptSensitive(mockAadhaar),
              aadhaarLastFour: mockAadhaar.slice(-4),
              aadhaarBlindIndex: blindIndex(mockAadhaar),
              aadhaarStatus: "VERIFIED",
            }
          : { aadhaarStatus: "VERIFIED" },
    });
  }
  const profile = person.customerProfile;
  if (profile && profile.termsAcceptances.length === 0) {
    await db.customerTermsAcceptance.create({
      data: { customerProfileId: profile.id, termsVersion: "CT-2026-10", acceptedOn: new Date(), recordedByRef: actorRef },
    });
  }
}
