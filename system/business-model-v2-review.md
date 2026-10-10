# Business Model v2 — Review Before Implementation

| | |
| --- | --- |
| **Reviews** | [`3_Percent_Club_Business_Model_v2_Final_Approved.md`](./3_Percent_Club_Business_Model_v2_Final_Approved.md) — version 2.0, dated 8 October 2026 |
| **Compared against** | The current model ([`business-model.md`](./business-model.md), [`prd-complete.md`](./prd-complete.md), [`approved-changes-implementation-log.md`](./approved-changes-implementation-log.md)) and the running CRM code |
| **Review date** | 8 October 2026 |
| **Status** | For MD decision. Nothing in v2 is implemented yet. |

Section numbers such as **§21** refer to the v2 document. Code paths are from the repository root.

---

## Verdict

The direction of v2 is right. Eight points should be fixed in the document before any code is written, and two of them (2.1 and 2.2) are real money risks.

Fix them in the document first, because the CRM will freeze these rules onto every Booking at submission (v2 §16, §17). Once real Bookings exist under a rule, changing it needs a new version, and every earlier Booking keeps the old rule.

---

## 1. What is right in v2

- **Monetary Invite bands, positions and cycles are removed.** This was the most MLM-looking part of the model and the most complex code: anniversary jobs and 9-position performance cycles.
- **Royalty becomes a one-time non-cash gift.** It is cheaper, simpler and easier to explain than bands and cycles.
- **Rates are Project-specific, versioned and MD-approved (§12–§15).** This suits a business with several developers. "3% is the brand name, not a promise" (§9) fixes a real advertising risk.
- **A benefit that is not offered is Disabled, not 0% (§13).** This is clear on screen and in the data.
- **Rates freeze per Booking and nothing changes retroactively (§16, §17).** This protects both the company and the Member.
- **Every reward has one owner, one qualifying event, one freeze point, one cancellation rule and one fulfilment rule (§84).** That makes the model testable.

---

## 2. Fix before building

Most important first.

### 2.1 Unlimited Customer-closing Loyalty creates unregistered brokers — §21, §22, §25

**Problem.** A Customer can close sales for other buyers at up to 3% (§13), with no lifetime limit (§21), and never has to become a Member. The Membership invitation after the third sale does not block anything (§25).

**What changes from today.** The current model allows 3 Loyalty benefits in a lifetime. After that, a Customer must become a Member to keep selling to others. The CRM checks RERA only on Member commission; Customer Loyalty never checks it (`src/lib/domain/commission.ts:756`, `:808`).

**Why it matters.**

- A dealer's relative or friend can stay a "Customer" and sell without Member Terms, without RERA, and without the deactivation that disciplines Members.
- RERA treats anyone who facilitates a sale for a commission as a real-estate agent who must register. v2 itself sends "frequent Customer-selling activity" to legal review (§82).
- Taking a reward away after launch is much harder than adding one later.

**Suggested rule.**

> Repeat-purchase Loyalty stays unlimited. Customer-closing Loyalty is limited to three qualified events per Customer for life. To earn on a fourth Customer-closed sale, the Customer must first be activated as a Member; that sale is then a Member sale under the Direct rules.

If MD wants Customer-closing to stay unlimited, the minimum safeguard is this: from the fourth Customer-closing event, Loyalty needs a valid RERA agent registration, checked the same way as a Member's.

### 2.2 Approved Buyback unlocks too much — §21, §23, §31, §41, §59

**Problem.** An Approved Buyback counts as the 100% milestone for Customer Loyalty (cash, up to 3%, unlimited), for Own-Sale and Reference Trip Credits, and for Royalty eligibility. In the current model the same rule was cheap, because Loyalty was 1% and allowed at most three times.

**What the CRM allows today.** A Buyback can be raised on any approved Booking (Booked, Payment Completed or Delivered) with no minimum Payment Received (`src/lib/services/acquisition-service.ts:183`).

**The loophole.**

1. A seller and a friendly buyer book a plot, and the buyer pays a small amount.
2. The company approves a Buyback. Loyalty, the Trip Credit and the Reference Credit qualify.
3. The buyer gets their money back. The same plot is resold to another friend and bought back again.

§31's anti-farming rule only stops a Member re-buying the same plot themselves. It does not cover third-party sales of the same plot, and §72's fraud clause only helps after someone notices.

**Suggested rules.**

> **(a)** An Approved Buyback counts as the alternative milestone for Customer Loyalty, Trip Credits and Royalty only if the source Booking had reached at least **[25]%** verified Payment Received before the Buyback was raised.
>
> **(b)** A Member can receive at most **one Own-Sale Credit for the same Plot/Unit within the same Project Trip Programme (all versions)**, whether the sale was a self-purchase or a third-party sale. A different Member who later genuinely sells the bought-back plot can still earn their own credit.

Rule (b) replaces the self-purchase-only rule in §31. It is also simpler to enforce: one check per Member, unit and programme.

### 2.3 Say which "Booking Request submission" freezes the rules — §16, §20, §39

**Problem.** v2 freezes rates and programme versions at Booking Request submission. Before Accounts approves it, a request can be rejected, or edited and resubmitted as a new version. v2 doesn't say which submission counts.

**What changes from today.** The CRM freezes the buyer's classification and generates commission at Accounts approval (`Booking.originalClassification`, `prisma/schema.prisma:1015`). Only the PLC snapshot is frozen at submission today (`Booking.plcSnapshotId`, `prisma/schema.prisma:1025`).

**Why it matters.** Without a rule, an early placeholder request could lock in an old, better rate. A request that stays pending a long time could also end up with a rate it should not have.

**Trip side.** §39 opens and freezes a Trip bucket at submission, before Accounts has approved anything. A rejected request would open a bucket and show Pending progress on the Member portal that never existed.

**Suggested rule.**

> The freeze moment is the submission time of the Booking Request version that Accounts approves. A rejected or withdrawn request freezes nothing. If a request is edited and resubmitted, the new version's submission time is the freeze. The buyer's Member status (Active, Deactivated or none) is read at that same moment.
>
> Trip rules are frozen as of that moment, but the Pending Trip Credit is created, and a bucket opened, only when Accounts approves the Booking.

### 2.4 The two Trip freezes conflict — §16 and §39

**Problem.** The Booking freezes its Trip Programme version and eligible inventory at submission (§16). The bucket freezes its own version at its first Pending credit (§39). If the programme changes while a bucket is open, a Booking frozen under the new version lands in a bucket frozen under the old one, and the two versions can disagree on which inventory is eligible.

**Suggested rule.**

> The Booking's frozen version decides **whether** the Plot/Unit earns a credit (programme active, unit eligible). The bucket's frozen version decides **how credits add up** (Total Target, Minimum Own, Maximum Reference, self-purchase rules). A Member has one open bucket per Project, and any eligible credit fills it.

### 2.5 Define "first purchase" once — §23, §49, §50

**Problem.** On the Customer side, two rules depend on a Customer's first purchase, and v2 defines "first" differently for each:

- **Royalty (§49, §50):** the earliest *approved* Booking. It becomes final at 100% or an Approved Buyback, and a later purchase can take its place if it is cancelled before then.
- **Repeat-purchase Loyalty (§23):** "first personal purchase is not repeat-purchase Loyalty", but "first" is not defined, and neither is what happens when the first purchase is cancelled.

With two Bookings in progress at once, the two rules can name different Bookings as "first".

The Member side is fine. Reference Credit (§34) already has a clear rule: earliest qualifying timestamp, then the lower Booking Number.

**Suggested rule.**

> A Customer's first personal purchase is their earliest Booking, by submission time, that Accounts approved and that was not cancelled before reaching 100% verified Payment Received or an Approved Buyback. If it is cancelled before then, the next such Booking becomes the first. The same definition is used for repeat-purchase Loyalty and for the Royalty relationship.

### 2.6 Royalty gaps — §12, §49, §52

| Question v2 leaves open | Suggested answer |
| --- | --- |
| §52 covers *another* Member closing the repeat purchase. What if the Royalty Linked Member closes it themselves? | Same rule: Direct only, no Royalty, and the opportunity stays open. One rule for every Member-closed repeat purchase. |
| Does a repeat purchase that is Sold By Customer trigger or use up the Royalty? | No. It is not a Club-direct purchase, so the opportunity stays open. |
| Can a Member's self-purchase make them their own Royalty Linked Member? | No. A Member self-purchase never creates a Royalty relationship. |
| What if the Royalty Linked Member is Deactivated? | Same as Trip (§47): the entitlement stays, and fulfilment is held until valid reactivation. |
| Project settings (§12) have no Royalty on/off switch, but the gift's cost lands on whichever Project the repeat purchase is in. | Add **Royalty Gift — Enabled / Disabled** to Project settings and versions (§12, §15). A repeat purchase in a Royalty-disabled Project gives no gift and leaves the opportunity open. |

### 2.7 Say what v2 does not change — §1

**Problem.** v2 calls itself the "single source of truth" (§1), but it does not restate these existing rules:

- the payout conditions: Aadhaar, a verified bank account, and RERA for Members;
- the 7-working-day payout target;
- the hold reasons;
- Paid Early with MD approval;
- maker-checker.

Read literally, someone could argue they no longer apply.

**Suggested wording.**

> Business Model v2 replaces earlier rules only where it says so. Everything else in `prd-complete.md` (v3.1), the approved changes packs and the signed Change Requests stays in force, including payout conditions, hold reasons, Paid Early and maker-checker.

**Also list what is retired**, using the IDs the code already cites:

- **RD-02:** annual Invite and Royalty counters.
- **RD-03:** the combined 4% sale cap.
- **AC-02:** Royalty earned through performance cycles.
- **CR-013:** position 10+ at 0%.
- **CR-014 and CR-027:** Invite and Royalty performance cycles, and the anniversary job.
- **CR-004 in the change-request register** (Loyalty split into two three-deal allowances): withdrawn, because v2 makes Loyalty unlimited.

The repo's own rule ([`change-requests/README.md`](./change-requests/README.md)) is that any change affecting commission is raised there first. v2 should therefore be logged as a Change Request, or as a new baseline, before work starts.

### 2.8 "First-year Membership is complimentary" leaves day 366 undefined — §7

**Problem.** The current business model ([`business-model.md`](./business-model.md)) describes Membership as free. v2 says the *first year* is complimentary, which implies a fee later, but it defines nothing about renewal or expiry.

**Why it matters.**

- "Active Member" decides Direct, self-purchase, the Loyalty block (§24), and Trip and Royalty fulfilment. Before building, v2 must say what a Member is on day 366 if they have not renewed.
- The Member Terms already say "Membership fees must not finance introduction rewards" (`system/change-requests/member-terms-and-conditions.md:166`), and Reference Credits are an introduction reward. If a fee is ever charged, legal should re-check that combination against the Prize Chits and Money Circulation Schemes (Banning) Act, 1978.

**Suggested approach.** Either define renewal now, or write "Membership is free until a later approved version says otherwise" and keep fees out of v2.

---

## 3. Smaller wording fixes

| # | Where | Issue | Suggested fix |
| --- | --- | --- | --- |
| 3.1 | §11 vs §83 | §11 says Direct and Loyalty can't go "to different closers", but §83 says they can't both apply to one sale. | Keep §83's wording. Nothing in v2 lets them coexist anyway. |
| 3.2 | §21 | "One Customer Loyalty entitlement for the eligible Customer" reads as one per Customer per Booking. | "At most one Loyalty entitlement per Booking, in total." |
| 3.3 | §13 | "Loyalty lower than Direct" means nothing when Direct is Disabled. A Project with Direct off and Loyalty on pushes dealers to route sales through Customer friends. | Loyalty can be Enabled only when Direct is Enabled, unless MD approves an exception with a reason. |
| 3.4 | §31 | "Same Project Trip Programme": does a new version count as a new programme? | All versions of a Project's Trip Programme count as one programme (also covered by 2.2(b)). |
| 3.5 | §25 | "Third successful Customer-closing Loyalty event": successful at what point? | Successful means the Loyalty has qualified (100% verified Payment Received, or a qualifying Buyback). |
| 3.6 | §67 | This section only says what happens to a Member who doesn't repay a Recovery. With unlimited Loyalty, the company's exposure to Customers is larger. | A Customer with Recovery Outstanding earns no further Loyalty until it is cleared, as in the current model. |
| 3.7 | §75 | A Sold By correction after a Trip is taken or a Gift is delivered could reward two people for one sale. | After fulfilment, a correction moves only future entitlements. There is no second Trip or Gift for the same event, and fraud stays recoverable (§72). |
| 3.8 | §47, §59 | Trip and Gift fulfilment ignore RERA, but a non-cash reward for facilitating a sale is still compensation. | Hold Trip and Gift fulfilment while a Member's RERA is Pending or Expired, the same as cash commission. |
| 3.9 | §68 | The economics review is optional ("if desired"). | MD cannot approve a Trip-enabled Project version until "Economics Reviewed = Yes" is recorded. |
| 3.10 | §82 | Tax on non-cash rewards. | Trips and gifts to dealers likely attract TDS on business perquisites (formerly Section 194R). Keep a per-person record of what was given and when, and confirm with the CA. |

---

## 4. What v2 means for the CRM

**Removed (a large, healthy deletion):**

- Invite and Royalty bands, and the network position numbering.
- Performance cycles and the anniversary job (`src/lib/services/cycle-service.ts`, and much of `src/lib/services/network-service.ts`).
- The 4% cap, and its "Commission Conflict — Above 4%" hold.
- The 3-slot lifetime Loyalty limit, and the 0% "No Benefit" state.

**Added:**

- Versioned Project commission settings: Direct and Loyalty (each Enabled/Disabled, with a rate) plus the Trip settings. Admin prepares them and MD approves them.
- Rates and versions frozen on each Booking at submission.
- Royalty Gift tracking: the relationship, the Royalty Credit, the programme version, and the statuses Eligible, Ordered, Delivered and Cancelled-Reversed (§57).
- The Trip engine, the largest new piece: Own-Sale and Reference Credits, buckets, FIFO allocation, banking of extra credits, reversals, nominees and fulfilment holds.
- Stable Buyback Completion fields: allotment papers collected back, and registry-back completed (§43).

**Rewritten:**

- The commission engine (`src/lib/domain/commission.ts`), so it reads the Booking's frozen Project rates.
- The Calculator and the Member portal.
- The Member Terms (`system/change-requests/member-terms-and-conditions.md`, read at runtime by `src/lib/terms.ts`), plus Members accepting the new Terms again.
- The mock data seeds and the commission checks (`prisma/commission.check.ts`).

**Suggested build order:**

1. Project settings, Project-specific Direct and Loyalty, and the deletions.
2. Royalty Gift.
3. Trip, after the Trip Terms are signed (§80 requires them before go-live anyway), because Trip has the most open questions.

---

## 5. Decisions needed

| # | Decision | Recommended | MD decision | Date |
| --- | --- | --- | --- | --- |
| 2.1 | Limit on Customer-closing Loyalty | 3 for life, then Membership | | |
| 2.2a | Minimum payment before a Buyback qualifies rewards | 25% | | |
| 2.2b | One Own-Sale Credit per Member, per unit, per programme | Yes, for all sale types | | |
| 2.3 | Freeze moment | Submission of the version Accounts approves; Trip credit created at approval | | |
| 2.4 | Booking freeze vs bucket freeze | The Booking decides eligibility; the bucket decides how credits add up | | |
| 2.5 | One definition of "first purchase" | As written in 2.5 | | |
| 2.6 | Royalty gaps | As in the table in 2.6 | | |
| 2.7 | v2 replaces earlier rules only where it says so, and lists what is retired | Yes | | |
| 2.8 | Membership after year one | Free until a later approved version says otherwise | | |
| 3 | Smaller wording fixes | As in section 3 | | |
