// Phase 1 seed — one active MD plus one account per role, and a Member with
// portal access. Idempotent: re-running updates the same records.
// Run: npm run db:seed
import { PrismaClient, type StaffRole } from "@prisma/client";
import { hashPassword } from "../src/lib/security/auth.ts";
import {
  aadhaarLastFour,
  blindIndex,
  decryptSensitive,
  encryptSensitive,
  maskPan,
  normaliseAadhaar,
  normalisePan,
} from "../src/lib/security/identity.ts";
import { calculateAreas } from "../src/lib/domain/inventory.ts";

const db = new PrismaClient();

const INITIAL_PASSWORD = "ChangeMe#2026";

const STAFF: Array<{ staffAccountId: string; name: string; role: StaffRole; mobile: string }> = [
  { staffAccountId: "STF-0001", name: "Managing Director", role: "MD", mobile: "9800000001" },
  { staffAccountId: "STF-0002", name: "Deepak Sharma", role: "ADMIN", mobile: "9800000002" },
  { staffAccountId: "STF-0003", name: "Priya Nair", role: "ACCOUNTS", mobile: "9800000003" },
  { staffAccountId: "STF-0004", name: "Suresh Iyer", role: "ACCOUNTS", mobile: "9800000004" },
  { staffAccountId: "STF-0005", name: "Rahul Mehta", role: "CRM", mobile: "9800000005" },
  { staffAccountId: "STF-0006", name: "Anita Rao", role: "CRM", mobile: "9800000006" },
  { staffAccountId: "STF-0007", name: "Meera Pillai", role: "MIS", mobile: "9800000007" },
  { staffAccountId: "STF-0008", name: "Arjun Bose", role: "PC", mobile: "9800000008" },
];

async function upsertPerson(name: string, mobile: string, sensitive?: { aadhaar?: string; pan?: string }) {
  const existing = await db.person.findFirst({ where: { fullName: name, primaryMobile: mobile } });
  const data = {
    fullName: name,
    primaryMobile: mobile,
    ...(sensitive?.aadhaar
      ? {
          aadhaarCipher: encryptSensitive(normaliseAadhaar(sensitive.aadhaar)),
          aadhaarLastFour: aadhaarLastFour(sensitive.aadhaar),
          aadhaarBlindIndex: blindIndex(normaliseAadhaar(sensitive.aadhaar)),
          aadhaarStatus: "AVAILABLE" as const,
        }
      : {}),
    ...(sensitive?.pan
      ? {
          panCipher: encryptSensitive(normalisePan(sensitive.pan)),
          panMasked: maskPan(sensitive.pan),
          panBlindIndex: blindIndex(normalisePan(sensitive.pan)),
          panStatus: "AVAILABLE" as const,
        }
      : {}),
  };
  return existing
    ? db.person.update({ where: { id: existing.id }, data })
    : db.person.create({ data });
}

async function main() {
  const passwordHash = hashPassword(INITIAL_PASSWORD);

  for (const staff of STAFF) {
    const person = await upsertPerson(staff.name, staff.mobile);

    const account = await db.staffAccount.upsert({
      where: { staffAccountId: staff.staffAccountId },
      create: {
        staffAccountId: staff.staffAccountId,
        personId: person.id,
        role: staff.role,
        passwordHash,
      },
      update: {
        role: staff.role,
        status: "ACTIVE",
        failedAttempts: 0,
        lockedUntil: null,
      },
    });

  }

  // One Member with portal access, and one Customer, to exercise the identity model.
  const memberPerson = await upsertPerson("Kavita Joshi", "9811111111", {
    aadhaar: "234567890123",
    pan: "ABCDE1234F",
  });
  const member = await db.memberProfile.upsert({
    where: { memberId: "MEM-0217" },
    create: {
      memberId: "MEM-0217",
      personId: memberPerson.id,
      activationDate: new Date("2024-03-11T00:00:00+05:30"),
      invitePosition: 1,
      inviteRatePercent: "1.000",
      portalAccount: { create: { loginId: "MEM-0217", passwordHash } },
    },
    update: { status: "ACTIVE" },
  });

  const customerPerson = await upsertPerson("Vikram Shah", "9822222222", { pan: "PQRSX6789K" });
  await db.customerProfile.upsert({
    where: { customerId: "CUS-3390" },
    create: {
      customerId: "CUS-3390",
      personId: customerPerson.id,
      originalIntroducedByMemberId: member.id,
      introducedPosition: 1,
      introducedRatePercent: "1.000",
    },
    update: {},
  });

  // A few more Persons so Enquiries and Holds have real people to point at.
  for (const [name, mobile] of [
    ["Sunita Devi", "9833333333"],
    ["Mohan Lal", "9844444444"],
    ["Rakesh Gupta", "9855555555"],
  ] as const) {
    await upsertPerson(name, mobile);
  }

  // ------------------------------------------------------------ Phase 2 demo
  const project = await db.project.upsert({
    where: { projectCode: "GRN" },
    create: {
      projectCode: "GRN",
      name: "Green Acres",
      developer: "Thirty Milestones LLP",
      location: "Jaipur",
      type: "RESIDENTIAL",
      lifecycle: "ACTIVE",
    },
    update: { lifecycle: "ACTIVE" },
  });

  // PLC is percentage only; each distinct component is charged once.
  const existingPlc = await db.plcRuleVersion.findUnique({
    where: { projectId_version: { projectId: project.id, version: 1 } },
  });
  const plc =
    existingPlc ??
    (await db.plcRuleVersion.create({
      data: {
        projectId: project.id,
        version: 1,
        isCurrent: true,
        reason: "Initial setup",
        components: {
          create: [
            { code: "ROAD_FACING", label: "Road facing", percent: "5.000" },
            { code: "CORNER", label: "Corner", percent: "2.500" },
            { code: "PARK_FACING", label: "Park facing", percent: "3.000" },
          ],
        },
      },
    }));

  const plots = [
    { plotNumber: "A-101", width: "30", length: "45", codes: ["ROAD_FACING"], park: false, release: true },
    { plotNumber: "A-102", width: "30", length: "50", codes: ["ROAD_FACING", "CORNER"], park: false, release: true },
    { plotNumber: "A-103", width: "25", length: "40", codes: [], park: true, release: true },
    { plotNumber: "A-104", width: "30", length: "45", codes: [], park: false, release: false },
  ];

  for (const p of plots) {
    const areas = calculateAreas({ kind: "REGULAR", widthFt: p.width, lengthFt: p.length });
    const existing = await db.plot.findUnique({
      where: {
        projectId_plotType_plotNumber: {
          projectId: project.id,
          plotType: "RESIDENTIAL",
          plotNumber: p.plotNumber,
        },
      },
    });
    if (existing) continue;

    await db.plot.create({
      data: {
        projectId: project.id,
        plotType: "RESIDENTIAL",
        plotNumber: p.plotNumber,
        widthFt: p.width,
        lengthFt: p.length,
        areaSqFt: areas.areaSqFt.toFixed(3),
        areaSqYd: areas.areaSqYd.toFixed(3),
        areaSqM: areas.areaSqM.toFixed(3),
        parkFacing: p.park,
        plcComponentCodes: p.codes,
        lifecycle: p.release ? "AVAILABLE" : "NOT_AVAILABLE",
        restriction: p.release ? "NONE" : "NOT_YET_RELEASED",
        boundaries: {
          create: [
            { side: "NORTH", kind: p.codes.includes("ROAD_FACING") ? "ROAD" : "PLOT", roadWidthFt: p.codes.includes("ROAD_FACING") ? "30" : null, adjacentPlotNumber: p.codes.includes("ROAD_FACING") ? null : "A-100" },
            { side: "EAST", kind: p.codes.includes("CORNER") ? "ROAD" : "PLOT", roadWidthFt: p.codes.includes("CORNER") ? "20" : null, adjacentPlotNumber: p.codes.includes("CORNER") ? null : "A-105" },
            { side: "SOUTH", kind: p.park ? "PARK" : "PLOT", adjacentPlotNumber: p.park ? null : "A-110" },
            { side: "WEST", kind: "OTHER" },
          ],
        },
      },
    });
  }

  console.log(`Seeded Project ${project.name} with PLC version ${plc.version} and ${plots.length} Plots.`);
  console.log(`Seeded ${STAFF.length} staff accounts, 1 Member and 1 Customer.`);
  console.log(`Initial password for every seeded account: ${INITIAL_PASSWORD}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
