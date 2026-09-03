// Land Inquiry service checks — Land Inquiry spec §32, end to end against the
// real database and the real commands.
// Run: npm run land:check   (requires a seeded database)
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertCheckDatabase } from "./check-guard.ts";

assertCheckDatabase();

import {
  archiveLandInquiry,
  changeLandInquiryStage,
  createLandInquiry,
  listLandInquiries,
  reassignLandInquiry,
  setLandInquiryStatus,
  updateLandInquiry,
  type LandInquiryInput,
} from "@/lib/services/land-inquiry-service";

const db = new PrismaClient();
const TAG = "ZZ-LAND";
const CRM = `${TAG}-CRM`;
const ADMIN = `${TAG}-ADMIN`;

let seq = 0;
const key = () => `${TAG}-${Date.now()}-${seq++}`;

async function expectBlocked(pattern: RegExp, fn: () => Promise<unknown>) {
  await assert.rejects(fn, pattern);
}

/** Idempotent, so a crashed run never blocks the next one. */
async function cleanup() {
  const ids = (
    await db.landInquiry.findMany({
      where: { createdByRef: { startsWith: TAG } },
      select: { id: true },
    })
  ).map((r) => r.id);
  await db.landInquiryOwner.deleteMany({ where: { landInquiryId: { in: ids } } });
  await db.landInquiryJamabandiEntry.deleteMany({ where: { landInquiryId: { in: ids } } });
  await db.landInquiry.deleteMany({ where: { id: { in: ids } } });
  await db.auditEvent.deleteMany({ where: { entity: "LandInquiry", entityId: { in: ids } } });
  await db.idempotencyRecord.deleteMany({ where: { key: { startsWith: TAG } } });
  await db.person.deleteMany({ where: { fullName: { startsWith: TAG } } });
}

const base = (): LandInquiryInput => ({
  receivedFrom: "THREE_PERCENT_CLUB",
  sourcePersonId: null,
  anotherDealerMobile: null,
  assignedToId: null,
  district: "",
  tehsil: "",
  exactLocation: "",
  latitude: "",
  longitude: "",
  areaBigha: "",
  areaBiswa: "",
  areaSourceUnit: null,
  areaSourceValue: "",
  dimensions: "",
  frontageValue: "",
  frontageUnit: null,
  roadWidthValue: "",
  roadWidthUnit: null,
  shape: "",
  boundaries: "",
  landCategory: null,
  currentLandUse: "",
  masterPlanZonalUse: "",
  status90A: "UNKNOWN",
  landConversionStatus: "UNKNOWN",
  changeLandUseStatus: "UNKNOWN",
  pattaLeaseStatus: "UNKNOWN",
  registrySaleDeedAvailable: "UNKNOWN",
  mutationComplete: "UNKNOWN",
  mortgageBankCharge: "UNKNOWN",
  courtCaseStay: "UNKNOWN",
  familyDispute: "UNKNOWN",
  acquisitionNotice: "UNKNOWN",
  governmentRestriction: "UNKNOWN",
  approachRoad: "UNKNOWN",
  roadType: "",
  electricity: "UNKNOWN",
  water: "UNKNOWN",
  sewerage: "UNKNOWN",
  existingConstruction: "UNKNOWN",
  encroachment: "UNKNOWN",
  possessionStatus: "",
  ownerAskingRate: "",
  ownerAskingRateBasis: null,
  totalAskingValue: "",
  negotiable: null,
  dlcRate: "",
  dlcRateBasis: null,
  expectedPurchaseRate: "",
  expectedPurchaseRateBasis: null,
  paymentExpectation: "",
  developmentPotential: [],
  documentsReceived: [],
  evaluation: [],
  owners: [],
  jamabandiEntries: [],
});

const create = (input: Partial<LandInquiryInput>, requestId = key()) =>
  createLandInquiry({
    createRequestId: requestId,
    actorRef: CRM,
    actorRole: "CRM",
    input: { ...base(), ...input },
  });

async function main() {
  await cleanup();

  /* ---- an inquiry with every optional section blank still saves (§30.21) */

  const bare = await create({});
  assert.match(bare.inquiryNo, /^LI-\d{6}$/, "the Inquiry No. is LI- and six digits");

  const bareRow = await db.landInquiry.findUniqueOrThrow({ where: { id: bare.id } });
  assert.equal(bareRow.status, "WORKING", "a new inquiry is Working");
  assert.equal(bareRow.stage, "NEW", "at stage New");
  assert.equal(bareRow.version, 1);
  assert.equal(bareRow.archivedAt, null);
  assert.ok(
    await db.auditEvent.findFirst({
      where: { entity: "LandInquiry", entityId: bare.id, action: "LAND_INQUIRY_CREATED" },
    }),
    "creating an inquiry is audited"
  );

  /* ---- the number comes from a sequence, so two in a row never collide */

  const second = await create({});
  assert.notEqual(second.inquiryNo, bare.inquiryNo);
  assert.ok(second.inquiryNo > bare.inquiryNo, "the series moves forward");

  /* ---- §30.9, §30.22 — the same submission key returns the first result */

  const once = key();
  const first = await create({ district: `${TAG} Jaipur` }, once);
  const replay = await create({ district: `${TAG} Jaipur` }, once);
  assert.deepEqual(replay, first, "a retried submission returns the original, not a second row");
  assert.equal(
    await db.landInquiry.count({ where: { district: `${TAG} Jaipur` } }),
    1,
    "and exactly one inquiry exists for it"
  );

  /* ---- Another Dealer: a mobile and nothing else (§2.2, §30.6 – §30.8) */

  const peopleBefore = await db.person.count();
  const dealerA = await create({
    receivedFrom: "ANOTHER_DEALER",
    anotherDealerMobile: "+91 98765-43210",
    district: `${TAG} Dausa`,
  });
  const dealerRow = await db.landInquiry.findUniqueOrThrow({ where: { id: dealerA.id } });
  assert.equal(dealerRow.anotherDealerMobile, "9876543210", "the mobile is normalised as typed");
  assert.equal(dealerRow.sourcePersonId, null, "and names no Person");
  assert.equal(
    await db.person.count(),
    peopleBefore,
    "an Another Dealer inquiry creates no Person, Customer, Member or portal record"
  );

  // §30.8 — the same dealer may offer several pieces of land.
  const dealerB = await create({
    receivedFrom: "ANOTHER_DEALER",
    anotherDealerMobile: "9876543210",
  });
  assert.notEqual(dealerB.id, dealerA.id, "the same dealer mobile may appear on another inquiry");

  // §30.7 — a mobile that matches an existing Person is still not that Person.
  const existing = await db.person.create({
    data: { fullName: `${TAG} Dealer Lookalike`, primaryMobile: "9876543210" },
  });
  const lookalike = await create({
    receivedFrom: "ANOTHER_DEALER",
    anotherDealerMobile: "9876543210",
  });
  assert.equal(
    (await db.landInquiry.findUniqueOrThrow({ where: { id: lookalike.id } })).sourcePersonId,
    null,
    "a matching mobile never auto-links the inquiry to that Person"
  );
  void existing;

  /* ---- the server decides source capability, not the caller (§5) */

  const plainPerson = await db.person.create({
    data: { fullName: `${TAG} Not A Member`, primaryMobile: "9811111111" },
  });
  await expectBlocked(/not a Member/, () =>
    create({ receivedFrom: "MEMBER", sourcePersonId: plainPerson.id })
  );
  await expectBlocked(/not a Customer/, () =>
    create({ receivedFrom: "CUSTOMER", sourcePersonId: plainPerson.id })
  );
  await expectBlocked(/Select the Member/, () => create({ receivedFrom: "MEMBER" }));
  await expectBlocked(/mobile number/, () => create({ receivedFrom: "ANOTHER_DEALER" }));
  await expectBlocked(/names no source Person/, () =>
    create({ receivedFrom: "THREE_PERCENT_CLUB", sourcePersonId: plainPerson.id })
  );

  const member = await db.memberProfile.findFirst({ where: { status: "ACTIVE" } });
  if (member) {
    const fromMember = await create({
      receivedFrom: "MEMBER",
      sourcePersonId: member.personId,
    });
    assert.equal(
      (await db.landInquiry.findUniqueOrThrow({ where: { id: fromMember.id } })).sourcePersonId,
      member.personId,
      "a Member-sourced inquiry links the existing Person, and creates none"
    );
  }

  /* ---- owners and Jamabandi rows (§8, §10, §30.13, §30.14) */

  const withRows = await create({
    owners: [
      { ownerName: "  Ram Lal  ", mobile: "98765 43211", isPrimary: false },
      { ownerName: "Sita Devi", mobile: "", isPrimary: false },
      { ownerName: "   ", mobile: "", isPrimary: false },
    ],
    jamabandiEntries: [
      { murbbaNo: "12", patwarNo: "", khasraNo: `${TAG}-145/2` },
      { murbbaNo: " ", patwarNo: "", khasraNo: "" },
    ],
  });
  const owners = await db.landInquiryOwner.findMany({
    where: { landInquiryId: withRows.id },
    orderBy: { sortOrder: "asc" },
  });
  assert.equal(owners.length, 2, "a blank owner row is dropped");
  assert.deepEqual(owners.map((o) => o.isPrimary), [true, false], "the first owner is Primary");
  assert.equal(owners[0].ownerName, "Ram Lal");
  assert.equal(owners[0].mobile, "9876543211");
  assert.equal(owners[1].mobile, null, "an owner mobile is optional");

  const entries = await db.landInquiryJamabandiEntry.findMany({
    where: { landInquiryId: withRows.id },
  });
  assert.equal(entries.length, 1, "an all-blank Jamabandi row never persists");

  // The database refuses a second Primary Owner even if the service did not.
  await assert.rejects(
    db.landInquiryOwner.create({
      data: {
        landInquiryId: withRows.id,
        ownerName: "Second Primary",
        isPrimary: true,
        sortOrder: 99,
      },
    }),
    /land_inquiry_one_primary_owner|Unique constraint/,
    "the database holds at most one Primary Owner per inquiry"
  );

  /* ---- area: metric converts exactly, Bigha is stored raw (§11, §30.16 – §30.18) */

  const area = await create({
    areaBigha: "4.5",
    areaBiswa: "12",
    areaSourceUnit: "SQ_FT",
    areaSourceValue: "10000",
  });
  const areaRow = await db.landInquiry.findUniqueOrThrow({ where: { id: area.id } });
  assert.equal(areaRow.areaBigha?.toString(), "4.5", "Bigha is stored exactly as entered");
  assert.equal(areaRow.areaBiswa?.toString(), "12");
  assert.equal(
    Number(areaRow.areaSqM),
    929.0304,
    "10,000 sq ft is 929.0304 sq m — the exact factor, not an approximation"
  );
  assert.equal(areaRow.areaSourceUnit, "SQ_FT", "and what the user actually typed is remembered");

  const bighaOnly = await create({ areaBigha: "3" });
  const bighaRow = await db.landInquiry.findUniqueOrThrow({ where: { id: bighaOnly.id } });
  assert.equal(bighaRow.areaSqM, null, "Bigha alone never invents a metric area");

  await expectBlocked(/positive number/, () => create({ areaBigha: "-2" }));

  /* ---- commercial values (§16, §30.19, §30.20) */

  await expectBlocked(/needs a rate basis/, () => create({ ownerAskingRate: "5000" }));
  const money = await create({
    ownerAskingRate: "5,000",
    ownerAskingRateBasis: "PER_SQ_FT",
    totalAskingValue: "1,25,00,000",
  });
  const moneyRow = await db.landInquiry.findUniqueOrThrow({ where: { id: money.id } });
  assert.equal(moneyRow.ownerAskingRate?.toFixed(2), "5000.00");
  assert.equal(
    moneyRow.totalAskingValue?.toFixed(2),
    "12500000.00",
    "a total may be stated without a rate, and Indian grouping is parsed, not stored"
  );
  await expectBlocked(/positive amount/, () =>
    create({ dlcRate: "0", dlcRateBasis: "TOTAL" })
  );

  // The whole point of §0: none of this reaches the transaction side.
  assert.equal(
    await db.commissionRecord.count({ where: { bookingId: null, acquisitionId: null } }),
    0,
    "a Land Inquiry creates no commission record of any kind"
  );

  /* ---- the map pin is a pair or nothing (§30.15) */

  await expectBlocked(/both latitude and longitude/, () => create({ latitude: "26.9124" }));
  await expectBlocked(/Latitude must be/, () => create({ latitude: "95", longitude: "75.78" }));

  /* ---- optimistic locking (§26.7, §30.11) */

  const edited = await create({ district: `${TAG} Ajmer` });
  const editedRow = await db.landInquiry.findUniqueOrThrow({ where: { id: edited.id } });
  await updateLandInquiry({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    id: edited.id,
    version: editedRow.version,
    input: { ...base(), district: `${TAG} Ajmer`, tehsil: `${TAG} Kishangarh` },
  });
  const afterEdit = await db.landInquiry.findUniqueOrThrow({ where: { id: edited.id } });
  assert.equal(afterEdit.version, editedRow.version + 1, "a successful update moves the version");
  assert.equal(afterEdit.tehsil, `${TAG} Kishangarh`);

  await expectBlocked(/updated by another user/, () =>
    updateLandInquiry({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      id: edited.id,
      version: editedRow.version,
      input: { ...base(), district: "Stale write" },
    })
  );
  assert.equal(
    (await db.landInquiry.findUniqueOrThrow({ where: { id: edited.id } })).district,
    `${TAG} Ajmer`,
    "and the stale write changed nothing"
  );

  /* ---- stage and status (§21, §22, §30.25 – §30.28) */

  let version = afterEdit.version;
  const stageStep = await changeLandInquiryStage({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    id: edited.id,
    version,
    stage: "DOCUMENTS_PENDING",
    reason: "",
  });
  version = (stageStep as { version: number }).version;

  await expectBlocked(/Skipping a stage/, () =>
    changeLandInquiryStage({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      id: edited.id,
      version,
      stage: "APPROVED_FOR_ACQUISITION",
      reason: "",
    })
  );
  const skipped = await changeLandInquiryStage({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    id: edited.id,
    version,
    stage: "APPROVED_FOR_ACQUISITION",
    reason: "Land arrived already verified.",
  });
  version = (skipped as { version: number }).version;
  assert.equal(
    (skipped as { status: string }).status,
    "WORKING",
    "Approved for Acquisition is a working stage; nothing about it closes the inquiry"
  );
  assert.equal(
    await db.acquisition.count({ where: { submittedByRef: { startsWith: TAG } } }),
    0,
    "and it creates no acquisition — the hand-off stays an explicit, separate step"
  );

  await expectBlocked(/back a stage/, () =>
    changeLandInquiryStage({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      id: edited.id,
      version,
      stage: "SITE_VISIT",
      reason: "",
    })
  );

  const closed = await setLandInquiryStatus({
    idempotencyKey: key(),
    actorRef: CRM,
    actorRole: "CRM",
    id: edited.id,
    version,
    status: "CLOSED",
    reason: "Owner sold elsewhere.",
  });
  version = (closed as { version: number }).version;
  assert.equal((closed as { status: string }).status, "CLOSED");
  assert.equal(
    (closed as { stage: string }).stage,
    "REJECTED_CLOSED",
    "closing sets the Status and the Stage together"
  );

  await expectBlocked(/reopen it before it can be edited/, () =>
    updateLandInquiry({
      idempotencyKey: key(),
      actorRef: CRM,
      actorRole: "CRM",
      id: edited.id,
      version,
      input: { ...base(), district: "Edit while closed" },
    })
  );

  await expectBlocked(/working stage this inquiry reopens at/, () =>
    setLandInquiryStatus({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      id: edited.id,
      version,
      status: "WORKING",
      reason: "Owner came back.",
    })
  );
  const reopened = await setLandInquiryStatus({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    id: edited.id,
    version,
    status: "WORKING",
    reason: "Owner came back.",
    restoredStage: "NEGOTIATION",
  });
  version = (reopened as { version: number }).version;
  assert.equal((reopened as { stage: string }).stage, "NEGOTIATION");
  assert.ok(
    await db.auditEvent.findFirst({
      where: { entityId: edited.id, action: "LAND_INQUIRY_REOPENED" },
    }),
    "the reopen and its reason are on the record's history"
  );

  /* ---- reassignment */

  const staff = await db.staffAccount.findFirst({ where: { status: "ACTIVE" } });
  if (staff) {
    const reassigned = await reassignLandInquiry({
      idempotencyKey: key(),
      actorRef: ADMIN,
      actorRole: "ADMIN",
      id: edited.id,
      version,
      assignedToId: staff.id,
      reason: "Desk change.",
    });
    version = (reassigned as { version: number }).version;
    assert.equal(
      (await db.landInquiry.findUniqueOrThrow({ where: { id: edited.id } })).assignedToId,
      staff.id
    );
  }

  /* ---- server-side search and filters (§25) */

  const byKhasra = await listLandInquiries({ khasraNo: `${TAG}-145` });
  assert.equal(byKhasra.totalRows, 1, "a Khasra number finds its inquiry");
  assert.equal(byKhasra.rows[0].id, withRows.id);

  const byOwner = await listLandInquiries({ q: "Sita Devi" });
  assert.ok(
    byOwner.rows.some((r) => r.id === withRows.id),
    "an owner name is searchable"
  );
  const byDealerMobile = await listLandInquiries({ q: "9876543210" });
  assert.ok(
    byDealerMobile.rows.some((r) => r.id === dealerA.id),
    "so is a dealer mobile"
  );
  await expectBlocked(/date range starts after it ends/, () =>
    listLandInquiries({ dateFrom: "2026-09-02", dateTo: "2026-09-01" })
  );

  /* ---- archive hides without deleting (§4.6, §30.29) */

  await archiveLandInquiry({
    idempotencyKey: key(),
    actorRef: ADMIN,
    actorRole: "ADMIN",
    id: edited.id,
    version,
    reason: "Duplicate of another inquiry.",
  });
  const archivedRow = await db.landInquiry.findUniqueOrThrow({ where: { id: edited.id } });
  assert.ok(archivedRow.archivedAt, "the row is still there");
  assert.equal(archivedRow.archivedByRef, ADMIN, "and names who archived it");
  assert.equal(
    (await listLandInquiries({ q: `${TAG} Ajmer` })).totalRows,
    0,
    "the default list excludes archived inquiries"
  );
  assert.equal(
    (await listLandInquiries({ q: `${TAG} Ajmer`, includeArchived: true })).totalRows,
    1,
    "and an authorised archived view still finds it"
  );

  await cleanup();
  await db.$disconnect();
  console.log("land-inquiry.check.ts OK");
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch((purgeError) => {
    console.error("Cleanup failed — tagged rows may remain:", purgeError);
  });
  await db.$disconnect();
  process.exit(1);
});
