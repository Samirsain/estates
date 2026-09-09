# As built — Land Inquiry, Customer → Member conversion, and the two profiles

What the running dashboard actually does today, read from the code rather than
from the requirement documents. Three subjects:

1. [Land Inquiry](#1-land-inquiry-land-inquiries) — screens, fields, stage ladder, rules.
2. [Customer → Member conversion](#2-customer--member-conversion) — the complete flow.
3. [Customer profile](#3-customer-profile-customers) and [Member profile](#4-member-profile-members) — layout, structure and every field.

Where a rule has a source, the file is named. The requirement documents behind
it are `land-inquiry-feature.md`, `prd-complete.md` and `design.md`.

---

## 0. The one idea the rest depends on

**A `Person` is the identity. A profile is a capability.**

```
                    Person  (fullName, mobile, Aadhaar, PAN, address, bank)
                      │
        ┌─────────────┼──────────────┐
        │             │              │
CustomerProfile  MemberProfile  StaffAccount
   CUS-000123      MEM-000045      STF-0007
```

- One Person may hold a Customer profile, a Member profile, both, or neither.
- Converting a Customer to a Member **adds** a `MemberProfile` to the same
  Person. The `CustomerProfile` is never deleted, moved or rewritten.
- Every name printed anywhere in the app links to `/people/[personId]`, which
  decides which profile page to open (`src/app/people/[personId]/page.tsx`).
  `?as=member` says which side of a two-profile Person the caller meant.

| Identifier | Prefix | Created when |
| --- | --- | --- |
| Customer ID | `CUS-` | First Hold, or first Booking Request when no Hold came first (`ensureCustomerProfile`) |
| Member ID | `MEM-` | Member activation (`activateMember`) |
| Land Inquiry No. | `LI-` | Land Inquiry create, from a database sequence |

All three come from `nextReference()` — a sequence, never `MAX+1`, never a row
count, never editable.

---

# 1. Land Inquiry (`/land-inquiries`)

Pre-acquisition land sourcing. It records land the company is *considering*
buying. It is deliberately isolated: **nothing here touches Booking, Payment,
Commission, payout, refund or accounting.** The rupee fields are negotiation
information only.

Code: `src/lib/domain/land-inquiry.ts` (pure rules) ·
`src/lib/services/land-inquiry-service.ts` (reads/writes) ·
`src/app/land-inquiries/*` (screens) · `system/land-inquiry-feature.md` (spec).

## 1.1 Screens

| Route | What it is |
| --- | --- |
| `/land-inquiries` | The list — server-side filtered, paginated, 25 per page |
| `/land-inquiries/new` | The 14-section create form |
| `/land-inquiries/[id]` | Read-only detail, same 14 sections, plus the action bar |
| `/land-inquiries/[id]/edit` | The same form, pre-filled, carrying the version |

Navigation entry: **Land Inquiries** in the left sidebar
(`src/components/app-shell.tsx`).

## 1.2 The list

Columns, in order:

`Inquiry No.` · `Date` · `Received From` · `Owner` · `Location` · `Land Area` ·
`Asking Rate` · `Status` · `Stage` · `Assigned To`

Rules that shape it:

- **Every filter runs in the database**, as query parameters. A filtered list
  survives a refresh and can be pasted to somebody else. The page never pulls
  the whole table into the browser.
- Filters: free-text `q`, District, Tehsil, Khasra No., Received From, Status,
  Stage, Assigned To, date-from, date-to, page, and `archived=1`.
- The free-text search covers what a person actually remembers: Inquiry No.,
  District, Tehsil, Exact Location, any owner's name, any Khasra No., the source
  Person's name, and — once 4+ digits are typed — the dealer mobile, an owner's
  mobile, or the source Person's mobile.
- Ordering is `inquiryDate desc, inquiryNo desc`, so paging never repeats or
  skips a row.
- **Archived rows are hidden by default.** Only MD and Admin can pass
  `archived=1` to see them.
- The `Owner` cell shows the Primary Owner plus a count of the others.
- The `Land Area` cell shows the metric area if it is known, otherwise the
  Bigha / Biswa exactly as recorded, otherwise nothing. It never converts one
  into the other (see §1.6).
- A row with `Received From = Another Dealer` shows a **mobile number and no
  name** — that is genuinely all the company was given.

## 1.3 The 14 sections

The create form, the edit form and the detail page all carry the same numbered
sections in the same order.

| # | Section | Fields |
| --- | --- | --- |
| 1 | Inquiry Details | Inquiry No. (auto), Inquiry Date (server IST date), Received From, Source (Member / Customer picker, or dealer mobile), Assigned To |
| 2 | Land Owner Details | Repeating rows: Owner Name, Mobile, Primary flag |
| 3 | Location | District, Tehsil, Exact Location, Latitude, Longitude |
| 4 | Jamabandi Details | Repeating rows: Murbba No., Pathar No., Khasra No. |
| 5 | Land Details | Area (Bigha, Biswa, and a metric value + unit), Dimensions, Frontage + unit, Road Width + unit, Shape, Boundaries |
| 6 | Land Category / Use | Land Category, Current Land Use, Master Plan / Zonal Use |
| 7 | Conversion / Approval | 90A Status, Land Conversion Status, Change of Land Use Status, Patta / Lease Status |
| 8 | Legal Check | Registry / Sale Deed Available, Mutation Complete, Mortgage / Bank Charge, Court Case / Stay, Family Dispute, Acquisition Notice, Government Restriction |
| 9 | Access & Site Condition | Approach Road, Road Type, Electricity, Water, Sewerage, Existing Construction, Encroachment, Possession Status |
| 10 | Commercial Details | Owner Asking Rate + basis, Total Asking Value, Negotiable, DLC Rate + basis, Expected Purchase Rate + basis, Payment Expectation |
| 11 | Development Potential | Multi-select: Residential, Commercial, Warehouse, Agriculture, Other |
| 12 | Documents Received | Multi-select: Jamabandi, Registry, Mutation, Bhu-Naksha, Khasra Map, 90A / Conversion Order, Patta, Owner ID, Site Photos, Location Map |
| 13 | Evaluation | Multi-select: Site Visit Required, Legal Verification Required, Revenue Verification Required |
| 14 | Inquiry Stage | Status and Stage, with the reason trail |

Enumerations used above:

- **Received From** — `MEMBER`, `CUSTOMER`, `THREE_PERCENT_CLUB` (3% Club),
  `ANOTHER_DEALER`.
- **Land Category** — Residential, Commercial, Industrial, Agricultural, Other.
- **Approval statuses** (§7) — Unknown, Not Applicable, Not Started, Pending,
  Approved, Rejected.
- **Check states** (§8, §9) — Unknown / Yes / No. On the risk fields
  (mortgage, court case, family dispute, acquisition notice, government
  restriction) **Yes means the problem exists**.
- **Rate basis** — Total, Per Bigha, Per Biswa, Per Hectare, Per Sq. Mtr.,
  Per Sq. Ft.
- **Linear unit** — FT or MTR.

## 1.4 Received From — what each choice means

| Choice | Names a Person? | Carries a mobile? | Notes |
| --- | --- | --- | --- |
| Member | Yes — must hold a Member profile | No | Verified on the server from the profile, never from the label the browser sent |
| Customer | Yes — must hold a Customer profile | No | Same server check |
| 3% Club | No | No | The company's own sourcing; attribution is the Assigned To staff member |
| Another Dealer | No | **Yes, required** | Inquiry-local mobile. No Person row is created, reused, converted or synced — even if the number already exists on file |

Validation (`validateReceivedFrom`):

- Another Dealer with a Person → rejected.
- Another Dealer with no mobile, or an invalid one → rejected. A valid mobile is
  ten digits starting 6–9; `+91`, spaces and hyphens are accepted on input and
  stripped before storage.
- 3% Club with a Person → rejected.
- Member / Customer with no Person → rejected.
- A dealer mobile on anything except an Another Dealer inquiry → rejected.

## 1.5 The stage ladder

```
NEW → DOCUMENTS_PENDING → SITE_VISIT → UNDER_VERIFICATION → NEGOTIATION
    → APPROVED_FOR_ACQUISITION

                            REJECTED_CLOSED   (off the ladder)
```

Status is separate and has two values: **Working** and **Closed**. The one
invalid pair is Working + Rejected / Closed.

Rules (`planStageChange`, `planReopen`):

| Move | Reason required? | Effect |
| --- | --- | --- |
| One step forward | No | Stage moves |
| Skipping a stage forward | **Yes, compulsory** | Stage moves |
| Any move backward | **Yes, compulsory** | Stage moves |
| To Rejected / Closed | **Yes, compulsory close reason** | Stage moves **and Status becomes Closed** |
| Same stage → same stage | — | Rejected |
| Any stage move while Closed | — | Rejected. Admin or MD must reopen first |
| Reopen | **Yes, compulsory** | Admin/MD only; must name a working stage to land on |

A Closed inquiry cannot be edited either — reopen first.

## 1.6 Area — why Bigha is never converted

Rajasthan's Land Revenue (Land Records) Rules, 1957 Appendix I publishes
*different* Bigha equivalents for different districts and former-state areas.
There is no statewide factor, so inventing one would silently restate what an
owner said their land measures.

- **Bigha and Biswa are stored exactly as entered** and are never derived from
  the metric area, nor it from them.
- The metric side has one canonical column, `areaSqM`. The user picks the unit
  they actually measured in (Sq. Mtr., Hectare, Sq. Ft.); the service converts
  to square metres with exact factors, and Hectare and Sq. Ft. are derived back
  for display.
- `areaSourceUnit` and `areaSourceValue` keep what was typed, so the screen
  shows it back without a round trip through the conversion.

## 1.7 Money

- Every rupee field is `Decimal(20,2)`. Nothing passes through a JavaScript
  float.
- Indian comma grouping is accepted on input (`₹`, commas, spaces stripped) and
  rendered back with `en-IN` grouping.
- **A rate needs its basis and a basis needs its rate** — one without the other
  is rejected with a sentence naming the field.
- **Total Asking Value is what the seller stated.** It is never recomputed as
  area × rate.

## 1.8 Owners and Jamabandi

- Owners are **child rows of the inquiry, not Person records** — a name heard on
  a phone call is not an identity the CRM holds.
- The first owner is Primary; exactly one is. Removing the Primary promotes the
  earliest one left. A database partial index enforces the single Primary.
- A row with a mobile but no name is rejected; a row left entirely blank is
  silently dropped, because that is what a half-filled repeater means.
- A Jamabandi row needs at least one of Murbba / Pathar / Khasra; a row with all
  three blank never persists.
- On update, owner and Jamabandi rows are **replaced wholesale**, not diffed —
  they carry no identity of their own and the audit event holds before and after.

## 1.9 Write rules — every mutation

Every write goes through `runCommand`, which supplies an idempotency key and an
append-only audit event carrying actor, before, after and reason.

| Action | Permission | Audit action | Notes |
| --- | --- | --- | --- |
| Create | `LAND_INQUIRY_MANAGE` | `LAND_INQUIRY_CREATED` | Carries the form's own `createRequestId`; a retry replays the first result instead of creating a second inquiry |
| Update | `LAND_INQUIRY_MANAGE` | `LAND_INQUIRY_UPDATED` | Optimistic lock; the audit records only the fields that actually moved |
| Change stage | `LAND_INQUIRY_MANAGE` | `LAND_INQUIRY_STAGE_CHANGED` | See §1.5 |
| Close | `LAND_INQUIRY_MANAGE` | `LAND_INQUIRY_CLOSED` | Compulsory reason |
| Reopen | `LAND_INQUIRY_REOPEN` | `LAND_INQUIRY_REOPENED` | **Admin / MD only** |
| Reassign | `WORK_REASSIGN` | `LAND_INQUIRY_REASSIGNED` | Target staff account must be Active |
| Archive | `LAND_INQUIRY_ARCHIVE` | `LAND_INQUIRY_ARCHIVED` | Compulsory reason |

- **Optimistic locking.** Every inquiry carries a `version`. A submission with a
  stale version is refused with *"This inquiry was updated by another user.
  Refresh and review the latest information."* — it is never merged.
- **No hard delete.** Archiving hides the record from the default list and keeps
  every fact and every audit event.
- **Inquiry Date is the server's Asia/Kolkata calendar date.** No path through
  the form can backdate it. `createdAt` keeps the full instant separately.
- A record the caller may not see returns *not found*. The response never
  reveals that a hidden one exists.
- Buttons are hidden by permission in the UI, and **every action re-checks the
  permission on the server**. UI hiding is presentation, not authorisation.

## 1.10 Who can do what

| Role | Land Inquiry rights |
| --- | --- |
| MD, Admin | Manage, Reopen, Archive, see archived rows |
| CRM | `LAND_INQUIRY_MANAGE` — create, edit, stage, close, but **not** reopen or archive |
| Accounts, MIS, PC | Read only (no `LAND_INQUIRY_MANAGE`) |

## 1.11 What Land Inquiry does *not* do

- It does not create an Acquisition. `Approved for Acquisition` is a stage on
  the inquiry; the Acquisition module is separate and holds no link back.
- It does not create, convert or update any Person, Customer or Member.
- It does not reach Booking, Payment, Commission, payout, refund or accounting.

---

# 2. Customer → Member conversion

The complete flow, end to end.

Code: `src/lib/services/network-service.ts` (`activateMember`) ·
`src/app/members/actions.ts` · `src/app/members/members-client.tsx`.

## 2.1 Where the Customer came from first

```
Enquiry (optional)
   │   Person created or matched by name + mobile
   ▼
Hold  ── or ──  Booking Request with no Hold before it
   │
   ▼
ensureCustomerProfile()  →  CUS-000123
```

- The Person is matched on **name and mobile together**, never mobile alone —
  a mobile may be shared across family members.
- The Customer ID is issued at the first moment the company commits inventory to
  a Person. It is **permanent, never reused, and retained even if the thing that
  created it is later rejected.**
- A Customer created this way starts with **no earning relationship at all** —
  no Royalty Member, no Loyalty consumed (CR-001).

## 2.2 The conversion itself

**Where:** `/members` → **Activate Member** button (visible only with
`MEMBER_ACTIVATE`).

The dialog has two modes:

| Mode | What it does |
| --- | --- |
| **Select Existing Person** | Picker listing every Person who does **not** already hold a Member profile and is not merged away. **This is where an existing Customer appears.** |
| **+ Create New Person** | Name + mobile + city; creates the Person first (or reuses an exact name+mobile match), then activates |

Fields in both modes:

- **Person** (or Full Name / Primary Mobile / City)
- **Invited By** — an Active Member. Optional. This is what takes the Network
  position and the rate band.
- **RERA** — Status (Registered / Pending / Expired / Not Applicable), Number,
  Expiry Date, Not-Applicable Reason.

## 2.3 What the server does, step by step

`activateMember()` — one transaction, one idempotency key:

1. **Permission.** Only `ADMIN` or `MD`. Anyone else is blocked, whatever the
   UI showed.
2. **Load the Person.** Blocked if they are already an activated Member.
   Blocked if the Person has been merged away.
3. **Validate RERA.** `Not Applicable` requires a compulsory reason.
   `Registered` requires the registration number.
4. **Set the activation date to now.** Activation **cannot be backdated** —
   there is no field for it.
5. **Issue the Member ID** — `MEM-nnnnnn` from the sequence, or reuse the
   existing one if a dormant MemberProfile already existed.
6. **Create (or update) the `MemberProfile`** with status `ACTIVE` and the RERA
   fields. *The CustomerProfile is untouched.*
7. **Create the `PortalAccount`** so the Member can log into the Member Portal:
   login ID = Member ID, default password `ChangeMe#2026`, status Active. An
   existing but disabled portal account is reactivated instead.
8. **Assign the Invite position** — only if an Invited By Member was named.
9. **Write the audit event** `MEMBER_ACTIVATED` with the Member ID, the inviting
   Member, the position and the rate.

The action returns one of two messages:

> Activated as MEM-000045 at Network position 3 (1% band).

> Activated as MEM-000045. No inviting Member was recorded, so no Invite
> position was taken.

## 2.4 The Invite position

`assignInvitePosition()`:

- The inviting Member must already be activated.
- The position is taken in the inviting Member's **current Invite cycle**
  (`currentCycle`), which also takes the lock that serialises the counter — two
  activations in the same instant cannot take the same position.
- The next position is `max(taken) + 1`. Positions are **assigned once and never
  renumbered, reset or moved**.
- The rate band is frozen onto the row at that moment:

| Position | Rate |
| --- | --- |
| 1 – 3 | 1% |
| 4 – 6 | 0.5% |
| 7 – 9 | 0.25% |
| 10 and beyond | 0% (a visible line that still consumes a position) |

- Cycles are per Member and roll on the **activation anniversary**; a 29 February
  activation resolves to 28 February in a non-leap year. Positions do **not**
  reset on an anniversary — they belong to a cycle, and the cycle's own nine must
  fill before the next anniversary opens a new one (CR-014).

## 2.5 First login — Terms acceptance

Not part of activation, but part of becoming a working Member.

`src/app/login/actions.ts`:

1. Member signs in at the portal with Member ID + password.
2. Credentials are checked first. If they are right but the current Terms version
   (`MEMBER_TERMS_VERSION`, today `2026-08-22`) has not been accepted, the login
   returns `TERMS` and the form comes back with the acceptance box, carrying the
   Member ID so only the password is retyped.
3. On acceptance a `MemberTermsAcceptance` row is written: member, version,
   timestamp, IP. **Never updated in place.** A new published version asks again
   and adds its own row; the old rows stay exactly as they were.

## 2.6 What conversion changes about the Customer

**Nothing is rewritten.** The same Person now holds both profiles. What changes
is what the commission engine will do next time that Person transacts:

- A Person who is an **Active Member buying personally** earns 3% Direct at the
  100% milestone, nothing else, and their inviting Member's opportunity is left
  untouched.
- Their existing Customer history — Royalty link, Loyalty slots consumed,
  Bookings — is untouched and still readable on the Customer page.
- A **final** Royalty link (see §3.3) is never recomputed. If it was final
  before the conversion it stays exactly as it was.

## 2.7 Deactivation and reactivation

Same permission gate: Admin or MD only, compulsory reason.

- **Deactivate** — portal access stops immediately, no new Member activity, and
  every **unpaid** commission goes On Hold — *Member Deactivated*. Paid and Paid
  Early records remain historical. **Network positions stay exactly as they are.**
- **Reactivate** — portal access is restored and unpaid commission eligibility
  is *rechecked*, never assumed.
- **Commission Hold** is separate: a Member-level hold applied to every unpaid
  record, with a reason, leaving paid history untouched. Removing it reassesses
  the affected records and the same task resumes.

There is no "convert back to Customer". A Member profile, once created, is
deactivated rather than removed.

---

# 3. Customer profile (`/customers`)

## 3.1 The list

`src/app/customers/page.tsx` · `customers-client.tsx`. Up to 300 rows, ordered
by Customer ID.

Columns: `Customer ID` · `Name` · `Mobile` · `City` · `Type` · `Project` ·
`Plot` · `Royalty linked to` · `Loyalty`

- The **mobile is masked** here. The main list never shows full private details.
- `Project` / `Plot` show the Customer's **most recent** deal, counted through
  `BookingParty` so an Additional Customer counts as a buyer too — with an
  "+n more" count for the rest. Ties on booking date break on submission time.
- `Royalty linked to` shows the Member ID with the name under it, and marks the
  link *provisional* until it goes final.
- `Loyalty` shows slots consumed out of 3, and sorts high-to-low (the used-up
  end is the interesting one). Every other column sorts A→Z; a Customer with
  nothing in that column sorts last.
- Client-side filters: search (ID, name, city, project, plot), Customer Type
  (End User / Investor), and a sort selector.

## 3.2 The detail page — `/customers/[id]`

Layout, top to bottom:

```
┌───────────────────────────────────────────────────────────┐
│ ← Back to Customers                    [ Edit details ]   │
├───────────────────────────────────────────────────────────┤
│ HERO                                                      │
│  (icon)  Full Name                                        │
│          CUS-000123   [End User]                          │
│                    Customer for · Loyalty slots ·         │
│                    Royalty linked to                      │
├──────────────┬──────────────┬─────────────────────────────┤
│ Profile      │ Identity     │ Bank                        │
├──────────────┴──────────────┴─────────────────────────────┤
│ Property Activity  (Enquiries + Holds + Bookings, merged) │
└───────────────────────────────────────────────────────────┘
```

**Hero stats**

| Stat | Value |
| --- | --- |
| Customer for | Derived on every read from the first Booking — never stored |
| Loyalty slots | `n of 3 used` — a combined lifetime maximum that never resets |
| Royalty linked to | Member ID (linked), with name + position + rate underneath, or the note that it is provisional |

**Profile card** — Mobile (masked), Alternate Mobile (masked, only if present),
Email, Date of Birth, City, Address. A blank Date of Birth or Address is *shown*
rather than hidden: the gap is the reason Edit details exists.

**Identity card** — Aadhaar and PAN. Each row shows either the masked number, or
the reason there isn't one — never "Not recorded" with "Pending" underneath
saying it twice.

- Aadhaar status: Pending / Available / Verified.
- PAN status: Not Available / Available / Verified.
- Aadhaar and PAN are AES-256-GCM ciphertext plus a masked form plus a
  deterministic blind index for duplicate detection. They are **fields, never
  uploaded documents**.

**Bank card** — for each bank record: Account (last four only), status badge
(Verified / Pending / other) with the verification date, IFSC, Bank, Branch,
Holder. The full account number is available only through the guarded reveal
action, only to a role holding `BANK_FULL`, and **every access is logged** —
including the denials.

**Property Activity** — Enquiries, Holds and Bookings merged into one list,
newest first, up to 50 of each. Each line: kind badge, Project · Plot (both
linked), status in words, IST timestamp. Bookings link to the booking page.

**Edit details** — `PERSON_DETAILS_EDIT` only (MD, Admin, CRM). Edits the Person
fields: name, mobile, alternate mobile, email, city, address, date of birth —
plus bank entry if the actor also holds `BANK_DETAILS_ENTER`. Aadhaar, PAN and
bank verification keep their own guarded flows.

## 3.3 CustomerProfile — the data

| Field | Meaning |
| --- | --- |
| `customerId` | `CUS-nnnnnn`, unique, never reused |
| `personId` | The identity this profile hangs off |
| `customerType` | End User / Investor |
| `loyaltySlotsConsumed` | 0–3. Combined lifetime maximum; the limit never resets |
| `legacyCustomerIds[]` | Old Customer IDs kept searchable after a merge |
| **Royalty link (CR-002)** | |
| `royaltyLinkedMemberId` | The Member who was **Sold By** on this Customer's first qualifying purchase |
| `royaltyLinkFirstBookingId` | That purchase |
| `royaltyLinkFinalAt` | Null = provisional. Set = final, and never recomputed |
| `royaltyPosition`, `royaltyRatePercent`, `royaltyCycleId` | The position taken in that Member's Royalty counter, and the band frozen onto it |
| **History only — nothing writes these any more** | |
| `originalIntroducedByMemberId`, `introducedPosition`, `introducedRatePercent`, `introducedYearStart` | The Enquiry-era relationship. CR-001 removed it: an Enquiry decides no Direct, Invite, Royalty or Loyalty |
| `royaltyYearStart` | The pre-CR-014 annual counter year |

**How the Royalty link is decided** (`syncRoyaltyLink`, recomputed from the
Bookings themselves on every event that could move it):

1. The first qualifying purchase is the Customer's earliest **approved** Booking
   as Primary Customer. An exact tie goes to the lower Booking Number.
2. Sold By **Member** on it → that Member is the *provisional* link.
   Sold By **3% Club** or **Customer** → *no Member at all*, permanently (CR-003).
3. The link becomes **final** — and only then takes a Royalty position — at 100%
   verified Payment Received, or an Approved Buyback on that same Booking.
4. A final link is never recomputed. Not by a later sale, not by a later
   cancellation. "No Royalty Member" is as final as a named one.
5. While provisional, a cancelled first Booking simply releases the link — no
   position was ever consumed.

---

# 4. Member profile (`/members`)

Built deliberately in the Customer page's language: same hero, same stat strip,
same cards of rows, same full-width lists underneath. A Member profile and a
Customer profile are the same kind of screen.

## 4.1 The list

`src/app/members/page.tsx` · `members-client.tsx`. Up to 300 rows, ordered by
Member ID.

Columns: `Member ID` · `Name` · `Mobile` · `City` · `Invited by` ·
`Total Deals` · `RERA`

- `Invited by` shows the Member ID with the name under it — two facts, two lines.
- `Total Deals` counts Bookings where this Member was **Sold By** and the
  Booking became a sale: Booked, Payment Completed, Delivered, Refund Pending,
  Buyback Completed. Request statuses are not deals yet; a rejected or cancelled
  request never was one. A Booking later refunded or bought back still happened,
  so it counts.
- The list also carries, for the row drawer: status, activation date, experience,
  invite position and rate, RERA detail, commission hold + reason, portal status,
  Aadhaar/PAN status, invited count, introduced count.

## 4.2 The detail page — `/members/[id]`

```
┌───────────────────────────────────────────────────────────┐
│ ← Back to Members        [ Member actions ] [ Edit ]      │
├───────────────────────────────────────────────────────────┤
│ HERO                                                      │
│  (icon)  Full Name                                        │
│          MEM-000045  [Active]  [Commission hold]          │
│                    Member for · Invite position ·         │
│                    Invited by                             │
│          (commission hold reason, if any)                 │
├──────────────┬──────────────┬─────────────────────────────┤
│ Profile      │ RERA         │ Bank                        │
├──────────────┴──────────────┼─────────────────────────────┤
│ Members Invited (n)         │ Royalty Linked Customers (n)│
├─────────────────────────────┴─────────────────────────────┤
│ Commission Records                                        │
└───────────────────────────────────────────────────────────┘
```

**Hero** — name, Member ID, status badge (Active / Deactivated), a Commission
hold badge when one is applied, and the hold reason under the card.

**Hero stats** — *Member for* (derived from the activation date), *Invite
position* (`Position n` + the `n% band`, or "Not assigned"), *Invited by*
(Member ID linked, name underneath).

**Profile card** — Mobile, Alternate Mobile, Email, Date of Birth, City,
Address, **Activated** (IST timestamp). Note: unlike the Customer page, the
Member's mobile is shown unmasked here.

**RERA card** — Status badge (Registered and Not Applicable read as success;
Pending and Expired as a problem), with the Not-Applicable reason as a hint,
plus Number and Expiry.

**Bank card** — identical to the Customer page: last four only, status badge,
IFSC, Bank, Branch, Holder. This page never prints a full account number, so
`BANK_FULL` is not consulted here at all.

**Members Invited** — the downline, ordered by invite position. Each row: Member
ID (linked), name, a "Deactivated" note where it applies, and `Pos n · n.nn%`.

**Royalty Linked Customers** — Customers whose first qualifying purchase this
Member closed, ordered by royalty position. Each row: Customer ID (linked),
name, `n/3 Loyalty slots used`, and `Pos n · n.nn%` — or `Provisional` while the
link has not gone final.

**Commission Records** — up to 100, current first. Columns: Booking (or
Acquisition No. for Buying Commission, which hangs off an Acquisition rather
than a Booking) · Project · Plot · Type · % · Eligibility · Payment. A
superseded record is labelled *Superseded* as a word rather than faded out. A
held record shows the hold reason under the eligibility.

Payment states: Not Paid, Paid, Paid Early, Cancelled, Accounts Adjustment
Required.

## 4.3 Member actions (the action bar)

| Action | Permission | Requires |
| --- | --- | --- |
| Activate / Reactivate | `MEMBER_ACTIVATE` (Admin, MD) | Compulsory reason on reactivation |
| Deactivate | `MEMBER_DEACTIVATE` (Admin, MD) | Compulsory reason |
| Apply / remove Commission Hold | `MEMBER_DEACTIVATE` | Reason |
| Update RERA | `MEMBER_ACTIVATE` | Rechecks unpaid commission eligibility afterwards |
| Enter bank details | `BANK_DETAILS_ENTER` (CRM) | Goes to Accounts for verification; any existing verified account stays active until approved |
| Verify / reject bank | `BANK_VERIFY` (Accounts) | The previous account moves to History |
| Reveal full account number | `BANK_FULL` field permission | Logged, including denials |
| Edit person details | `PERSON_DETAILS_EDIT` | — |
| Generate portal auto-login link | Any staff | Member and portal account must both be Active; the link is a 7-day signed token |

## 4.4 MemberProfile — the data

| Field | Meaning |
| --- | --- |
| `memberId` | `MEM-nnnnnn`, unique — also the portal login ID |
| `personId` | The identity |
| `activationDate` | Set at activation, never backdated. The anniversary that drives every cycle |
| `status` | `ACTIVE` / `DEACTIVATED` |
| `invitedByMemberId` | The inviting Member (self-relation) |
| `invitePosition`, `inviteRatePercent`, `inviteCycleId` | The position taken in the inviter's Invite cycle and the band frozen onto it |
| `reraStatus` | Pending (the honest default for a new Member) / Registered / Expired / Not Applicable |
| `reraNumber`, `reraExpiryDate`, `reraNotApplicableReason` | Number required when Registered; reason required when Not Applicable |
| `commissionHold`, `commissionHoldReason` | Member-level hold across every unpaid record |
| `legacyMemberIds[]` | Old Member IDs kept searchable after a merge |
| `termsAcceptances[]` | One append-only row per accepted Terms version |
| `performanceCycles[]` | The counter windows, stored so a cycle's progress can be shown and audited rather than recomputed on a screen |
| `portalAccount` | Login ID, password hash, status, failed attempts, lockout, last login |
| `invitedMembers[]` | The downline |
| `royaltyLinkedCustomers[]` | Customers whose first qualifying purchase this Member closed |
| `introducedCustomers[]` | History only — the Enquiry-era relationship CR-001 removed |
| `inviteYearStart` | History only — the pre-CR-014 annual counter year |

## 4.5 Person — the shared identity

Held once, read by both profiles.

| Field | Notes |
| --- | --- |
| `fullName` | Indexed |
| `dateOfBirth` | Part of the final buyer details collected before Allotment or Registry. Stored at UTC midnight and read back in UTC |
| `primaryMobile`, `altMobile` | Contact only. **Deliberately not unique** — a mobile may be shared. A Member logs in with the Member ID, never a mobile |
| `email`, `city`, `addressLine` | — |
| `aadhaarCipher`, `aadhaarLastFour`, `aadhaarBlindIndex`, `aadhaarStatus` | AES-256-GCM; the blind index is a deterministic keyed hash so duplicates are caught without a searchable plaintext |
| `panCipher`, `panMasked`, `panBlindIndex`, `panStatus` | Same shape |
| `mergeStatus`, `survivingPersonId` | `NONE` / `SURVIVOR` / `MERGED_AWAY`. **Old records are never deleted** and old IDs stay searchable |

---

## 5. Quick reference — the rules that surprise people

1. **Bigha is never converted.** No statewide factor exists, so it is stored as
   entered.
2. **Total Asking Value is never recomputed** from area × rate. It is what the
   seller said.
3. **Another Dealer creates no Person**, even when the mobile already exists on
   file.
4. **Activation cannot be backdated.** There is no field for it.
5. **A network position, once taken, never moves** — not on an anniversary, not
   on deactivation, not on a later correction. The band rate is frozen onto the
   row.
6. **Position 10 and beyond is a real position at 0%.** It still consumes a slot.
7. **A final Royalty link is never recomputed**, including CR-003's permanent
   "no Royalty Member".
8. **Converting a Customer to a Member deletes nothing.** One Person, two
   profiles.
9. **Nothing is hard-deleted.** Land Inquiries archive; Persons merge; Members
   deactivate.
10. **UI hiding is not authorisation.** Every server action re-checks the
    permission itself.
