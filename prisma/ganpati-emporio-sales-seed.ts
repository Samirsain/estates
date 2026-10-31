// Sales on Ganpati Estate Emporio (GEE), so its plan and lists look like a
// Project a few months into selling: Registry done on some Plots, paid in full
// on others, instalments running, two Booking Requests with Accounts, a few
// Holds — and the units the architect's PDF shows as open left Available.
// Run after prisma/ganpati-emporio-seed.ts.
//
//   node --env-file=.env --import ./prisma/alias-loader.mjs prisma/ganpati-emporio-sales-seed.ts
//
// Made through the same services the screens use, dated September–October
// with the demo's story clock. Safe to run again: every step has a fixed key,
// so a step already done replays instead of repeating, and buyers are found by
// mobile — a run cut short by a dropped connection just carries on.
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";
import { installStoryClock, at } from "./demo/story-clock.ts";

assertCheckDatabase();
installStoryClock();

const db = new PrismaClient();
const { submitBookingRequest, decideBookingRequest } = await import("@/lib/services/booking-service");
const { confirmPaymentReceived } = await import("@/lib/services/payment-service");
const { recordFinalBuyers, recordCompletion } = await import("@/lib/services/completion-service");
const { createHold } = await import("@/lib/services/hold-service");
const { inDays } = await import("./demo/toolkit.ts");

const CRM = { actorRef: "STF-0005", actorRole: "CRM" };
const ACC = { actorRef: "STF-0003", actorRole: "ACCOUNTS" };

type Outcome = "DELIVERED" | "PAID" | "BOOKED" | "BOOKED_65" | "WAITING" | "HOLD";
type By = "CLUB" | "MEM-000001" | "MEM-000002" | "MEM-000003";
/** [unit, buyer, sold by, day booked (Sept/Oct 2026), what happened]. */
const SALES: [string, string, By, string, Outcome][] = [
  ["2A", "Rameshwar Lal Godara", "MEM-000001", "2026-09-03", "DELIVERED"],
  ["2B", "Sushila Devi Godara", "MEM-000001", "2026-09-03", "DELIVERED"],
  ["12", "Om Prakash Bishnoi", "CLUB", "2026-09-04", "DELIVERED"],
  ["18", "Harpreet Singh Brar", "CLUB", "2026-09-06", "DELIVERED"],
  ["1A", "Mahaveer Prasad Jain", "CLUB", "2026-09-08", "PAID"],
  ["1B", "Kamla Jain", "CLUB", "2026-09-08", "PAID"],
  ["3A", "Vinod Kumar Sihag", "MEM-000002", "2026-09-10", "PAID"],
  ["13", "Gurmeet Kaur", "CLUB", "2026-09-12", "PAID"],
  ["19", "Rajkumar Saharan", "MEM-000003", "2026-09-13", "PAID"],
  ["23", "Bhagirath Mal Poonia", "CLUB", "2026-09-15", "PAID"],
  ["24", "Sunil Kumar Swami", "CLUB", "2026-09-16", "PAID"],
  ["S-04", "Shyam Sunder Agarwal", "CLUB", "2026-09-18", "PAID"],
  ["S-05", "Pawan Kumar Mittal", "MEM-000001", "2026-09-18", "PAID"],
  ["3B", "Manju Sihag", "MEM-000002", "2026-09-20", "BOOKED_65"],
  ["14", "Jagdish Prasad Beniwal", "CLUB", "2026-09-22", "BOOKED_65"],
  ["15", "Anil Kumar Kaswan", "CLUB", "2026-09-24", "BOOKED"],
  ["20", "Balwinder Singh", "MEM-000003", "2026-09-25", "BOOKED_65"],
  ["21", "Satpal Godara", "CLUB", "2026-09-27", "BOOKED"],
  ["25", "Mukesh Kumar Garg", "CLUB", "2026-09-29", "BOOKED"],
  ["26", "Neelam Garg", "CLUB", "2026-09-29", "BOOKED"],
  ["27", "Dharmpal Jakhar", "MEM-000001", "2026-10-01", "BOOKED_65"],
  ["S-06", "Rakesh Goyal", "CLUB", "2026-10-03", "BOOKED"],
  ["S-08", "Deepak Singla", "CLUB", "2026-10-04", "BOOKED"],
  ["S-09", "Manoj Bansal", "MEM-000002", "2026-10-06", "BOOKED"],
  ["S-14", "Sanjay Chhabra", "CLUB", "2026-10-08", "BOOKED_65"],
  ["S-15", "Vikas Sethi", "CLUB", "2026-10-09", "BOOKED"],
  ["S-16", "Rohit Narang", "MEM-000003", "2026-10-11", "BOOKED"],
  ["S-17", "Amit Juneja", "CLUB", "2026-10-13", "BOOKED"],
  ["S-23", "Hari Ram Choudhary", "CLUB", "2026-10-15", "BOOKED"],
  ["8A", "Surender Kumar", "MEM-000001", "2026-10-17", "BOOKED"],
  ["8B", "Kavita Rani", "MEM-000001", "2026-10-17", "BOOKED"],
  ["10A", "Ishwar Singh Rathore", "CLUB", "2026-10-20", "BOOKED"],
  ["7B", "Pooja Bhadu", "CLUB", "2026-10-22", "BOOKED"],
  ["11A", "Naresh Kumar Dudi", "MEM-000003", "2026-10-28", "WAITING"],
  ["S-19", "Lalit Khurana", "CLUB", "2026-10-29", "WAITING"],
  ["9A", "Ramniwas Kularia", "CLUB", "2026-10-30", "HOLD"],
  ["22", "Sukhdev Singh Sandhu", "MEM-000002", "2026-10-30", "HOLD"],
  ["S-20", "Ajay Kumar Bansal", "CLUB", "2026-10-30", "HOLD"],
  ["K-3", "Mohit Saini", "CLUB", "2026-10-30", "HOLD"],
  ["16", "Gopal Krishan Sharma", "MEM-000001", "2026-10-30", "HOLD"],
  ["10B", "Rekha Rathore", "CLUB", "2026-10-30", "HOLD"],
  ["29", "Parmjeet Singh Gill", "MEM-000003", "2026-10-30", "HOLD"],
  ["S-18", "Nitin Khurana", "CLUB", "2026-10-30", "HOLD"],
];

const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00+05:30`) + days * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const project = await db.project.findUniqueOrThrow({ where: { projectCode: "GEE" } });
  const plots = new Map((await db.plot.findMany({ where: { projectId: project.id }, select: { id: true, plotNumber: true } })).map((p) => [p.plotNumber, p.id]));
  const members = new Map(
    (await db.memberProfile.findMany({ where: { memberId: { in: ["MEM-000001", "MEM-000002", "MEM-000003"] }, status: "ACTIVE" }, select: { memberId: true, personId: true } })).map((m) => [m.memberId, m.personId])
  );

  for (const [i, [unit, name, by, day, outcome]] of SALES.entries()) {
    const plotId = plots.get(unit);
    if (!plotId) throw new Error(`GEE has no unit ${unit}`);
    const key = (step: string) => `GEES-${unit}-${step}`;
    const mobile = `97${String(41000000 + i * 37).padStart(8, "0")}`;
    const memberPersonId = by === "CLUB" ? undefined : members.get(by);
    console.log(`${day}  ${unit}  ${name}  ${outcome}`);

    await at(db, day, async () => {
      const person =
        (await db.person.findFirst({ where: { primaryMobile: mobile } })) ??
        (await db.person.create({ data: { fullName: name, primaryMobile: mobile, city: "Hanumangarh", addressLine: `${10 + i}, Ward ${3 + (i % 9)}, Hanumangarh Jn.` } }));

      if (outcome === "HOLD") {
        await createHold({ ...CRM, idempotencyKey: key("hold"), plotId, personId: person.id, sourcedByType: memberPersonId ? "MEMBER" : "THREE_PERCENT_CLUB", sourcedByPersonId: memberPersonId ?? null, remark: "Token amount expected this week." });
        return;
      }
      const full = outcome === "DELIVERED" || outcome === "PAID";
      const { bookingId } = await submitBookingRequest({
        ...CRM,
        idempotencyKey: key("request"),
        plotId,
        parties: [{ personId: person.id, role: "PRIMARY", sharePercent: null }],
        soldByType: memberPersonId ? "MEMBER" : "THREE_PERCENT_CLUB",
        soldByPersonId: memberPersonId ?? null,
        bookingDate: new Date(),
        schedule: full
          ? [{ seq: 1, percent: "30", dueDate: new Date() }, { seq: 2, percent: "70", dueDate: inDays(20) }]
          : [{ seq: 1, percent: "30", dueDate: new Date() }, { seq: 2, percent: "35", dueDate: inDays(30) }, { seq: 3, percent: "35", dueDate: inDays(75) }],
      });
      if (outcome === "WAITING") return;
      await decideBookingRequest({ ...ACC, idempotencyKey: key("approve"), bookingId, approve: true, note: "Verified against the signed agreement and the first receipt." });
      await confirmPaymentReceived({ ...ACC, idempotencyKey: key("pay1"), bookingId, percent: "30", paidOn: new Date(), reference: `GEEUTR${String(i).padStart(3, "0")}1` });
    });

    if (outcome === "BOOKED_65") {
      await at(db, shift(day, 12), async () => confirmPaymentReceived({ ...ACC, idempotencyKey: key("pay2"), bookingId: await bookingOf(plotId), percent: "35", paidOn: new Date(), reference: `GEEUTR${String(i).padStart(3, "0")}2` }));
    }
    if (outcome === "PAID" || outcome === "DELIVERED") {
      await at(db, shift(day, 15), async () => confirmPaymentReceived({ ...ACC, idempotencyKey: key("pay2"), bookingId: await bookingOf(plotId), percent: "70", paidOn: new Date(), reference: `GEEUTR${String(i).padStart(3, "0")}2` }));
    }
    if (outcome === "DELIVERED") {
      await at(db, shift(day, 20), async () => {
        const bookingId = await bookingOf(plotId);
        const person = await db.person.findFirstOrThrow({ where: { primaryMobile: mobile } });
        await recordFinalBuyers({ ...CRM, idempotencyKey: key("buyers"), bookingId, buyers: [{ personId: person.id, dateOfBirth: new Date(`19${70 + i}-0${1 + (i % 9)}-1${i % 9}`), address: person.addressLine ?? "Hanumangarh Jn.", aadhaar: `5${String(31200000000 + i * 7919).padStart(11, "0")}` }] });
        await recordCompletion({ ...CRM, idempotencyKey: key("registry"), bookingId, completion: { route: "REGISTRY", advocateName: "Adv. Vijay Kumar Sharma", registryDate: new Date() } });
      });
    }
  }

  const counts = await db.plot.groupBy({ by: ["status"], where: { projectId: project.id }, _count: { _all: true } });
  console.log("GEE now:", counts.map((c) => `${c._count._all} ${c.status}`).join(", "));
}

/** The Plot's live Booking — the one the earlier step made. */
async function bookingOf(plotId: string): Promise<string> {
  const b = await db.booking.findFirstOrThrow({ where: { plotId, status: { in: ["BOOKED", "PAYMENT_COMPLETED", "DELIVERED"] } }, select: { id: true } });
  return b.id;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
