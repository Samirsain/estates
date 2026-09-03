# 3% CLUB — LAND INQUIRY MANAGEMENT
## Implementation Specification & Claude Code Implementation Prompt

**Document type:** Implementation-ready change specification  
**Target:** Existing 3% Club CRM / Dashboard  
**New route:** `/land-inquiries`  
**Authority:** The finalized Land Inquiry requirements in this document control this feature. Existing architecture must be reused wherever it does not conflict.

---

# 0. Architecture Grounding

## Confirmed existing architecture

The current project reference shows:

- Next.js 16.2.12, React 19, App Router.
- PostgreSQL/Supabase through Prisma 5.
- Staff authentication uses a signed JWT in an httpOnly cookie and validates the matching `sessions` record on authenticated requests.
- Tailwind v4 and the existing light dashboard design.
- Reads are performed on the server; Client Components hold interaction state.
- Mutations use React Server Actions; there is no normal REST CRUD layer.
- One unified `people` identity is reused when a person is a Customer, Member or portal user.
- Existing audit history is append-only with actor, timestamp, before/after values and reason.
- Shared status vocabularies are centralized in project utilities; literals should not be scattered across pages.
- Existing verification commands are `npm run check`, `npx tsc --noEmit`, and `npm run build`.

## Architecture decision for this feature

Land Inquiry is a new **pre-acquisition CRM module**, not a parallel application.

Reuse:

- existing `people` identity;
- existing staff/auth/session model;
- existing RBAC helpers;
- existing audit helper/table;
- existing Member and Customer lookup components;
- existing table/search/filter/pagination/form/badge/modal/toast patterns;
- existing acquisition/Purchase-for-Resale workflow only at explicit hand-off.

Do **not** create:

- another Member master;
- another Customer master;
- an “Another Dealer” master;
- a second staff/role system;
- a new REST layer;
- a separate audit framework;
- a document-upload system merely for “Documents Received”.

## Feature-specific exception: commercial values

The main transaction CRM intentionally avoids storing rupee deal/payment/commission amounts. This feature nevertheless expressly requires Owner Asking Rate, Total Asking Value, DLC Rate and Expected Purchase Rate.

Therefore:

> Land Inquiry may persist INR values as **pre-acquisition market/negotiation information only**.

These values must never automatically feed:

- Booking;
- Payment Received;
- Payment Given;
- Commission;
- payout;
- refund;
- Tally/accounting.

---

# 1. Feature Overview

Land Inquiry Management captures land opportunities received by 3% Club before they become approved acquisitions.

It records:

- inquiry source;
- owners;
- land location;
- Jamabandi references;
- area/site details;
- land use and conversion status;
- legal red flags;
- access/utilities;
- asking and expected commercial values;
- documents said to be received;
- internal evaluation needs;
- progress toward acquisition.

Recommended navigation placement:

> **Leads → Land Inquiries → Plots / Workflow**

Main workflow:

1. Create Land Inquiry.
2. Select source.
3. Save partial information.
4. Add/update land, legal and commercial information.
5. Move Inquiry Stage.
6. Close as rejected, or reach Approved for Acquisition.
7. If approved, use an explicit hand-off into the existing acquisition workflow.
8. Keep the Land Inquiry as permanent audited history.

---

# 2. Final Business Requirements

## 2.1 Inquiry Details

- Inquiry No. is backend-generated, unique and non-editable.
- Inquiry Date is backend-generated using Asia/Kolkata current date and non-editable.
- Received From has exactly:
  - Member
  - Customer
  - 3% Club
  - Another Dealer
- Status has exactly:
  - Working
  - Closed
- Default Status = Working.
- Default Inquiry Stage = New.

## 2.2 Received From

### Member
- Search/select existing Member.
- Link existing Person record.
- Existing displayed data comes from current database.
- No duplicate person is created.

### Customer
- Search/select existing Customer.
- Link existing Person record.
- No duplicate person is created.

### 3% Club
- Search/select an existing record already classified by the current project as an eligible 3% Club/dealer/source record.
- Do not create a new “3% Club database” merely for this feature.

### Another Dealer
- Only manual Mobile Number is stored for the source.
- No name is required.
- No `people` row is created or modified.
- No Customer, Member, 3% Club/dealer, Lead or portal record is created.
- Same mobile may occur on several different Land Inquiries.

## 2.3 Land Owners

- Multiple owners allowed.
- Owner row contains:
  - Owner Name
  - Mobile Number
- Owner Mobile is optional.
- First owner automatically becomes Primary Owner.
- Other owners are Additional Owners.
- One maximum Primary Owner.
- Zero owners are allowed while the inquiry is still incomplete.
- If an owner row exists, Owner Name is required.
- No Father/Husband Name, ownership share, owner-count field, seller field or authorised-person field.

## 2.4 Location

- District
- Tehsil
- Exact Location
- Google Map Pin

Map pin is editable and stored as coordinates.

## 2.5 Jamabandi Details

Section title must be exactly:

> **Jamabandi Details**

Repeatable rows:
- Murbba No.
- Patwar No.
- Khasra No.

## 2.6 Land Details

Available:
- Bigha
- Biswa
- Hectare
- Sq. Mtr.
- Sq. Ft.
- Dimensions
- Frontage
- Road Width
- Shape
- Boundaries

Metric values are synchronized. Bigha/Biswa are not universally auto-converted.

## 2.7 Land Category / Use

Category:
- Residential
- Commercial
- Industrial
- Agricultural
- Other

Additional:
- Current Land Use
- Master Plan / Zonal Use

## 2.8 Conversion / Approval

- 90A Status
- Land Conversion Status
- Change of Land Use Status
- Patta / Lease Status

## 2.9 Legal Check

- Registry / Sale Deed Available
- Mutation Complete
- Mortgage / Bank Charge
- Court Case / Stay
- Family Dispute
- Acquisition Notice
- Government Restriction

Use Unknown / Yes / No so missing information is never misrepresented as “No”.

## 2.10 Access & Site Condition

- Approach Road
- Road Type
- Electricity
- Water
- Sewerage
- Existing Construction
- Encroachment
- Possession Status

## 2.11 Commercial Details

- Owner Asking Rate
- Total Asking Value
- Negotiable — Yes / No
- DLC Rate
- Expected Purchase Rate
- Payment Expectation

Rate fields require a rate basis so the number is meaningful.

## 2.12 Development Potential

Optional multi-select:
- Residential
- Commercial
- Warehouse
- Agriculture
- Other

## 2.13 Documents Received

Optional multi-select:
- Jamabandi
- Registry
- Mutation
- Bhu-Naksha
- Khasra Map
- 90A / Conversion Order
- Patta
- Owner ID
- Site Photos
- Location Map

Zero selection is valid. These are presence/status checkboxes, not uploads.

## 2.14 Evaluation

Optional multi-select:
- Site Visit Required
- Legal Verification Required
- Revenue Verification Required

Remove:
- Management Interest
- Negotiation Status

## 2.15 Inquiry Stage

- New
- Documents Pending
- Site Visit
- Under Verification
- Negotiation
- Approved for Acquisition
- Rejected / Closed

Status and Stage remain separate.

---

# 3. Complete Field Specification

| Section | Field | Type | Req.? | Default | Source | Validation | DB field | Behaviour / Notes |
|---|---|---|---|---|---|---|---|---|
| Inquiry Details | Inquiry No. | Read-only text | System | generated | Backend | unique | `inquiry_no` | never editable |
| Inquiry Details | Date | Read-only date | System | India today | Backend | non-user editable | `inquiry_date` | Asia/Kolkata |
| Inquiry Details | Received From | Select | Yes | — | enum | 4 values only | `received_from` | conditional source |
| Inquiry Details | Related Source | Search/select | Conditional | null | `people` | required for Member/Customer/Club | `source_person_id` | existing record only |
| Inquiry Details | Another Dealer Mobile | Mobile | Conditional | null | Manual | required only for Another Dealer | `another_dealer_mobile` | inquiry-local only |
| Inquiry Details | Status | Select | System | Working | enum | Working/Closed | `status` | separate from Stage |
| Inquiry Details | Assigned To | Staff search | Optional | creator if eligible | existing staff | active eligible staff | `assigned_to_id` | operational assignment |
| Owner | Owner Name | Text | Conditional | — | Manual | nonblank if row exists | child `owner_name` | multiple rows |
| Owner | Mobile Number | Mobile | Optional | null | Manual | normalize if entered | child `mobile` | blank allowed |
| Owner | Primary | System flag | System | first=true | System | one max | child `is_primary` | clearly displayed |
| Location | District | Search/text | Optional | null | lookup/manual | trimmed | `district` | not enum |
| Location | Tehsil | Search/text | Optional | null | lookup/manual | trimmed | `tehsil` | not enum |
| Location | Exact Location | Textarea | Optional | null | Manual | length limit | `exact_location` | free text |
| Location | Google Map Pin | Map | Optional | null | Map | valid lat/lng pair | `latitude`,`longitude` | editable |
| Jamabandi | Murbba No. | Text | Optional | null | Manual | row cannot be all blank | child `murbba_no` | repeatable |
| Jamabandi | Patwar No. | Text | Optional | null | Manual | row cannot be all blank | child `patwar_no` | repeatable |
| Jamabandi | Khasra No. | Text | Optional | null | Manual | row cannot be all blank | child `khasra_no` | searchable |
| Land Details | Bigha | Decimal | Optional | null | Manual | positive | `area_bigha` | no universal conversion |
| Land Details | Biswa | Decimal | Optional | null | Manual | positive | `area_biswa` | no universal conversion |
| Land Details | Hectare | Decimal UI | Optional | derived/manual | Metric | positive | derived from sq m | exact metric sync |
| Land Details | Sq. Mtr. | Decimal | Optional | null | Manual/derived | positive | `area_sq_m` | canonical metric |
| Land Details | Sq. Ft. | Decimal UI | Optional | derived/manual | Metric | positive | derived from sq m | exact metric sync |
| Land Details | Metric Source Unit | System | Optional | null | UI | valid metric unit | `area_source_unit` | remembers authoritative entry |
| Land Details | Metric Source Value | Decimal | Optional | null | UI | positive | `area_source_value` | preserves input |
| Land Details | Dimensions | Text | Optional | null | Manual | max length | `dimensions` | descriptive |
| Land Details | Frontage | Decimal + unit | Optional | null | Manual | positive | `frontage_value/unit` | Ft/Mtr |
| Land Details | Road Width | Decimal + unit | Optional | null | Manual | positive | `road_width_value/unit` | Ft/Mtr |
| Land Details | Shape | Text | Optional | null | Manual | max length | `shape` | descriptive |
| Land Details | Boundaries | Textarea | Optional | null | Manual | max length | `boundaries` | descriptive |
| Land Category | Category | Select | Optional | null | enum | allowed values | `land_category` | — |
| Land Category | Current Land Use | Text | Optional | null | Manual | max length | `current_land_use` | — |
| Land Category | Master Plan / Zonal Use | Text | Optional | null | Manual | max length | `master_plan_zonal_use` | — |
| Conversion | 90A Status | Select | Optional | Unknown | enum | approved values | `status_90a` | tracking only |
| Conversion | Land Conversion Status | Select | Optional | Unknown | enum | approved values | `land_conversion_status` | — |
| Conversion | Change of Land Use Status | Select | Optional | Unknown | enum | approved values | `change_land_use_status` | — |
| Conversion | Patta / Lease Status | Select | Optional | Unknown | enum | approved values | `patta_lease_status` | — |
| Legal | Registry / Sale Deed Available | Tri-state | Optional | Unknown | enum | U/Y/N | `registry_sale_deed_available` | — |
| Legal | Mutation Complete | Tri-state | Optional | Unknown | enum | U/Y/N | `mutation_complete` | — |
| Legal | Mortgage / Bank Charge | Tri-state | Optional | Unknown | enum | U/Y/N | `mortgage_bank_charge` | Yes=issue exists |
| Legal | Court Case / Stay | Tri-state | Optional | Unknown | enum | U/Y/N | `court_case_stay` | Yes=issue exists |
| Legal | Family Dispute | Tri-state | Optional | Unknown | enum | U/Y/N | `family_dispute` | — |
| Legal | Acquisition Notice | Tri-state | Optional | Unknown | enum | U/Y/N | `acquisition_notice` | — |
| Legal | Government Restriction | Tri-state | Optional | Unknown | enum | U/Y/N | `government_restriction` | — |
| Site | Approach Road | Tri-state | Optional | Unknown | enum | U/Y/N | `approach_road` | — |
| Site | Road Type | Text | Optional | null | Manual | max length | `road_type` | — |
| Site | Electricity | Tri-state | Optional | Unknown | enum | U/Y/N | `electricity` | — |
| Site | Water | Tri-state | Optional | Unknown | enum | U/Y/N | `water` | — |
| Site | Sewerage | Tri-state | Optional | Unknown | enum | U/Y/N | `sewerage` | — |
| Site | Existing Construction | Tri-state | Optional | Unknown | enum | U/Y/N | `existing_construction` | — |
| Site | Encroachment | Tri-state | Optional | Unknown | enum | U/Y/N | `encroachment` | Yes=issue exists |
| Site | Possession Status | Text | Optional | null | Manual | max length | `possession_status` | — |
| Commercial | Owner Asking Rate | INR Decimal | Optional | null | Manual | >0 | `owner_asking_rate` | inquiry-only rupees |
| Commercial | Asking Rate Basis | Select | Conditional | null | enum | required with rate | `owner_asking_rate_basis` | supporting field |
| Commercial | Total Asking Value | INR Decimal | Optional | null | Manual | >0 | `total_asking_value` | never auto-overwrite |
| Commercial | Negotiable | Yes/No | Optional | null | Manual | Boolean | `negotiable` | null=unknown |
| Commercial | DLC Rate | INR Decimal | Optional | null | Manual | >0 | `dlc_rate` | informational |
| Commercial | DLC Rate Basis | Select | Conditional | null | enum | required with rate | `dlc_rate_basis` | supporting field |
| Commercial | Expected Purchase Rate | INR Decimal | Optional | null | Manual | >0 | `expected_purchase_rate` | internal inquiry estimate |
| Commercial | Expected Rate Basis | Select | Conditional | null | enum | required with rate | `expected_purchase_rate_basis` | supporting field |
| Commercial | Payment Expectation | Textarea | Optional | null | Manual | max length | `payment_expectation` | no accounting automation |
| Development | Potential | Checkbox array | Optional | [] | enum | unique values | `development_potential` | multiple/zero |
| Documents | Documents Received | Checkbox array | Optional | [] | enum | unique values | `documents_received` | no uploads |
| Evaluation | Evaluation | Checkbox array | Optional | [] | enum | unique values | `evaluation` | multiple/zero |
| Inquiry Stage | Stage | Select | System | New | enum | transition guard | `stage` | separate from status |
| System | Create Request ID | Hidden UUID | System | generated | form | unique | `create_request_id` | idempotency |
| System | Version | Integer | System | 1 | backend | positive | `version` | optimistic locking |
| System | Created/Updated by | FK | System | current staff | session | valid staff | actor FKs | audit metadata |
| System | Created/Updated at | timestamp | System | now | DB | immutable/update | timestamps | — |
| System | Archived at/by | nullable | Optional | null | Admin/MD | audited | archive fields | no hard delete |

---

# 4. Database / Schema Changes

## 4.1 Reuse

Reuse existing:
- `people`
- staff/auth/session model
- audit log infrastructure
- acquisition workflow

Do not unnecessarily modify existing transaction tables.

## 4.2 New tables

Create only:

1. `land_inquiries`
2. `land_inquiry_owners`
3. `land_inquiry_jamabandi_entries`

## 4.3 Enums

```prisma
enum LandInquiryReceivedFrom { Member Customer Club AnotherDealer }
enum LandInquiryStatus { Working Closed }
enum LandInquiryStage {
  New DocumentsPending SiteVisit UnderVerification
  Negotiation ApprovedForAcquisition RejectedClosed
}
enum LandCategory { Residential Commercial Industrial Agricultural Other }
enum LandApprovalStatus { Unknown NotApplicable NotStarted Pending Approved Rejected }
enum LandCheckState { Unknown Yes No }
enum LandDevelopmentPotential { Residential Commercial Warehouse Agriculture Other }
enum LandDocumentType {
  Jamabandi Registry Mutation BhuNaksha KhasraMap
  ConversionOrder90A Patta OwnerId SitePhotos LocationMap
}
enum LandEvaluationType {
  SiteVisitRequired LegalVerificationRequired RevenueVerificationRequired
}
enum LandRateBasis { Total PerBigha PerBiswa PerHectare PerSqMtr PerSqFt }
enum LinearUnit { Ft Mtr }
enum LandMetricSourceUnit { SqMtr Hectare SqFt }
```

## 4.4 Prisma structure

The exact current `Person` and staff model names must be bound to the existing schema after repository inspection; do not create replacements.

```prisma
model LandInquiry {
  id                        String   @id @default(uuid()) @db.Uuid
  inquiryNo                 String   @unique @map("inquiry_no") @db.VarChar(24)
  inquiryDate               DateTime @map("inquiry_date") @db.Date
  receivedFrom              LandInquiryReceivedFrom @map("received_from")
  sourcePersonId            String?  @map("source_person_id") @db.Uuid
  anotherDealerMobile       String?  @map("another_dealer_mobile") @db.VarChar(10)
  status                    LandInquiryStatus @default(Working)
  stage                     LandInquiryStage @default(New)
  assignedToId              String?  @map("assigned_to_id")

  district                  String?  @db.VarChar(120)
  tehsil                    String?  @db.VarChar(120)
  exactLocation             String?  @map("exact_location") @db.Text
  latitude                  Decimal? @db.Decimal(10,7)
  longitude                 Decimal? @db.Decimal(10,7)

  areaBigha                 Decimal? @map("area_bigha") @db.Decimal(20,6)
  areaBiswa                 Decimal? @map("area_biswa") @db.Decimal(20,6)
  areaSqM                   Decimal? @map("area_sq_m") @db.Decimal(20,6)
  areaSourceUnit            LandMetricSourceUnit? @map("area_source_unit")
  areaSourceValue           Decimal? @map("area_source_value") @db.Decimal(20,6)

  dimensions                String? @db.VarChar(255)
  frontageValue             Decimal? @map("frontage_value") @db.Decimal(18,4)
  frontageUnit              LinearUnit? @map("frontage_unit")
  roadWidthValue            Decimal? @map("road_width_value") @db.Decimal(18,4)
  roadWidthUnit             LinearUnit? @map("road_width_unit")
  shape                     String? @db.VarChar(100)
  boundaries                String? @db.Text

  landCategory              LandCategory? @map("land_category")
  currentLandUse            String? @map("current_land_use") @db.VarChar(255)
  masterPlanZonalUse        String? @map("master_plan_zonal_use") @db.VarChar(255)

  status90A                 LandApprovalStatus @default(Unknown) @map("status_90a")
  landConversionStatus      LandApprovalStatus @default(Unknown) @map("land_conversion_status")
  changeLandUseStatus       LandApprovalStatus @default(Unknown) @map("change_land_use_status")
  pattaLeaseStatus          LandApprovalStatus @default(Unknown) @map("patta_lease_status")

  registrySaleDeedAvailable LandCheckState @default(Unknown) @map("registry_sale_deed_available")
  mutationComplete          LandCheckState @default(Unknown) @map("mutation_complete")
  mortgageBankCharge        LandCheckState @default(Unknown) @map("mortgage_bank_charge")
  courtCaseStay             LandCheckState @default(Unknown) @map("court_case_stay")
  familyDispute             LandCheckState @default(Unknown) @map("family_dispute")
  acquisitionNotice         LandCheckState @default(Unknown) @map("acquisition_notice")
  governmentRestriction     LandCheckState @default(Unknown) @map("government_restriction")

  approachRoad              LandCheckState @default(Unknown) @map("approach_road")
  roadType                  String? @map("road_type") @db.VarChar(100)
  electricity               LandCheckState @default(Unknown)
  water                     LandCheckState @default(Unknown)
  sewerage                  LandCheckState @default(Unknown)
  existingConstruction      LandCheckState @default(Unknown) @map("existing_construction")
  encroachment              LandCheckState @default(Unknown)
  possessionStatus          String? @map("possession_status") @db.VarChar(255)

  ownerAskingRate           Decimal? @map("owner_asking_rate") @db.Decimal(20,2)
  ownerAskingRateBasis      LandRateBasis? @map("owner_asking_rate_basis")
  totalAskingValue          Decimal? @map("total_asking_value") @db.Decimal(20,2)
  negotiable                Boolean?
  dlcRate                   Decimal? @map("dlc_rate") @db.Decimal(20,2)
  dlcRateBasis              LandRateBasis? @map("dlc_rate_basis")
  expectedPurchaseRate      Decimal? @map("expected_purchase_rate") @db.Decimal(20,2)
  expectedPurchaseRateBasis LandRateBasis? @map("expected_purchase_rate_basis")
  paymentExpectation        String? @map("payment_expectation") @db.Text

  developmentPotential      LandDevelopmentPotential[] @default([]) @map("development_potential")
  documentsReceived         LandDocumentType[] @default([]) @map("documents_received")
  evaluation                LandEvaluationType[] @default([])

  createRequestId           String @unique @map("create_request_id") @db.Uuid
  version                   Int @default(1)
  createdById               String @map("created_by_id")
  updatedById               String @map("updated_by_id")
  archivedAt                DateTime? @map("archived_at")
  archivedById              String? @map("archived_by_id")
  createdAt                 DateTime @default(now()) @map("created_at")
  updatedAt                 DateTime @updatedAt @map("updated_at")

  owners                    LandInquiryOwner[]
  jamabandiEntries          LandInquiryJamabandiEntry[]

  // Add FK relations to the ACTUAL existing Person/staff models.
  @@index([inquiryDate])
  @@index([receivedFrom])
  @@index([status, stage])
  @@index([district, tehsil])
  @@index([sourcePersonId])
  @@index([assignedToId])
  @@index([archivedAt])
  @@map("land_inquiries")
}

model LandInquiryOwner {
  id            String @id @default(uuid()) @db.Uuid
  landInquiryId String @map("land_inquiry_id") @db.Uuid
  landInquiry   LandInquiry @relation(fields: [landInquiryId], references: [id], onDelete: Cascade)
  ownerName     String @map("owner_name") @db.VarChar(200)
  mobile        String? @db.VarChar(10)
  isPrimary     Boolean @default(false) @map("is_primary")
  sortOrder     Int @map("sort_order")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  @@unique([landInquiryId, sortOrder])
  @@index([ownerName])
  @@index([mobile])
  @@map("land_inquiry_owners")
}

model LandInquiryJamabandiEntry {
  id            String @id @default(uuid()) @db.Uuid
  landInquiryId String @map("land_inquiry_id") @db.Uuid
  landInquiry   LandInquiry @relation(fields: [landInquiryId], references: [id], onDelete: Cascade)
  murbbaNo      String? @map("murbba_no") @db.VarChar(100)
  patwarNo      String? @map("patwar_no") @db.VarChar(100)
  khasraNo      String? @map("khasra_no") @db.VarChar(150)
  sortOrder     Int @map("sort_order")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  @@unique([landInquiryId, sortOrder])
  @@index([khasraNo])
  @@index([patwarNo])
  @@map("land_inquiry_jamabandi_entries")
}
```

## 4.5 Migration SQL controls

Add:

- PostgreSQL sequence for Inquiry No.
- source-integrity CHECK:
  - Member/Customer/Club => `source_person_id` present, Another Dealer mobile null.
  - AnotherDealer => `source_person_id` null, mobile present.
- lat/lng: both null or both valid.
- positive numeric checks.
- rate value/rate-basis pairing.
- child Jamabandi row cannot have all 3 identifiers blank.
- partial unique index allowing max one Primary Owner per inquiry:

```sql
CREATE UNIQUE INDEX land_inquiry_one_primary_owner
ON land_inquiry_owners (land_inquiry_id)
WHERE is_primary = true;
```

## 4.6 Delete policy

No hard delete.

Use archive:
- `archived_at`
- `archived_by_id`

Default queries exclude archived.

---

# 5. Received From Logic

## UI
Use a segmented select/dropdown.

When Member/Customer/3% Club:
- show existing search/select component;
- populate read-only current database data;
- store selected Person ID.

When Another Dealer:
- hide person search;
- show only Mobile Number.

When type changes, immediately clear incompatible source state.

## Frontend state

Use a discriminated union so mixed state is impossible:

```ts
type ReceivedFromState =
  | { type: "Member"; sourcePersonId: string; anotherDealerMobile: null }
  | { type: "Customer"; sourcePersonId: string; anotherDealerMobile: null }
  | { type: "Club"; sourcePersonId: string; anotherDealerMobile: null }
  | { type: "AnotherDealer"; sourcePersonId: null; anotherDealerMobile: string };
```

## Server
Revalidate source capability. Never trust client labels.

- Member ID must point to existing valid Member capability.
- Customer ID must point to existing Customer capability.
- Club ID must satisfy the existing codebase’s Club/dealer-source predicate.
- Another Dealer must never call the project’s create/reuse Person helper.

## Database
Enforce the source pair with CHECK constraint.

## Duplicates
- Person-backed sources do not duplicate because they are FKs.
- Another Dealer mobile is **not unique**.
- A matching existing Person mobile may generate an informational warning only; it must not auto-convert the inquiry.

---

# 6. Inquiry Number Generation

Format:

> `LI-000001`

Use one PostgreSQL sequence:

```sql
CREATE SEQUENCE land_inquiry_no_seq START 1;
```

Creation transaction:
1. get `nextval`;
2. format with 6 digits;
3. insert with unique constraint.

Never use:
- frontend generation;
- record count;
- `MAX + 1`.

Frontend shows “Generated after Save” until successful create.

---

# 7. Date Logic

- Backend sets inquiry date from current Asia/Kolkata calendar date.
- Store as PostgreSQL DATE.
- UI is read-only.
- Store audit `created_at` separately as full timestamp.
- User cannot backdate through normal form.

---

# 8. Land Owner Logic

Owners are inquiry-child records, not automatically Persons.

Add:
- Add Owner
- Remove Owner
- Make Primary

Rules:
- first owner becomes Primary;
- only one Primary;
- if Primary deleted, promote lowest `sort_order`;
- if last owner deleted, zero owners is allowed;
- Owner Name required inside any saved owner row;
- owner mobile optional.

Owner operations and primary changes are audited.

---

# 9. Location

Store:
- District
- Tehsil
- Exact Location
- latitude
- longitude

District/Tehsil should not be Prisma enums.

Reuse an existing location master/autocomplete if present; otherwise use searchable text.

Map:
- reuse existing map component;
- otherwise implement a minimal Google Maps pin picker;
- coordinates are authoritative;
- user can load and edit existing pin;
- reject invalid/incomplete pair.

---

# 10. Jamabandi Details

Use repeatable child rows because one land inquiry can involve multiple references.

A row may have one, two or all three:
- Murbba
- Patwar
- Khasra

But an all-empty row must not persist.

Index Khasra for search.

The CRM is recording inquiry information, not legally certifying Jamabandi/title.

---

# 11. Land Details — Rajasthan Area Handling

## Verified design

Do **not** use one universal Bigha conversion for Rajasthan.

Official Rajasthan Land Revenue records publish different land-measure equivalents across different districts/former-state areas. Therefore Bigha/Biswa are local measurements and cannot safely be converted with one statewide constant.

Canonical metric value:

> `area_sq_m`

Exact metric conversions:

```ts
const SQ_M_PER_HECTARE = 10000;
const SQ_M_PER_SQ_FT = 0.09290304;
const SQ_FT_PER_SQ_M = 10.763910416709722;
```

When user enters Hectare/Sq Mtr/Sq Ft:
- convert to canonical Sq Mtr;
- derive other metric displays;
- store original input value/unit to avoid conversion drift.

When user enters Bigha/Biswa:
- store them as entered;
- do not create metric values unless metric area is independently known.

Precision:
- stored metric/Bigha/Biswa: Decimal(20,6)
- display Sq Ft: normally 2 decimals
- Hectare: up to 6 decimals
- never round canonical storage only for display convenience.

Dimensions, Frontage, Road Width, Shape and Boundaries remain independent descriptive/site fields.


# 12. Land Category / Use

Land Category enum:
- Residential
- Commercial
- Industrial
- Agricultural
- Other

Additional optional text:
- Current Land Use
- Master Plan / Zonal Use

Do not make Master Plan/Zonal Use mandatory merely because the land is non-agricultural.

---

# 13. Conversion / Approval

Use one tracking vocabulary for all four fields:

- Unknown
- Not Applicable
- Not Started
- Pending
- Approved
- Rejected

Fields:
- 90A Status
- Land Conversion Status
- Change of Land Use Status
- Patta / Lease Status

Important:

> These are internal status records only. They must not be displayed as a guarantee of title, RERA status, registry, legality or future approval.

---

# 14. Legal Check

Use tri-state `Unknown / Yes / No`.

Positive-document fields:
- Registry / Sale Deed Available
- Mutation Complete

Risk fields:
- Mortgage / Bank Charge
- Court Case / Stay
- Family Dispute
- Acquisition Notice
- Government Restriction

For risk fields, `Yes` means the issue exists/is reported.

Never prefill Unknown as No.

---

# 15. Access & Site Condition

Use `Unknown / Yes / No` for:
- Approach Road
- Electricity
- Water
- Sewerage
- Existing Construction
- Encroachment

Use free text for:
- Road Type
- Possession Status

This avoids inventing an incomplete legal/engineering taxonomy.

---

# 16. Commercial Details

## Currency and precision

Currency = INR.

Persist with Prisma/PostgreSQL Decimal, preferably `Decimal(20,2)`.

Do not persist money using JavaScript floating-point arithmetic.

## Rate basis

When these fields have a numeric value:
- Owner Asking Rate
- DLC Rate
- Expected Purchase Rate

require one supporting basis:

- Total
- Per Bigha
- Per Biswa
- Per Hectare
- Per Sq. Mtr.
- Per Sq. Ft.

A value with no basis is invalid.

## Total Asking Value

Independent user-entered field.

Do **not** auto-overwrite it using Area × Rate because:
- Bigha conversion may be locally variable;
- negotiated total may differ;
- source information must be preserved as stated.

A UI calculation hint may be displayed only when the basis/area conversion is deterministic. The hint must be non-persistent unless the user explicitly copies/enters it.

## Numeric rules

- no negative value;
- no zero when a monetary value is entered;
- UI may accept Indian comma formatting but server parses a normalized decimal;
- display uses Indian number grouping.

## Payment Expectation

Text area, e.g.:
- token expectation;
- balance timeline;
- registry-linked payment;
- other seller expectations.

No accounting entries are generated.

---

# 17. Development Potential

Optional multi-select:

- Residential
- Commercial
- Warehouse
- Agriculture
- Other

Store as enum array.

Rules:
- zero allowed;
- one allowed;
- multiple allowed;
- duplicates removed/rejected.

---

# 18. Documents Received

Optional multi-select checkboxes:

- Jamabandi
- Registry
- Mutation
- Bhu-Naksha
- Khasra Map
- 90A / Conversion Order
- Patta
- Owner ID
- Site Photos
- Location Map

Store as enum array.

This means:

> “The inquiry record says this item was received/available.”

It does **not** mean:
- upload a file;
- create Person KYC;
- use `kyc_documents`;
- verify the document legally.

Inquiry submission must succeed with an empty array.

---

# 19. Evaluation

Section name exactly:

> **Evaluation**

Optional multi-select:

- Site Visit Required
- Legal Verification Required
- Revenue Verification Required

Zero selection is valid.

Do not create:
- Management Interest
- Negotiation Status

---

# 20. Status

Only:

- Working
- Closed

Default:
> Working

Status describes whether the inquiry is operationally open.

It must never be overloaded to represent acquisition progress.

---

# 21. Inquiry Stage

Values in displayed order:

1. New
2. Documents Pending
3. Site Visit
4. Under Verification
5. Negotiation
6. Approved for Acquisition
7. Rejected / Closed

## Normal forward movement

Users may move to the next stage.

## Forward skip

CRM/Admin/MD may skip stages if the land arrives already advanced.

A reason is compulsory when one or more stages are skipped.

## Backward movement

While Status = Working, CRM/Admin/MD may move backward.

Reason compulsory.

## Rejected / Closed

Setting Stage = Rejected / Closed:
- requires close reason;
- automatically sets Status = Closed;
- audits both fields.

## Approved for Acquisition

It does **not** create an acquisition automatically.

It indicates readiness for explicit acquisition hand-off.

## Reopen

Only Admin/MD may reopen a Closed inquiry.

Reason compulsory.

If Stage was Rejected / Closed:
- reopening must choose a valid Working stage.

---

# 22. Status vs Inquiry Stage

## Valid Working combinations

- Working + New
- Working + Documents Pending
- Working + Site Visit
- Working + Under Verification
- Working + Negotiation
- Working + Approved for Acquisition

## Valid Closed combinations

Normal:
- Closed + Rejected / Closed

Also permitted:
- Closed + Approved for Acquisition, after an explicit hand-off/completion action when management chooses to close the inquiry record.

## Invalid

- Working + Rejected / Closed

## Close Inquiry action

If a user closes an inquiry from:
- New
- Documents Pending
- Site Visit
- Under Verification
- Negotiation

the action:
1. asks reason;
2. Status → Closed;
3. Stage → Rejected / Closed;
4. appends audit.

Status and Stage remain two separate database fields.

---

# 23. UI / UX Specification

## 23.1 Navigation

Add **Land Inquiries** to the existing staff navigation.

Use the project’s current icon library and navigation component.

No new design system.

## 23.2 Routes

Recommended App Router routes:

```text
/land-inquiries
/land-inquiries/new
/land-inquiries/[id]
/land-inquiries/[id]/edit
```

If the repository has a consistent modal edit/create convention, Claude Code may preserve that convention while keeping the `/land-inquiries` module boundary.

## 23.3 List page

Header:
- `Land Inquiries`
- `+ New Land Inquiry`

Optional existing-pattern summary cards:
- Working
- Closed
- Approved for Acquisition

Below:
- search
- filters
- server-side table/list

## 23.4 Form layout

Use exactly the 14 business sections:

1. Inquiry Details
2. Land Owner Details
3. Location
4. Jamabandi Details
5. Land Details
6. Land Category / Use
7. Conversion / Approval
8. Legal Check
9. Access & Site Condition
10. Commercial Details
11. Development Potential
12. Documents Received
13. Evaluation
14. Inquiry Stage

Desktop:
- 2 columns for short fields;
- long text full width.

Mobile/tablet:
- 1 column;
- Owner/Jamabandi rows become stacked cards;
- map full-width;
- footer/save controls remain accessible.

## 23.5 Create screen

Read-only display:
- Inquiry No.: `Generated after Save`
- Date: current India date

Received From first.

Only show source control relevant to selected type.

The form may be saved with all optional business sections blank.

## 23.6 Detail screen

Top summary:
- Inquiry No.
- Status badge
- Stage badge
- Received From
- Primary Owner
- District/Tehsil
- Assigned To

Then the 14 sections.

Empty optional values display `—` or remain visually de-emphasized according to existing dashboard style.

## 23.7 Edit screen

Working inquiry:
- authorized users can edit.

Closed:
- read-only by default;
- Admin/MD must Reopen first for normal edits.

## 23.8 Archive

No normal Delete button.

Admin/MD:
> Archive Inquiry

Requirements:
- confirmation;
- reason;
- audit;
- default list hides archived.

## 23.9 Auto-save

Do not add background auto-save unless current repository already has a proven auto-save system.

Use explicit Save/Update.

## 23.10 Loading / empty / errors

Reuse current:
- loading skeleton/spinner;
- toast;
- field error;
- confirmation modal.

Empty example:
> No land inquiries found.

Provide:
- Clear Filters
- New Land Inquiry, if user is authorized.

---

# 24. List / Table View

Recommended columns:

| Column | Behaviour |
|---|---|
| Inquiry No. | clickable to detail |
| Date | India date format |
| Received From | badge/text |
| Owner | Primary Owner; show `+N` additional if useful |
| Location | District / Tehsil / concise exact location |
| Land Area | metric if known; otherwise Bigha/Biswa |
| Asking Rate | INR + rate basis |
| Status | Working/Closed badge |
| Inquiry Stage | stage badge |
| Assigned To | staff display |
| Actions | View/Edit/Close as permitted |

Default sort:

> Inquiry Date DESC, then Inquiry No. DESC

Pagination:
- server-side;
- reuse current page-size convention;
- recommended default 25.

Land Area display:
1. if canonical metric exists, display source metric + optional secondary conversion;
2. else display recorded Bigha/Biswa;
3. else `—`.

---

# 25. Search & Filters

All normal list filtering must be **server-side**.

Do not fetch the whole dataset to the browser.

## Global search

Search across authorized fields:
- Inquiry No.
- Owner Name
- Owner Mobile
- Another Dealer Mobile
- source Person name/mobile
- District
- Tehsil
- Khasra No.

## Filters

- Inquiry No.
- Owner Name
- Mobile
- District
- Tehsil
- Khasra No.
- Received From
- Status
- Inquiry Stage
- Assigned To
- Date From
- Date To
- Archived, Admin/MD only if existing pattern permits.

## Query parameters

Use App Router query params so filter state survives refresh and is server-rendered.

## Database indexes

Required:
- unique Inquiry No.
- Inquiry Date
- Received From
- Status + Stage
- District + Tehsil
- Source Person
- Assigned To
- Owner Name
- Owner Mobile
- Khasra No.
- Archived At

Do not add fuzzy/trigram infrastructure until measured usage requires it.


# 26. API / Backend Specification

## 26.1 Existing-stack decision

The project uses **Server Actions**, not a REST CRUD layer.

Therefore do not introduce `/api/land-inquiries/*` merely to satisfy a generic API format.

Use:
- server query functions for reads;
- React Server Actions for writes.

The route is the UI route; Server Actions are the mutation contract.

## 26.2 Recommended module layout

Claude Code must adapt exact paths to current repository conventions.

```text
src/app/land-inquiries/
  page.tsx
  new/page.tsx
  [id]/page.tsx
  [id]/edit/page.tsx
  actions.ts
  components/
    LandInquiryForm.tsx
    LandInquiryFilters.tsx
    LandInquiryTable.tsx
    OwnerRepeater.tsx
    JamabandiRepeater.tsx
    LandAreaFields.tsx
    MapPinPicker.tsx

src/lib/
  land-inquiry.ts
  land-area.ts
```

Extend the project’s central status/type vocabulary rather than creating disconnected string literals.

## 26.3 Read: `listLandInquiries`

Equivalent purpose: List API.

Input:

```ts
type LandInquiryListFilters = {
  q?: string;
  inquiryNo?: string;
  ownerName?: string;
  mobile?: string;
  district?: string;
  tehsil?: string;
  khasraNo?: string;
  receivedFrom?: LandInquiryReceivedFrom;
  status?: LandInquiryStatus;
  stage?: LandInquiryStage;
  assignedToId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
};
```

Response:
```ts
{
  rows: LandInquiryListRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
}
```

Authorization:
- authenticated staff;
- field visibility follows RBAC.

Errors:
- invalid filter;
- unauthorized archived filter;
- invalid date range.

## 26.4 Read: `getLandInquiry(id)`

Returns:
- inquiry;
- ordered owners;
- ordered Jamabandi entries;
- safe linked source Person fields;
- safe assigned staff fields.

Not found must not expose whether a hidden/unauthorized record exists.

## 26.5 Source lookup

Prefer reuse of current Member/Customer search query/components.

Logical operation:

```ts
searchLandInquirySourcePeople(
  type: "Member" | "Customer" | "Club",
  query: string
)
```

Server must independently enforce capability.

For Club, inspect current repository and reuse its existing source/dealer classification.

## 26.6 Create Server Action

Recommended logical name:

```ts
createLandInquiryAction(input)
```

Steps inside one transaction:

1. validate authenticated session;
2. enforce role;
3. validate `createRequestId`;
4. normalize/validate input;
5. validate related source without creating Person;
6. obtain PostgreSQL Inquiry No. sequence;
7. insert Land Inquiry;
8. insert owners;
9. insert Jamabandi rows;
10. append audit event;
11. return `{ id, inquiryNo }`.

Idempotency:
- `create_request_id` is unique;
- retry with same key returns original successful result rather than creating duplicate.

Common error codes:
- `UNAUTHORIZED`
- `VALIDATION_ERROR`
- `SOURCE_PERSON_NOT_FOUND`
- `SOURCE_PERSON_WRONG_TYPE`
- `INVALID_ANOTHER_DEALER_MOBILE`
- `DUPLICATE_SUBMISSION`
- `CONFLICT`

## 26.7 Update Server Action

```ts
updateLandInquiryAction({
  id,
  version,
  input
})
```

Use optimistic locking.

Update only if submitted `version` equals current `version`.

On success:
- version += 1.

On mismatch:
> This inquiry was updated by another user. Refresh and review the latest information.

Update parent + owner rows + Jamabandi rows in one transaction.

## 26.8 Change Stage

```ts
changeLandInquiryStageAction({
  id,
  version,
  newStage,
  reason?
})
```

Server:
- validates role;
- validates status/stage compatibility;
- requires reason on skip/backward movement;
- RejectedClosed requires close reason and sets Status Closed;
- audits old/new Stage and any linked Status change.

## 26.9 Change Status

```ts
changeLandInquiryStatusAction({
  id,
  version,
  newStatus,
  reason,
  restoredStage?
})
```

Closing intermediate Working inquiry:
- Status Closed
- Stage RejectedClosed

Reopen:
- Admin/MD only;
- reason;
- restored Working stage required if currently RejectedClosed.

## 26.10 Reassign

```ts
reassignLandInquiryAction({
  id,
  version,
  assignedToId,
  reason?
})
```

Use existing staff assignment rules.

## 26.11 Archive

```ts
archiveLandInquiryAction({
  id,
  version,
  reason
})
```

Admin/MD only.

Set archive metadata; do not delete.

## 26.12 Acquisition hand-off

At Stage = ApprovedForAcquisition, show an explicit:

> Start Acquisition

only if the current codebase contains a compatible external acquisition/Purchase-for-Resale action.

The hand-off may prefill data.

It must not:
- silently alter Land Inquiry values;
- automatically create acquisition on stage selection;
- build a duplicate acquisition subsystem.

If no compatible external-land action exists, leave the inquiry at Approved for Acquisition and treat implementation of a new acquisition path as a separate change request.

---

# 27. Permissions / Roles

Reuse existing RBAC.

Recommended matrix:

| Action | MD | Admin | CRM | Accounts | MIS | PC | Member / Customer |
|---|---:|---:|---:|---:|---:|---:|---:|
| View | Yes | Yes | Yes | acquisition-relevant/read if granted | read/masked | read if granted | No |
| Create | Yes | Yes | Yes | No | No | No by default | No |
| Edit Working | Yes | Yes | Yes | No | No | No by default | No |
| Change Stage | Yes | Yes | Yes | No | No | No | No |
| Close | Yes | Yes | Yes | No | No | No | No |
| Reopen | Yes | Yes | No | No | No | No | No |
| Reassign | Yes | Yes | per existing assignment permission | No | No | No | No |
| Archive | Yes | Yes | No | No | No | No | No |
| Owner/source mobile | Yes | Yes | Yes | need-based | masked as current policy | need-based | No |
| Commercial values | Yes | Yes | Yes | acquisition need-based | read if authorized | No by default | No |

Critical:
- no Member portal access;
- no Customer portal access;
- Another Dealer has no account or portal rights;
- UI hiding is not authorization—every Server Action and server query must enforce permission.

---

# 28. Validation Rules

## 28.1 Complete validation matrix

| Field / Rule | Validation |
|---|---|
| Inquiry No. | backend-generated only; unique |
| Inquiry Date | backend-generated; read-only |
| Received From | required; approved enum |
| Member source | existing valid Member Person |
| Customer source | existing valid Customer Person |
| Club source | existing eligible Club/dealer Person |
| Another Dealer | source Person null + valid mobile |
| Another Dealer duplicate mobile | allowed across inquiries |
| Owner rows | optional |
| Owner Name | mandatory inside owner row |
| Owner Mobile | optional; valid if entered |
| Primary Owner | maximum one |
| Map | both coordinates or none |
| Latitude | -90 to 90 |
| Longitude | -180 to 180 |
| Jamabandi row | at least one of Murbba/Patwar/Khasra |
| Bigha/Biswa | positive decimal if entered |
| Metric area | positive decimal |
| Frontage/Road Width | positive + unit |
| Land Category | allowed enum |
| Conversion values | allowed enum |
| Legal/site tri-state | Unknown/Yes/No |
| INR values | Decimal >0 if entered |
| Rate basis | mandatory when corresponding rate entered |
| Negotiable | nullable Boolean |
| Development potential | 0..N unique valid enums |
| Documents | 0..N unique valid enums |
| Evaluation | 0..N unique valid enums |
| Status | Working/Closed only |
| Stage | approved enum only |
| Working + RejectedClosed | invalid |
| Stage skip/back | reason mandatory |
| Reopen | Admin/MD + reason |
| Archive | Admin/MD + reason |
| createRequestId | UUID unique |
| update version | must match current version |

## 28.2 Mobile normalization

Reuse the project’s current helper.

Accept common human formatting:
- spaces;
- hyphens;
- `+91`.

Persist normalized Indian mobile according to existing project convention.

Do not use Another Dealer mobile as a unique master-identity key.

## 28.3 Duplicate inquiry prevention

Hard prevent duplicate technical submissions via `createRequestId`.

Do **not** hard-block two land inquiries merely because they may describe the same land. The same land may reach the company from different sources.

Optional warning may compare:
- District
- Tehsil
- Khasra
- Primary Owner
- source/mobile

but authorized user decides whether to continue.

---

# 29. Audit / History

Integrate with the existing append-only audit system.

Audit at minimum:

- create;
- source type / source record;
- assignment;
- Status;
- Stage;
- owner add/edit/remove;
- Primary Owner change;
- District/Tehsil/Exact Location;
- map coordinates;
- Jamabandi row changes;
- area;
- category/use;
- approval status;
- legal checks;
- site conditions;
- commercial values/rate basis;
- Development Potential;
- Documents Received;
- Evaluation;
- reopen;
- archive.

Each audit event should follow current infrastructure:
- entity type;
- entity ID;
- actor;
- timestamp;
- action;
- before;
- after;
- reason where applicable.

Never hard-delete audit history.

---

# 30. Edge Cases

1. **Multiple owners:** supported.
2. **No owner mobile:** valid.
3. **No owners yet:** valid partial inquiry.
4. **No documents:** valid.
5. **No Evaluation:** valid.
6. **Another Dealer does not exist in database:** correct; save mobile only.
7. **Another Dealer mobile matches existing Person:** do not auto-link; optional warning only.
8. **Same dealer mobile in many inquiries:** valid.
9. **Double-click Create:** one record through idempotency key.
10. **Two users create at same moment:** PostgreSQL sequence produces different Inquiry Nos.
11. **Two users edit same inquiry:** stale version rejected.
12. **Closed inquiry edit:** normal edit blocked.
13. **Primary Owner removed:** promote earliest remaining owner.
14. **Only owner removed:** zero owners allowed.
15. **Invalid pin:** reject.
16. **Only Bigha known:** save Bigha; do not invent metric area.
17. **Only Sq Ft known:** calculate canonical Sq Mtr.
18. **Bigha and metric both known:** store both independently.
19. **Rate without basis:** reject.
20. **Total value without rate:** allowed.
21. **All optional fields blank:** source-valid inquiry still saves.
22. **Network failure after successful create:** retry same create ID returns original.
23. **Source Person deactivated later:** inquiry history/link remains.
24. **Source Person merged:** use existing identity-merge behaviour; do not duplicate Land Inquiry.
25. **Forward stage skip:** reason.
26. **Backward stage change:** reason.
27. **Rejected inquiry reopened:** Admin/MD + reason + working stage.
28. **Approved for Acquisition:** no automatic acquisition.
29. **Archive:** hides from default list, preserves history.
30. **Map service unavailable:** form may save without map because pin is optional.

---

# 31. Migration / Deployment Plan

## Database

1. Add enums.
2. Add 3 new models/tables.
3. Add existing Person/staff FKs.
4. Add Inquiry No. PostgreSQL sequence.
5. Add source/map/numeric/rate check constraints.
6. Add partial Primary Owner unique index.
7. Add indexes.
8. Run Prisma migration and generate.

## Existing data

No old Lead/Customer/Member/Booking record should be converted into Land Inquiry automatically.

No change required to existing records.

## Seed data

No fake Land Inquiry production seed.

Do not seed a universal Rajasthan Bigha conversion.

## Maps environment

Only if an existing map integration cannot be reused:
- add Google Maps browser key using current env naming practice;
- restrict origins in Google Cloud;
- do not commit secrets.

## Deployment order

1. repository inspection;
2. migration in dev;
3. domain validation utilities;
4. queries/actions;
5. UI;
6. staging;
7. UAT;
8. build checks;
9. production migration;
10. application release.

## Rollback

Prefer forward-fix after database migration.

If UI release must be rolled back:
- keep Land Inquiry tables/data;
- remove route/nav access temporarily;
- do not drop tables containing production inquiry data.

---

# 32. Testing Checklist

## Create / source

- [ ] Inquiry No. cannot be manually entered.
- [ ] Inquiry Date cannot be manually entered.
- [ ] Working/New defaults.
- [ ] Member search links existing Person.
- [ ] Customer search links existing Person.
- [ ] 3% Club lookup links eligible existing record.
- [ ] Another Dealer shows only mobile.
- [ ] Another Dealer creates no Person/Member/Customer/Lead/portal record.
- [ ] matching existing mobile does not auto-convert.
- [ ] same Another Dealer mobile can be reused on another inquiry.
- [ ] all optional business fields blank still saves.
- [ ] double submission creates one inquiry.
- [ ] concurrent creations get unique Inquiry Nos.

## Owner

- [ ] first owner auto Primary.
- [ ] multiple owners.
- [ ] mobile optional.
- [ ] blank owner name rejected only when row exists.
- [ ] switch Primary.
- [ ] remove Additional.
- [ ] remove Primary promotes next.
- [ ] remove last owner leaves zero.
- [ ] database cannot hold two Primary owners.

## Location

- [ ] District.
- [ ] Tehsil.
- [ ] Exact Location.
- [ ] map pin create/view/edit.
- [ ] invalid coordinate rejected.
- [ ] map blank allowed.

## Jamabandi

- [ ] one row.
- [ ] multiple rows.
- [ ] all-empty row rejected.
- [ ] Khasra search works.
- [ ] change audited.

## Area

- [ ] Sq Mtr → Hectare.
- [ ] Hectare → Sq Mtr.
- [ ] Sq Ft → Sq Mtr.
- [ ] Sq Mtr → Sq Ft.
- [ ] precision retained.
- [ ] negative area rejected.
- [ ] Bigha stored raw.
- [ ] Biswa stored raw.
- [ ] no universal Bigha conversion.
- [ ] local and metric values can coexist.

## Business fields

- [ ] each Land Category option.
- [ ] Current Land Use optional.
- [ ] Master Plan/Zonal Use optional.
- [ ] all Approval statuses.
- [ ] Legal Unknown remains different from No.
- [ ] all Site fields.
- [ ] INR Decimal values.
- [ ] negative/zero monetary value rejected.
- [ ] rate requires basis.
- [ ] Total Asking Value independent.
- [ ] rupee inquiry values do not affect Booking/Payments/Commission.

## Multi-select

- [ ] Development Potential none/one/many.
- [ ] Documents none/one/many.
- [ ] Evaluation none/one/many.
- [ ] no upload required.
- [ ] no Management Interest.
- [ ] no Negotiation Status.

## Status / Stage

- [ ] forward stage.
- [ ] skip requires reason.
- [ ] backward requires reason.
- [ ] RejectedClosed closes inquiry.
- [ ] Working + RejectedClosed rejected.
- [ ] CRM can close.
- [ ] CRM cannot reopen.
- [ ] Admin/MD reopen with reason.
- [ ] Approved for Acquisition does not auto-create acquisition.

## List / search

- [ ] Inquiry No.
- [ ] Owner Name.
- [ ] Mobile.
- [ ] District.
- [ ] Tehsil.
- [ ] Khasra.
- [ ] Received From.
- [ ] Status.
- [ ] Stage.
- [ ] Assigned To.
- [ ] date range.
- [ ] server pagination.
- [ ] archive excluded by default.

## Permissions

- [ ] portal users cannot access.
- [ ] unauthorized staff action fails server-side.
- [ ] CRM create/edit working.
- [ ] Admin/MD archive/reopen.
- [ ] sensitive data follows masking/need rules.

## Audit / concurrency

- [ ] create audited.
- [ ] stage/status audited.
- [ ] source audited.
- [ ] owners audited.
- [ ] commercial values audited.
- [ ] legal/evaluation audited.
- [ ] stale update gets conflict.
- [ ] transaction rollback prevents partial child updates.

## Responsive

- [ ] desktop.
- [ ] tablet.
- [ ] mobile.
- [ ] owner repeater.
- [ ] Jamabandi repeater.
- [ ] map.

## Build checks

Run:

```bash
npm run check
npx tsc --noEmit
npm run build
```

Extend `scripts/check-rules.ts` (or current equivalent) for:
- Received From discriminated-union rule;
- Status/Stage compatibility;
- exact metric conversion constants;
- explicit absence of a universal Bigha conversion;
- rate/basis pairing.

---

# 33. Implementation Order

1. Inspect repository and confirm actual model/helper/component names.
2. Bind new FK relations to current Person/staff models.
3. Add Prisma enums/models.
4. Add SQL sequence, constraints and indexes.
5. Run migration/generate.
6. Add central Land Inquiry types/constants.
7. Add area conversion utility.
8. Add validation schema using existing validation library/convention.
9. Reuse/build source lookup queries.
10. Build list/detail queries.
11. Build create Server Action.
12. Build update + optimistic locking.
13. Build stage/status/reopen/archive actions.
14. Integrate audit.
15. Add navigation.
16. Build list/filter/pagination page.
17. Build create/edit form.
18. Build Owner repeater.
19. Build Jamabandi repeater.
20. Build metric area controls.
21. Build/reuse Map Pin picker.
22. Build detail page.
23. Add acquisition hand-off CTA only if compatible.
24. Add permission checks.
25. Extend `npm run check` rules.
26. Run typecheck/build.
27. Staging UAT.
28. Deploy migration then application.
29. Verify production create/search/audit.
30. Record deployment and rollback point.

---

# 34. Developer / Claude Code Implementation Prompt

Copy everything inside this block into Claude Code:

```text
Implement the new LAND INQUIRY MANAGEMENT feature inside the EXISTING 3% Club CRM.

DO NOT begin by inventing a new architecture.

FIRST inspect the repository and report:
1. Actual Prisma model names for people/Person, staff users, sessions and audit.
2. Existing auth and role-check helpers.
3. Existing React Server Action conventions and file locations.
4. Existing Member lookup component/query.
5. Existing Customer lookup component/query.
6. How the current project identifies a 3% Club/dealer/source record.
7. Existing list/table/search/filter/pagination components.
8. Existing input/select/checkbox/modal/toast/badge components.
9. Existing Google Maps/map integration, if any.
10. Existing external acquisition/Purchase-for-Resale action, if any.

Known architecture:
- Next.js 16.2.12, React 19, App Router.
- PostgreSQL/Supabase through Prisma 5.
- Signed JWT in httpOnly cookie + session-row validation.
- Server Components read data.
- Client Components hold interaction state and call React Server Actions.
- Do NOT add a REST CRUD layer.
- Tailwind v4 existing dashboard style.
- One unified people identity is reused across Member/Customer capabilities.
- Existing append-only audit must be reused.
- Existing shared status/type constants must be extended instead of scattering literals.

NEW ROUTE:
- /land-inquiries
Recommended:
- /land-inquiries/new
- /land-inquiries/[id]
- /land-inquiries/[id]/edit
Adjust only to match an already-established route convention.

FEATURE PURPOSE:
This is pre-acquisition land sourcing. It is NOT a Customer lead, Booking, Plot, Buyback or Acquisition record.

FORM SECTIONS:
1 Inquiry Details
2 Land Owner Details
3 Location
4 Jamabandi Details
5 Land Details
6 Land Category / Use
7 Conversion / Approval
8 Legal Check
9 Access & Site Condition
10 Commercial Details
11 Development Potential
12 Documents Received
13 Evaluation
14 Inquiry Stage

RECEIVED FROM:
Exactly:
- Member
- Customer
- 3% Club
- Another Dealer

Member:
- search/select existing Member Person;
- link only;
- no duplicate.

Customer:
- search/select existing Customer Person;
- link only.

3% Club:
- search/select the existing record type the current repository uses for eligible Club/dealer/source records;
- do not create a new Club database.

ANOTHER DEALER — CRITICAL:
- only manually entered source field is Mobile Number;
- store it only on the Land Inquiry;
- source_person_id must be null;
- never create/reuse/convert/sync a people row;
- never create Customer/Member/Club/Lead/portal record;
- same mobile may exist on several inquiries;
- even if mobile matches an existing Person, do not auto-link or auto-convert.

INQUIRY NUMBER:
- backend/database generated;
- LI-000001 format;
- PostgreSQL sequence;
- unique/race-safe;
- never count rows or MAX+1;
- frontend cannot edit.

DATE:
- backend current Asia/Kolkata DATE;
- read-only.

STATUS:
- Working
- Closed

STAGE:
- New
- Documents Pending
- Site Visit
- Under Verification
- Negotiation
- Approved for Acquisition
- Rejected / Closed

Status and Stage separate.
Working + Rejected/Closed invalid.
Rejected/Closed => Status Closed + required reason.
Forward stage skip => reason.
Backward stage movement => reason.
Closed inquiry reopen => Admin/MD only + reason.
Approved for Acquisition does NOT automatically create Acquisition.

OWNERS:
- zero or more;
- first owner automatically Primary;
- one Primary max;
- Owner Name required only when owner row exists;
- Owner Mobile optional;
- if Primary removed, promote lowest-order remaining owner;
- if final owner removed, zero owners allowed;
- owners are inquiry-child records, not automatically Person records.

LOCATION:
- District
- Tehsil
- Exact Location
- Google Map Pin
Store lat/lng.
Reuse current map integration; otherwise build minimal picker following existing env/security pattern.

JAMABANDI DETAILS:
repeatable rows:
- Murbba No.
- Patwar No.
- Khasra No.
A saved child row cannot have all 3 blank.
Khasra searchable.

LAND AREA:
UI fields:
- Bigha
- Biswa
- Hectare
- Sq. Mtr.
- Sq. Ft.

IMPORTANT:
Do not hardcode one Rajasthan Bigha factor.
Official Rajasthan land-record rules show local measure equivalence differs by district/former-state area.

Canonical metric storage = square metres.

Use exact metric conversion:
1 hectare = 10000 sq m
1 sq ft = 0.09290304 sq m
1 sq m = 10.763910416709722 sq ft

Store:
- area_sq_m
- metric source unit
- metric source value
- Bigha independently
- Biswa independently

Do not derive metric value from Bigha/Biswa unless a separate verified location-specific conversion configuration is approved later.

LAND DETAILS:
- Dimensions text
- Frontage decimal + Ft/Mtr
- Road Width decimal + Ft/Mtr
- Shape text
- Boundaries text

CATEGORY:
- Residential
- Commercial
- Industrial
- Agricultural
- Other
Plus optional Current Land Use and Master Plan/Zonal Use.

CONVERSION / APPROVAL:
Use:
- Unknown
- Not Applicable
- Not Started
- Pending
- Approved
- Rejected

for:
- 90A Status
- Land Conversion Status
- Change of Land Use Status
- Patta / Lease Status

LEGAL:
Use Unknown/Yes/No:
- Registry / Sale Deed Available
- Mutation Complete
- Mortgage / Bank Charge
- Court Case / Stay
- Family Dispute
- Acquisition Notice
- Government Restriction
For risk fields, Yes means the issue exists.

SITE:
Unknown/Yes/No:
- Approach Road
- Electricity
- Water
- Sewerage
- Existing Construction
- Encroachment
Text:
- Road Type
- Possession Status

COMMERCIAL — EXPLICIT FEATURE EXCEPTION:
Persist INR inquiry/negotiation information:
- Owner Asking Rate
- Total Asking Value
- DLC Rate
- Expected Purchase Rate
- Negotiable
- Payment Expectation

Use Decimal(20,2), not JS float persistence.

Rate fields require basis:
- Total
- Per Bigha
- Per Biswa
- Per Hectare
- Per Sq. Mtr.
- Per Sq. Ft.

Do not auto-overwrite Total Asking Value.

These rupee values must remain isolated from:
- Booking
- Payment Received
- Payment Given
- Commission
- refund
- payout
- accounting/Tally

DEVELOPMENT POTENTIAL:
optional array:
- Residential
- Commercial
- Warehouse
- Agriculture
- Other

DOCUMENTS RECEIVED:
optional checkboxes only:
- Jamabandi
- Registry
- Mutation
- Bhu-Naksha
- Khasra Map
- 90A / Conversion Order
- Patta
- Owner ID
- Site Photos
- Location Map
Zero allowed.
DO NOT implement file upload.

EVALUATION:
optional:
- Site Visit Required
- Legal Verification Required
- Revenue Verification Required
Zero allowed.
DO NOT add Management Interest.
DO NOT add Negotiation Status.

CREATE ONLY THREE NEW TABLES:
- land_inquiries
- land_inquiry_owners
- land_inquiry_jamabandi_entries

Reuse:
- existing people
- existing staff/auth/session
- existing audit
- existing acquisition workflow

Required land_inquiries technical fields:
- UUID id
- unique inquiry_no
- inquiry_date DATE
- received_from enum
- nullable source_person_id
- nullable another_dealer_mobile
- status
- stage
- assigned_to_id using current staff model
- all specified business fields
- enum arrays for development/documents/evaluation
- unique create_request_id UUID
- version integer for optimistic concurrency
- created_by/updated_by/timestamps
- archived_at/archived_by

MIGRATION CONSTRAINTS:
- Person-backed source requires source_person_id and no Another Dealer mobile.
- Another Dealer requires mobile and no source_person_id.
- latitude/longitude both null or both valid.
- positive numeric inputs.
- rate value/basis paired.
- partial unique index: one Primary Owner per inquiry.
- Jamabandi child row cannot be all blank.
- Inquiry No. sequence.

NO HARD DELETE:
Admin/MD archive with reason and audit.

SERVER READS:
- listLandInquiries(filters)
- getLandInquiry(id)
- reuse source lookup queries/components.

SERVER ACTIONS:
- createLandInquiryAction
- updateLandInquiryAction
- changeLandInquiryStageAction
- changeLandInquiryStatusAction
- reassignLandInquiryAction
- archiveLandInquiryAction
- reopenLandInquiryAction
Rename/place only to match established repository convention.

CREATE ACTION:
one DB transaction:
1 auth
2 authorization
3 validate/normalize
4 idempotency create_request_id
5 validate existing source capability WITHOUT person creation
6 sequence inquiry number
7 create inquiry
8 create owners
9 create Jamabandi rows
10 append audit
11 return id/inquiry number

UPDATE:
use version optimistic locking.
Reject stale edits instead of overwriting.

LIST:
server-side pagination/search/filter.
Columns:
Inquiry No, Date, Received From, Primary Owner, Location, Land Area, Asking Rate, Status, Stage, Assigned To, Actions.

FILTERS:
Inquiry No, Owner Name, Mobile, District, Tehsil, Khasra, Received From, Status, Stage, Assigned To, Date Range.

PERMISSIONS:
Use current RBAC.
Recommended:
- CRM/Admin/MD create/edit Working;
- CRM/Admin/MD stage/close;
- Admin/MD reopen/archive;
- Accounts can read acquisition-relevant inquiries if existing permission design supports it;
- MIS read/masked;
- Member/Customer portal no access;
- Another Dealer no login.

AUDIT:
reuse append-only audit.
Audit source, assignment, status, stage, owners, map/location, Jamabandi, area, legal, commercial, documents/evaluation, archive/reopen.

UI:
reuse existing Tailwind/components/design.
No new design library.
Desktop two-column where appropriate; mobile one-column.
Owner and Jamabandi repeaters must be mobile usable.
Do not add background auto-save unless a proven existing project convention exists.

ACQUISITION HAND-OFF:
At Approved for Acquisition, show explicit Start Acquisition only if a compatible existing acquisition action exists.
Never auto-create acquisition from stage change.
Do not create a second acquisition engine.

TEST:
Add pure checks to the current check script for:
- source discriminated union;
- Status/Stage compatibility;
- exact metric area conversion;
- no universal Bigha conversion;
- rate/basis pair validation.

Run:
npm run check
npx tsc --noEmit
npm run build

Staging/UAT must include:
- Another Dealer creates no Person
- same dealer mobile across multiple inquiries
- double-click create creates one
- simultaneous creation gives unique Inquiry Nos
- owner primary promotion
- empty optional fields
- no documents/evaluation
- map validation
- multiple Jamabandi rows and Khasra search
- metric conversions
- Bigha raw storage
- rupee fields remain isolated
- stage skip/back reasons
- close/reopen
- permissions
- audit
- concurrent stale edit conflict
- responsive UI.

WHEN FINISHED REPORT:
1. Repository architecture/components reused.
2. Files created.
3. Files modified.
4. Prisma enums/models added.
5. Migration name and custom SQL constraints/indexes.
6. Server Actions added/changed.
7. Queries added/changed.
8. Components added.
9. Checks/tests added.
10. npm run check result.
11. tsc result.
12. build result.
13. Any assumption discovered.
14. Any risky architectural change you did NOT make because it needs owner approval.

Do not modify unrelated functionality.
Do not silently invent extra business statuses or data models.
```

---

# Research Basis — Rajasthan Area Handling

External verification used for the Land Details decision:

1. **Rajasthan Revenue Department — Rajasthan Land Revenue (Land Records) Rules, 1957, Appendix I**  
   Official PDF:  
   `https://landrevenue.rajasthan.gov.in/content/dam/landrevenue/revenuedepartment/pdf/Rules/land%20records%20rules%2C1957%20updated%202023.pdf`

   Appendix I lists different land-measure equivalents for different Rajasthan districts/former-state areas. This is why the implementation must not hardcode one statewide Bigha/Biswa conversion.

2. **Rajasthan Revenue Department — Form A / Form B under the Rajasthan Land Revenue (Conversion of Agricultural Land for Non-Agricultural Purposes in Rural Areas) Rules, 2007**  
   Official PDF:  
   `https://landrevenue.rajasthan.gov.in/content/dam/landrevenue/revenuedepartment/Rules/scan0044.pdf`

   The form records District, Tehsil, Khasra and area in **hectare or sq. metre**, supporting the use of square metres as the canonical metric area.

---

# Final Implementation Principle

> **Land Inquiry is a controlled pre-acquisition record. It must reuse existing identities and architecture, preserve inquiry facts, allow partial information, and require an explicit hand-off before the land becomes a transaction/acquisition record.**
