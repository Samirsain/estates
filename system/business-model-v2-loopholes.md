# Business Model v2 — Loophole Register

| | |
| --- | --- |
| **Reviews** | [`3_Percent_Club_Business_Model_v2_Final_Approved.md`](./3_Percent_Club_Business_Model_v2_Final_Approved.md) — version 2.0, dated 8 October 2026 |
| **Companion to** | [`business-model-v2-review.md`](./business-model-v2-review.md) — the general review. This file lists only the ways the rules can be gamed. |
| **Review date** | 8 October 2026 |
| **Status** | For MD decision. Nothing in v2 is implemented yet. |

Section numbers such as **§21** refer to the v2 document. Code paths are from the repository root. **"CRM today"** means the behaviour of the running code, which v2 would build on.

---

## How to read this

Each loophole lists:

- **who** can use it;
- **how**, step by step;
- the **v2 sections** it comes from;
- what the **CRM does today**, where that matters;
- the **fix**, written as a rule that can go into v2.

**Severity**

| Level | Meaning |
| --- | --- |
| **High** | Real cash loss or regulatory exposure, and easy to do without anyone noticing. |
| **Medium** | Leaks rewards or creates liability. Needs some collusion, or happens only in certain cases. |
| **Low** | Small gain, easy to spot, or mainly an implementation trap. |

**Count:** 12 High, 18 Medium, 6 Low — 36 in total.

---

## Seven rules that close most of these

Many loopholes come from the same few missing rules. Adding these seven closes 13 of the 36 outright and narrows 4 more (L-04, L-08, L-33, L-35):

| # | Rule to add to v2 | Closes |
| --- | --- | --- |
| R1 | **Related parties.** Every buyer and every Sold By Person declares their related parties (spouse, parents, children, siblings, own business). A Booking is a Member self-purchase if **any** party on it — Primary or Additional — is the selling Member or a declared related party of that Member. A Sold By Customer can never be a party on the Booking or a related party of any party on it. | L-01, L-02, L-04, L-06, L-07, L-35 |
| R2 | **A change of buyer re-runs the rules.** An approved Primary Customer Change re-runs the self-purchase test, Loyalty and Royalty as at the change date. Any Direct already paid above the new entitlement becomes a Recovery. A transfer never creates a Royalty relationship. | L-03 |
| R3 | **Buyback needs real payment.** An Approved Buyback counts as the alternative milestone only if the source Booking had reached at least **[25]%** verified Payment Received before the Buyback was raised. | L-11, L-13 (partly) |
| R4 | **One credit per Member per unit per programme.** A Member can earn at most one Own-Sale Credit for the same Plot/Unit in the same Project Trip Programme (all versions), whatever the sale type. | L-13, L-17 (partly) |
| R5 | **Fulfilled means consumed forever.** Once a Trip is travelled or a Gift delivered, every credit and opportunity it used stays consumed, even if the underlying sale is later cancelled. Nothing reopens. | L-17 |
| R6 | **A Customer closer is a real, bound Customer.** Sold By Customer needs a Person with their own approved purchase, verified Aadhaar or PAN, and accepted Customer Terms that include §79 and the §70–§71 marketing rules. Customer-closing Loyalty is limited to three for life, and after that Membership is needed. | L-05, L-08 (partly), L-10, L-29 |
| R7 | **KYC before approval, one bank account per person.** Accounts cannot approve a Booking that creates any entitlement until the buyer and the Sold By Person have a verified Aadhaar or PAN. One bank account number can be verified for one Person only. | L-31, L-32, L-33 (partly) |

The remaining items need their own small fixes, listed below.

---

## Summary

| ID | Loophole | Severity | Fix |
| --- | --- | --- | --- |
| L-01 | Member co-buys as Additional Customer to escape self-purchase rules | High | R1 |
| L-02 | Member buys in a relative's name | High | R1 |
| L-03 | Primary Customer Change after approval | High | R2 |
| L-04 | Deactivate, buy through a friend, reactivate | Medium | R1 + own fix |
| L-05 | Anyone can be named a "Customer" closer | High | R6 |
| L-06 | Household and reciprocal closing | High | R1 |
| L-07 | Closer is a co-buyer on the same Booking | Medium | R1 |
| L-08 | Member routes a sale through a Customer to escape holds | High | R6 + own fix |
| L-09 | Same-day "repeat" purchases | Medium | Own fix |
| L-10 | Customer closers are not bound by the money and marketing rules | Medium | R6 |
| L-11 | Buyback unlocks cash Loyalty, Trip and Royalty | High | R3 |
| L-12 | Buying Commission to the people who made the original sale | Medium | Own fix |
| L-13 | The same plot earns credits again and again | High | R3 + R4 |
| L-14 | A throwaway booking locks an old, easier Trip bucket | Medium | Own fix |
| L-15 | Cheapest-unit and split-unit farming | Medium | Own fix |
| L-16 | Change Plot into excluded inventory keeps the credit | Low | Own fix |
| L-17 | Cancel after travel or delivery, then earn again | Medium | R5 |
| L-18 | A Deactivated inviter still collects Reference Credits | Low | Own fix |
| L-19 | Steering the Reference Credit into the right Project | Low | Own fix |
| L-20 | Banked credits and closed programmes never expire | Medium | Own fix |
| L-21 | Nominee turns a non-cash reward into cash | Medium | Own fix |
| L-22 | Steering repeat purchases to "3% Club" for Loyalty + Gift | Medium | Own fix |
| L-23 | Joint buyers create several Royalty relationships | Medium | Own fix |
| L-24 | Direct paid at 25%, then the sale is cancelled | High | Own fix |
| L-25 | Discounts given outside "Authorised Discount" | Medium | Own fix |
| L-26 | Change Plot to a cheaper unit after Direct is paid | Low | Own fix |
| L-27 | Early or edited Booking Requests lock a better rate | Medium | Own fix |
| L-28 | Backdated Project settings versions | Low | Own fix |
| L-29 | Unlimited Customer-closing Loyalty as a broker channel | High | R6 |
| L-30 | Loyalty Enabled while Direct is Disabled | Medium | Own fix |
| L-31 | Duplicate person records | Medium | R7 |
| L-32 | Shared bank accounts behind nominee Members and Customers | Medium | R7 |
| L-33 | Escaping a Recovery through a relative's Membership | High | R7 + own fix |
| L-34 | An inviter added late, just before the first sale | Medium | Own fix |
| L-35 | Staff and their relatives as closers | High | R1 + own fix |
| L-36 | Sold By Correction after a reward is fulfilled | Low | Own fix |

---

## A. Who the buyer really is

### L-01 · Member co-buys as Additional Customer — High

**v2:** §20 says "An Additional Customer who is a Member does not by itself make the Booking a Member self-purchase."

**How.**
1. Member M sells a plot with a friend or relative as Primary Customer and themselves as Additional Customer.
2. The Booking is classified as a third-party sale, not a self-purchase.

**What M gains, compared with a real self-purchase:**
- Direct at 25% payment instead of 100%.
- A third-party Own-Sale Credit, which escapes the §31 anti-recycling rule.
- M becomes the Royalty Linked Member of their own co-buyer, so a Gift comes later.

**Fix.** R1. A Booking is a self-purchase if **any** party on it is the selling Member or their declared related party.

### L-02 · Member buys in a relative's name — High

**v2:** §20 defines self-purchase only by the Primary Customer.

**How.** The Member's spouse, parent or employee is the Primary Customer, and the Member is Sold By. The result is the same as L-01, without the Member's name appearing on the Booking at all.

**Fix.** R1, with a related-party declaration that each Member signs and keeps current. Treat a false declaration as fraud under §72.

### L-03 · Primary Customer Change after approval — High

**v2:** Silent. Nothing in v2 mentions changing the Primary Customer.

**CRM today:**
- A Primary Customer Change can move an approved Booking to any Person (`src/lib/services/booking-service.ts:1097`).
- On approval it recomputes only the Royalty link (`booking-service.ts:1221`).
- It does not re-run the self-purchase test or Loyalty.

**How.** There are three ways to use it:
1. Member M sells to a friend, and Direct is paid at 25%. The Primary Customer is then changed to M. M has bought a plot for themselves with Direct at 25% instead of 100%.
2. A Booking is transferred to a new person, and it becomes that person's "first purchase". The original seller becomes the Royalty Linked Member of someone they never sold to (the CRM does this today).
3. Repeat-purchase Loyalty is paid to existing Customer X. The Booking is then moved to a new person Y. Loyalty was paid on what is now Y's first purchase.

**Fix.** R2. A change of buyer re-runs every buyer-based rule as at the change date, and a transfer never creates a Royalty relationship.

### L-04 · Deactivate, buy through a friend, reactivate — Medium

**v2:** §24 says "Deactivation cannot be used to switch reward systems", but v2 applies that only to Loyalty.

**How.** Member M is deactivated, on request or by letting a Recovery lapse. M then buys through friend Member F as a third-party sale, and F gets Direct at 25% and passes it back. M also becomes a Customer whose Royalty Linked Member is F. M is then reactivated.

**Fix.** A buyer who holds any Member capability, Active or Deactivated, creates no Royalty relationship, and the selling Member's Direct milestone is 100%. Also apply R1.

---

## B. Customer Loyalty

### L-05 · Anyone can be named a "Customer" closer — High

**v2:** §22 requires that the "Customer genuinely closes the sale", but never says who counts as a Customer.

**CRM today:** Sold By Customer accepts any Person who is not an Active Member (`src/lib/services/sold-by.ts:40`). The Person does not need to have bought anything.

**How.** A local broker is entered as a "Customer", closes sales and earns Loyalty (up to 3%, unlimited) with no Membership, Member Terms or RERA check.

**Fix.** R6. A Customer closer must have their own approved purchase, verified KYC and accepted Customer Terms.

### L-06 · Household and reciprocal closing — High

**v2:** §21–§23 exclude the first personal purchase from Loyalty, but nothing stops one family member "closing" another's purchase.

**How.**
1. Husband buys plot 1, with no reward.
2. Wife buys plot 2, with husband as Sold By Customer. Husband earns Loyalty.
3. Husband buys plot 3, with wife as Sold By Customer. Wife earns Loyalty.

Two friends can do the same for each other. Every purchase in the circle, including each person's first, earns up to 3%. The "first purchase excluded" rule stops working.

**Fix.** R1. The closer cannot be a related party of any buyer on the Booking. Also flag reciprocal pairs: if A closed for B within the last 12 months, B closing for A earns no Loyalty.

### L-07 · Closer is a co-buyer on the same Booking — Medium

**CRM today:** The engine blocks a closer only when they are the **Primary** Customer (`src/lib/domain/commission.ts:568`). An Additional Customer on the same Booking can be named Sold By Customer.

**How.** Two people buy a plot jointly. The Additional Customer is named as the closer and earns Loyalty on their own purchase.

**Fix.** R1. A Sold By Customer can never be a party on the Booking.

### L-08 · Member routes a sale through a Customer to escape holds — High

**v2:** Holds apply to the closer, and only Members have RERA, Commission Hold, Recovery and deactivation checks.

**How.** Member M's RERA is Expired, or M is on Commission Hold, has a Recovery Outstanding or is Deactivated. M's sale is recorded as Sold By Customer, naming a friend. The friend's Loyalty is paid with no RERA check and handed back to M.

**Fix.** R6, and also:
- A Sold By Customer must have their own enquiry or Hold trail for that buyer.
- Flag any Customer-closed Booking where the buyer's enquiry came through a Member.

### L-09 · Same-day "repeat" purchases — Medium

**v2:** §23 says "first personal purchase is not repeat-purchase Loyalty", but there is no time gap.

**How.** A buyer who wants five plots books them as five Bookings, minutes apart. Plots 2 to 5 are "repeat purchases", and each earns Loyalty: a hidden 3% discount on four plots.

A variant: plot 1 is Sold By Member X and plot 2, booked the same day, is 3% Club direct. X immediately earns a Royalty Gift, and the buyer gets Loyalty.

**Fix.** A purchase is "repeat" only if the earlier Booking was approved at least **[30]** days before the later one was submitted, or had already reached 100% verified Payment Received.

### L-10 · Customer closers are not bound by the money and marketing rules — Medium

**v2:** §79 ("must not collect Customer money in personal accounts…") is written for **Members**. The §70–§71 marketing limits reach Members through the Member Terms.

**How.** A Customer closer collects cash from the buyer, or advertises "buy one plot and earn 3% forever". No rule in v2 binds them.

**Fix.** R6. The Customer Terms carry §79 and §70–§71 for anyone who earns Loyalty by closing a sale.

### L-29 · Unlimited Customer-closing Loyalty as a broker channel — High

**v2:** §21 makes Loyalty unlimited, and §25 makes the Membership invitation non-blocking.

**How.** A dealer, or a dealer's relative, never becomes a Member and sells for ever as a "Customer" at up to 3%. They escape Member Terms, RERA and deactivation. RERA treats anyone who facilitates sales for a commission as an agent who must register.

**Fix.** R6. Customer-closing Loyalty is limited to three for life, and after that Membership is needed. Repeat-purchase Loyalty can stay unlimited. See [review 2.1](./business-model-v2-review.md#21-unlimited-customer-closing-loyalty-creates-unregistered-brokers--21-22-25).

### L-30 · Loyalty Enabled while Direct is Disabled — Medium

**v2:** §13 says "Loyalty lower than Direct" and allows an MD exception. §12 makes the two settings independent.

**How.** In a Project with Direct Disabled and Loyalty Enabled, or Loyalty at or above Direct, Members earn more by having a Customer friend "close" the sale than by closing it themselves.

**Fix.** Loyalty can be Enabled only when Direct is Enabled, and must be strictly lower. An MD exception needs a written reason.

---

## C. Buyback and Buying Commission

### L-11 · Buyback unlocks cash Loyalty, Trip and Royalty — High

**v2:** §21, §23, §34, §41 and §59 make an Approved Buyback the alternative milestone for Loyalty, Trip Credits and Royalty.

**CRM today:** A Buyback can be raised on any approved Booking (Booked, Payment Completed or Delivered) with no minimum Payment Received (`src/lib/services/acquisition-service.ts:183`).

**How.**
1. A seller and a friendly buyer book a plot, and the buyer pays a small amount.
2. The company approves a Buyback. Loyalty, the Trip Credit, the Reference Credit and Royalty eligibility all qualify.
3. The buyer gets their money back.

**Fix.** R3. A Buyback counts only after **[25]%** verified Payment Received on the source Booking.

### L-12 · Buying Commission to the people who made the original sale — Medium

**v2:** §63 bars only the seller or returning owner from earning Buying Commission "merely for arranging their own return".

**How.**
1. Member M sells a plot and earns Direct.
2. M "arranges" the company's Buyback of the same plot and earns up to 5% Buying Commission.
3. M resells the plot and earns Direct again.

The returning owner's relative can also be named as the Buying Commission beneficiary.

**Fix.** No Buying Commission on a Buyback goes to:
- the source sale's selling Member;
- its Customer closer;
- its Royalty Linked Member;
- any related party of the returning owner.

---

## D. Trip

### L-13 · The same plot earns credits again and again — High

**v2:** §31 stops only a **self-purchase** of the same unit by the same Member. It says "a later genuine third-party sale of the Buyback unit may still create a new Own-Sale Credit."

**How.** Member M sells plot P to friend F1, and a Buyback follows. M sells P to friend F2, and another Buyback follows, and so on. Each sale gives M a new Own-Sale Credit from the same plot.

**Fix.** R4: one Own-Sale Credit per Member, per unit, per programme. Also R3.

### L-14 · A throwaway booking locks an old, easier Trip bucket — Medium

**v2:** §39 opens and freezes a bucket at the first Pending credit, at submission. Nothing says what happens if that credit is reversed.

**How.** A harder Trip version (a higher target) is about to start. Member M submits one Booking Request to open a bucket under the easier version. The request is later rejected or cancelled, but the bucket keeps the old target.

**Fix.** Create the Pending credit only at Accounts approval ([review 2.3](./business-model-v2-review.md#23-say-which-booking-request-submission-freezes-the-rules--16-20-39)). If the credit that opened a bucket is reversed and no other valid credit remains, the bucket closes, and the next credit opens a new one under the version current at that time.

### L-15 · Cheapest-unit and split-unit farming — Medium

**v2:** §29 says "each distinct qualifying Plot/Unit = one Own-Sale Credit", whatever its value.

**How.**
- A Member sells only the cheapest units, such as small kiosks or shops, to reach the target.
- Or a large plot is split into several units for one buyer, giving several credits.

**Fix.**
- Eligible inventory carries a **minimum Commissionable Sale Value per credit**.
- Units created by splitting a plot after the programme starts count as one unit for credits.

### L-16 · Change Plot into excluded inventory keeps the credit — Low

**v2:** §74 says "credit follows the final valid unit outcome", which does not say whether the final unit must be eligible.

**How.** A Member books an eligible unit, so a credit is pending, and then changes plot to an excluded unit such as a clearance or discounted plot.

**Fix.** The final unit must be eligible under the Booking's frozen inventory list, or the credit reverses.

### L-17 · Cancel after travel or delivery, then earn again — Medium

**v2:** §45 has no clawback after travel, and §60 has none after Gift delivery. §34 does not consume the Reference opportunity on non-qualifying activity, and §50 lets a cancelled first purchase free the Royalty opportunity.

**How.**
- A Trip is travelled. The sale behind a used credit is then cancelled, and the Reference opportunity reopens. The introduced Member's next sale gives the inviter a second Reference Credit.
- The same works for Royalty: the Gift is delivered, the purchase is cancelled, the opportunity reopens, and a second Gift follows.

**Fix.** R5. A fulfilled reward keeps everything it used consumed for ever.

### L-18 · A Deactivated inviter still collects Reference Credits — Low

**v2:** Silent. §47 covers Trip fulfilment for a Deactivated Member, but not whether Reference Credits keep arriving.

**Fix.** State the rule. Suggestion: the Reference opportunity is consumed, and the credit is created and held until valid reactivation, the same as fulfilment under §47.

### L-19 · Steering the Reference Credit into the right Project — Low

**v2:** §34 says the first Reference-eligible sale is decided by the earliest **100% timestamp**.

**How.** The introduced Member and the buyer time their payments so that the first sale to reach 100% is in the Project where the inviter already has a bucket.

**Fix.** Accept it, since the harm is small. Or decide "first" by Booking Request submission order instead.

### L-20 · Banked credits and closed programmes never expire — Medium

**v2:**
- §36 says extra Reference Credits "are not lost".
- §38 lets unused credits build later buckets.
- §40 lets protected credits complete a bucket after closure "according to disclosed closure terms".

None of these has an end date.

**How.** Credits are banked for years and claimed when convenient, so the company carries an open-ended liability.

**Fix.** The Trip Terms set an expiry for unused credits (e.g. **[24]** months from qualification) and a **final completion date** for any bucket left open when a programme closes.

### L-21 · Nominee turns a non-cash reward into cash — Medium

**v2:** §46 and §61 let the Member nominate "another traveller" or "another gift recipient", with no limit on who.

**How.** The Member sells the Trip or Gift to a stranger for cash and names the stranger as nominee. "No automatic cash alternative" becomes cash anyway, and the tax still sits with the Member.

**Fix.** Nominees are limited to declared family members, and the nominee's identity is recorded.

---

## E. Royalty

### L-22 · Steering repeat purchases to "3% Club" for Loyalty + Gift — Medium

**v2:** §52 and §62 say a Club-direct repeat purchase gives the buyer Loyalty and the Royalty Linked Member a Gift.

**How.** The Royalty Linked Member tells their Customer to buy "direct". If Loyalty plus the Gift is worth more than Direct, the pair earns more by hiding the Member's role.

**Fix.**
- Economics review (§68): Loyalty plus the Gift's value must stay below Direct.
- A Club-direct repeat purchase whose enquiry or Hold came from the Royalty Linked Member is recorded as Sold By Member.

### L-23 · Joint buyers create several Royalty relationships — Medium

**v2:** §49 says "At the Customer's earliest approved first Booking", without saying whether that means only the Primary Customer or every buyer on the Booking.

**How.** A Member sells one plot to four co-buyers and claims four Royalty relationships, leading to four Gifts later.

**Fix.** Only the Primary Customer gets a first purchase and a Royalty relationship from a Booking.

---

## F. Direct Commission

### L-24 · Direct paid at 25%, then the sale is cancelled — High

**v2:** §19 sets Direct at up to 5%, paid at 25% verified Payment Received. §67 says Recovery has 15 days, and the only stated penalty is deactivation of a free Membership.

**How.**
1. A friend books a plot and pays 25%, possibly with the Member's own money.
2. The Member receives up to 5% of the **full** value, which is 20% of the cash collected.
3. The friend cancels and is refunded.
4. The Member does not repay and is deactivated, which costs a free Membership nothing.

Raising the Direct maximum from 3% to 5% makes this worth more than it was in v1.

**Fix (pick one or more):**
- **(a)** The cancellation refund deduction in the Customer Terms is at least the Direct paid on that Booking.
- **(b)** Direct is paid in two parts, e.g. half at 25% and the rest at 100%.
- **(c)** Payment Received counts only from the buyer's own account, or a third-party payer is recorded and flagged.
- **(d)** A Recovery can be set off against any unpaid cash commission or Loyalty owed to the same person.

### L-25 · Discounts given outside "Authorised Discount" — Medium

**v2:** §18 says Commissionable Sale Value = (Base + PLC) − **Authorised Discount**.

**How.** A cashback, a free upgrade or another concession is given separately from the price, so commission is paid on a higher value than the company actually receives.

**Fix.** Any price concession, in any form, counts as Authorised Discount.

### L-26 · Change Plot to a cheaper unit after Direct is paid — Low

**v2:** §74 keeps the frozen *rate*, but does not say what happens to the *amount* when the unit changes.

**How.** A Member books an expensive unit, collects Direct at 25%, then changes the plot to a cheaper unit.

**Fix.** The amount always follows the final unit's Commissionable Sale Value, and any overpayment becomes a Recovery.

---

## G. Freeze points and versions

### L-27 · Early or edited Booking Requests lock a better rate — Medium

**v2:** §16 freezes everything at "Booking Request submission", but does not say which submission when a request is rejected, or edited and resubmitted.

**How.** A rate cut is approved for next week. A request is submitted now to lock the old rate, then edited later, possibly to a different plot, while keeping the first freeze.

**Fix.** The freeze is the submission time of the request **version that Accounts approves**, and a rejected request freezes nothing. See [review 2.3](./business-model-v2-review.md#23-say-which-booking-request-submission-freezes-the-rules--16-20-39).

### L-28 · Backdated Project settings versions — Low

**v2:** §15 stores an "effective date/time" on each version.

**How.** A version approved with an effective date in the past would change Bookings that were already submitted, if the system looks up "the version effective at submission" by date instead of storing the version it actually froze.

**Fix.**
- A version's effective time can never be earlier than its approval time.
- Each Booking stores the ID of the version it froze, and that ID is never looked up again by date.

---

## H. Identity, Membership and staff

### L-31 · Duplicate person records — Medium

**v2:** §77 says "One real person = one entitlement history."

**CRM today:**
- Aadhaar and PAN are unique once recorded (`prisma/schema.prisma:81`).
- A Person can exist with Aadhaar Pending.
- Booking approval does not check the buyer's Aadhaar; only payout does.

**How.** A second record of the same person, with no Aadhaar, is the buyer. The first record, with Aadhaar, is the paid Sold By Customer, so Loyalty is earned on one's own purchase. Duplicates also get fresh "first purchases" and Royalty opportunities.

**Fix.** R7. The buyer and the Sold By Person have a verified Aadhaar or PAN before Accounts approves any Booking that creates an entitlement.

### L-32 · Shared bank accounts behind nominee Members and Customers — Medium

**CRM today:** Each Person may have one verified bank account (`prisma/constraints.sql:340`), but the same account number can be verified for two different Persons.

**How.** Nominee Members or Customers (L-02, L-06, L-08) all have their commission and Loyalty paid into one real account.

**Fix.** R7. One account number can be verified for only one Person. Any second attempt is blocked or flagged for Accounts.

### L-33 · Escaping a Recovery through a relative's Membership — High

**v2:** §67 says unresolved Recovery "may lead to Membership deactivation", which is the only stated consequence.

**How.** A Member owes a Recovery after L-24 and is deactivated. Their spouse or sibling joins free and carries on with the same customers.

**Fix.**
- Flag any new Member who shares a phone number, address or bank account with a deactivated Member.
- Allow Recovery set-off (L-24 (d)).
- Add R7.

### L-34 · An inviter added late, just before the first sale — Medium

**v2:** §26 freezes the inviter at Membership Application, but "later correction requires Admin/MD, reason and audit". Nothing limits when a correction can happen.

**How.** A strong Member joined with no inviter. Just before that Member's first Trip-eligible sale, an inviter is "corrected" in, and that inviter takes the Reference Credit.

**Fix.** No inviter can be added or changed after the introduced Member's first Reference-eligible Booking Request is submitted.

### L-35 · Staff and their relatives as closers — High

**v2:** Silent on staff. CRM staff choose Sold By when they raise a Booking Request.

**How.** A walk-in buyer (really Sold By 3% Club, which earns nothing) is recorded as Sold By a staff member's relative, either as a Member for Direct or as a Customer for Loyalty.

**Fix.**
- Staff and their declared relatives cannot earn Direct, Loyalty, Trip or Royalty.
- Alternatively, any Booking that would pay them needs MD approval.
- Also apply R1.

### L-36 · Sold By Correction after a reward is fulfilled — Low

**v2:** §75 lets a Sold By Correction move entitlements. §45 and §60 say there is no clawback after travel or delivery.

**CRM today:** Admin or MD approves Sold By Corrections (`src/lib/services/booking-service.ts:1387`).

**How.** A Trip has already been travelled on a sale. A later correction names a different seller, who gets the credit again, so one sale pays for two Trips.

**Fix.**
- After fulfilment, a correction moves only future entitlements.
- No second Trip or Gift is given for the same event.
- A correction that moves a paid or fulfilled reward needs MD approval, not Admin alone.

---

## Checked and not a loophole

These were checked and hold up as written:

- **Sock-puppet invitees.** Routing your own sales through fake introduced Members gains nothing. Each introduced Member gives one Reference Credit for life, and Minimum Own / Maximum Reference still forces the inviter to sell.
- **An Active Member closing as a Customer.** The CRM already blocks this (`src/lib/services/sold-by.ts:40`), matching §24.
- **Royalty farming on one Customer.** It is limited to one Royalty Credit per Customer for life (§53).
- **Direct and Loyalty on the same sale.** No route in v2 produces both. Only the §11 wording needs tightening ([review 3.1](./business-model-v2-review.md#3-smaller-wording-fixes)).

---

## Decisions needed

| # | Decision | Recommended | MD decision | Date |
| --- | --- | --- | --- | --- |
| R1 | Related-party rule for self-purchase and Customer closing | Adopt | | |
| R2 | Primary Customer Change re-runs all buyer rules | Adopt | | |
| R3 | Minimum payment before a Buyback qualifies anything | 25% | | |
| R4 | One Own-Sale Credit per Member, per unit, per programme | Adopt | | |
| R5 | Fulfilled rewards keep everything consumed | Adopt | | |
| R6 | Customer closer must be a real, bound Customer, limited to 3 | Adopt | | |
| R7 | KYC before approval; one bank account per Person | Adopt | | |
| L-09 | Minimum gap for a "repeat" purchase | 30 days, or the earlier one already at 100% | | |
| L-20 | Expiry of unused Trip credits | 24 months | | |
| L-24 | Protection against Direct at 25%, then cancel | Refund deduction ≥ Direct, plus Recovery set-off | | |
| Others | Own fixes as listed per loophole | Adopt | | |
