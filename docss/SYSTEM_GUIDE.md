# 3% Club Real Estate CRM — Complete System Guide

> **Version:** Business Model v2 · CRM v3.1
> **Brand:** 3% Club Real Estate / 3% Real Estate Club
> **Owner:** 3% Club / Thirty Milestones LLP
> **Tech Stack:** Next.js 15 (App Router) · TypeScript · Prisma · PostgreSQL (Supabase, Mumbai) · Tailwind CSS · Radix UI · Framer Motion

---

## Table of Contents

1. [What This System Is](#1-what-this-system-is)
2. [Architecture Overview](#2-architecture-overview)
3. [Directory Layout](#3-directory-layout)
4. [Business Positioning & Brand Rules](#4-business-positioning--brand-rules)
5. [Core Entities](#5-core-entities)
6. [Member Lifecycle](#6-member-lifecycle)
7. [Customer Lifecycle](#7-customer-lifecycle)
8. [Project Settings & Versioning](#8-project-settings--versioning)
9. [Booking Flow & Freeze Rules](#9-booking-flow--freeze-rules)
10. [Commissionable Sale Value](#10-commissionable-sale-value)
11. [Project Direct Commission](#11-project-direct-commission)
12. [Customer Loyalty](#12-customer-loyalty)
13. [Sales & Reference Trip Reward](#13-sales--reference-trip-reward)
14. [Royalty Relationship Reward](#14-royalty-relationship-reward)
15. [Buying Commission](#15-buying-commission)
16. [Recovery & Holds](#16-recovery--holds)
17. [Payment Model](#17-payment-model)
18. [Payout Policy](#18-payout-policy)
19. [Staff Roles & Permissions](#19-staff-roles--permissions)
20. [Security & Identity](#20-security--identity)
21. [Dashboard & Tasks](#21-dashboard--tasks)
22. [Rewards Overview Dashboard](#22-rewards-overview-dashboard)
23. [Member Portal](#23-member-portal)
24. [Hold System](#24-hold-system)
25. [Buyback & Acquisition](#25-buyback--acquisition)
26. [Sold By Classification](#26-sold-by-classification)
27. [Anti-Fraud Controls](#27-anti-fraud-controls)
28. [Owner-Accepted Commercial Risks](#28-owner-accepted-commercial-risks)
29. [Operational Scripts & Commands](#29-operational-scripts--commands)
30. [Go-Live Prerequisites](#30-go-live-prerequisites)
31. [Glossary](#31-glossary)

---

## 1. What This System Is

3% Club CRM is a **plotted real-estate CRM** built for a membership-based property network. It manages:

- **Members** — property dealers, brokers, consultants, and relationship-rich businesspeople
- **Customers** — end-buyers of property
- **Projects** — real estate developments with configurable commission and reward settings
- **Bookings** — property transactions with full approval workflows
- **Commissions** — Project Direct Commission and Customer Loyalty
- **Trip Rewards** — non-cash performance-based travel rewards
- **Royalty Gifts** — non-cash relationship-based gift rewards
- **Acquisitions / Buybacks** — Company purchases of property back from Customers
- **Land Inquiries** — pre-acquisition land evaluation

**IMPORTANT: This is a percentage-only financial model.** No rupee value is stored or calculated anywhere — not in Bookings, payments, commissions, or acquisitions. This is a hard requirement, not a simplification.

### Core Proposition

> **YOUR BUSINESS RELATIONSHIPS SHOULD GROW BEYOND ONE DEAL.**

The system rewards genuine property activity under explicit, frozen, and auditable rules.

---

## 2. Architecture Overview

The entire system is **one Next.js application** — screens, business rules, and API endpoints live in a single codebase and single deployment. There is no separate backend service.

```
Browser ──▶ Next.js (Server Components, Server Actions, /api routes)
                        │
                        └──▶ PostgreSQL (Supabase, Mumbai)
                                  └── constraints + triggers = last guard
```

### Key Design Principles

| Principle | Implementation |
|---|---|
| **Percentage-only** | No rupee values anywhere in the system |
| **Refuse, don't guess** | Undocumented combinations become Commission Conflicts for Admin correction |
| **Frozen versions** | Every Booking permanently stores its exact frozen Project Settings Version ID |
| **No backdating** | A Project Settings Version cannot become effective earlier than its approval time |
| **No retroactive eligibility** | Later improvements do not retroactively improve earlier Bookings |
| **Immutable audit trail** | Every state change runs inside one transaction with an idempotency key |
| **IST timezone** | All business times are Asia/Kolkata |

---

## 3. Directory Layout

| Path | Purpose |
|---|---|
| `src/app/` | **Screens.** Each module = `page.tsx` (server) + `*-client.tsx` (browser) + `actions.ts` (server actions) |
| `src/lib/domain/` | **Pure business rules.** No database, no framework — unit-checkable logic |
| `src/lib/services/` | **Commands.** Every state change runs here, inside one transaction with an idempotency key |
| `src/lib/security/` | **Security.** Permissions, sessions, passwords, lockout, Aadhaar/PAN encryption, blind indexing |
| `src/lib/migration/` | Reconciliation rules for migrated databases |
| `prisma/` | Schema, migrations, constraints Prisma cannot express, seed data, and check suite |
| `system/` | Approved requirements — `prd-complete.md` governs; code follows it |
| `docss/` | Business Model v2 documentation — the Single Source of Truth and all supplements |

### App Routes

| Route | Module |
|---|---|
| `/dashboard` | Dashboard with task management |
| `/members` | Member management and profiles |
| `/members/[id]` | Individual Member profile — Trip, Royalty, commission, history |
| `/customers` | Customer management |
| `/bookings` | Booking approval workflow |
| `/projects` | Project configuration and settings |
| `/plots` | Plot/inventory management |
| `/acquisitions` | Buyback/acquisition management |
| `/rewards` | Rewards overview — monetary, Trip, Royalty, reviews |
| `/reports` | Reporting |
| `/enquiries` | Enquiry management |
| `/land-inquiries` | Land inquiry evaluation |
| `/portal` | Member-facing portal |
| `/calculator` | Commission calculator |
| `/administration` | Admin functions |
| `/login` | Authentication |

### Services Layer (29 service files)

| Service | Domain |
|---|---|
| `booking-service.ts` | Booking creation, approval, amendment |
| `commission-service.ts` | Commission calculation and lifecycle |
| `commission-settings-service.ts` | Project settings versioning |
| `trip-service.ts` | Trip credit, bucket, and reward management |
| `royalty-service.ts` | Royalty relationship and gift lifecycle |
| `royalty-programme-service.ts` | Royalty programme versioning |
| `acquisition-service.ts` | Buyback/acquisition workflow |
| `payment-service.ts` | Payment recording and verification |
| `recovery-service.ts` | Recovery creation and resolution |
| `cancellation-service.ts` | Booking cancellation handling |
| `change-plot-service.ts` | Plot change within/across Projects |
| `hold-service.ts` | Plot hold and extension management |
| `inventory-service.ts` | Plot inventory management |
| `network-service.ts` | Member network and inviter relationships |
| `merge-service.ts` | Identity merge workflow |
| `bank-service.ts` | Bank account management and verification |
| `benefit-control-service.ts` | Benefit release controls |
| `control-review-service.ts` | Staff conflict and circumvention reviews |
| `customer-closer-service.ts` | Customer-closing eligibility |
| `project-service.ts` | Project configuration |
| `enquiry-service.ts` | Enquiry management |
| `land-inquiry-service.ts` | Land inquiry evaluation |
| `report-service.ts` | Report generation |
| `task-service.ts` | Task lifecycle |
| `admin-service.ts` | Admin operations |
| `sold-by.ts` | Sold By classification logic |
| `plc-service.ts` | PLC handling |
| `completion-service.ts` | Buyback completion tracking |
| `command.ts` | Command infrastructure |

---

## 4. Business Positioning & Brand Rules

### What 3% Club IS

- A real-estate business membership network for serious property professionals and relationship-rich local businesspeople
- Selected Project opportunities, professional identity, business support, performance rewards

### What 3% Club is NOT (never use publicly)

- CRM / software / passive income / MLM / downline / team income / chain income / recruitment income / scheme

### Brand Name Rule

> **"3% Club" is the brand name. It is NOT a promise that every Project pays 3% Direct Commission.**

Correct wording: *"Applicable Direct Commission is Project-specific and disclosed before the relevant Booking."*

### Official Terminology

**Use these terms:**
- Membership Opportunity, Business Membership, Real-Estate Business Network
- Project Direct Commission, Customer Loyalty
- Sales & Reference Trip Reward, Own-Sale Credit, Reference Credit, Trip Target
- Royalty Relationship Reward, Royalty Credit
- Buying Commission, Stable Buyback Completion

**Never use publicly:**
- passive income, indirect income, downline, team income, chain income, recruitment income, scheme

### Target Market

- Property dealers, real-estate agents, brokers, property consultants
- Relationship-rich local businesspeople in Tier-3 cities and smaller towns

### Launch Membership

> **First-year Membership is complimentary.**

Complimentary Membership does not guarantee: income, leads, sales, allocations, commissions, Trips, Gifts, or future renewal pricing.

---

## 5. Core Entities

### Person

The foundational identity record. Both Members and Customers sit on the same Person.

- `fullName`, `primaryMobile`, `altMobile`, `email`, `city`, `addressLine`, `dateOfBirth`
- Aadhaar/PAN with encryption and blind indexing
- Bank details with verification workflow
- One verified bank account = one Person (joint account exception requires MD approval)

### Member (MemberProfile)

A Person who has been activated as a 3% Club Member.

- `memberId` — e.g. `MEM-000218`
- Status: **Active** / **Deactivated**
- RERA status tracking
- Commission Hold capability
- Portal access with password and lockout
- Inviter relationship (frozen at Membership Application submission)

### Customer (CustomerProfile)

A Person who has purchased property.

- `customerId` — e.g. `CUS-003391`
- Customer Terms acceptance
- KYC verification status
- Customer-closing eligibility tracking

### Project

A real estate development with independently configurable settings.

- Direct Commission (Enabled/Disabled, rate up to 5%)
- Customer Loyalty (Enabled/Disabled, rate up to 3%)
- Trip Programme (Enabled/Disabled, targets, composition)
- Versioned settings with MD approval workflow

### Plot

Individual property units within a Project.

- `plotNumber`
- PLC (Preferential Location Charge) handling
- Eligible/excluded inventory for Trip Programmes

### Booking

A property transaction record.

- `bookingNumber` — e.g. `BKG-000001`
- Frozen Project Settings Version ID
- Primary Customer + Additional Customers
- Sold By classification
- Payment tracking (percentage-based)
- Approval workflow

---

## 6. Member Lifecycle

```
Application → Activation (Active) → [Deactivation → Reactivation] → ...
```

### Active Member Can

- Sell to third-party Customers and earn Direct Commission
- Self-purchase and earn Direct at 100% milestone
- Accumulate Trip Credits (Own-Sale + Reference)
- Be a Royalty Linked Member
- Access the Member Portal

### Deactivated Member

- May buy property as a normal Customer
- **Cannot** personally earn Customer-closing Loyalty or repeat-purchase Loyalty
- Trip fulfilment is held until valid reactivation
- Royalty Gift fulfilment is held until reactivation
- Reward/history remains recorded
- Another Member may sell to them under normal Member-sale rules

### Inviter Rules

- Inviter freezes at Membership Application submission
- No inviter may be added/changed after the introduced Member's first Reference-eligible Booking Request is submitted
- A previous selling Member is NOT automatically the Membership inviter
- Correction requires Admin/MD authority + reason + audit trail

### Joining Creates

> **No commission, no Trip Credit and no Royalty Reward.** Joining alone creates zero progress.

---

## 7. Customer Lifecycle

### Becoming a Customer

A Customer is created when a Person makes a property purchase through the system.

### Customer to Member Conversion

- A Customer may apply to become a Member at any time
- If a valid inviter exists, the inviter freezes at Membership Application submission
- An Active Member cannot use Customer-closing Loyalty for their own selling activity

### Customer-Closer Eligibility

To act as a "Sold By Customer" closer:

- Must have their own approved personal purchase
- Verified KYC required
- Accepted Customer Terms required (authorised payment handling, no unofficial receipts, no unauthorised promises, marketing restrictions)
- Maximum **3 successful Customer-closing Loyalty events for life**
- After the third: must become an Active Member to continue earning from third-party selling
- A random non-Member Person cannot be used merely as a Customer closer

---

## 8. Project Settings & Versioning

Each Project independently configures:

### Direct Commission Settings

- Enabled / Disabled
- Direct percentage (max 5%)

### Customer Loyalty Settings

- Enabled / Disabled
- Loyalty percentage (max 3%)

### Trip Programme Settings

- Enabled / Disabled
- Total Trip Target (e.g. 9)
- Minimum Own-Sale Credits (e.g. 6)
- Maximum Reference Credits (e.g. 3)
- Eligible / excluded inventory
- Programme Code (e.g. `TRIP-A`)
- Programme Version reference
- Trip Terms/PPT Version
- Cut-off date (optional)
- Wind-down deadline (optional)

### Versioning Rules

1. Admin prepares → MD reviews → MD approves → Version becomes Active
2. No silent overwrite permitted
3. Each material change creates a **new immutable version**
4. Old versions remain historical
5. **No backdating** — a version cannot become effective earlier than its approval time
6. Every approved Booking permanently stores the exact frozen Version ID

### Rate Limits

| Benefit | Hard Maximum |
|---|---|
| Project Direct Commission | **5%** |
| Customer Loyalty | **3%** |

If Direct is Disabled with Loyalty Enabled, or Loyalty >= Direct, the Project may proceed only with **explicit MD exception + written commercial reason + audit trail**.

### Code Constants (from `src/lib/domain/commission.ts`)

```typescript
DIRECT_MAX_PERCENT = "5"
LOYALTY_MAX_PERCENT = "3"
DIRECT_MILESTONE = "25"       // 25% for third-party
FULL_MILESTONE = "100"        // 100% for self-purchase and Loyalty
CUSTOMER_CLOSING_LOYALTY_LIMIT = 3
BUYBACK_MIN_SOURCE_PAYMENT = "25"
```

---

## 9. Booking Flow & Freeze Rules

### Booking Request to Approval

1. Booking Request submitted
2. Accounts reviews
3. Accounts approves (or rejects/returns)
4. Approved Booking permanently stores frozen Version ID

### Final Booking Freeze Rule

> The commercial/reward version that applies is **the Booking Request version that Accounts ultimately approves**.

- Rejected request freezes nothing
- Abandoned request freezes nothing
- Materially edited/resubmitted request uses the submission timestamp/version of the request Accounts finally approves

### No Retroactive Eligibility

Later Direct increase, Loyalty increase, Trip activation, target reduction, Gift improvement, or inventory expansion **does not retroactively improve an earlier Booking**.

---

## 10. Commissionable Sale Value

```
Commissionable Sale Value = (Final Approved Base Property Value + Applicable PLC) - Authorised Discount
```

### Include

- Final approved Base Property Value
- Applicable PLC

### Exclude

- GST/tax, stamp duty, registration, government levy
- Documentation, maintenance, utilities
- Finance charges, interest, penalties
- Refunds, pass-through amounts

**WARNING:** Off-book concessions (cashback, free upgrades) do **not** automatically reduce Commissionable Sale Value unless formally recorded as Authorised Discount. This is an Owner-accepted commercial risk.

---

## 11. Project Direct Commission

### Third-Party Member Sale

| Condition | Requirement |
|---|---|
| Member status | Active |
| Sold By | Member |
| Project Direct | Enabled |
| Transaction | Otherwise eligible |
| **Milestone** | **Full entitlement at 25% verified Payment Received** |

- Uses the frozen Project Direct rate
- May be earned on **unlimited** qualifying third-party sales
- Only one selling Member receives Direct on one sale

### Formal Member Self-Purchase

Triggered **only when the Primary Customer is an Active Member**.

| Rule | Value |
|---|---|
| Direct | Buyer-Member receives Project Direct if Enabled |
| Rate | Frozen Project Direct rate |
| **Milestone** | **100% verified Payment Received** |
| Second seller Direct | None |
| Customer Loyalty | None |
| Trip Credits | May create Own-Sale Credits |
| Reference Credit to inviter | None from self-purchase |
| Buyback acceleration | No |

### Related-Party Sales

A Member may sell to spouse, parent, child, sibling, or other related person and still receive normal third-party sale treatment if the formal self-purchase rule is not triggered. This is intentional. Fraud, sham and collusive transactions remain prohibited.

### Protection at 25% — Recovery Rules

Because full Direct eligibility triggers at 25%:

- Unpaid Direct is cancelled if entitlement later becomes invalid
- Paid invalid Direct becomes **Recovery Outstanding**
- Recovery may be set off against future monetary benefits
- Accounts Recovery Reference must be recorded

### Change Plot Impact on Direct

If Direct was already paid and Booking changes to a cheaper unit:
- Frozen percentage/version remains
- Direct amount is recalculated using the final valid unit's Commissionable Sale Value
- Overpayment becomes Recovery
- Underpayment follows normal approval

---

## 12. Customer Loyalty

Two routes exist, both using the frozen Project Loyalty rate.

### Route 1: Customer-Closing Loyalty

| Rule | Value |
|---|---|
| Closer | Real existing Customer with own approved purchase |
| KYC | Verified |
| Customer Terms | Accepted |
| **Lifetime limit** | **3 successful Customer-closing Loyalty events** |
| After 3rd | Must become Active Member to continue |
| **Milestone** | **100% verified Payment Received** |
| Buyback alternative | Requires >= 25% source Payment Received |

### Route 2: Repeat-Purchase Loyalty

| Rule | Value |
|---|---|
| Quantity limit | **Unlimited** |
| First purchase | Never earns repeat-purchase Loyalty |
| Time gap | None required (same-day qualifies) |
| Member-closed | Does NOT generate Customer Loyalty |
| **Milestone** | **100% verified Payment Received** |
| Buyback alternative | Requires >= 25% source Payment Received |

### Hard Rule: Direct vs Loyalty

> **A single sale cannot generate both Project Direct Commission AND Customer Loyalty to different closers.**

| Final Classification | Monetary Treatment |
|---|---|
| Sold By Member | Project Direct Commission |
| Formal Member self-purchase | Buyer-Member Project Direct Commission |
| Sold By Customer | Customer Loyalty |
| Sold By 3% Club + eligible repeat personal purchase | Customer Loyalty |

Trip and Royalty rewards are non-cash and may coexist only when their own rules qualify.

---

## 13. Sales & Reference Trip Reward

The Trip Programme is a **non-cash performance reward** for genuine sales and genuine first qualifying sales from introduced Members. It is NOT a joining reward and NOT multi-level. Joining creates **zero Trip progress**.

### Trip Credits

#### Own-Sale Credit

- Each distinct qualifying Plot/Unit may create **one Own-Sale Credit**
- Five qualifying units in one Booking = five Own-Sale Credits
- Credit is Plot/Unit-based, not Booking-number-based
- Self-purchase may generate Own-Sale Credits (no general cap on how many)

#### Reference Credit

- **Immediate inviter only** — no multi-level
- One introduced Member can contribute **one lifetime Reference Credit**
- Self-purchase by the introduced Member does NOT consume the Reference opportunity
- Opportunity is global across Projects
- Consumed by the first Reference-eligible third-party sale in an active Trip Programme
- A sale in a Project with no active Trip Programme does not consume the opportunity
- If first referred sale has multiple units: selling Member earns multiple Own-Sale Credits, inviter receives **one Reference Credit only**
- If multiple candidate sales qualify simultaneously: earliest qualification timestamp wins; if equal, lower permanent Booking Number wins

#### Anti-Recycling Rule

> One Member may earn at most **one Own-Sale Credit** for the same Plot/Unit in the same Project Trip Programme (across all sale types — self-purchase, third-party sale, resale after Buyback). A different Member may earn a later genuine Own-Sale Credit for the same unit.

#### Subdivided Unit Rule

If an eligible unit is subdivided after programme activation, child units share one Trip Credit pool from the parent unit, unless MD activates a new Programme Version explicitly recognising them as separate eligible credit units.

### Trip Bucket System

```
First eligible Booking approved → Bucket opens (rules frozen)
    → Credits accumulate → Target met → Trip Earned
    → Bucket closes → Next bucket uses current Programme Version
```

#### Bucket Opening

A bucket opens when the eligible Booking Request version is approved and creates the Member's first valid Pending Trip Credit in that Project. A rejected/raw request does not open a bucket. At opening, the following freeze:

- Total Target, Minimum Own-Sale Credits, Maximum Reference Credits
- Self-purchase rules, eligible inventory
- Trip Programme Version, Trip Terms/PPT Version

#### Credit States

```
Pending → Qualified → [Allocated → Used] or [Held / Expired / Reversed]
```

| State | Meaning |
|---|---|
| **Pending** | Sale not yet at 100% (or approved Buyback) |
| **Qualified** | Ready, not yet used in a Trip |
| **Allocated** | Assigned to an Earned Trip, awaiting travel |
| **Used** | Trip has been travelled |
| **Held** | Member is Deactivated |
| **Expired** | 12 months elapsed since qualification |
| **Reversed** | Credit invalidated (reason recorded) |

#### Credit Expiry

> Unused Qualified Trip Credits expire **12 months after qualification**.

Code constant: `TRIP_CREDIT_LIFE_MONTHS = 12`

Project Terms must also define a final completion/wind-down deadline for any open bucket after programme closure.

#### FIFO Allocation (from `src/lib/domain/trip.ts`)

Credits are allocated **earliest qualified first**, subject to:

1. Minimum Own-Sale requirement is met first from earliest Own-Sale Credits
2. Remaining target filled earliest first, never exceeding Maximum Reference
3. Reference Credits are optional
4. Used credits cannot be reused
5. Tie-breaking by credit ID when qualification times match

#### Banked Reference Credits

If a current bucket cannot use all qualified Reference Credits, extra qualified Reference Credits remain **banked for that same Project** and may be used in later buckets subject to FIFO and credit expiry.

#### Change Plot — Trip Rule

If Booking changes Plot, the final valid unit must be eligible under the Booking's frozen Trip Programme version. If the final unit is excluded, pending/qualified Trip Credit reverses.

### Trip Reward States

```
Earned → Booked → Travelled
         ↓
       Deficient → Backfill or pause
         ↓
       Cancelled
```

| State | Meaning |
|---|---|
| **Earned** | Target met, awaiting travel booking |
| **Booked** | Travel arranged |
| **Travelled** | Trip completed — **no ordinary clawback** |
| **Deficient** | A used credit became invalid post-earning; next unused eligible qualified credit may backfill under FIFO, otherwise fulfilment pauses |
| **Cancelled** | Trip cancelled per published Terms |

### Trip Programme Example

> Target 9 / Minimum Own 6 / Maximum Reference 3

**Eligible compositions:**
- 9 Own + 0 Reference
- 8 Own + 1 Reference
- 7 Own + 2 Reference
- 6 Own + 3 Reference

**Not eligible:**
- 5 Own + 4 Reference (below Minimum Own)

### Worked Example — Arjun Mehta (MEM-000218)

**Desert Square - TRIP-D** — rules 3 / min Own 2 / max Reference 1 - Terms TRIP-D-1 - no open bucket:

| Credit | Source | State |
|---|---|---|
| Own sale | BKG-000001 - D-01 | Allocated |
| Reference | BKG-000002 - D-02 via MEM-000219 (Neha Agarwal's first sale) | Allocated |
| Own sale | BKG-000003 - D-03 | Allocated |

Trip **Earned** — traveller not recorded yet. Credits turn **Used** when the Trip is marked Travelled.

**Aravali Greens - TRIP-A** — open since 10/10/2026 - rules 5 / 3 / 2 - Terms TRIP-A-1 - progress **1 / 5**:

| Credit | Source | State | Expires |
|---|---|---|---|
| Own sale | BKG-000004 - A-01 | Qualified | 10/10/2027 |

**Royalty** — 3 final relationships (CUS-003391, CUS-003393, CUS-003394), all opportunities **UNUSED**; 0 Royalty Credits.

### Nominee Rules

- The earning Member remains the owner of all Credits and the Trip Reward entitlement
- Underlying credits do not transfer ownership
- Permitted nominee: immediate family **or** one MD-approved non-family nominee
- Nominee identity must be recorded before fulfilment
- No automatic cash alternative exists

### Deactivated Inviter

If the introduced Member qualifies the Reference event while the inviter is Deactivated:
- Reference opportunity is consumed
- Reference Credit is created
- Credit use/fulfilment is held until valid reactivation

### Recovery and Trip Fulfilment

- If Recovery Outstanding exists: progress remains recorded, earned reward remains recorded, fulfilment is held until Recovery Cleared
- If Member is Deactivated: reward/history remains, fulfilment is held until valid reactivation

### Programme Closure

When a Trip Programme closes:
- No post-cut-off approved Booking enters
- Protected pre-cut-off approved activity continues under its frozen version
- Project Terms define the final wind-down/completion deadline
- Partial progress is not silently removed before the disclosed deadline

### Fulfilled Reward Finality

Once a Trip is travelled, all underlying credits/opportunities used remain **consumed forever**, even if the underlying sale later cancels. Fraud/recovery may still be pursued, but the old opportunity does not reopen.

---

## 14. Royalty Relationship Reward

Royalty is a **non-cash relationship reward** — not a monetary percentage. There are no Royalty percentage bands, positions, annual/anniversary cycles, or multi-level mechanics.

### Relationship Creation

At the Primary Customer's earliest qualifying first Booking:

| Sold By | Royalty Relationship |
|---|---|
| Sold By **Member** | Selling Member becomes **Provisional Royalty Linked Member** |
| Sold By **Customer** | No relationship created |
| Sold By **3% Club** | No relationship created |

The relationship **finalises** when the first purchase reaches either:
- 100% verified Payment Received, **or**
- Approved Buyback satisfying the 25% minimum-payment safeguard

### Important Relationship Rules

- Only the **Primary Customer** can establish a Royalty relationship (Additional Customers do not create separate relationships)
- If first Booking cancels before finalisation: provisional relationship removed, opportunity not consumed, a later genuine first qualifying purchase may establish it
- If first purchase was NOT Member-sold: later Member sale does NOT retroactively create a relationship
- History remains auditable

### Royalty Reward Event

A final Royalty Linked Member receives **one Royalty Relationship Reward** when that Primary Customer later makes their first qualifying **direct personal purchase through 3% Club**, provided:

- Royalty opportunity remains unused
- Final Sold By is not another Member
- Other eligibility conditions are satisfied

If another Member is final Sold By: no Royalty Reward on that sale, but the unused opportunity remains available.

### Key Royalty Rules

| Rule | Value |
|---|---|
| One Royalty opportunity per Customer | **One lifetime** |
| One Royalty Credit | = **One Gift entitlement** |
| Gift Programme Version freeze | At qualifying future Booking Request version ultimately approved |
| Original relationship creation date | Does NOT freeze the Gift programme |
| Coexistence with Loyalty | Customer Loyalty + Royalty Reward CAN coexist on the same sale |
| Cash alternative | **None** |
| Fulfilled Gift finality | Opportunity consumed **forever**, even if underlying sale later cancels |
| Royalty Credits combining into points | Not supported unless a future approved programme explicitly adds it |

### Royalty States

```
Eligible → Selected → Ordered → Delivered
                                     ↓
                                  Reversed (with reason)
```

### CRM Data Stored for Royalty

- Royalty relationship and Linked Member
- Royalty Credit ID and Programme Version
- Selected Reward reference/code and selection date
- Status tracking: Eligible / Ordered / Delivered / Cancelled-Reversed
- Fulfilment reference and delivery date

The complete catalogue and reward cost do NOT need to be stored in CRM.

### Royalty and Buyback

- Buyback itself does not earn or own Royalty
- Buyback is only an alternative qualification milestone on the underlying qualifying Customer purchase
- Credit belongs to the already-established Royalty Linked Member, NOT the Buyback arranger, Buying Commission beneficiary, or broker

### Member Profile — Royalty Section

**Relationships owned:**
- Customer ID, name (staff view only — never in portal)
- Relationship Final / Provisional
- First purchase that made it (Booking, Plot, final date)
- Royalty opportunity UNUSED / CONSUMED
- Summary: *"x final / y can still earn a Gift / z waiting for full payment"*

**Royalty Credits (one card per Gift):**
- Customer ID, name and the trigger Booking
- Qualified by — 100% Payment Received / Approved Buyback (after >= 25%)
- Eligible on date
- Programme Version, catalogue, terms
- State — Eligible / Selected / Ordered / Delivered / Reversed
- Gift reference, recipient and relation, non-family MD approval
- Order reference, ordered on
- Delivered on, delivery reference
- Fulfilment hold — including "Waiting for Stable Buyback Completion"
- Reversal reason

**Empty state message:** *"A Gift is earned when a final linked Customer's first Club-direct purchase is paid in full (or an approved Buyback after 25%). y relationships can still earn one."*

---

## 15. Buying Commission

Buying Commission is **completely separate** from Direct, Loyalty, Trip, and Royalty.

| Rule | Value |
|---|---|
| Rate | Percentage of Acquisition Price |
| Hard maximum | **5%** |
| Beneficiaries | One: Member, Customer, or external broker |
| Freeze point | Formal Acquisition approval |
| **Milestone** | **100% verified Payment Given** |
| Paid Early | MD approval only |
| Returning owner | Cannot earn merely for arranging own return |
| Original sale participant | May still qualify under normal rules |

### Buying Commission Freeze

- Freezes at formal Acquisition approval
- Any later change requires: controlled correction + reason + approval + before/after audit history

### Paid Early Rules

Requires MD approval. Must record: reason, beneficiary, rate, reference, date, actor, audit. No duplicate normal payout later.

---

## 16. Recovery & Holds

### Recovery Outstanding

If a paid monetary benefit later becomes invalid:

1. Create **Recovery Outstanding**
2. Retain external Accounts Recovery Reference
3. Future monetary benefits may be set off
4. New cash payout blocked while Recovery remains unresolved
5. Trip/Gift fulfilment held while Recovery remains unresolved

> **Recovery deadline: 15 calendar days from notice.** Unresolved Recovery may lead to Membership deactivation.

### Recovery Circumvention Review

If a new/related Person shares indicators (bank account, mobile, address, known close-family/related-party link) with a Member having unresolved Recovery, the system creates a **Recovery Circumvention Review** before monetary/non-cash benefits are released. No automatic punishment — Accounts/MD reviews the facts.

### Commission Hold

A Member may have a Commission Hold applied/removed by Admin, blocking payouts.

---

## 17. Payment Model

### Payment Received (Customer-side)

Used for: Direct, Customer Loyalty, normal Trip qualification, normal Royalty qualification.

### Payment Given (Company acquisition-side)

Used for: Buying Commission, Stable Buyback Completion, Buyback-qualified reward fulfilment.

**CAUTION: Never mix Payment Received and Payment Given.** They track different sides of the transaction.

---

## 18. Payout Policy

| Rule | Value |
|---|---|
| Bank account | Verified before payout |
| Minimum threshold | None |
| Invoice required | Not a business-rule condition |
| Statutory deductions | Per applicable law |
| Decimal precision | 2 decimal places final, no intermediate rounding |
| Target timing | Within 7 working days after eligibility + holds cleared |
| Traceability | Each commission remains separately traceable |

### Paid Early

Exception requiring MD approval. Must record: reason, beneficiary, benefit type, rate, reference, date/time, actor. If transaction later becomes invalid, Recovery/adjustment applies.

---

## 19. Staff Roles & Permissions

The system uses role-based access control with a defined permission matrix.

### Staff Accounts

- Staff IDs: `STF-0001` through `STF-0008` (seeded)
- Password-based authentication (no multi-factor — CR-003 removed it)
- Lockout mechanism for failed login attempts
- Password change via `npm run reset:password`

### Key Role Capabilities

| Action | Required Role |
|---|---|
| Prepare Project Settings | Admin |
| Approve Project Settings | MD |
| Approve Booking Requests | Accounts |
| Approve Hold Extensions (2nd+) | Admin |
| Approve Buying Commission Paid Early | MD |
| Staff Conflict Resolution | MD |
| Recovery Circumvention Review | Accounts/MD |
| Sold By Correction | Admin/MD |
| Member Deactivation | Admin |
| Inviter Correction | Admin/MD |

---

## 20. Security & Identity

### Sensitive Data Protection

| Data | Protection |
|---|---|
| Aadhaar | Encrypted + blind indexed |
| PAN | Encrypted + blind indexed |
| Bank account | Encrypted + verification workflow |
| Password | Hashed |

### Key Security Files

| File | Purpose |
|---|---|
| `src/lib/security/auth.ts` | Authentication logic |
| `src/lib/security/session.ts` | Session management |
| `src/lib/security/permissions.ts` | Role-based permission matrix |
| `src/lib/security/identity.ts` | Aadhaar/PAN encryption and blind indexing |
| `src/lib/security/audit.ts` | Audit trail recording |
| `src/lib/security/idempotency.ts` | Duplicate-prevention keys |
| `src/lib/security/current-actor.ts` | Current authenticated actor resolution |

### Key Rotation

Sensitive fields can be re-encrypted onto a new key:
```bash
npm run rotate:key          # dry run
npm run rotate:key --confirm # actual rotation
```

### Audit Trail

Every state change is recorded with:
- Actor reference
- Timestamp
- Before/after state (masked where appropriate)
- Reason (where applicable)

Tracked events: Person details updates, bank details entered/verified/rejected, Aadhaar/PAN revealed, Member activation/deactivation/reactivation, RERA updates, Commission Hold applied/removed, Portal password reset/unlock.

---

## 21. Dashboard & Tasks

### Task Model

Each task has:
- **Purpose** — duplicate-prevention key (Record + Purpose)
- **Title** — what needs attention
- **Record** — the entity it relates to (Plot, Enquiry, Booking, Customer, Member, Acquisition, Project)
- **Subject** — resolved Project, Plot, party reference, and Booking link
- **Assignee Role** — which staff role should handle it
- **Due date** — displayed in IST
- **Urgency** flag
- **Status** — Pending / Completed
- **Recurrence** — for scheduled tasks
- **Decision** flag — decision tasks are approved on the record's review snapshot, not inline

### Task Views

| View | Shows |
|---|---|
| TODAY | Tasks due today |
| OVERDUE | Past-due tasks |
| UPCOMING | Future tasks |
| COMPLETED | Resolved tasks |
| ALL | Everything |
| RANGE | Custom date range |

### Scheduled Jobs

Jobs are **not automatic** — until something calls `/api/jobs`, Hold expiry, payment reminders, and RERA alerts do not happen.

- Run manually: `npm run jobs:run [JOB]`
- Health check: `/api/health` answers 200 only when DB is reachable and every secret is configured, and reports the last successful run of each job

---

## 22. Rewards Overview Dashboard

The Rewards page (`/rewards`) provides operational cards with counts (implemented in `src/lib/rewards-overview.ts`):

| Card | What It Tracks |
|---|---|
| Direct Ready | Direct commissions ready for payout (NOT_PAID, READY) |
| Direct Held | Direct commissions on hold (NOT_PAID, ON_HOLD) |
| Loyalty Ready | Loyalty commissions ready for payout |
| Loyalty Held | Loyalty commissions on hold |
| Recoveries | Outstanding recovery amounts |
| Trips Awaiting | Trips in EARNED/BOOKED state |
| Trips Deficient | Trips in DEFICIENT state |
| Gifts Awaiting Selection | Royalty Gifts in ELIGIBLE/SELECTED state |
| Gifts Awaiting Delivery | Royalty Gifts in ORDERED state |
| Settings Awaiting MD | Project versions in PENDING_APPROVAL |
| Buyback Reviews | Buyback commission/unwind review tasks pending |
| Control Reviews | Staff conflict (PENDING) + circumvention reviews (PENDING_REVIEW) |

**No rupee totals are shown — counts only.**

### Reviews Tab

The rewards page also exposes a Reviews tab with two types:
1. **Staff Conflict Reviews** (CONFLICT) — staff/relative benefit entitlements requiring MD approval
2. **Circumvention Reviews** (CIRCUMVENTION) — potential recovery circumvention via shared indicators

Each review shows: person, benefit description, detail, status, and decision information.

---

## 23. Member Portal

The portal (`/portal`) shows safe, Member-specific information:

### What Members CAN See

- Selected Projects and frozen Direct rate/status
- Authorised deals and Direct eligibility/status
- Trip progress: Pending Own-Sale, Qualified Own-Sale, Reference Credits
- Banked/used credits, target/composition
- Earned Trip Rewards and their states
- Royalty Reward status
- Recovery/hold status (at a safe level)

### What Members CANNOT See

- Other Customers' PII
- Bank/KYC secrets
- Internal Accounts notes
- Project economics
- Any rupee value, Trip cost, Gift cost
- Customer identities in credit lists (staff-only)

---

## 24. Hold System

### Plot Hold

- **Duration:** 72 hours (system-calculated, constant `HOLD_HOURS = 72`)
- **Maximum open positions:** 3 per actual Person across all Projects (`MAX_OPEN_POSITIONS = 3`)
  - Counted: Active Holds + Waiting for Booking Approval + Pending Hold Requests
- **Extensions:** First extension is CRM's; any further extension needs Admin

### Hold Extension Logic

- Extension request does NOT pause the Hold timer
- If Hold expires before extension is decided: request closes as Expired, new Hold required
- Extension hours are added to the current expiry time

### Member Hold Request Expiry

- Expires at end of the working day (if created before cut-off hour) — 23:59 IST
- Expires at end of next working day (if created after cut-off hour) — 23:59 IST
- Working calendar: configurable cut-off hour, weekly off days, holidays
- Default: cut-off at 17:00 IST, Sunday off, no holidays

---

## 25. Buyback & Acquisition

### Approved Buyback as Alternative Milestone

Buyback can act as an alternative reward milestone only if the source Booking has reached **at least 25% verified Payment Received** (`BUYBACK_MIN_SOURCE_PAYMENT = "25"`).

Applies to: Customer Loyalty, Own-Sale Trip Credit, Reference Credit, Royalty Reward eligibility.

> **Buyback does NOT accelerate Direct Commission.**

Ordinary cancellation does not create Trip Credit.

### Stable Buyback Completion

All conditions must be true:

1. Buyback/Acquisition formally Approved
2. Payment Given = 100% verified
3. No cancellation/unwind
4. Completion/document-return requirements completed (allotment papers collected, registry-back completed, other required conditions)

### Buyback-Qualified Trip Credit

- Credit becomes Qualified at Approved Buyback
- But becomes **usable for Trip fulfilment only after Stable Buyback Completion**
- If Buyback unwinds before completion: Buyback-based qualification reverses, source-sale recalculated, no duplicate credit
- If source sale later independently satisfies normal milestone, normal qualification may apply

### Buyback Credit Ownership

The credit belongs to the **source sale participants**:
- Source Sold By Member → source selling Member gets Own-Sale Credit(s)
- Eligible first referred sale → immediate inviter may get one Reference Credit
- Member self-purchase source → eligible Own-Sale Credit subject to anti-recycling
- Buying Commission beneficiary gets NO Trip Credit merely for arranging the Buyback

---

## 26. Sold By Classification

Each sale has **one** final approved classification:

| Classification | Description |
|---|---|
| **Sold By Member** | An Active Member closed the sale |
| **Sold By Customer** | A qualifying Customer closed the sale |
| **Sold By 3% Club** | Company/direct sale |

The final approved Sold By selection controls all sale-side monetary treatment.

### Sold By Correction

- A controlled correction may affect: Direct, Loyalty, Trip Credits, Reference Credits, Royalty relationship, Royalty Reward
- Recalculation uses the Booking's **frozen** Project/Programme Versions (not current settings)
- Only the correct final beneficiary keeps the applicable entitlement
- After fulfilment: fulfilled reward remains consumed, correction updates history/future entitlement, correction requires MD approval, no automatic second Trip/Gift
- Any exceptional compensation is separate MD settlement outside the reward-credit engine

### Change Plot Rules

- **Same-Project:** Booking continues with frozen rate/version; final unit controls economic amount and Trip eligibility; no duplicate credit
- **Cross-Project:** Requires cancellation/new Booking; new Booking uses new Project's current settings; does not carry frozen terms from old Project

### Primary Customer Change

Approved Primary Customer Change changes ownership/customer details only. It does NOT automatically re-run original Direct, Loyalty, self-purchase classification, or reward economics. Any separate correction uses the appropriate controlled correction workflow.

---

## 27. Anti-Fraud Controls

### Prohibited Activities

- Fake Member/Customer, sham sale, test Booking
- False Sold By, circular transaction
- Duplicate identity abuse, artificial reward farming
- Collusive activity
- Members/Customer closers collecting money into personal accounts
- Issuing unofficial receipts
- Making unauthorised guarantees or promises
- Misrepresenting Company approval/status

### Staff Conflict Controls

Staff and defined close relatives cannot receive Direct/Loyalty/Trip/Royalty automatically. Requires:
- Conflict-of-interest disclosure
- MD approval
- Independent processing
- Staff member cannot create/approve their own entitlement

### Identity Merge Controls

Identity merge must not duplicate: inviter, lifetime Reference opportunity, Royalty relationship/opportunity, Customer Loyalty for same Booking, Trip Credit for same unit/event, Recovery. One real person remains one entitlement history.

### Bank Account Uniqueness

Default: one verified bank account = one Person. Joint account exception requires proof of joint holders + Accounts approval + MD approval + audit trail.

### Payment Correction Guards

Payment corrections must not create duplicate rewards. History remains auditable.

### Test/Mock Data

Test, QA, migration and dummy records create no real entitlement. Before production go-live, test/mock reward records should be reset or migrated to Business Model v2 rules.

---

## 28. Owner-Accepted Commercial Risks

These were **reviewed and deliberately accepted** — they must not be silently changed by developers, staff, or future reviewers without a new Owner-approved business-rule change:

| # | Risk | Example |
|---|---|---|
| 1 | **Related-party Member sales** | Member A sells to A's brother and may still earn normal Direct |
| 2 | **Customer closer may be related/co-buyer** | Wife is Additional Customer and Sold By Customer on Husband's Booking |
| 3 | **Primary Customer Change doesn't re-run economics** | Direct paid on original sale is not automatically recalculated |
| 4 | **Immediate repeat-purchase Loyalty** | Same-day second purchase may qualify |
| 5 | **Reciprocal Customer closing** | A closes B's purchase, later B closes A's (each within 3-event limit) |
| 6 | **Full Direct at 25%** | Full Direct eligibility at 25% Payment Received; Recovery controls apply |
| 7 | **Formal Authorised Discount only** | Off-book cashback doesn't reduce commission base |
| 8 | **General KYC before payout** | Booking may be approved while payout-grade KYC is pending |
| 9 | **Final Sold By controls Club-direct** | Background Member involvement doesn't override final Sold By |
| 10 | **Original sale participant may earn Buying Commission** | Member earns Direct on original sale, later earns Buying Commission on Buyback |
| 11 | **Reference Project steering** | First qualifying Reference event decided by milestone timing |

---

## 29. Operational Scripts & Commands

### Running the App

```bash
npm install
cp .env.example .env       # fill in the six secrets
npx prisma migrate deploy
npm run db:constraints      # controls Prisma cannot express
npm run db:seed             # first staff accounts, one project, a few plots
npm run dev                 # start development server
```

Seeded accounts sign in with `STF-0001` through `STF-0008` and the password the seed prints.

### Verification Commands

| Command | What It Proves |
|---|---|
| `npm run check` | Task rules, permission matrix, every domain rule, and types. No database needed |
| `npm run db:check` | Full end-to-end suite: schema, bookings, commission, all phases, acquisitions |
| `npm run reconcile` | Migration record-count and exception report |

### Individual Check Scripts

| Script | Checks |
|---|---|
| `npm run booking:check` | Booking domain rules |
| `npm run commission:check` | Commission calculation rules |
| `npm run commission-settings:check` | Project settings validation |
| `npm run royalty:check` | Royalty relationship and reward rules |
| `npm run trip:check` | Trip credit and reward rules |
| `npm run controls:check` | Anti-fraud and control review rules |
| `npm run plc:check` | PLC handling rules |
| `npm run acquisition:check` | Acquisition/Buyback rules |
| `npm run phase5:check` | Phase 5 feature rules |
| `npm run phase6:check` | Phase 6 feature rules |
| `npm run phase7:check` | Phase 7 feature rules |
| `npm run land:check` | Land inquiry rules |

### Operational Commands

| Command | Use |
|---|---|
| `npm run jobs:run [JOB]` | Run scheduled jobs from command line |
| `npm run rotate:key` | Re-encrypt protected fields onto new `SENSITIVE_KEY` (dry run without `--confirm`) |
| `npm run db:constraints` | Re-apply database controls (safe to re-run) |
| `npm run data:reset` | Reset data (dev only) |
| `npm run demo` | Run demo scenario |
| `npm run seed:mock-v2` | Seed mock v2 business model data |
| `npm run seed:showcase` | Seed showcase data |
| `npm run reset:password` | Reset a staff password |
| `npm run db:studio` | Open Prisma Studio for direct DB browsing |

**WARNING:** Database checks write and purge tagged data, so they refuse to run unless `ALLOW_CHECK_WRITES=true` is set. **A production environment must NEVER set it.**

---

## 30. Go-Live Prerequisites

Before production go-live, ALL of these must be satisfied:

- [ ] Business Model v2 approved
- [ ] Project settings approved
- [ ] Trip Terms ready (package, destination, inclusions, exclusions, booking/travel windows, redemption deadline, passport/visa, nominee, cancellation, substitution, tax, wind-down)
- [ ] Royalty Gift catalogue/terms ready (Gift choices, specifications, value/tier, substitution, selection deadline, delivery, warranty, nomination, cancellation, tax)
- [ ] Member/Customer Terms updated (reward framework, money-handling, privacy, recovery, fraud treatment, deactivation, nomination rules)
- [ ] Marketing updated (no universal 3% Direct promise, Trip leads with sales performance not recruitment)
- [ ] Staff trained
- [ ] CRM changes implemented
- [ ] UAT passed

The Effective Date is **actual production go-live date/time in Asia/Kolkata** — not the document date.

No legacy transition engine is required. Only mock/test data exists under the earlier model. Production may launch directly on Business Model v2.

---

## 31. Glossary

| Term | Definition |
|---|---|
| **Authorised Discount** | Formally recorded discount that reduces Commissionable Sale Value |
| **Banked Reference** | Qualified Reference Credits beyond Maximum Reference, kept for a later Trip |
| **Buying Commission** | Percentage of Acquisition Price paid to the broker who arranged a Buyback |
| **Commissionable Sale Value** | (Base Property Value + PLC) - Authorised Discount |
| **Customer-Closing Loyalty** | Customer Loyalty earned by a Customer who closes a third-party sale |
| **Customer Loyalty** | Project-specific monetary benefit for qualifying Customer activity |
| **Direct Commission** | Project-specific monetary benefit for Member-closed sales |
| **FIFO** | First In, First Out — Trip Credit allocation order |
| **Formal Member Self-Purchase** | Booking where Primary Customer is an Active Member |
| **Frozen Version** | The immutable Project Settings Version stored on an approved Booking |
| **IST** | India Standard Time (Asia/Kolkata) — all business times |
| **KYC** | Know Your Customer — identity verification |
| **Own-Sale Credit** | Trip Credit earned from a Member's own qualifying sale |
| **Payment Given** | Company acquisition-side payment progress |
| **Payment Received** | Customer-side sale payment progress |
| **PLC** | Preferential Location Charge |
| **Primary Customer** | The main buyer on a Booking — controls Royalty relationship |
| **Recovery Outstanding** | Paid benefit that later became invalid — must be recovered |
| **Reference Credit** | Trip Credit earned from an introduced Member's first qualifying sale |
| **Repeat-Purchase Loyalty** | Customer Loyalty from second and later personal Bookings |
| **Royalty Credit** | One Gift entitlement from a Royalty Relationship Reward |
| **Royalty Linked Member** | The Member who first sold to a Customer, creating a lasting relationship |
| **Sold By** | The final approved classification of who closed a sale |
| **Stable Buyback Completion** | All Buyback conditions met (approved, 100% paid, no unwind, docs complete) |
| **Trip Bucket** | A container that holds Trip Credits towards one Trip Target |
| **Trip Programme Code** | Identifier for a Trip Programme within a Project (e.g. `TRIP-A`) |

---

> **Final Business Principle:**
> *3% Club rewards genuine property activity under explicit, frozen, and auditable rules while preserving the commercial flexibility deliberately chosen by the Owner.*
