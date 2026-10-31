// Buyback / Resale for the mock data (owner, 31 Oct 2026): the list had none.
// Every deal type in every status, arranged by a Member, a Customer and the
// 3% Club, with every action the deal page takes:
//
//   Buyback (Bookings on Ganpati Estate Emporio)
//     GEE 12  Delivered → bought back: 25%, approved, Buying Commission, 75%,
//             Registry papers back — Stable Buyback Completion, commission paid
//     GEE 19  approved at 30% after a Payment Given correction — Payment Pending
//     GEE 14  20% given, waiting for Accounts
//     GEE 24  rejected      GEE 23  approved, then cancelled — its Booking restored
//   Purchase for Resale (Hanumangarh Resale Properties, a Resale Group)
//     SS-17   30%, approved, Buying Commission, 70%, commission paid
//     GA-08   10% given, waiting on 20%
//     SE-31   rejected      GV-04   approved, then cancelled (legal issue)
//
//   node --env-file=.env --import ./prisma/alias-loader.mjs prisma/buyback-seed.ts
//
// Runs after prisma/ganpati-emporio-sales-seed.ts (its Bookings are bought back)
// and seed:fresh (its Members and Customers arrange the deals); seed:fresh runs
// it itself. Only what the screens can enter (mock-data rule, 30 Oct 2026).
// Safe to run again: a deal already made is skipped.
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";
import { installStoryClock, at } from "./demo/story-clock.ts";

assertCheckDatabase();
installStoryClock();

const db = new PrismaClient();
const A = await import("@/lib/services/acquisition-service");
const { markCommissionPaid } = await import("@/lib/services/commission-service");
const { createProject, setProjectStatus } = await import("@/lib/services/project-service");

const MD = { actorRef: "STF-0001", actorRole: "MD" };
const CRM = { actorRef: "STF-0005", actorRole: "CRM" };
const ACC = { actorRef: "STF-0003", actorRole: "ACCOUNTS" };
const ACC2 = { actorRef: "STF-0004", actorRole: "ACCOUNTS" };
const RUN = Date.now().toString(36);
let seq = 0;
const key = () => `BBK-${RUN}-${seq++}`;
const day = (d: string) => new Date(`${d}T11:00:00+05:30`);

/** A Member by Member ID, a Customer by mobile, or the 3% Club. */
type By = "CLUB" | string;
type Step =
  | [string, "pay", string, string] // percent, Remark
  | [string, "correct", string, string] // the first entry's right percent, reason
  | [string, "approve" | "reject" | "cancel", string]
  | [string, "commission", string] // percent, to the arranger
  | [string, "papers"]
  | [string, "commissionPaid", string]; // Remarks

type Deal = {
  tag: string;
  on: string;
  by: By;
  remark: string;
  schedule: [string, string][];
  steps: Step[];
} & ({ plot: string } | { property: { propertyName: string; location: string; propertyNumber: string; areaSqFt: string }; seller: { fullName: string; primaryMobile: string; addressLine: string } });

const DEALS: Deal[] = [
  {
    tag: "SS-17",
    on: "2026-09-15",
    by: "MEM-000003",
    property: { propertyName: "Shiv Shakti Colony", location: "Suratgarh Road, Hanumangarh Jn.", propertyNumber: "SS-17", areaSqFt: "1350" },
    seller: { fullName: "Baldev Singh Dhillon", primaryMobile: "9414120171", addressLine: "22, Sector 5, Hanumangarh Jn." },
    remark: "Corner Plot in a 90-A approved colony, bought to resell",
    schedule: [["30", "2026-09-15"], ["70", "2026-10-15"]],
    steps: [
      ["2026-09-15", "pay", "30", "Paid by bank transfer (NEFT / RTGS)"],
      ["2026-09-16", "approve", "Approved — papers and seller details checked"],
      ["2026-09-16", "commission", "1.5"],
      ["2026-10-14", "pay", "70", "Final payment"],
      ["2026-10-16", "commissionPaid", "Paid by bank transfer"],
    ],
  },
  {
    tag: "GV-04",
    on: "2026-09-25",
    by: "MEM-000001",
    property: { propertyName: "Ganesh Vihar", location: "Sangaria Road, Hanumangarh", propertyNumber: "GV-04", areaSqFt: "1500" },
    seller: { fullName: "Mangi Lal Bhambhu", primaryMobile: "9414120172", addressLine: "Ward 11, Sangaria" },
    remark: "Owner selling his second Plot; bought to resell",
    schedule: [["25", "2026-09-25"], ["75", "2026-10-30"]],
    steps: [
      ["2026-09-25", "pay", "25", "Part payment, balance as per schedule"],
      ["2026-09-26", "approve", "Approved — Advance Payment Given checked"],
      ["2026-10-12", "cancel", "Legal issue found on the property"],
    ],
  },
  {
    tag: "GEE-12",
    on: "2026-10-02",
    by: "MEM-000001",
    plot: "12",
    remark: "Customer needs money urgently",
    schedule: [["25", "2026-10-02"], ["75", "2026-10-25"]],
    steps: [
      ["2026-10-02", "pay", "25", "Paid by bank transfer (NEFT / RTGS)"],
      ["2026-10-03", "approve", "Approved — Advance Payment Given checked"],
      ["2026-10-03", "commission", "1"],
      ["2026-10-24", "pay", "75", "Final payment"],
      ["2026-10-27", "papers"],
      ["2026-10-28", "commissionPaid", "Paid after 100% Payment Given"],
    ],
  },
  {
    tag: "SE-31",
    on: "2026-10-05",
    by: "CLUB",
    property: { propertyName: "Sai Enclave", location: "Pilibanga Road, Hanumangarh", propertyNumber: "SE-31", areaSqFt: "1200" },
    seller: { fullName: "Rajendra Prasad Soni", primaryMobile: "9414120173", addressLine: "Main Bazaar, Pilibanga" },
    remark: "Owner's offer for a Plot to resell",
    schedule: [["20", "2026-10-05"], ["80", "2026-11-05"]],
    steps: [["2026-10-07", "reject", "Rejected — Payment Given not reached"]],
  },
  {
    tag: "GEE-19",
    on: "2026-10-08",
    by: "CLUB",
    plot: "19",
    remark: "Customer wants to sell the Plot back to the company",
    schedule: [["30", "2026-10-08"], ["70", "2026-11-20"]],
    steps: [
      ["2026-10-08", "pay", "20", "Paid by cheque"],
      ["2026-10-09", "correct", "30", "Wrong amount entered"],
      ["2026-10-10", "approve", "Approved — Advance Payment Given checked"],
    ],
  },
  {
    tag: "GEE-24",
    on: "2026-10-15",
    by: "MEM-000002",
    plot: "24",
    remark: "Customer needs money urgently",
    schedule: [["25", "2026-10-15"], ["75", "2026-11-15"]],
    steps: [["2026-10-16", "reject", "Rejected — seller papers incomplete"]],
  },
  {
    tag: "GEE-23",
    on: "2026-10-18",
    by: "CLUB",
    plot: "23",
    remark: "Customer wants to sell the Plot back to the company",
    schedule: [["25", "2026-10-18"], ["75", "2026-11-18"]],
    // Approved first, so cancelling it shows the unwind: Booking and Plot restored.
    steps: [
      ["2026-10-18", "pay", "25", "Paid by cheque"],
      ["2026-10-19", "approve", "Approved — papers and seller details checked"],
      ["2026-10-21", "cancel", "Seller changed their mind"],
    ],
  },
  {
    tag: "GA-08",
    on: "2026-10-20",
    by: "9610000016",
    property: { propertyName: "Green Avenue", location: "Town, Hanumangarh", propertyNumber: "GA-08", areaSqFt: "1800" },
    seller: { fullName: "Kulwant Kaur Virk", primaryMobile: "9414120174", addressLine: "House 7, Green Avenue, Town, Hanumangarh" },
    remark: "Owner moving to Jaipur; Plot bought to resell",
    schedule: [["25", "2026-10-21"], ["75", "2026-11-25"]],
    steps: [["2026-10-21", "pay", "10", "Part payment, balance as per schedule"]],
  },
  {
    tag: "GEE-14",
    on: "2026-10-26",
    by: "9610000011",
    plot: "14",
    remark: "Customer cannot pay the remaining instalments",
    schedule: [["20", "2026-10-26"], ["80", "2026-11-30"]],
    steps: [["2026-10-27", "pay", "20", "Paid by bank transfer (NEFT / RTGS)"]],
  },
];

const personOf = async (by: string) =>
  by.startsWith("MEM-")
    ? (await db.memberProfile.findFirstOrThrow({ where: { memberId: by, status: "ACTIVE" } })).personId
    : (await db.person.findFirstOrThrow({ where: { primaryMobile: by, customerProfile: { isNot: null } } })).id;

/** The Resale Group the outside properties go into, made as the Projects screen makes one. */
async function resaleGroup() {
  const found = await db.project.findUnique({ where: { projectCode: "HRP" } });
  if (found) return found.id;
  return at(db, "2026-09-14", async () => {
    const { projectId } = await createProject({
      ...MD,
      idempotencyKey: key(),
      projectCode: "HRP",
      name: "Hanumangarh Resale Properties",
      type: "RESIDENTIAL",
      location: "Hanumangarh, Rajasthan",
      city: "Hanumangarh",
      isExternalResaleGroup: true,
      components: [],
    });
    await setProjectStatus({ ...MD, idempotencyKey: key(), projectId, status: "ACTIVE", reason: "Opened for the outside Plots we buy to resell" });
    return projectId;
  });
}

async function main() {
  const groupId = await resaleGroup();
  const gee = await db.project.findUniqueOrThrow({ where: { projectCode: "GEE" } });

  for (const [n, deal] of DEALS.entries()) {
    const done =
      "plot" in deal
        ? await db.acquisition.findFirst({ where: { type: "BUYBACK", plot: { projectId: gee.id, plotNumber: deal.plot } } })
        : await db.acquisition.findFirst({ where: { propertyNumber: deal.property.propertyNumber } });
    if (done) {
      console.log(`${deal.tag} already made. Skipped.`);
      continue;
    }

    const arranger = deal.by === "CLUB" ? null : await personOf(deal.by);
    const arrangedByType = deal.by === "CLUB" ? "THREE_PERCENT_CLUB" : deal.by.startsWith("MEM-") ? "MEMBER" : "CUSTOMER";
    const ref = (i: number) => `BBUTR${String(n + 1).padStart(2, "0")}${i}`;

    const acquisitionId = await at(db, deal.on, async () => {
      const common = {
        ...CRM,
        idempotencyKey: key(),
        arrangedByType,
        arrangedByPersonId: arranger,
        purchaseDate: new Date(),
        remark: deal.remark,
        schedule: deal.schedule.map(([percent, due], i) => ({ seq: i + 1, percent, dueDate: day(due) })),
      } as const;
      if ("plot" in deal) {
        const booking = await db.booking.findFirstOrThrow({
          where: { projectId: gee.id, plot: { plotNumber: deal.plot }, status: { in: ["BOOKED", "PAYMENT_COMPLETED", "DELIVERED"] } },
        });
        return (await A.createAcquisition({ ...common, type: "BUYBACK", sourceBookingId: booking.id, sellerPersonId: booking.primaryPersonId })).acquisitionId;
      }
      const seller =
        (await db.person.findFirst({ where: { primaryMobile: deal.seller.primaryMobile } })) ??
        (await db.person.create({ data: { ...deal.seller, city: "Hanumangarh" } }));
      return (await A.createAcquisition({ ...common, type: "PURCHASE_FOR_RESALE", sellerPersonId: seller.id, property: { ...deal.property, resaleGroupId: groupId } })).acquisitionId;
    });
    console.log(`${deal.on}  ${deal.tag}  created`);

    for (const [i, step] of deal.steps.entries()) {
      const [on, what] = step;
      await at(db, on, async () => {
        const base = { idempotencyKey: key(), acquisitionId };
        switch (what) {
          case "pay":
            return A.confirmPaymentGiven({ ...ACC, ...base, percent: step[2], paidOn: new Date(), reference: ref(i), remark: step[3] });
          case "correct": {
            // The checker is a different Accounts login than the one who entered it.
            const entry = await db.paymentGivenEntry.findFirstOrThrow({ where: { acquisitionId, status: "CONFIRMED" }, orderBy: { recordedAt: "asc" } });
            return A.correctPaymentGiven({ ...ACC2, idempotencyKey: base.idempotencyKey, entryId: entry.id, percent: step[2], paidOn: entry.paidOn, reference: ref(i), reason: step[3] });
          }
          case "approve":
          case "reject":
            return A.decideAcquisition({ ...ACC2, ...base, approve: what === "approve", note: step[2] });
          case "cancel":
            return A.cancelAcquisitionDeal({ ...ACC, ...base, reason: step[2] });
          case "commission":
            return A.recordBuyingCommission({ ...CRM, ...base, beneficiaryPersonId: arranger!, percent: step[2] });
          case "papers":
            return A.recordBuybackDocumentsReturned({ ...CRM, ...base, returnedOn: new Date() });
          case "commissionPaid": {
            const record = await db.commissionRecord.findFirstOrThrow({ where: { acquisitionId, isCurrent: true } });
            return markCommissionPaid({ ...ACC, idempotencyKey: base.idempotencyKey, recordId: record.id, early: false, paidOn: new Date(), reference: ref(i), remarks: step[2] });
          }
        }
      }, "15:00");
      console.log(`${on}  ${deal.tag}  ${what}`);
    }
  }

  const counts = await db.acquisition.groupBy({ by: ["type", "status"], _count: { _all: true } });
  console.log("Buyback / Resale now:", counts.map((c) => `${c._count._all} ${c.type} ${c.status}`).join(", "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
