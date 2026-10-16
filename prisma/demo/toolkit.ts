// Seed helpers for the demo (spec §4). Every helper goes through a service and
// runs inside a story step, so "now" is story time.
import { PrismaClient, type EnquirySource } from "@prisma/client";
import { MEMBER_TERMS_VERSION } from "@/lib/terms";
import { aadhaarLastFour, blindIndex, encryptSensitive, normaliseAadhaar } from "@/lib/security/identity";
import { makeAvailable, prepareInventory } from "@/lib/services/inventory-service";
import { createCommissionVersion, type CommissionVersionInput } from "@/lib/services/commission-settings-service";
import { activateMember } from "@/lib/services/network-service";
import { enterBankDetails } from "@/lib/services/bank-service";
import { recordCustomerTermsAcceptance, verifyAadhaar } from "@/lib/services/customer-closer-service";
import { createEnquiry } from "@/lib/services/enquiry-service";
import { decideBookingRequest, submitBookingRequest } from "@/lib/services/booking-service";
import { confirmPaymentReceived } from "@/lib/services/payment-service";
import { markCommissionPaid } from "@/lib/services/commission-service";
import { CommandError } from "@/lib/services/command";
import { CUSTOMERS, MEMBERS, MOBILE_PREFIX, PROJECTS, type CastSpec } from "./world.ts";

export const db = new PrismaClient();

export const MD = "STF-0001";
export const ACC = "STF-0003";
export const ACC2 = "STF-0004";
export const CRM = "STF-0005";

/** One id per run, read before any step moves the clock: story time repeats between runs, so keys built from it would replay an earlier run's. */
const RUN = Date.now().toString(36);
let seq = 0;
export const key = () => `DEMO-${RUN}-${seq++}`;
let refSeq = 0;
export const ref = (kind: "UTR26" | "NEFT26" | "RFD26") => `${kind}${String(48210000 + ++refSeq * 37).padStart(8, "0")}`;
export const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

export type Who = { id: string; name: string; mobile: string; key: string; note: string; profileId?: string };
export const people: Record<string, Who> = {};
export const notes = (k: string, note: string) => {
  people[k].note = people[k].note ? `${people[k].note} ${note}` : note;
};

const BANKS = [
  ["State Bank of India", "MI Road, Jaipur", "SBIN0031025"],
  ["HDFC Bank", "C-Scheme, Jaipur", "HDFC0000123"],
  ["ICICI Bank", "Malviya Nagar, Jaipur", "ICIC0000698"],
  ["Punjab National Bank", "Raja Park, Jaipur", "PUNB0144500"],
  ["Bank of Baroda", "Vaishali Nagar, Jaipur", "BARB0VAISHA"],
] as const;
const STREETS = ["Malviya Nagar", "Vaishali Nagar", "Mansarovar", "Raja Park", "Tonk Road", "Jagatpura", "Sodala", "Shyam Nagar", "Pratap Nagar", "Bani Park"];

/** What each Person's bank detail was entered as (it is stored encrypted) — the joint account reuses one. */
export const bankAccounts: Record<string, { accountNumber: string; bankName: string; branchName: string; ifsc: string }> = {};

let mobileSeq = 0;
let aadhaarSeq = 0;
let accountSeq = 0;

/**
 * A second dataset in its own process (prisma/all-cases-seed.ts) starts its
 * Aadhaar and account numbers well past the demo's, so the two never share an
 * identity or a bank account by accident.
 */
export function startNumbersAt(n: number) {
  mobileSeq = aadhaarSeq = accountSeq = n;
}

async function makePerson(k: string, spec: CastSpec): Promise<Who> {
  const n = ++mobileSeq;
  const mobile = spec.mobile ?? `${MOBILE_PREFIX}${String(14000000 + n * 7).padStart(8, "0")}`;
  const kyc = spec.kyc ?? "available";
  const aadhaar = `7${String(41200000000 + ++aadhaarSeq * 13).padStart(11, "0")}`;
  const created = await db.person.create({
    data: {
      fullName: spec.name,
      primaryMobile: mobile,
      city: "Jaipur",
      addressLine: spec.address ?? `${(n % 90) + 10}, ${STREETS[n % STREETS.length]}`,
      ...(kyc === "none"
        ? {}
        : {
            aadhaarCipher: encryptSensitive(normaliseAadhaar(aadhaar)),
            aadhaarLastFour: aadhaarLastFour(aadhaar),
            aadhaarBlindIndex: blindIndex(normaliseAadhaar(aadhaar)),
            aadhaarStatus: "AVAILABLE",
          }),
    },
  });
  if (kyc === "verified") await verifyAadhaar({ idempotencyKey: key(), actorRef: ACC, actorRole: "ACCOUNTS", personId: created.id });
  if (spec.bank !== false && kyc !== "none") {
    const [bankName, branchName, ifsc] = BANKS[n % BANKS.length];
    const accountNumber = `3${String(1002003000 + ++accountSeq * 11).padStart(11, "0")}`;
    // An account nobody else holds is verified as it is entered (bank-service).
    await enterBankDetails({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      personId: created.id,
      accountHolder: spec.name,
      bankName,
      branchName,
      accountNumber,
      ifsc,
    });
    bankAccounts[k] = { accountNumber, bankName, branchName, ifsc };
  }
  const who = { id: created.id, name: spec.name, mobile, key: k, note: "" };
  people[k] = who;
  return who;
}

export async function customer(k: string): Promise<Who> {
  return people[k] ?? makePerson(k, CUSTOMERS[k]);
}

export async function member(k: string): Promise<Who> {
  if (people[k]?.profileId) return people[k];
  const spec = MEMBERS[k];
  const who = await makePerson(k, spec);
  const inviter = spec.inviter ? people[spec.inviter] : null;
  const activated = await activateMember({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    personId: who.id,
    invitedByMemberId: inviter?.profileId ?? null,
    reraStatus: "REGISTERED",
    reraNumber: `RAJ/A/${2026}/${k.slice(1)}${String(who.mobile).slice(-3)}`,
    reraExpiryDate: new Date(`${spec.reraExpiry ?? "2028-03-31"}T00:00:00+05:30`),
  });
  await db.memberTermsAcceptance.create({ data: { memberProfileId: activated.memberProfileId, version: MEMBER_TERMS_VERSION } });
  who.profileId = activated.memberProfileId;
  return who;
}

const plotIds: Record<string, string> = {};
export const plotId = (number: string) => {
  const id = plotIds[number];
  if (!id) throw new Error(`No plot ${number}`);
  return id;
};
export const projectIds: Record<string, string> = {};

/** A Project as MD launches it: the record, a published PLC rule set, inventory made Available. */
export async function project(code: string) {
  const spec = PROJECTS[code];
  const created = await db.project.create({
    data: {
      projectCode: spec.code,
      name: spec.name,
      developer: "3% Real Estate Club",
      location: spec.location,
      city: spec.city,
      type: spec.type,
      status: "ACTIVE",
    },
  });
  projectIds[code] = created.id;
  await db.plcRuleVersion.create({
    data: {
      projectId: created.id,
      version: 1,
      status: "PUBLISHED",
      effectiveFrom: new Date(),
      publishedAt: new Date(),
      reason: `Location charges for ${spec.name}`,
      components: { create: spec.plc },
    },
  });
  await prepareInventory({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", projectId: created.id, rows: spec.plots });
  const made = await db.plot.findMany({ where: { projectId: created.id } });
  for (const p of made) {
    plotIds[p.plotNumber] = p.id;
    if (p.status === "NOT_AVAILABLE") {
      await makeAvailable({ idempotencyKey: key(), actorRef: MD, actorRole: "MD", plotId: p.id, reason: "Released for sale" });
    }
  }
  return { id: created.id, name: spec.name };
}

export async function settings(projectId: string, input: CommissionVersionInput) {
  const created = await createCommissionVersion({
    idempotencyKey: key(),
    actorRef: MD,
    actorRole: "MD",
    projectId,
    ...input,
    economicsReviewed: input.trip?.tripEnabled ?? false,
  });
  return created.versionId;
}

const SCHEDULES = {
  standard: () => [
    { seq: 1, percent: "30", dueDate: new Date() },
    { seq: 2, percent: "35", dueDate: inDays(60) },
    { seq: 3, percent: "35", dueDate: inDays(120) },
  ],
  two: () => [
    { seq: 1, percent: "30", dueDate: new Date() },
    { seq: 2, percent: "70", dueDate: inDays(60) },
  ],
  full: () => [{ seq: 1, percent: "100", dueDate: new Date() }],
};

/** CRM submits, Accounts approves (unless `submitOnly` or `reject`). */
export async function sell(
  plotNumber: string,
  buyer: Who,
  soldBy: { member?: Who; customer?: Who } = {},
  opts: { joint?: Who; schedule?: keyof typeof SCHEDULES; submitOnly?: boolean; reject?: string; enquiryId?: string } = {}
) {
  const submitted = await submitBookingRequest({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    plotId: plotId(plotNumber),
    parties: opts.joint
      ? [
          { personId: buyer.id, role: "PRIMARY" as const, sharePercent: "50" },
          { personId: opts.joint.id, role: "ADDITIONAL" as const, sharePercent: "50" },
        ]
      : [{ personId: buyer.id, role: "PRIMARY" as const, sharePercent: null }],
    soldByType: soldBy.member ? "MEMBER" : soldBy.customer ? "CUSTOMER" : "THREE_PERCENT_CLUB",
    soldByPersonId: soldBy.member?.id ?? soldBy.customer?.id ?? null,
    bookingDate: new Date(),
    customerType: "END_USER",
    schedule: SCHEDULES[opts.schedule ?? "standard"](),
    // Linked, so approval marks the Enquiry Booked and closes its follow-up.
    enquiryId: opts.enquiryId ?? null,
  });
  if (opts.submitOnly) return submitted.bookingId;
  await decideBookingRequest({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId: submitted.bookingId,
    approve: !opts.reject,
    // A rejection in this story is always a payment the request claimed and the bank returned.
    ...(opts.reject ? { rejectReason: "PAYMENT_NOT_RECEIVED" as const, requestClaimedPayment: true } : {}),
    note: opts.reject ?? "Verified against the signed agreement and the first receipt.",
  });
  return submitted.bookingId;
}

export const pay = (bookingId: string, percent: string, payer?: { payerName: string; payerReference: string }) =>
  confirmPaymentReceived({
    idempotencyKey: key(),
    actorRef: ACC,
    actorRole: "ACCOUNTS",
    bookingId,
    percent,
    paidOn: new Date(),
    reference: ref("UTR26"),
    ...payer,
  });

export const directOf = (bookingId: string) =>
  db.commissionRecord.findFirstOrThrow({ where: { bookingId, type: "DIRECT", isCurrent: true } });

let crmAccountId = "";
export async function enquiry(
  who: Who,
  projectCode: string,
  source: EnquirySource,
  opts: { member?: Who; customer?: Who; followUpInDays?: number; remark?: string } = {}
) {
  if (!crmAccountId) crmAccountId = (await db.staffAccount.findFirstOrThrow({ where: { staffAccountId: CRM } })).id;
  const customerProfileId = opts.customer
    ? (await db.customerProfile.findUniqueOrThrow({ where: { personId: opts.customer.id } })).id
    : null;
  const made = await createEnquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    personId: who.id,
    projectId: projectIds[projectCode],
    source,
    sourceMemberId: opts.member?.profileId ?? null,
    sourceCustomerId: customerProfileId,
    assignedStaffId: crmAccountId,
    assigneeRole: "CRM",
    nextFollowUpAt: inDays(opts.followUpInDays ?? 3),
    remark: opts.remark ?? "Interested; wants a site visit and the price list.",
  });
  return (made as { enquiryId: string }).enquiryId;
}

/** A Customer closer: verified KYC (from the cast) and Customer Terms accepted. */
export async function closerReady(who: Who) {
  const profile = await db.customerProfile.findUniqueOrThrow({ where: { personId: who.id } });
  await recordCustomerTermsAcceptance({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    customerProfileId: profile.id,
    termsVersion: "CT-2026-10",
    acceptedOn: new Date(),
  });
}

/** Accounts' monthly payout run: every Ready, unpaid line on the demo's Projects. */
export async function payReadyCommissions() {
  const ready = await db.commissionRecord.findMany({
    where: { isCurrent: true, eligibility: "READY", payment: "NOT_PAID", booking: { projectId: { in: Object.values(projectIds) } } },
    select: { id: true },
  });
  for (const r of ready) {
    try {
      await markCommissionPaid({
        idempotencyKey: key(),
        actorRef: ACC,
        actorRole: "ACCOUNTS",
        recordId: r.id,
        early: false,
        paidOn: new Date(),
        reference: ref("NEFT26"),
        remarks: "",
      });
    } catch (error) {
      if (!(error instanceof CommandError)) throw error; // e.g. a Recovery is outstanding: it stays unpaid
    }
  }
}
