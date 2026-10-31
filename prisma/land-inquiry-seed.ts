// Land Inquiries for the mock data (owner, 31 Oct 2026): the list had none.
// Eight, one at every stage and from every Received From — Members Hemant,
// Kiran and Mahendra, Customer Deepika, the 3% Club and two Another Dealers —
// around Hanumangarh (Ganpati Estate Emporio), Kishangarh (Kishangarh Farm
// Estates) and Jaipur. Only what the New Land Inquiry form asks is filled
// (mock-data rule, 30 Oct 2026); Assigned To and the rest stay blank.
//
//   node --env-file=.env --import ./prisma/alias-loader.mjs prisma/land-inquiry-seed.ts
//
// Runs after seed:fresh, whose Members and Customer are the sources; seed:fresh
// runs it itself. Made through the same services the screens use, dated
// September–October with the demo's story clock. Safe to run again: an inquiry
// already made is skipped.
import { PrismaClient } from "@prisma/client";
import type { LandInquiryInput, LandInquiryStage } from "@/lib/domain/land-inquiry";
import { assertCheckDatabase } from "./check-guard.ts";
import { installStoryClock, at } from "./demo/story-clock.ts";

assertCheckDatabase();
installStoryClock();

const db = new PrismaClient();
const { createLandInquiry, changeLandInquiryStage, setLandInquiryStatus } = await import("@/lib/services/land-inquiry-service");
const { emptyInput } = await import("@/lib/domain/land-inquiry");

const CRM = { actorRef: "STF-0005", actorRole: "CRM" };
const RUN = Date.now().toString(36);

type Move = [day: string, to: LandInquiryStage | "CLOSED", reason?: string];
/** source: the Member ID, or the Customer's mobile. In day order, so the LI numbers are too. */
const INQUIRIES: { tag: string; day: string; source?: string; input: Partial<LandInquiryInput>; moves: Move[] }[] = [
  {
    tag: "PILIBANGA",
    day: "2026-09-22",
    input: {
      receivedFrom: "THREE_PERCENT_CLUB",
      owners: [{ ownerName: "Sukhwinder Singh Sandhu", mobile: "9414604501", isPrimary: true }],
      district: "Hanumangarh",
      tehsil: "Pilibanga",
      exactLocation: "NH-62 frontage, 2 km before Pilibanga on the Hanumangarh side",
      latitude: "29.4791",
      longitude: "74.1236",
      jamabandiEntries: [
        { murbbaNo: "18", patharNo: "4", khasraNo: "18/4" },
        { murbbaNo: "18", patharNo: "5", khasraNo: "18/5" },
        { murbbaNo: "18", patharNo: "6", khasraNo: "18/6" },
      ],
      areaBigha: "15",
      areaSourceUnit: "HECTARE",
      areaSourceValue: "3.79",
      frontageValue: "420",
      frontageUnit: "FT",
      roadWidthValue: "60",
      roadWidthUnit: "MTR",
      developmentPotential: ["COMMERCIAL", "WAREHOUSE", "RESIDENTIAL"],
      currentLandUse: "Wheat and mustard, canal-irrigated",
      masterPlanZonalUse: "Mixed use along the highway",
      documentsReceived: ["JAMABANDI", "REGISTRY", "MUTATION", "BHU_NAKSHA", "KHASRA_MAP", "CONVERSION_ORDER_90A", "PATTA", "OWNER_ID", "SITE_PHOTOS", "LOCATION_MAP"],
    },
    moves: [
      ["2026-09-24", "DOCUMENTS_PENDING"],
      ["2026-09-29", "SITE_VISIT"],
      ["2026-10-06", "UNDER_VERIFICATION"],
      ["2026-10-13", "NEGOTIATION"],
      ["2026-10-27", "APPROVED_FOR_ACQUISITION"],
    ],
  },
  {
    tag: "KADAMPURA",
    day: "2026-09-26",
    input: {
      receivedFrom: "ANOTHER_DEALER",
      anotherDealerName: "Naveen Agarwal (Agarwal Land Bank)",
      anotherDealerMobile: "9829806701",
      owners: [
        { ownerName: "Ladu Ram Gurjar", mobile: "9829806702", isPrimary: true },
        { ownerName: "Kalyan Gurjar", mobile: "9829806703", isPrimary: false },
      ],
      district: "Ajmer",
      tehsil: "Kishangarh",
      exactLocation: "Village Kadampura, on the NH-48 bypass",
      latitude: "26.5409",
      longitude: "74.8205",
      jamabandiEntries: [{ murbbaNo: "", patharNo: "", khasraNo: "301" }],
      areaBigha: "9",
      areaBiswa: "15",
      areaSourceUnit: "SQ_M",
      areaSourceValue: "15780",
      frontageValue: "250",
      frontageUnit: "FT",
      roadWidthValue: "100",
      roadWidthUnit: "FT",
      developmentPotential: ["WAREHOUSE"],
      currentLandUse: "Grazing land",
      masterPlanZonalUse: "Agriculture",
      documentsReceived: ["JAMABANDI", "OWNER_ID", "SITE_PHOTOS"],
    },
    moves: [
      ["2026-09-28", "DOCUMENTS_PENDING"],
      ["2026-10-03", "SITE_VISIT"],
      ["2026-10-07", "CLOSED", "Court stay on the land: the owners' family dispute is pending in the SDM court, Kishangarh."],
    ],
  },
  {
    tag: "SANGARIA-ROAD",
    day: "2026-10-03",
    source: "MEM-000001",
    input: {
      receivedFrom: "MEMBER",
      owners: [
        { ownerName: "Gurdev Singh Brar", mobile: "9414201101", isPrimary: true },
        { ownerName: "Jaswinder Kaur Brar", mobile: "9414201102", isPrimary: false },
      ],
      district: "Hanumangarh",
      tehsil: "Hanumangarh",
      exactLocation: "Chak 3 STB, Sangaria Road, 1.5 km past Ganpati Estate Emporio",
      latitude: "29.6034",
      longitude: "74.3389",
      jamabandiEntries: [
        { murbbaNo: "41", patharNo: "12", khasraNo: "41/12" },
        { murbbaNo: "41", patharNo: "13", khasraNo: "41/13" },
      ],
      areaBigha: "8",
      areaBiswa: "5",
      areaSourceUnit: "HECTARE",
      areaSourceValue: "2.09",
      frontageValue: "310",
      frontageUnit: "FT",
      roadWidthValue: "100",
      roadWidthUnit: "FT",
      developmentPotential: ["RESIDENTIAL", "COMMERCIAL"],
      currentLandUse: "Kinnow orchard and cotton",
      masterPlanZonalUse: "Residential (Hanumangarh Master Plan 2031)",
      documentsReceived: ["JAMABANDI", "REGISTRY", "MUTATION", "OWNER_ID", "SITE_PHOTOS", "LOCATION_MAP"],
    },
    moves: [
      ["2026-10-05", "DOCUMENTS_PENDING"],
      ["2026-10-09", "SITE_VISIT"],
      ["2026-10-14", "UNDER_VERIFICATION"],
      ["2026-10-22", "NEGOTIATION"],
    ],
  },
  {
    tag: "TILONIA-ROAD",
    day: "2026-10-06",
    source: "MEM-000002",
    input: {
      receivedFrom: "MEMBER",
      owners: [{ ownerName: "Bhanwar Lal Jat", mobile: "9460301201", isPrimary: true }],
      district: "Ajmer",
      tehsil: "Kishangarh",
      exactLocation: "Tilonia Road, 4 km from Kishangarh Farm Estates",
      latitude: "26.6137",
      longitude: "74.9021",
      jamabandiEntries: [
        { murbbaNo: "", patharNo: "", khasraNo: "512" },
        { murbbaNo: "", patharNo: "", khasraNo: "513/2" },
      ],
      areaBigha: "12",
      areaSourceUnit: "SQ_M",
      areaSourceValue: "19420",
      frontageValue: "180",
      frontageUnit: "FT",
      roadWidthValue: "40",
      roadWidthUnit: "FT",
      developmentPotential: ["FARMHOUSE", "RESIDENTIAL"],
      currentLandUse: "Rain-fed farming",
      masterPlanZonalUse: "Agriculture (Kishangarh Master Plan 2031)",
      documentsReceived: ["JAMABANDI", "OWNER_ID", "SITE_PHOTOS"],
    },
    moves: [
      ["2026-10-08", "DOCUMENTS_PENDING"],
      ["2026-10-16", "SITE_VISIT"],
    ],
  },
  {
    tag: "MUHANA",
    day: "2026-10-10",
    source: "9610000011",
    input: {
      receivedFrom: "CUSTOMER",
      owners: [
        { ownerName: "Ram Sahay Saini", mobile: "9414503401", isPrimary: true },
        { ownerName: "Mohan Lal Saini", mobile: "9414503402", isPrimary: false },
        { ownerName: "Gopal Saini", mobile: null, isPrimary: false },
      ],
      district: "Jaipur",
      tehsil: "Sanganer",
      exactLocation: "Village Muhana, Mandi Road, near the Sanganer flyover",
      latitude: "26.7854",
      longitude: "75.7621",
      jamabandiEntries: [
        { murbbaNo: "", patharNo: "", khasraNo: "88/1" },
        { murbbaNo: "", patharNo: "", khasraNo: "88/2" },
        { murbbaNo: "", patharNo: "", khasraNo: "89" },
      ],
      areaBigha: "5",
      areaBiswa: "4",
      areaSourceUnit: "SQ_M",
      areaSourceValue: "8420",
      frontageValue: "160",
      frontageUnit: "FT",
      roadWidthValue: "60",
      roadWidthUnit: "FT",
      developmentPotential: ["RESIDENTIAL"],
      currentLandUse: "Vegetable farming",
      masterPlanZonalUse: "Residential (Jaipur Master Plan 2025)",
      documentsReceived: ["JAMABANDI", "REGISTRY", "MUTATION", "BHU_NAKSHA", "KHASRA_MAP", "OWNER_ID", "LOCATION_MAP"],
    },
    moves: [
      ["2026-10-12", "DOCUMENTS_PENDING"],
      ["2026-10-17", "SITE_VISIT"],
      ["2026-10-24", "UNDER_VERIFICATION"],
    ],
  },
  {
    tag: "MADANGANJ",
    day: "2026-10-12",
    source: "MEM-000003",
    input: {
      receivedFrom: "MEMBER",
      owners: [
        { ownerName: "Pukhraj Kumawat", mobile: "9829402301", isPrimary: true },
        { ownerName: "Shanti Devi Kumawat", mobile: null, isPrimary: false },
      ],
      district: "Ajmer",
      tehsil: "Kishangarh",
      exactLocation: "Madanganj, behind the marble mandi on the Ajmer road",
      latitude: "26.5672",
      longitude: "74.8612",
      jamabandiEntries: [{ murbbaNo: "", patharNo: "", khasraNo: "1184" }],
      areaBigha: "3",
      areaBiswa: "10",
      areaSourceUnit: "SQ_FT",
      areaSourceValue: "61000",
      frontageValue: "26",
      frontageUnit: "MTR",
      roadWidthValue: "18",
      roadWidthUnit: "MTR",
      developmentPotential: ["WAREHOUSE", "INDUSTRIAL"],
      currentLandUse: "Vacant; used as a marble slab yard",
      masterPlanZonalUse: "Industrial (next to the RIICO area)",
      documentsReceived: ["JAMABANDI", "OWNER_ID"],
    },
    moves: [["2026-10-15", "DOCUMENTS_PENDING"]],
  },
  {
    tag: "SANGARIA-BYPASS",
    day: "2026-10-29",
    input: {
      receivedFrom: "ANOTHER_DEALER",
      anotherDealerName: "Balkishan Sharma (Shree Shyam Properties)",
      anotherDealerMobile: "9414705601",
      owners: [{ ownerName: "Hardeep Singh", mobile: "9414705602", isPrimary: true }],
      district: "Hanumangarh",
      tehsil: "Sangaria",
      exactLocation: "Sangaria bypass, near the grain mandi",
      latitude: "29.7953",
      longitude: "74.4651",
      areaBigha: "4",
      frontageValue: "140",
      frontageUnit: "FT",
      roadWidthValue: "40",
      roadWidthUnit: "FT",
      developmentPotential: ["RESIDENTIAL", "COMMERCIAL"],
      currentLandUse: "Cotton",
      documentsReceived: ["LOCATION_MAP"],
    },
    moves: [],
  },
  {
    tag: "RAWATSAR",
    day: "2026-10-30",
    input: {
      receivedFrom: "THREE_PERCENT_CLUB",
      owners: [{ ownerName: "Om Prakash Godara", mobile: "9414907801", isPrimary: true }],
      district: "Hanumangarh",
      tehsil: "Rawatsar",
      exactLocation: "Rawatsar–Hanumangarh road, opposite the petrol pump at Chak 4 RWD",
      latitude: "29.2942",
      longitude: "74.3932",
      jamabandiEntries: [{ murbbaNo: "7", patharNo: "21", khasraNo: "7/21" }],
      areaBigha: "6",
      areaBiswa: "10",
      areaSourceUnit: "HECTARE",
      areaSourceValue: "1.64",
      frontageValue: "200",
      frontageUnit: "FT",
      roadWidthValue: "60",
      roadWidthUnit: "FT",
      developmentPotential: ["RESIDENTIAL"],
      currentLandUse: "Gram and mustard",
      documentsReceived: ["JAMABANDI"],
    },
    moves: [],
  },
];

/** A Member by Member ID, a Customer by mobile. */
const sourceOf = async (source: string) =>
  source.startsWith("MEM-")
    ? (await db.memberProfile.findFirstOrThrow({ where: { memberId: source, status: "ACTIVE" } })).personId
    : (await db.person.findFirstOrThrow({ where: { primaryMobile: source, customerProfile: { isNot: null } } })).id;

async function main() {
  for (const li of INQUIRIES) {
    const tag = `LI-MOCK-${li.tag}-`;
    if (await db.landInquiry.findFirst({ where: { createRequestId: { startsWith: tag } } })) {
      console.log(`${li.tag} already made. Skipped.`);
      continue;
    }
    const input: LandInquiryInput = { ...emptyInput(), ...li.input, sourcePersonId: li.source ? await sourceOf(li.source) : null };
    const { id, inquiryNo } = await at(db, li.day, () => createLandInquiry({ ...CRM, createRequestId: `${tag}${RUN}`, input }), "15:00");
    console.log(`${li.day}  ${inquiryNo}  ${input.tehsil}`);

    for (const [i, [day, to, reason = ""]] of li.moves.entries()) {
      await at(db, day, async () => {
        const { version } = await db.landInquiry.findUniqueOrThrow({ where: { id }, select: { version: true } });
        const step = { ...CRM, idempotencyKey: `${tag}${RUN}-${i}`, id, version };
        return to === "CLOSED"
          ? setLandInquiryStatus({ ...step, status: "CLOSED", reason })
          : changeLandInquiryStage({ ...step, stage: to, reason });
      }, "16:00");
    }
  }
  const counts = await db.landInquiry.groupBy({ by: ["stage"], _count: { _all: true } });
  console.log("Land Inquiries now:", counts.map((c) => `${c._count._all} ${c.stage}`).join(", "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
