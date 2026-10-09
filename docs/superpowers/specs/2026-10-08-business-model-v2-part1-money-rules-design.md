# Business Model v2 — Part 1: Money Rules — Design

| | |
| --- | --- |
| **Source** | [`system/3_Percent_Club_Business_Model_v2_Final_Approved.md`](../../../system/3_Percent_Club_Business_Model_v2_Final_Approved.md) (v2.0) — cited below as **v2 §n** |
| **Date** | 8 October 2026 |
| **Status** | Design approved in conversation on 8 October 2026. Built on the local branch `business-model-v2`; **not pushed** until the owner says so. |
| **Rule** | Build exactly what v2 says. The review and loophole documents (`system/business-model-v2-review.md`, `system/business-model-v2-loopholes.md`) are **not** part of this build. Where v2 is silent and the code must still choose, the choice is listed in §9. |

v2 is delivered in three parts. This is part 1. Part 2 is the Royalty Gift with Stable Buyback Completion; part 3 is the Trip Programme.

---

## v2.1 amendments (9 October 2026) — these override the sections below

Source: [`system/3_Percent_Club_Business_Model_v2.1_Final_Implementation_Baseline.md`](../../../system/3_Percent_Club_Business_Model_v2.1_Final_Implementation_Baseline.md), cited **v2.1 §n**. It supersedes v2.0. The owner's answers of 9 October 2026 are marked *(owner)*.

1. **Freeze (v2.1 §16, §17).** The terms that count are those frozen on the Booking Request version Accounts approves. This is what §2 already does: each submission freezes, a corrected submission re-freezes, and approval makes it permanent. Each review snapshot now also stores the frozen version's ID. A rejected request earns nothing.
2. **Customer-closing Loyalty is limited to 3 successful events for life (v2.1 §21, §25).** Repeat-purchase Loyalty stays unlimited. A Loyalty record is *qualified* when it reaches its milestone (`CommissionRecord.qualifiedAt`). When a Customer-closing record reaches its milestone and the closer already has three qualified, uncancelled Customer-closing records, it is Cancelled with the reason "Membership activation is required to earn from further third-party sales". A qualified record that loses its milestone is un-qualified. This **replaces** the Membership invitation task in §4: v2.1 §25 makes it a block, not an invitation.
3. **A Sold By Customer must be a real existing Customer (v2.1 §22).**
   - **Own approved purchase** — checked when Sold By Customer is chosen (submission, revision, Sold By Correction). The closer needs an approved, uncancelled Booking as Primary Customer. Otherwise the request is refused.
   - **Verified KYC** — Aadhaar status `VERIFIED` *(owner)*. Until then the Customer-closing Loyalty record is On Hold: `CLOSER_KYC_PENDING`.
   - **Accepted Customer Terms** — CRM records the acceptance on the Customer (Terms version reference + acceptance date) *(owner)*; the Terms text is supplied later. Until it is recorded the record is On Hold: `CUSTOMER_TERMS_PENDING`.
   - A closer who is related to the buyer or is a co-buyer is not disqualified (v2.1 §22, §83.2). Closing for oneself as Primary Customer is still the existing conflict.
4. **Buyback minimum (v2.1 §41, §49).** An Approved Buyback stands in for the Loyalty milestone only when the source Booking has at least 25% verified Payment Received. The same 25% applies to the Royalty link becoming final through a Buyback.
5. **Not in part 1 *(owner)*:** Recovery Outstanding, set-off, the 15-day deadline and Circumvention Review (v2.1 §19, §67, §74); one bank account per Person (§77); staff conflict approval (§72). A paid record that becomes invalid keeps today's Accounts Adjustment Required. Commission settings live on the Project page only, not on the create form *(owner)*.

---

## Goal

Each Project's sale commission comes from an MD-approved, versioned Project setting, frozen onto the Booking at Booking Request submission (v2 §12–§17). Direct and Loyalty follow v2 §11 and §19–§24. Everything v2 §1 retires from the money side is removed: monetary Invite bands, positions and cycles; monetary Royalty bands, positions and cycles; the 3-Loyalty lifetime limit; the fixed 3% Direct; and the combined 4% cap.

---

## 1. Project commission versions (v2 §12–§15)

**New model `ProjectCommissionVersion`**, one row per version per Project:

| Field | Meaning |
| --- | --- |
| `projectId`, `version` | Numbered 1, 2, 3 … per Project; never reused. |
| `status` | `DRAFT` → `PENDING_APPROVAL` → `ACTIVE` → `SUPERSEDED`, or `REJECTED` |
| `directEnabled`, `directPercent` | Direct on/off and rate |
| `loyaltyEnabled`, `loyaltyPercent` | Loyalty on/off and rate (one rate for both Loyalty routes, v2 §21) |
| `loyaltyExceptionReason` | Required when an MD exception is needed (see below) |
| `reason` | Why this version exists |
| `preparedByRef`, `preparedAt`, `submittedAt` | Admin who prepared it, and when it was sent to MD |
| `decidedByRef`, `decidedAt`, `decisionNote` | MD's approval or rejection |
| `effectiveFrom`, `effectiveTo` | Set at approval and when superseded |

**Flow (v2 §14).**
1. Admin creates a Draft. A Draft is the only state that can be edited.
2. Admin sends it to MD → `PENDING_APPROVAL`. It can no longer be edited (v2 §14 "no silent overwrite").
3. MD approves → `ACTIVE`, effective at once. The previous Active version becomes `SUPERSEDED`. Or MD rejects with a note → `REJECTED`, and Admin can prepare a new Draft.

Only `ADMIN` prepares and sends. Only `MD` approves or rejects. At most one Draft or Pending version per Project at a time, and exactly one Active version at most.

**Validation (v2 §13)**, enforced in the domain and as database `CHECK` constraints:
- Enabled ⇔ a rate is present. A benefit not offered is **Disabled**, never 0%.
- `0 < directPercent ≤ 5`; `0 < loyaltyPercent ≤ 3`.
- If Loyalty is Enabled **and** (Direct is Disabled **or** Loyalty ≥ Direct), `loyaltyExceptionReason` is required. MD's approval of the version is the MD exception, with its reason and audit.

Trip settings join this model in part 3.

---

## 2. Freeze at Booking Request submission (v2 §16, §17, §20, §24)

**New fields on `Booking`:**
- `commissionVersionId` — the Project's Active version.
- `loyaltySubjectDeactivated` — whether the Person who would earn Loyalty held a Deactivated Member capability.

The existing `originalClassification` (buyer is an Active Member or not) moves from Accounts approval to submission.

**When they are set.**
- At Booking Request submission.
- Again when a corrected request is sent (`reviseBookingRequest`), because that is a new submission.
- They never change after Accounts approval.

**No Active version** → the Booking Request cannot be submitted: "This Project has no approved commission settings."

**Other paths.**
- **Accounts review:** Accounts sees the frozen Direct and Loyalty terms in the request snapshot it approves.
- **Change Plot within the same Project:** the same Booking continues, so the frozen version stays (v2 §74). Across Projects it is a cancellation and a new Booking, as today.
- **Sold By Correction:** recalculates with the Booking's **frozen version** (v2 §75). It re-reads `loyaltySubjectDeactivated` for the corrected closer.

---

## 3. Who earns what (v2 §11, §19–§24)

The pure engine `generateCommission()` is rewritten. Its input carries the frozen version instead of fixed rates and network bands.

| Final Sold By | Buyer | Component | Rate | Milestone |
| --- | --- | --- | --- | --- |
| Member | Active Member buying for themselves (frozen) | DIRECT → that Member, if Direct Enabled | frozen Direct | 100% |
| Member | anyone else | DIRECT → selling Member, if Direct Enabled | frozen Direct | 25% |
| Customer | anyone else | LOYALTY (closing Customer), if Loyalty Enabled and not `loyaltySubjectDeactivated` | frozen Loyalty | 100% |
| 3% Club | buyer with an earlier purchase | LOYALTY (repeat purchase) → buyer, if Loyalty Enabled and not `loyaltySubjectDeactivated` | frozen Loyalty | 100% |
| 3% Club | first purchase | nothing | — | — |

**Kept conflicts.** These still stop Accounts approval, as today:
- Active Member buyer whose Sold By is not that Member;
- Sold By Member or Customer with no Person;
- Sold By Customer who is the buyer.

**New conflict:** a Booking with no frozen version.

**Never on the same sale (v2 §11):**
- Direct and Loyalty.
- A self-purchase never has Loyalty (v2 §20).
- A Member-closed repeat purchase never has Loyalty (v2 §23).

**"Earlier purchase"** stays as the code reads it today: an earlier-submitted Booking of the same buyer that Accounts approved and that was not cancelled.

**No cap.** The combined 4% cap is gone (v2 §11).

**`ruleVersion` strings** carry the Project version, e.g. `DIRECT/THIRD_PARTY/V2/3%@25` and `DIRECT/SELF_PURCHASE/V2/3%@100`. The `SELF_PURCHASE` token is kept for the existing classification evidence reader.

---

## 4. Eligibility and lifecycle (v2 §19–§25)

- **Milestones** are as in the table. Approved Buyback stays the alternative milestone for **Loyalty only**; it never accelerates Direct (v2 §20, §21).
- **Holds and payout conditions** are unchanged: Aadhaar, verified bank, RERA for Member components (now Direct only), Member Commission Hold, Deactivated, deal processes, and Paid Early with MD approval.
- **Unlimited Loyalty** (v2 §21). The Loyalty opportunity ledger is removed. A new partial unique index allows at most one current `LOYALTY` record per Booking.
- **Membership invitation** (v2 §25). When a Customer-closing Loyalty record reaches its milestone and that Customer now has three or more such qualified records, a CRM task "Membership invitation" is created for that Person, once. It blocks nothing, and later Loyalty is unaffected.

---

## 5. Removed

**Schema**
- `CommissionType.INVITE`, `CommissionType.ROYALTY`.
- `BeneficiaryRole.INVITING_MEMBER`, `BeneficiaryRole.INTRODUCING_MEMBER`.
- `EligibilityState.NO_BENEFIT`.
- `CommissionHoldReason.COMMISSION_CONFLICT_ABOVE_4`.
- `CommissionOpportunity`, with `OpportunityKind`, `OpportunityStatus` and `CommissionRecord.opportunityId`.
- `PerformanceCycle`, with its enums.
- `MemberProfile`: `invitePosition`, `inviteRatePercent`, `inviteYearStart`, `inviteCycleId`.
- `CustomerProfile`: `introducedPosition`, `introducedRatePercent`, `introducedYearStart`, `royaltyPosition`, `royaltyRatePercent`, `royaltyYearStart`, `royaltyCycleId`, `loyaltySlotsConsumed`.

**Code**
- Network bands, positions and counters.
- `cycle-service.ts`, and the anniversary cycle job in `jobs.ts`.
- The 4% cap.
- The "No Benefit" state.
- Fixed `DIRECT_PERCENT` / `LOYALTY_PERCENT`.

**Kept**
- Who invited whom (`invitedByMember`), which part 3 needs.
- The Royalty Linked Member link — provisional, then final at 100% or Approved Buyback (v2 §49–§51) — which part 2 needs.
- Buying Commission, unchanged.

---

## 6. Screens

- **Project page** — new *Commission settings* section:
  - the Active version;
  - any Draft or Pending version;
  - history;
  - Admin: prepare, edit and send;
  - MD: approve or reject with a note.
- **Booking Request (submit, revise, Accounts review, Booking detail)** — the frozen Direct and Loyalty terms and their version number.
- **Calculator** — pick a Project; it uses that Project's Active version. Bands, positions and the cap are removed.
- **Member portal** — network positions, bands and cycles are removed. Each deal shows its frozen rate and status (v2 §69).
- **Member and Customer profiles, Members and Customers lists, Reports** — positions, bands, cycles, "x of 3 Loyalty" and cap figures are removed.

---

## 7. Data and migration (v2 §73, §81)

- One Prisma migration plus `constraints.sql` additions: CHECKs, one Active per Project, one Draft or Pending per Project, and one current Loyalty per Booking.
- Only mock data exists, so the local database is reset (`npm run data:reset`) before migrating. There is no legacy transition (v2 §81).
- Every seed script runs under v2:
  - old Invite, Royalty and cycle setup is removed;
  - every seeded Project gets an approved version (Direct 3%, Loyalty 1%, so the mock scenarios still read naturally).
- The UAT narrative documents (`system/mock-data-*.md`) describe the old model and are not rewritten in part 1.

---

## 8. Testing

**`npm run check`** (pure checks, no database, plus `tsc`). The engine is checked:
- row by row: third-party Direct at 25%, self-purchase Direct at 100% with nothing else, Customer-closing Loyalty, repeat-purchase Loyalty, first purchase nothing;
- Direct Disabled, Loyalty Disabled, and a Deactivated Loyalty subject;
- every kept conflict, and the new one;
- no cap even at Direct 5%;
- version validation: ceilings, Disabled-versus-0, exception reason;
- `buybackAccelerates` (Loyalty only);
- eligibility without "No Benefit" or the cap.

**`npm run db:check`** (database suites). The commission suite is rewritten for v2:
- **Approval flow:** Admin prepares; MD approves; Admin cannot approve; MD cannot prepare; reject with a note; approval supersedes; one Draft or Pending at a time.
- **Freeze:** submitted under version 1, version 2 approved, Accounts approves → the records carry version 1. A corrected request after version 2 → version 2. No Active version → submission blocked.
- **Loyalty:** unlimited (a fourth and fifth Loyalty for one Customer still pay); at most one per Booking.
- **Buyback:** accelerates Loyalty, not Direct.
- **Membership invitation:** a task at the third qualified Customer-closing Loyalty, not at the second.
- **Sold By Correction:** uses the frozen version, not today's.
- **Change Plot:** keeps the version.

Checks for removed rules are deleted. Every suite that touched removed fields is updated.

---

## 9. Choices where v2 is silent

| # | Question | Choice (closest to v2's own words) |
| --- | --- | --- |
| 1 | A corrected Booking Request is sent again before approval — which submission freezes? | Each submission freezes; the version Accounts approves is the one that counts. Approval makes it permanent. |
| 2 | A Project with no Active version | The Booking Request cannot be submitted (v2 §13: benefits are set explicitly, never silently). |
| 3 | When a version takes effect | At MD approval. No future-dated or backdated versions. |
| 4 | Who prepares | Admin only, so MD's approval is always a second person (v2 §14). |
| 5 | "Loyalty lower than Direct" when Direct is Disabled | Treated as needing the MD exception and its written reason. |
| 6 | When the Deactivated-Member test for Loyalty is read | At submission, frozen with the Booking (v2 §24 "protected Booking Requests keep their frozen treatment"). On a Sold By Correction, re-read for the new closer. |
| 7 | "Third successful Customer-closing Loyalty event" (v2 §25) | The third Customer-closing Loyalty record to reach its milestone (100% or Approved Buyback). The task is created once. |

---

## 10. Not in part 1

- Royalty Gift, Royalty Credit and Stable Buyback Completion — part 2.
- Trip Programme, Own-Sale and Reference Credits, and the inviter freeze at Membership Application (v2 §26) — part 3.
- **Member and Customer Terms text.** v2 §80 requires it updated before go-live but gives no text, so the owner supplies it.
- Economics-review metadata (v2 §68, "if desired").
- Marketing material outside the CRM (v2 §70–§71).
