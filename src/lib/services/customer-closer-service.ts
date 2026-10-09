// The Customer closer's own conditions — Business Model v2.1 §22, §77, §79.
//
// A Sold By Customer earns Customer-closing Loyalty only with verified KYC
// (Aadhaar Verified) and accepted Customer Terms. Both are recorded here, and
// each reassesses the closer's unpaid Loyalty so a hold lifts at once.

import { notFutureDated } from "@/lib/domain/booking";
import { blocked, runCommand } from "./command";
import { reassessLoyaltyOf } from "./commission-service";

/**
 * v2.1 §22 — CRM records which Customer Terms version the Customer accepted,
 * and when. The Terms text itself is published outside the CRM.
 */
export async function recordCustomerTermsAcceptance(args: {
  idempotencyKey: string;
  actorRef: string;
  actorRole: string;
  customerProfileId: string;
  termsVersion: string;
  acceptedOn: Date;
}) {
  if (!["CRM", "ADMIN", "MD"].includes(args.actorRole)) {
    blocked("Only CRM, Admin or MD may record a Customer Terms acceptance.");
  }
  if (!args.termsVersion.trim()) blocked("Enter the Customer Terms version the Customer accepted.");
  const dated = notFutureDated("Acceptance date", args.acceptedOn);
  if (!dated.ok) blocked(dated.reason);

  return runCommand<{ acceptanceId: string; reassessed: number }>(
    {
      idempotencyKey: args.idempotencyKey,
      operation: "CUSTOMER_TERMS_ACCEPTANCE_RECORD",
      actorRef: args.actorRef,
      actorRole: args.actorRole,
      payload: { customerProfileId: args.customerProfileId, termsVersion: args.termsVersion.trim() },
    },
    async (tx) => {
      const customer = await tx.customerProfile.findUnique({ where: { id: args.customerProfileId } });
      if (!customer) blocked("That Customer no longer exists.");
      const acceptance = await tx.customerTermsAcceptance.create({
        data: {
          customerProfileId: customer.id,
          termsVersion: args.termsVersion.trim(),
          acceptedOn: args.acceptedOn,
          recordedByRef: args.actorRef,
        },
      });
      const reassessed = await reassessLoyaltyOf(tx, customer.personId, args.actorRef);
      return {
        result: { acceptanceId: acceptance.id, reassessed },
        audit: {
          entity: "CustomerProfile",
          entityId: customer.id,
          action: "CUSTOMER_TERMS_ACCEPTED",
          after: { termsVersion: acceptance.termsVersion, acceptedOn: args.acceptedOn.toISOString() },
        },
      };
    }
  );
}

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
  if (!["ACCOUNTS", "ADMIN", "MD"].includes(args.actorRole)) {
    blocked("Only Accounts, Admin or MD may verify an Aadhaar.");
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
      const reassessed = await reassessLoyaltyOf(tx, person.id, args.actorRef);
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
