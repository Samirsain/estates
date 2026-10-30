// The Customer closer's own conditions — Business Model v2.1 §22, §77, §79.
//
// A Sold By Customer earns Customer-closing Loyalty only with verified KYC
// (Aadhaar Verified). It is recorded here and reassesses the closer's unpaid
// Loyalty so a hold lifts at once. Customer Terms acceptance is no longer a
// condition (owner, 29 Oct 2026).

import { blocked, runCommand } from "./command";
import { reassessBenefitsOf } from "./commission-service";

/**
 * v2.1 §22, §77 — verified KYC for a Customer closer. A recorded Aadhaar
 * (Available) is checked against the document and marked Verified. Accounts
 * verifies, as it does bank details; Admin and MD may too.
 */
export async function verifyAadhaar(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  personId: string;
}) {
  if (!["ACCOUNTS", "MD"].includes(args.actorRole)) {
    blocked("Only Accounts or MD may verify an Aadhaar.");
  }

  return runCommand<{ personId: string; reassessed: number }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "AADHAAR_VERIFY",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { personId: args.personId },
    },
    async (tx) => {
      const person = await tx.person.findUnique({
        where: { id: args.personId },
        select: { id: true, aadhaarStatus: true },
      });
      if (!person) blocked("That Person no longer exists.");
      if (person.aadhaarStatus === "PENDING") blocked("No Aadhaar is recorded yet, so it cannot be verified.");
      if (person.aadhaarStatus === "VERIFIED") blocked("This Aadhaar is already verified.");

      await tx.person.update({ where: { id: person.id }, data: { aadhaarStatus: "VERIFIED" } });
      const reassessed = await reassessBenefitsOf(tx, person.id, args.actorRef);
      return {
        result: { personId: person.id, reassessed },
        audit: {
          entity: "Person",
          entityId: person.id,
          action: "AADHAAR_VERIFIED",
          before: { aadhaarStatus: person.aadhaarStatus },
          after: { aadhaarStatus: "VERIFIED" },
        },
      };
    }
  );
}
