# Commission System — Complete Rulebook and Test Plan

**Read Part 1, approve the rules and formulas, and only then will anything be built.**

| | |
|---|---|
| **Part 1 — How it works** | Every rule, every formula, every event, with worked examples. Sections 1 to 15 |
| **Part 2 — How we will test it** | How many Members, Customers and Sales to create, and what each must produce. Sections 16 to 21 |

There is no technical content in this document. Everything is written the way the business
works, so it can be read and approved by anyone, not only by a developer.

---

# PART 1 — HOW IT WORKS

## 1. The words used in this document

| Word | Meaning here |
|---|---|
| **Member** | A person activated as a Member of the company. Earns Direct, Invite and Royalty |
| **Customer** | A buyer. Earns Loyalty only |
| **The Company** | A sale closed by the company itself, with no Member and no Customer involved. Called a 3% Club direct sale |
| **Sale** | One approved booking of one plot by one buyer |
| **Closed by** | The person recorded on the sale as the one who closed it. **This single field decides almost everything** |
| **Buyer** | The primary customer of the sale — the person commercially buying it |
| **Milestone** | The percentage of payment that must be received before a commission becomes payable |
| **Entitlement / slot** | A one-time right to earn a particular commission. Once used, it cannot be used again |
| **Beneficiary** | The person a commission will be paid to |
| **Legally completed** | The sale reached final delivery. Before that, it is not legally completed |

---

## 2. The five commissions

| # | Commission | Who earns it | Why they earn it | Rate | Becomes payable at |
|---|---|---|---|---|---|
| 1 | **Direct** | The Member who closed the sale | They sold the plot | **3%** | **25%** payment received |
| 2 | **Invite** | The Member who invited that selling Member | They brought that Member into the company | **1% / 0.5% / 0.25%** (band) | **100%** payment received |
| 3 | **Royalty** | The Member who first introduced the buyer | They brought that Customer into the company | **1% / 0.5% / 0.25%** (band) | **100%** payment received |
| 4 | **Loyalty** | A Customer | They closed a sale for someone else, **or** they bought again themselves | **1%** | **100%** payment received |
| 5 | **Buying** | Whoever arranged a purchase **by** the company | They found the company a property to buy | **Typed in by hand, case by case** | **100%** of the payment the company has given out |

Commissions 1 to 4 are **sale commissions** and share one 4% ceiling.
Commission 5 is on the buying side. It sits **outside** the ceiling, has no bands, and has no
lifetime limit.

### Buying Commission — its own small set of rules

- One Buying Commission per acquisition. A second one cannot be added.
- The percentage is entered by hand. It must be above 0% and not more than 100%.
- It **cannot** be given to the seller, or to the previous owner selling the property back.
- On a buyback, it **cannot** be given to any customer of the booking being bought back —
  nobody earns a commission for arranging the return of their own property.
- If the company itself arranged the purchase, nobody earns it.

---

## 3. The two counters and the band table

Every Member keeps **two separate counters**, and they never mix.

| Counter | Counts | Feeds |
|---|---|---|
| **Invited Members** | The Members this Member brings in | The **Invite** commission |
| **Introduced Customers** | The Customers this Member brings in | The **Royalty** commission |

Being 1st in one counter has no effect at all on the other. The same Member can be at
position 1 in one and position 8 in the other on the same day.

### The band table — the same table for both counters

| Position | Rate earned |
|---|---|
| 1st, 2nd, 3rd | **1%** |
| 4th, 5th, 6th | **0.5%** |
| 7th, 8th, 9th | **0.25%** |
| 10th onwards | **0%** — nothing is earned, and no commission line is created at all |

### The counter year

The year runs from **that Member's own activation anniversary** — not April, not January.
Every Member's year starts on a different date.

- Activated on 14 March → their year runs 14 March to 13 March.
- Activated on 29 February → in a non-leap year the anniversary falls on **28 February**.

### The rule that matters most

> **A position, once given, is frozen for life — and so is the rate it earned.**

It never moves, never renumbers, never re-rates. When the anniversary passes, only the
**new** people entering start again at position 1. Everyone already placed stays exactly
where they are, on exactly the rate they got.

**Example — Member M1, activated 1 April:**

| Who joins under M1 | When | Position | Rate | After the next anniversary |
|---|---|---|---|---|
| Member A | June 2026 | 1 | 1% | Still position 1, still 1% |
| Member B | September 2026 | 2 | 1% | Still position 2, still 1% |
| Member C | February 2027 | 3 | 1% | Still position 3, still 1% |
| Member D | May 2027 | **1 of the new year** | 1% | — |

A, B and C do not shift. D does not become position 4.

---

## 4. How a person enters a counter

### A Member enters the Invited Members counter

- Only **Admin or MD** can activate a Member.
- Activation **cannot be backdated**. It happens on the day it is done.
- If the new Member was invited by an existing Member, they take the **next free position**
  in that Member's current counter year, and the band rate is stamped on them then and there.
- A Member activated without an inviter has no position and generates no Invite, ever.

### A Customer enters the Introduced Customers counter

This is the part most easily missed:

> **A Customer's introducer is decided by the enquiry, not by the sale.**

- The introducer freezes on the **earliest enquiry** for that person that was recorded as
  sourced by a Member.
- Once frozen, later enquiries by other Members **never** overwrite it.
- If two enquiries carry the exact same timestamp, the lower enquiry number wins.
- At the moment of freezing, the Customer takes the **next free position** in that Member's
  Introduced Customers counter for that year, and the band rate is stamped.
- Correcting the introducer afterwards is possible, but only by **Admin or MD**, and only
  with a compulsory written reason. The Customer then takes the next available position
  under the corrected Member, and the old position stays as history.

**Consequence:** a Customer with no Member-sourced enquiry has no introducer and no
position, so **no Royalty will ever be generated for them**, no matter who sells to them.

---

## 5. Which sale pays what

This is the entire matrix. What decides it is **who is recorded as having closed the sale**,
together with **who the buyer is**.

| Sale closed by | Buyer | What is generated | Total |
|---|---|---|---|
| A **Member** | Someone else | Direct 3% to that Member **+** Invite band to the Member who invited them | up to 4% |
| A **Member** | That **same Member** | Direct 3% only, and it waits until **100%** | 3% |
| Anyone | A buyer who is an **active Member**, where "closed by" names somebody else | **Not allowed** — it must be recorded as that Member's own purchase | conflict |
| A **Customer** | Someone else | Loyalty 1% to the Customer who closed it | 1% |
| A **Customer** | **Themselves** | **Not allowed** — a repeat personal purchase is a company sale | conflict |
| **The Company** | A buyer with **no earlier purchase** | **Nothing at all** | 0% |
| **The Company** | A buyer with an **earlier purchase** | Loyalty 1% to the buyer **+** Royalty band to the Member who first introduced them | up to 2% |

### Three things that are commonly misunderstood

**a) The enquiry does not decide the commission.**
Where the enquiry came from is history. It is used for exactly one thing — deciding who the
Customer's original introducer is, which later feeds Royalty. It never decides who gets paid
on a sale. **Who closed the sale decides that.**

**b) A first company purchase pays nobody.**
A walk-in buyer who walks in and buys earns nothing for anybody. Loyalty and Royalty appear
only from that buyer's **second** purchase onwards.

**c) What counts as an "earlier purchase".**
Only a purchase that Accounts actually approved, that was submitted earlier, and that was
not cancelled or rejected. A rejected request or a cancelled booking does not make the next
purchase a repeat purchase.

---

## 6. How many times each one can be earned

This is where the double-payment risk lives. Three of the five are **one-time entitlements**.

| Commission | The slot belongs to | How many | Counted across |
|---|---|---|---|
| **Direct** | — | Unlimited. Every qualifying sale earns it | — |
| **Invite** | The **invited Member** | **1 for life** | All projects, all years |
| **Royalty** | The **introduced Customer** | **1 for life** | All projects, all years |
| **Loyalty** | The **Customer** | **3 for life, in total** | All projects, all years, both kinds of Loyalty together |
| **Buying** | — | 1 per acquisition | — |

Read the Invite row carefully. The slot belongs to the **invited** Member, but the money goes
to the **inviting** Member:

> M1 invites Member A. However many plots A sells over the next ten years, **M1 earns the
> Invite exactly once from A** — on A's first sale to reach 100%. If M1 also invites B, C
> and D, that is a separate slot each, so M1 earns four times in total: once per person
> invited, never twice for the same person.

The three Loyalty slots are shared between both kinds of Loyalty. A Customer who closes two
sales for friends and then buys a second plot themselves has used all three, and earns
nothing on any sale after that.

---

## 7. The 4% ceiling

> **Direct + Invite + Royalty + Loyalty on any one sale can never exceed 4%.**

If a combination ever would, the system generates **nothing at all** for that sale and raises
a **Commission Conflict** for CRM or Admin to correct the sale details. It never trims a
component to make it fit, and it never quietly drops the smallest one.

While a conflict is open, **no commission on that sale can be marked ready or paid** —
including any component that on its own would have been perfectly valid.

Buying Commission is not counted in this ceiling.

**Worth knowing:** with today's rates the highest total that can actually occur is exactly 4%
— Direct 3% plus an Invite of 1%. So the ceiling cannot be breached as things stand. It is a
guard against a future rate change. See decision 6 in section 21.

---

## 8. Payment — the engine behind everything

Nothing is earned by creating a sale, and nothing is earned by approving it. Commission is
earned by **payment arriving and being verified**.

### How payment progress works

- Accounts records each payment received as a **percentage of the total**, against a
  reference number.
- Each payment is applied to the **oldest unpaid instalment first**.
- Progress can never go **above 100%** or **below 0%**. An entry that would push it past
  100% is refused.
- The sale is treated as payment-complete only at exactly **100%**.
- Every payment reference must be **unique across the entire system**. The same reference
  cannot be used twice, anywhere, for anything.
- A payment entered wrongly is **corrected, never deleted**. The original stays visible as
  history and the correction is recorded against it.

### The milestones

| Commission | Milestone |
|---|---|
| Direct, on a sale to somebody else | **25%** |
| Direct, on a Member's own purchase | **100%** |
| Invite | **100%** |
| Royalty | **100%** |
| Loyalty | **100%** |
| Buying | **100%** of the payment given out by the company |

**The formula:**

> A commission becomes payable when
> **verified payment received on that sale ≥ the milestone for that commission**,
> and none of the holds in section 10 apply.

The commission lines themselves are created earlier — as soon as Accounts approves the sale
— so from day one everybody can see what the sale will earn and for whom. But nothing is
claimed, and no slot is taken, until the milestone is actually reached.

---

## 9. When a slot is taken, and when it comes back

This is the single most important mechanism in the system, and the one most likely to hide a
loophole.

### When it is taken

> **The slot is taken at the moment payment crosses the milestone. Not before.**

This means: if the same Member has three sales running at once, **all three will show an
Invite line** for their inviter. That is correct and expected. The first sale to reach 100%
takes the slot and pays. The other two are then closed with "the entitlement is already
taken" and pay nothing. The inviter is paid once.

The same applies when two sales cross 100% at the very same instant. The system deliberately
makes them queue, so only one can win the slot. The loser's line is closed with a reason —
it is never paid, and never left half-claimed.

### When it comes back

| What happened | Slot returns? |
|---|---|
| Sale cancelled **before** legal completion | **Yes** — it reopens and somebody else can earn it |
| Sale legally completed, and only later bought back | **No** — it stays used. The sale did happen |
| Payment corrected downwards, back below the milestone | **Yes** — it reopens and the commission line steps back to unpaid |
| The sale's "closed by" or beneficiary is corrected | **Yes** — the old line is withdrawn, its slot reopens, the new person takes it |

**Nothing is ever deleted.** A reopened slot keeps its history and the reason it was
reopened. A withdrawn commission line is marked as replaced, not removed.

---

## 10. Eligibility — a separate question from the calculation

A commission can be correctly calculated, past its milestone, and still not be paid. That is
deliberate. Eligibility is rechecked **every time anything changes**.

The holds, in the order they are checked:

| Order | Hold | Applies to | Cleared by |
|---|---|---|---|
| 1 | Sale is above 4% | Everyone on that sale | CRM/Admin correcting the sale details |
| 2 | Sale is under **refund** | Everyone on that sale | The refund being settled or withdrawn |
| 3 | Sale is under **plot change** | Everyone on that sale | The change being settled or withdrawn |
| 4 | Sale is under **buyback** | Everyone on that sale | The buyback being settled or withdrawn |
| 5 | Company's own payment still pending | Buying Commission | The company completing its payment |
| 6 | **Member deactivated** | Member commissions only | Reactivation |
| 7 | **Member on commission hold** | Member commissions only | The hold being lifted, with a reason |
| 8 | _Milestone not yet reached_ | Everyone | Payment arriving |
| 9 | **Aadhaar not on record** | Anyone | Recording the Aadhaar |
| 10 | **Bank account not verified** | Anyone | Verifying a bank account for that person |
| 11 | **RERA pending or expired** | Member commissions only | RERA registered, or marked not applicable with a reason |

Points that matter:

- Holds 1 to 7 are judged **before** the milestone. So a held commission does not show as
  "waiting for payment" — it shows the real reason.
- **PAN never causes a hold.** Aadhaar does.
- RERA marked _Registered_ or _Not applicable_ both satisfy the condition. Only _Pending_ and
  _Expired_ hold. _Not applicable_ always needs a written reason.
- A Customer's Loyalty is never held for RERA or Member status — those are Member conditions.
- One verified bank account is enough. It belongs to the person, not to the sale.

---

## 11. Paying it out

| State | Meaning |
|---|---|
| **Not paid** | The normal starting state |
| **Paid** | Accounts paid it after eligibility became ready |
| **Paid early** | Accounts paid it before the conditions were met. Needs **compulsory remarks**. No extra approval from MD or Admin is required |
| **Accounts adjustment required** | It was already paid, and then something changed that should have stopped it. A human has to settle it |
| **Cancelled** | The sale was cancelled, or the entitlement was lost to another sale |

The rules:

- Every payout needs a **date, a reference and — for an early payment — remarks**.
- The payout date **cannot be in the future**.
- The reference must be **unique across the whole system**.
- A commission already _Paid_ or _Paid early_ can **never be marked paid again**.
- A commission _Paid early_ does **not** raise a second payout task when it later reaches its
  normal milestone.
- A commission in _Accounts adjustment required_ cannot be paid at all until it is settled.
- A _Cancelled_ commission can never be paid.
- If a paid commission is later affected by a cancellation, a payment correction or a
  beneficiary correction, it becomes **Accounts adjustment required**. It is never quietly
  reversed and never deleted.
- One payout task is raised per commission when it becomes ready — never a second one.

---

## 12. What happens on every business event

This is the complete list of events that touch commission.

| Event | Effect on commission |
|---|---|
| **Sale request submitted** | Nothing. No commission exists yet |
| **Accounts approves the sale** | All commission lines are created and immediately checked. If the total would exceed 4%, nothing is created and a conflict task is raised for CRM |
| **Accounts rejects the request** | Nothing was created, so nothing happens. It does not count as an earlier purchase |
| **Payment received and verified** | Everything is rechecked. Any line whose milestone is now reached claims its slot and becomes ready, if no hold applies |
| **Payment corrected downwards** | Everything is rechecked. Any line that has fallen below its milestone gives its slot back and steps down to unpaid. If it was already paid, it becomes _Accounts adjustment required_ |
| **Refund / cancellation raised** | Every commission on that sale goes on hold. **Slots are not released yet** — the cancellation has only been requested |
| **Cancellation approved** | Unpaid lines are cancelled and their slots reopen. Paid lines become _Accounts adjustment required_. The enquiry returns to active unless it was closed separately |
| **Plot change approved** | The commission is regenerated against the new plot and rechecked against the payment already received |
| **Buyback approved** | The original sale closes. If it had reached legal delivery, its slots **stay used**. If it had not, they reopen |
| **"Closed by" corrected** | The old commission is withdrawn and its slot reopened; the new commission is generated. A task goes to Accounts to review the impact. Booking and payment history are untouched |
| **Primary buyer changed** | Same as above — the commission follows the corrected attribution |
| **Original introducer corrected** | Only Admin or MD, with a written reason. The Customer takes a new position under the corrected Member; the old position stays as history |
| **Member activated** | They take their position under their inviter, with the band rate stamped, and a portal login is created |
| **Member deactivated** | Portal access is cut immediately. Every unpaid commission goes on hold. Paid history is untouched. Positions do not move. Pending hold requests are sent to CRM to review |
| **Member reactivated** | Every unpaid commission is rechecked — not assumed to be payable again. The same task resumes; a duplicate is not created |
| **Member put on / taken off commission hold** | A written reason is compulsory. Every unpaid commission of that Member is rechecked |
| **Member's RERA status changed** | Every unpaid commission of that Member is rechecked at once |
| **Bank account verified / Aadhaar recorded** | That person's held commissions can become ready at the next recheck |
| **Two people merged into one identity** | Only MD may approve it. Two active Members can never be merged. The Loyalty count is **rebuilt from unique qualifying sales** — not added together, and not the higher of the two. The same sale recorded against both identities counts once. The result is capped at three. Nothing is deleted; the merged-away identity stays searchable |
| **Anniversary passes** | Nothing is renumbered or re-rated. Only new entries start at position 1 of the new year |

---

## 13. Who is allowed to do what

| Action | Who |
|---|---|
| Activate or deactivate a Member | Admin or MD only |
| Correct a Customer's original introducer | Admin or MD only, with a written reason |
| Approve a person merge | MD only |
| Approve a sale, so commission is created | Accounts |
| Record payment received | Accounts |
| Mark a commission paid, or paid early | Accounts |
| Correct "closed by" | Raised for review, then approved — and the commission impact goes back to Accounts |
| Fix a commission conflict | CRM or Admin, by correcting the sale details |
| Put a Member on commission hold | Recorded with a compulsory reason |

The person who submits a sale and the person who approves it are never the same account.

---

## 14. What a Member sees in their portal

A Member sees, for each of their own commissions: the project, the plot, the type of
commission, the percentage, the milestone, the current status, the reason for any hold, and
the date it was paid.

They **never** see the buyer's identity, and they never see anybody else's commission.

---

## 15. Money — the one open point

> **The system stores percentages only. There is no rupee value stored anywhere.**

Everything above is a percentage. The payout is:

> **Payout = the sale value × the commission percentage**

but _which_ sale value is not decided, and the system does not hold one. This is decision 1
in section 21, and it must be answered before any payout screen can be built.

### Worked example 1 — a Member's third-party sale (₹50,00,000 plot, for illustration)

Member A sits at position 1 under M1. A sells a plot to a walk-in buyer.

| Stage | What happens |
|---|---|
| Sale approved | Two lines created: Direct 3% for A, Invite 1% for M1. Total 4% — inside the ceiling |
| Payment reaches 25% | A's Direct becomes payable → **₹1,50,000**. M1's line still says waiting for 100% |
| Payment reaches 100% | M1's Invite becomes payable → **₹50,000**, and **M1's Invite slot for Member A is used up forever** |
| A sells ten more plots | A earns Direct 3% on every one. **M1 earns nothing more from A, ever** |

### Worked example 2 — a repeat company purchase

Customer C was introduced by M1 and sits at position 4 in M1's Introduced Customers counter.
C already owns one plot and now buys a second, directly from the company.

| Stage | What happens |
|---|---|
| Sale approved | Two lines: Loyalty 1% for C, Royalty 0.5% for M1. Nobody earns Direct — the company sold it |
| Payment reaches 100% | C earns **₹50,000** (Loyalty 1 of 3 used). M1 earns **₹25,000**, and **M1's Royalty on C is used up forever** |
| C buys a third plot | C earns Loyalty again (2 of 3). **M1 earns nothing** — the Royalty slot for C is gone |
| C buys a fourth and fifth plot | Loyalty on the fourth (3 of 3). **Nothing at all on the fifth** |

### Worked example 3 — a Customer who closes sales for others

Customer D introduces and closes sales for three friends, then buys a second plot themselves.

| Sale | What D earns |
|---|---|
| Friend 1 | Loyalty 1% (1 of 3) |
| Friend 2 | Loyalty 1% (2 of 3) |
| Friend 3 | Loyalty 1% (3 of 3) |
| D's own second purchase | **Nothing.** All three lifetime bonuses are used |

---

# PART 2 — HOW WE WILL TEST IT

## 16. The question the test has to answer

> **Can any person be paid twice for the same thing?**

The specific ways it could happen:

1. Two sales by the same Member both reach 100% — does the inviter get the Invite twice?
2. Two sales reach 100% **at the same instant** — does the slot get taken by both?
3. A Customer buys a third, fourth and fifth time — does Royalty repeat each time?
4. A Customer closes four sales — is the fourth Loyalty correctly refused?
5. A sale is cancelled after commission was paid — is it reclaimed, or silently lost?
6. A sale is cancelled, the slot reopens, and the sale is later revived — two payouts?
7. Payment is corrected down and then back up — does the milestone pay twice?
8. "Closed by" is corrected — do the old and the new person both keep a payout?
9. The introducer is corrected from Member A to Member B — do both earn Royalty?
10. A Member is deactivated and reactivated — does a second payout task appear?
11. The same payment reference is entered twice — are two payments recorded?
12. A Customer who is also a Member — do they collect Loyalty and Direct on one sale?
13. Position 10 and beyond — does 0% earn nothing, rather than falling back to 1%?
14. The anniversary passes — do existing positions get renumbered or re-rated?
15. Two duplicate identities are merged — do their Loyalty counts add up to six?

---

## 17. The dataset — how much to create

The size is fixed by the band table, not by a wish for volume. To prove positions 1 through
10, we need 10 people in a counter. Everything else layers on top.

| What | How many | Why exactly this many |
|---|---|---|
| **Projects** | 2 | To prove the lifetime limits are per person, not per project |
| **Plots** | 45 | 37 sales plus spares for cancellations and plot changes |
| **Members** | 15 | Breakdown below |
| **Customers** | 32 | Breakdown below |
| **Enquiries** | 14 | Royalty depends on the enquiry, not on the sale |
| **Sales** | 37 | Scenario list in section 18 |
| **Acquisitions** | 3 | One buyback of a delivered sale, one of an undelivered sale, one outside purchase for Buying Commission |

### The 15 Members

| Who | Count | Purpose |
|---|---|---|
| Root Member (M1) | 1 | Top of the chain. Nobody invited them |
| Invited by M1 in one year | 10 | Positions 1 to 10 — proves every band and the 0% cut-off |
| Invited by M1 after the anniversary | 1 | Must take position 1 of the **new** year, while the earlier ten do not move |
| Invited by M2 | 1 | Must take position 1 under M2 — proves the counters are per Member, not global |
| Member with no inviter | 1 | Their sales must pay Direct only, with no Invite anywhere |
| Spare Member | 1 | For deactivation, commission hold, RERA and bank-verification tests |

### The 32 Customers

| Who | Count | Purpose |
|---|---|---|
| Introduced by M1 | 10 | Positions 1 to 10 in the Introduced Customers counter. Only positions 1, 4, 7 and 10 need to buy — the other six exist to occupy positions |
| Introduced by M1 after the anniversary | 1 | Must take position 1 of the new year |
| Introduced by M2 | 1 | Position 1 under M2 |
| Walk-in buyers | 10 | Buyers for the ten Member-closed sales |
| Buyers for the Loyalty tests | 4 | So one Customer can close four sales and be refused on the fourth |
| Buyers for the simultaneous test | 2 | Two sales hitting 100% together |
| Customers with no introducer | 2 | Their repeat purchase must pay Loyalty but no Royalty |
| A duplicate identity pair | 2 | The same real person entered twice, for the merge test |

### Document coverage — important

At least half of these people must carry **Aadhaar and a verified bank account**, and the
Members involved must carry a valid RERA status. Otherwise every commission will correctly
sit on hold, and the test will look broken when it is working perfectly.

---

## 18. The 37 sales and what each must produce

### Group A — Direct and the Invite bands (10 sales)

Each of the ten Members invited by M1 closes one sale to a walk-in buyer, and each sale is
taken to 100% payment.

| Sale | Closed by (position under M1) | Expected |
|---|---|---|
| A1 | Position 1 | Direct 3% to the seller at 25% · Invite **1%** to M1 at 100% · total 4% |
| A2, A3 | Positions 2, 3 | Direct 3% · Invite **1%** |
| A4–A6 | Positions 4, 5, 6 | Direct 3% · Invite **0.5%** |
| A7–A9 | Positions 7, 8, 9 | Direct 3% · Invite **0.25%** |
| A10 | Position 10 | Direct 3% · **no Invite line at all** |

### Group B — The Invite double-pay test (2 sales)

The Member at position 1 closes two more sales. Both are taken close to 100%, then pushed
over **together**.

| Sale | Expected |
|---|---|
| B1, B2 | Both show an Invite line while below 100%. The **first** to reach 100% pays M1. The second is closed with "the entitlement is already taken". Across A1, B1 and B2, **M1 is paid exactly once** for this Member |

### Group C — A Member's own purchase (2 sales)

| Sale | Expected |
|---|---|
| C1 | A Member buys for themselves, recorded as closed by themselves → Direct 3% at **100%**, no Invite to their inviter |
| C2 | The same purchase recorded as closed by somebody else → **conflict raised, nothing generated** |

### Group D — Loyalty for closing a sale (5 sales)

One Customer closes sales for four different buyers.

| Sale | Expected |
|---|---|
| D1, D2, D3 | Loyalty **1%** each to the closing Customer, at 100% |
| D4 | **Nothing** — the three lifetime bonuses are used up |
| D5 | That Customer recorded as closing their **own** purchase → **conflict, nothing generated** |

### Group E — Company sales, Loyalty and Royalty (12 sales)

| Sale | Expected |
|---|---|
| E1 | A Customer's **first** company purchase → **nothing at all** |
| E2–E9 | The **second** purchase of the Customers at introduced positions 1, 4, 7 and 10 → Loyalty **1%** to the buyer, plus Royalty of **1% / 0.5% / 0.25% / nothing** to M1 |
| E10 | A **third** purchase by one of them → Loyalty again (2 of 3), but **Royalty must not repeat** |
| E11, E12 | A Customer with no introducer buys twice → Loyalty on the second, **no Royalty** |

### Group F — Reversals (4 sales)

| Sale | Expected |
|---|---|
| F1 | Cancelled before legal completion after taking a slot → **slot reopens** |
| F2 | A later sale takes the reopened slot → paid **once**, to the right person |
| F3 | Delivered, then bought back → **slot stays used**, nobody else can earn it |
| F4 | Commission already paid, then the sale cancelled → becomes **Accounts adjustment required**, never silently deleted |

### Group G — The merge test (2 sales)

| Sale | Expected |
|---|---|
| G1, G2 | The same real person, entered twice as two identities, earns Loyalty under each. After the merge the surviving identity holds the **correct unique count — not the sum**. If both identities were credited from the same sale, it counts **once** |

### Group H — Corrections (no new sales; uses the sales above)

| Test | Expected |
|---|---|
| Correct "closed by" on an A-group sale | Old commission withdrawn, its slot reopened, new commission generated. **Not both.** Accounts gets a review task |
| Correct the primary buyer | The commission follows the correction, and does not duplicate |
| Correct a Customer's introducer from M1 to M2 | The Royalty follows to M2. **M1 must not keep an unearned Royalty** |

---

## 19. What else has to be tested — beyond Members, Customers and plots

### 19.1 Payments — the real trigger

The test must move a sale's payment percentage **up and back down**:

- Crossing 25% — Direct becomes payable
- Crossing 100% — Invite, Royalty and Loyalty become payable and take their slots
- A **correction downwards** below 100% after a slot was taken — the slot must come back
- Crossing 100% **again** afterwards — it must pay once, not twice
- An entry that would take the total past 100% — it must be refused
- The **same payment reference entered twice** — the second must be refused

### 19.2 The beneficiary's readiness

Each of these must be applied as a hold and then released: Aadhaar missing, bank not
verified, RERA pending, RERA expired, Member deactivated then reactivated, Member put on
commission hold then released.

### 19.3 Sale-level blocks

A sale under refund, plot change or buyback holds every commission on it. Each must be raised
and then withdrawn, and commission must resume — **without raising a second payout task**,
and without releasing slots while the request is only pending.

### 19.4 Enquiries

Fourteen Member-sourced enquiries are needed to place the introduced Customers into their
positions. Also test: two enquiries from two different Members for the same person — only the
**earliest** may freeze, and the later one must never overwrite it.

### 19.5 Two things at once

Two sales reaching 100% in the same second, and two Members activated in the same second.
These must be fired **together**, not one after the other. This is where a double payment is
most likely to slip through.

### 19.6 Time

The anniversary rollover cannot be tested without controlling dates. We need to be able to
set activation dates in the past so a counter year can be crossed on demand. Without this,
the "after the anniversary" cases in section 17 cannot run at all. A 29 February activation
should be included.

### 19.7 Repeating the same action

Every approval, payment and payout must be submitted **twice**, deliberately, including a
double click. The second must change nothing.

### 19.8 Buying Commission

Three checks: it cannot go to the seller; it cannot go to a customer of the buyback being
arranged; and a second one cannot be added to the same acquisition. It must also stay
**outside** the 4% ceiling, and wait for the company's own payment to complete.

---

## 20. What actually protects us at thousands of records

Mock data proves the rules hold for 37 sales. It cannot prove they hold for 37,000. What
proves that is a set of **standing checks** — run across the whole database at any size, at
any time, and always coming back empty:

1. No Member has earned an Invite twice for the same invited Member.
2. No Customer has generated Royalty more than once in their lifetime.
3. No Customer has more than three Loyalty bonuses.
4. No sale's live commission adds up to more than 4%.
5. Every used entitlement points to exactly one live commission, and every live commission
   that needs one has exactly one.
6. No sale carries two live commissions of the same kind for the same person.
7. Every position within one Member's counter year is unique, starts at 1, and has no gaps.
8. Every frozen rate still matches the band its position falls in.
9. No cancelled-before-completion sale is still holding an entitlement.
10. No payment reference appears against two payouts.
11. No commission is marked paid twice, in any combination of normal and early payment.
12. No commission is marked ready or paid while its sale carries an open conflict.
13. Every Customer with a Royalty has a frozen introducer and a position; every Customer
    without one has no Royalty.

**Recommendation:** run these as a daily automatic check once live. At thousands of records,
this is what finds a loophole — not more mock data.

---

## 21. Decisions needed from you before coding

1. **The money base.** The system stores percentages only. Which value is 3% taken of — plot
   value, plot value with PLC charges, or the amount actually collected? And is the payout
   amount calculated inside this system or outside it?
2. **Position 10 and beyond.** Today it earns nothing and **no line is created at all**, so
   the Member sees nothing. Should they instead see a 0% line, so it is visible that the sale
   was counted but paid nothing?
3. **A Member's own purchase.** Today their inviter earns nothing on it. Please confirm.
4. **A Customer who becomes a Member.** Do their used Loyalty bonuses carry over, and can
   they still earn Loyalty afterwards?
5. **Royalty frequency.** Confirm it is once in the Customer's **lifetime**, not once per year.
6. **The 4% ceiling.** With today's rates the highest possible total is exactly 4%, so the
   ceiling can never actually be breached. Confirm no future rate is planned that would
   breach it — otherwise the conflict path can never occur with real numbers.
7. **Buying Commission.** The percentage is typed in by hand, with no band and no limit.
   Confirm this is intended, or give the rule it should follow.
8. **The merged identity.** After two identities are merged, the Loyalty count is rebuilt to
   the unique count and capped at three. Confirm this is what you want, rather than the count
   simply carrying over from the surviving identity.

---

**Once Part 1 and section 21 are approved, the mock data and the standing checks will be
built exactly as written here.**
