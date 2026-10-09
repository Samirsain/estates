# 3% CLUB REAL ESTATE — BUSINESS MODEL v2.1
## Final Implementation Baseline After Loophole Review

**Document version:** 2.1  
**Document date:** 9 October 2026  
**Business Effective Date:** Production go-live date/time in Asia/Kolkata  
**Status:** FINAL BUSINESS-RULE BASELINE — READY FOR CRM / TERMS / UAT IMPLEMENTATION  
**Brand:** 3% Club Real Estate / 3% Real Estate Club

> 9 October 2026 is the document date, not the commercial Effective Date. Business Model v2 becomes effective only at production go-live after Terms/PPT, CRM changes, UAT and staff readiness are complete.

---

# 1. Purpose

This document is the final business-side source of truth for the new 3% Club model.

It supersedes Business Model v2.0 for implementation purposes and incorporates the Owner decisions taken after the formal loophole review.

The new live model removes:

- monetary Member Invite percentage bands;
- Invite positions and anniversary/performance cycles;
- monetary Royalty percentage bands;
- Royalty positions and anniversary/performance cycles;
- the combined 4% sale-side monetary cap;
- a universal fixed 3% Direct Commission across all Projects.

It also incorporates the post-review controls for Customer-closing Loyalty, Buyback qualification, Trip-credit recycling, Booking version freezes, reward fulfilment finality, bank/recovery controls, staff conflicts and the commercial risks deliberately accepted by the Owner.

Only mock/test data exists under the old model. No live legacy-rights transition engine is required.

# 2. Business in one sentence

**3% Club is a real-estate business membership network that helps serious property professionals grow through selected Projects, professional identity, Project-specific Direct Commission, sales-performance rewards and long-term relationship rewards.**

---

# 3. Positioning

Externally position 3% Club as:

- a business membership opportunity;
- a real-estate business network;
- a professional network for property dealers and agents;
- a network for selected Project opportunities, relationships and growth.

Do not position it as:

- software;
- CRM;
- dashboard;
- MLM;
- passive income;
- downline;
- chain income;
- recruitment income.

The CRM supports the business; it is not the product Members join for.

---

# 4. Core brand promise

> **YOUR BUSINESS RELATIONSHIPS SHOULD GROW BEYOND ONE DEAL.**

The model should create:

1. Control
2. Status
3. Access
4. Performance recognition
5. Relationship recognition

---

# 5. Target Member

Primary audience:

- property dealers;
- real-estate agents;
- brokers;
- property consultants;
- relationship-rich local businesspeople;
- local professionals who want an organised real-estate business channel.

Primary market:

> Tier-3 cities, small towns and relationship-driven property markets.

---

# 6. Member value proposition

A Member may receive value through:

- 3% Club Member identity;
- selected Projects;
- professional support;
- business connections;
- Project-specific Direct Commission;
- Sales & Reference Trip Reward;
- Royalty Relationship Reward;
- visibility into eligible deal/reward status.

No benefit is earned merely because someone joins.

---

# 7. Launch Membership

Current launch direction:

> **First-year Membership is complimentary.**

Complimentary Membership does not mean guaranteed income, leads, sales, allocation or rewards.

---

# 8. Official terminology

Use:

- Business Membership
- Real-Estate Business Network
- Project Direct Commission
- Customer Loyalty
- Sales & Reference Trip Reward
- Own-Sale Credit
- Reference Credit
- Trip Target
- Royalty Relationship Reward
- Royalty Credit
- Buying Commission

Retire from the live programme:

- Invite Commission bands
- Royalty percentage bands
- Invite/Royalty positions
- Invite/Royalty cycles
- Downline
- Team Income
- Passive Income
- Chain Income

---

# 9. “3% Club” name

> **3% Club is the brand name, not a promise that every Project pays 3% Direct Commission.**

Correct public wording:

> **Applicable Direct Commission is Project-specific and disclosed before the relevant Booking.**

---

# 10. One final Sold By classification

Each sale has one final approved classification:

1. Sold By Member
2. Sold By Customer
3. Sold By 3% Club

Only one final sale classification applies.

---

# 11. Hard combination rule

The old 4% monetary cap is removed.

However:

> **A single sale action cannot generate both Project Direct Commission and Customer Loyalty to different closers.**

| Sale classification | Monetary benefit |
|---|---|
| Sold By Member | Project Direct |
| Member self-purchase | Buyer-Member Project Direct |
| Sold By Customer | Project Customer Loyalty |
| Club-direct qualifying repeat personal purchase | Project Customer Loyalty |

Trip and Royalty Gift are non-cash rewards and may coexist only under their own rules.

Buying Commission is separate.

---

# 12. Project settings

Each Project may independently configure:

## Monetary
- Direct Commission — Enabled / Disabled
- Direct rate if Enabled
- Customer Loyalty — Enabled / Disabled
- Loyalty rate if Enabled

## Trip
- Trip Programme — Enabled / Disabled
- Total Trip Target
- Minimum Own-Sale Credits
- Maximum Reference Credits
- eligible/excluded inventory
- Trip Programme Version
- Trip Terms/PPT Version

Direct, Loyalty and Trip remain independently configurable.

A Project may run an unusual combination, such as Direct Disabled while Loyalty is Enabled, only under the exception control in Section 13.

# 13. Rate ceilings and exceptional Project economics

Hard maximums:

> **Project Direct Commission: maximum 5%**

> **Customer Loyalty: maximum 3%**

Normal commercial preference:

> **Customer Loyalty should be lower than Project Direct Commission.**

However, Direct, Loyalty and Trip remain independent Project settings.

If either of these applies:

- Direct is Disabled while Loyalty is Enabled; or
- Loyalty is equal to or higher than Direct,

then the Project may proceed only with:

> **explicit MD exception + written commercial reason + audit trail.**

A benefit intentionally not offered is shown as **Disabled**, not as an unexplained 0% rate.

# 14. Project settings approval

1. Admin prepares.
2. MD reviews.
3. MD approves.
4. Approved version becomes Active.

No silent overwrite is allowed.

Every material change creates a new immutable version.

---

# 15. Project settings versioning and no backdating

Every material Project setting change creates a new immutable version preserving at minimum:

- Direct Enabled/Disabled and rate;
- Loyalty Enabled/Disabled and rate;
- Trip Enabled/Disabled;
- Total Target;
- Minimum Own-Sale Credits;
- Maximum Reference Credits;
- eligible inventory scope;
- Trip Programme/Terms Version;
- effective date/time;
- approver;
- reason.

Old versions remain historical.

A Project settings version's effective timestamp:

> **cannot be earlier than its approval timestamp.**

Every approved Booking stores the exact frozen Project Settings Version ID. The system must not later re-determine that version merely by looking up dates.

# 16. Booking freeze point — final rule

The applicable financial/reward settings freeze on:

> **the Booking Request version that Accounts ultimately approves.**

Rules:

- a rejected Booking Request freezes nothing;
- an abandoned request freezes nothing;
- a materially edited/resubmitted request uses the submission/version that Accounts ultimately approves;
- the approved Booking permanently stores the exact frozen Version ID.

This replaces the earlier rule that any first/raw Booking Request submission could freeze the programme.

# 17. No retroactive reward eligibility

A Booking/Unit uses only the rate and programme rules frozen on the Booking Request version that Accounts approves.

Later:

- Direct increases;
- Loyalty increases;
- Trip activation;
- target reductions;
- Gift improvements;
- inventory changes

do not retroactively improve an already frozen Booking.

Likewise, a rejected request does not preserve an old/easier programme version.

# 18. Commissionable sale value

Keep the global formula:

> **Commissionable Sale Value = (Final Approved Base Property Value + Applicable PLC) − Authorised Discount**

Include:

- approved Base Property Value;
- applicable PLC;
- only the formal Authorised Discount recorded in the approved transaction.

Exclude:

- GST/taxes;
- stamp duty;
- registration;
- government levies;
- documentation;
- maintenance;
- utilities;
- finance charges;
- interest;
- penalties;
- pass-through charges.

## Owner-accepted rule

Cashback, free upgrades and other off-book concessions do **not** automatically reduce the commissionable base unless they are formally entered as an Authorised Discount.

This is a deliberate commercial choice and an accepted risk.

# 19. Project Direct — third-party Member sale

When:

- Member is Active;
- final Sold By = Member;
- Project Direct is Enabled;
- sale is otherwise eligible;

the selling Member earns the frozen Project Direct rate.

Milestone:

> **full Direct entitlement at 25% verified Payment Received**

This remains intentionally unchanged after loophole review.

Direct may be earned on unlimited qualifying third-party sales.

Only one selling Member receives Direct on one sale.

## Cancellation protection

If a sale later becomes invalid/cancelled and the Direct should no longer remain earned:

- unpaid Direct is cancelled;
- paid Direct becomes Recovery Outstanding;
- Recovery may be set off against future monetary benefits owed to the same person;
- third-party payer details must be recorded where the property payment does not come from the named buyer.

No staged 50/50 Direct payout is introduced.

# 20. Member self-purchase and related-party treatment

A Booking is formally treated as Member self-purchase only when:

> **the Primary Customer is an Active Member.**

An Additional Customer who is a Member does not automatically make the Booking self-purchase.

Related-party purchases do not automatically become Member self-purchase.

Therefore a Member may sell to a spouse, parent, child, sibling or other related person and retain normal third-party classification if the formal Primary Customer is not an Active Member and the transaction is otherwise genuine.

This is an intentional Owner decision.

For formal Member self-purchase:

- buyer-Member receives the frozen Project Direct rate if Direct is Enabled;
- Direct milestone = 100% verified Payment Received;
- no second selling Member receives Direct;
- no Customer Loyalty applies to the buyer-Member;
- self-purchase may create Own-Sale Trip Credit under Trip rules;
- self-purchase does not create Reference Credit for the Member's inviter;
- Buyback does not accelerate self-purchase Direct Commission.

Fraud, sham activity and fabricated ownership remain prohibited.

# 21. Customer Loyalty — two different lifetime rules

Each Project has one shared Customer Loyalty rate for both eligible Loyalty routes:

1. Customer closes a qualifying sale for another buyer.
2. Customer makes an eligible repeat direct personal purchase.

But the lifetime rules are different:

## Customer-closing Loyalty

> **Maximum 3 successful Customer-closing Loyalty events for life.**

After the third successful Customer-closing event, the person must become an Active Member to continue earning from future third-party selling activity.

## Repeat-purchase Loyalty

> **Unlimited in lifetime quantity.**

One Booking can generate at most one Customer Loyalty entitlement for the eligible Customer.

# 22. Customer-closing Loyalty and Customer-closer eligibility

Customer-closing Loyalty may apply when:

- final Sold By = Customer;
- Project Loyalty is Enabled;
- closer has not exhausted the 3 lifetime Customer-closing events;
- transaction is otherwise eligible.

A Sold By Customer must be a **real existing Customer**, not merely any non-Member Person.

Required:

- their own approved personal purchase exists;
- verified KYC for Customer-closer eligibility;
- accepted Customer Terms;
- Customer Terms bind them to authorised money-handling and marketing restrictions.

## Owner-accepted related-party/co-buyer rule

A Sold By Customer is **not automatically disqualified** merely because they are:

- related to the buyer; and/or
- an Additional Customer/co-buyer on the same Booking.

If they otherwise satisfy Customer-closer eligibility, the sale may qualify.

Normal milestone:

> **100% verified Payment Received**

Approved Buyback may act as an alternative milestone only under the minimum-payment safeguard in Section 41.

# 23. Repeat-purchase Loyalty

A Customer's eligible repeat direct personal purchase may earn the frozen Project Loyalty rate.

Rules:

- first personal purchase is not repeat-purchase Loyalty;
- **any second qualifying personal Booking may count immediately as a repeat purchase**;
- there is no 30-day waiting period;
- same-day second/subsequent personal Bookings may qualify if all other rules are satisfied;
- Member-closed repeat purchase gets no Customer Loyalty;
- Project Loyalty must be Enabled;
- normal milestone = 100% Payment Received;
- Approved Buyback may qualify only under the minimum-payment safeguard.

Repeat-purchase Loyalty is unlimited in lifetime quantity.

# 24. Member status and Customer Loyalty

An Active Member cannot use Sold By Customer for the same closing action.

A Deactivated Member:

- may buy property as a normal Customer;
- may be treated as a Customer for purchase classification;
- may have another genuine Member sell to them under normal rules;

but while Deactivated they cannot personally earn either Customer Loyalty route:

- Customer-closing Loyalty;
- repeat-personal-purchase Loyalty.

A Deactivated Member purchase is not automatically treated as formal Member self-purchase merely because the person previously held Member capability.

Existing properly eligible protected Booking Requests retain their frozen treatment.

# 25. After three Customer-closing Loyalty events

Customer-closing Loyalty is limited to three successful events for life.

After the third successful Customer-closing Loyalty event:

> **Membership activation is required before the person can earn from any further third-party selling activity.**

This is no longer merely a non-blocking invitation.

Repeat-personal-purchase Loyalty may continue under Customer rules unless/until the person activates as a Member.

# 26. Customer → Member conversion and inviter freeze

A Customer may apply to become a Member at any time.

If a valid inviter exists:

> inviter freezes at **Membership Application submission**.

Later correction requires Admin/MD authority, reason and audit.

However:

> **no inviter may be added or changed for Reference purposes after the introduced Member's first Reference-eligible Booking Request is submitted.**

If no valid inviter exists, no inviter is assigned.

The Member who previously sold property to the Customer or owns the Customer's Royalty relationship is not automatically the Membership inviter.

Past Customer history remains historical and does not create retrospective Member benefits.

# 27. Sales & Reference Trip Reward

The Trip Programme rewards:

1. genuine Project sales;
2. genuine first qualifying sale performance by directly introduced Members.

It is not a joining or multi-level reward.

Joining alone gives:

> **zero Trip progress**

---

# 28. Trip target composition

Each Trip-enabled Project defines:

- Total Target
- Minimum Own-Sale Credits
- Maximum Reference Credits

Example:

> Target 9 / Minimum Own 6 / Maximum Reference 3

Eligible combinations include:

- 9 Own + 0 Reference
- 8 + 1
- 7 + 2
- 6 + 3

Not eligible:

- 5 Own + 4 Reference

Reference Credits are optional.

---

# 29. Own-Sale Credit is Unit/Plot-based with anti-recycling

> **Each distinct qualifying Plot/Unit may create one Own-Sale Credit.**

Multiple qualifying units in one Booking may therefore create multiple Own-Sale Credits.

However, across all sale types:

> **one Member may receive at most one Own-Sale Credit for the same Plot/Unit within the same Project Trip Programme.**

This applies to:

- self-purchase;
- ordinary third-party sale;
- resale after Buyback.

A different Member may earn a later genuine Own-Sale Credit for the same unit.

## Subdivision rule

Eligible inventory is frozen by Programme Version.

If an eligible unit is subdivided after programme activation, the child units inherit **one shared Trip Credit pool** from the parent unit unless MD activates a new Programme Version explicitly treating those child units as separate eligible credit units.

# 30. Normal Trip qualification

Normal qualification:

> **100% verified Payment Received**

Before qualification:

> Pending Trip Credit

At qualification:

> Qualified Trip Credit

---

# 31. Member self-purchase Trip Credits

Qualifying self-purchased units count toward the Member's Own-Sale Trip progress.

There is no separate bucket limit on qualifying self-purchase credits.

However, the general anti-recycling rule applies:

> the same Member cannot receive more than one Own-Sale Credit for the same unit within the same Project Trip Programme, regardless of whether the first credit arose from self-purchase or another sale type.

Approved Buyback may qualify a self-purchase Trip Credit only under the Buyback minimum-payment rule. Buyback still does not accelerate self-purchase Direct Commission.

# 32. Reference Credit

Rules:

- immediate inviter only;
- no multi-level credit;
- one directly introduced Member can contribute **one lifetime Reference Credit**;
- self-purchase by introduced Member does not consume the Reference opportunity;
- the opportunity is global across Projects;
- it is consumed only by the first Reference-eligible sale in an **active Trip Programme**.

A sale in a Project with no Trip Programme does not consume it.

---

# 33. First referred sale with multiple units

If introduced Member B's first Reference-eligible transaction includes five qualifying units:

- B may earn up to five Own-Sale Credits;
- B's immediate inviter receives **one Reference Credit only**.

---

# 34. Reference qualification

Reference Credit is created when the introduced Member's first Reference-eligible third-party sale reaches either:

- 100% verified Payment Received; or
- Approved Buyback satisfying the minimum-payment rule in Section 41.

Self-purchase does not consume the Reference opportunity.

Rejected/non-qualifying activity does not consume it.

If two qualifying sales become eligible at exactly the same time:

1. earlier verified qualifying timestamp wins;
2. if identical, lower permanent Booking Number wins.

## Accepted low-risk rule

Payment timing may influence which Project becomes the first qualifying Reference event. This risk is accepted; first-event logic is not changed to Booking Request order.

# 35. One sale may create two Members' credits

A first qualifying referred sale can separately create:

- Own-Sale Credit(s) for the seller;
- one Reference Credit for the immediate inviter.

These are separate entitlements.

---

# 36. Extra Reference Credits and expiry

If the current Trip bucket allows fewer Reference Credits than the Member has unused qualified Reference Credits:

> extra qualified Reference Credits remain banked for that same Project.

They may be used in later buckets subject to:

- the later bucket's frozen composition rules;
- FIFO allocation;
- the expiry rule below.

Unused Qualified Trip Credits, including banked Reference Credits, expire:

> **12 months after qualification**

An already Earned Trip Reward follows its separate redemption window rather than this credit-expiry rule.

# 37. FIFO allocation

Credits are allocated automatically:

> **earliest qualified eligible credits first**

subject to:

- credit type;
- Minimum Own requirement;
- Maximum Reference allowance;
- frozen Project programme rules.

Used credits cannot be reused.

---

# 38. Repeatable Trips

Once a bucket is completed:

- Trip Reward becomes Earned;
- used credits are locked;
- fresh/unused credits may build the next bucket.

Each fresh completed target can earn another Trip while the applicable Project programme remains active under its terms.

---

# 39. Trip bucket freeze — final rule

The Member's current Project Trip bucket opens only when:

> **the Booking Request version that Accounts approves creates the first valid Pending Trip Credit for that Member/Project.**

A rejected/raw request does not open or freeze a bucket.

At bucket opening freeze:

- Total Target;
- Minimum Own-Sale Credits;
- Maximum Reference Credits;
- self-purchase rules;
- eligible inventory rules;
- Trip Programme Version;
- Trip Terms/PPT Version.

Later Project changes do not alter the active bucket.

After that bucket is earned/closed, the next bucket uses the then-current approved Programme Version.

# 40. Trip programme closure and wind-down

When a Trip Programme closes:

- no post-cut-off approved Booking Request becomes newly eligible;
- protected pre-cut-off approved activity continues under its frozen version;
- unused Qualified Credits remain subject to the 12-month expiry rule;
- Project Terms must state a final completion/wind-down date for any open bucket.

Partial progress is not silently removed before the disclosed wind-down/expiry rules apply.

# 41. Approved Buyback as alternative reward qualification

Approved Buyback can act as an alternative reward milestone only when the source Booking has already reached:

> **at least 25% verified Payment Received**

before the Buyback qualifies the relevant benefit.

This 25% minimum applies to Buyback-based qualification for:

- Customer Loyalty;
- Own-Sale Trip Credit;
- Reference Credit;
- Royalty Reward eligibility.

The credit/benefit belongs to the source transaction, not to the person merely arranging the Buyback.

Buyback still does **not** accelerate Project Direct Commission.

# 42. Buyback-qualified credit: Qualified vs usable

Approved Buyback may make the Trip Credit:

> **Qualified**

But a Buyback-qualified credit becomes usable for actual Trip booking only after:

> **Stable Buyback Completion**

---

# 43. Stable Buyback Completion

Stable Buyback Completion means all applicable conditions are true:

1. Buyback/Acquisition is formally Approved.
2. Payment Given = 100% verified.
3. Buyback/Acquisition has not been cancelled or unwound.
4. Applicable completion/document-return work is complete, including where relevant:
   - Allotment papers collected back;
   - Registry-back completed;
   - other required acquisition completion conditions.

At Stable Buyback Completion:

> Buyback-qualified Trip Credits become usable for Trip fulfilment.

---

# 44. Buyback unwind and Trip Credit

If Buyback later unwinds before Stable Buyback Completion:

- Buyback-created Trip qualification reverses;
- source-sale status is recalculated;
- if the source independently reaches normal 100%, normal qualification may still apply;
- no duplicate credit is created.

---

# 45. Trip cancellation/reversal and fulfilment finality

## Before Reward Earned

If a qualifying credit becomes invalid:

- reverse the credit;
- recalculate progress.

## Reward Earned but not Booked

If a used credit becomes invalid:

- reward may become Deficient;
- next unused eligible qualified credit may backfill under FIFO;
- otherwise fulfilment pauses.

## Trip already Booked

Published Trip Terms control cancellation, refundability, rebooking and traveller changes.

## Travel completed

> **Once the Trip has been travelled, every credit/opportunity used for that fulfilled reward remains consumed forever.**

A later cancellation does not reopen the old Reference/Trip opportunity and does not create a second reward.

Fraud/sham activity may still create Recovery or disciplinary action.

# 46. Trip reward owner and nominee

The earning Member remains owner of the Trip entitlement and underlying credits.

Credits do not transfer ownership.

Permitted nominee:

- immediate family; or
- one MD-approved non-family nominee.

Nominee identity must be recorded before fulfilment.

No automatic cash alternative exists.

# 47. Recovery, deactivation and Reference holding

If Member has Recovery Outstanding:

- Trip progress remains recorded;
- earned reward remains recorded;
- fulfilment is held until Recovery Cleared.

If Member is Deactivated:

- earned reward/history remains;
- fulfilment is held until valid reactivation.

If an introduced Member completes the one lifetime Reference event while the inviter is Deactivated:

- the Reference opportunity is consumed;
- Reference Credit is created;
- the credit/use/fulfilment is held until valid reactivation.

The event does not remain open to create a second Reference Credit later.

# 48. Royalty Relationship Reward

Royalty is now:

> **a one-time non-cash relationship reward**

not a monetary percentage.

No:

- Royalty percentage;
- band;
- position;
- annual reset;
- performance cycle.

---

# 49. Royalty relationship creation — Primary Customer only

Royalty relationship is created only for the **Primary Customer** of the Booking.

Additional Customers do not each create separate Royalty relationships from the same Booking.

At the Primary Customer's earliest approved first Booking:

### Sold By Member
The selling Member becomes the Provisional Royalty Linked Member.

### Sold By Customer / Sold By 3% Club
No Member Royalty relationship is created.

The relationship becomes final when the first purchase reaches either:

- 100% verified Payment Received; or
- Approved Buyback satisfying the 25% source-payment safeguard.

# 50. Cancellation before Royalty relationship finalises

If the first Booking is cancelled before both:

- 100% Payment Received; and
- Approved Buyback;

then:

- provisional Royalty relationship is removed from current entitlement;
- opportunity is not consumed;
- a later genuine first qualifying purchase may establish the relationship.

History remains.

---

# 51. First purchase not Member-sold

If the Customer's first qualifying purchase was Sold By Customer or Sold By 3% Club:

> a later Member sale does not retroactively create a Royalty relationship.

---

# 52. Royalty reward event and Club-direct attribution

A final Royalty Linked Member may receive one Royalty Relationship Reward when the Primary Customer later makes their first qualifying:

> **direct personal purchase through 3% Club**

provided:

- Royalty opportunity remains unused;
- final approved Sold By for that repeat purchase is 3% Club;
- other eligibility conditions are satisfied.

If another Member is final Sold By:

- no Royalty Reward on that sale;
- unused Royalty opportunity remains.

## Owner-accepted attribution rule

> **The final approved Sold By selection alone decides whether the repeat purchase is Club-direct.**

The system does not automatically reclassify the sale as Member-sold merely because the Royalty Linked Member sourced, influenced, discussed or assisted with the current transaction in the background.

This is an intentionally accepted steering risk. Fraudulent Sold By data remains prohibited.

# 53. One Royalty opportunity per Customer

Each Customer may create:

> **one Royalty Credit for life**

for the valid Royalty Linked Member.

---

# 54. One Royalty Credit = one Gift entitlement

One qualifying Royalty event creates:

> one Royalty Credit

which creates:

> one catalogue Gift entitlement.

Credits do not combine into a points system unless a later approved programme expressly adds that feature.

---

# 55. Royalty Gift Programme Version

The applicable Royalty Gift Programme Version freezes on:

> **the qualifying future Royalty Booking Request version that Accounts ultimately approves.**

Not when the original Royalty relationship was created.

A rejected/abandoned request freezes nothing.

Later catalogue changes do not alter the frozen entitlement.

# 56. Royalty catalogue

The full Gift catalogue stays outside CRM in the official PPT/Programme Terms.

Before live launch define:

- exact gift choices;
- specifications;
- phone model if applicable;
- gold weight/purity/certification if applicable;
- substitution;
- stock unavailability;
- redemption deadline;
- delivery;
- warranty/support;
- tax/statutory wording;
- nomination;
- cancellation.

No live Royalty Gift promise may be activated without an approved dated Programme Version.

---

# 57. Royalty data in CRM

CRM records/reference:

- Royalty relationship;
- Royalty Credit ID;
- Reward Programme Version;
- selected Reward reference;
- selection date;
- Eligible / Ordered / Delivered / Cancelled-Reversed status;
- fulfilment reference;
- delivery date.

CRM does not need the full catalogue or reward cost.

---

# 58. Royalty + Buyback

Buyback itself does not earn or own Royalty.

Approved Buyback may act as an alternative qualification milestone on the underlying qualifying Customer purchase only after the source Booking reaches:

> **at least 25% verified Payment Received.**

Royalty Credit belongs to the already-established Royalty Linked Member, not the Buyback arranger or Buying Commission beneficiary merely because they helped with the acquisition.

# 59. Buyback-triggered Royalty fulfilment

Approved Buyback satisfying the 25% minimum may make the Royalty Credit **Eligible** before the underlying purchase reaches 100%.

Physical Gift fulfilment waits until either:

1. the underlying qualifying Customer purchase independently reaches 100% Payment Received; or
2. Buyback reaches Stable Buyback Completion.

If Buyback unwinds before fulfilment and no independent normal milestone exists, Buyback-created eligibility reverses.

# 60. Royalty Gift after delivery

Before delivery, invalidated eligibility may reverse/cancel the entitlement.

After delivery:

> **the Royalty opportunity and the credit used for that delivered Gift remain consumed forever.**

A later cancellation does not reopen the same Customer's one Royalty opportunity for a second Gift.

No ordinary post-delivery clawback applies unless published Terms expressly define one.

Fraud, sham activity or material misrepresentation remains separately recoverable/disciplinary.

# 61. Royalty reward owner and nominee

The Royalty Linked Member remains owner of the Royalty Credit/Reward entitlement.

Underlying credit ownership does not transfer.

Permitted Gift recipient nominee:

- immediate family; or
- one MD-approved non-family nominee.

Nominee identity is recorded before fulfilment.

No automatic cash alternative exists.

# 62. Customer Loyalty + Royalty Reward

A qualifying Club-direct repeat personal purchase may create:

1. Customer Loyalty to the buyer; and
2. one non-cash Royalty Reward to the Royalty Linked Member.

These are separate benefits.

---

# 63. Buying Commission

Buying Commission remains separate from Direct, Loyalty, Trip and Royalty Reward.

Rate:

> percentage of Acquisition Price

Hard maximum:

> **5%**

One beneficiary may be:

- Member;
- Customer;
- external broker.

## Owner-approved original-sale participation rule

A person is **not automatically disqualified** from Buying Commission merely because they participated in the original sale.

Therefore, subject to normal Buying Commission rules, the following may also receive Buying Commission on a later Buyback:

- original selling Member;
- original Customer closer;
- Royalty Linked Member.

Returning owner still cannot receive Buying Commission merely for arranging their own return.

This deliberately accepts the possibility of a genuine sequence such as:

> Direct on original sale → Buying Commission on Buyback → Direct on later resale.

# 64. Buying Commission freeze point

Buying Commission freezes at:

> **formal Acquisition approval**

Any later rate change requires controlled correction, reason, approval and before/after history.

---

# 65. Buying Commission milestone

Normal milestone:

> **100% verified Payment Given**

Paid Early:

> MD approval only

No Trip Credit is earned merely because someone arranged the Buyback.

---

# 66. Payment Received vs Payment Given

## Payment Received
Customer-side sale progress.

Used for:
- Direct;
- Loyalty;
- normal Trip qualification;
- normal Royalty reward qualification.

## Payment Given
Company acquisition progress.

Used for:
- acquisition;
- Buying Commission;
- Stable Buyback Completion;
- Buyback-qualified reward fulfilment.

Never mix them.

---

# 67. Recovery and Recovery Circumvention Review

If a paid monetary benefit later becomes invalid:

- Recovery Outstanding is created;
- external Accounts Recovery Reference is linked;
- exact rupee recovery may remain outside CRM;
- future monetary benefits owed to the same person may be set off against Recovery;
- no new cash payout is released while the applicable Recovery block remains;
- Trip/Gift fulfilment is held.

Recovery deadline:

> **15 calendar days from recovery notice**

Unresolved Recovery may lead to Membership deactivation.

## Recovery Circumvention Review

If another/new Person shares material links with a person who has unresolved Recovery, including:

- bank account;
- mobile;
- address;
- known close-family/related-party link,

create a **Recovery Circumvention Review** before monetary/non-cash benefits are released.

Do not automatically punish the related person. Accounts/MD reviews the facts and records the decision.

# 68. Project economics review

Before a Project reward programme becomes active:

> management must review its economics outside CRM.

Review:

- Direct rate;
- Loyalty rate;
- Trip target;
- estimated Trip cost;
- possible Own + Reference double-credit exposure;
- estimated Royalty Gift cost;
- expected Project/company margin.

CRM stores only approval metadata if desired:

- Economics Reviewed = Yes
- approver
- approval date
- programme version

No Project profit, Trip cost or Gift cost needs to be stored in CRM.

---

# 69. Member portal

Member may see safe information such as:

- selected Projects;
- frozen Direct rate/status;
- authorised deals;
- Direct status;
- Trip progress by Project;
- Pending/Qualified Own-Sale Credits;
- Reference Credits;
- banked/used credits;
- target/composition;
- earned Trip Rewards;
- Royalty reward status;
- Recovery/hold status at a safe level.

Do not expose unrelated Customer PII, bank/KYC secrets, internal Accounts notes or Project economics.

---

# 70. Marketing change

Old blanket message:

> “3% Direct + monetary Invite + monetary Royalty”

is no longer correct.

New public positioning should say:

> **3% Club property professionals ke liye ek real-estate business network hai. Different Projects par applicable Direct Commission aur performance/relationship rewards Project-specific terms ke according available ho sakte hain.**

Specific Project communication should disclose that Project's actual Direct, Loyalty and Trip terms.

---

# 71. Trip marketing

Do not lead with:

- invite Members and win trips;
- recruit a team;
- build a downline.

Lead with:

> **Project sales performance**

Then explain that a limited part of the target may come from genuine first-sale performance of directly introduced Members.

---

# 72. Fraud, artificial activity and staff conflicts

Fraudulent, sham, circular or artificially structured activity does not qualify.

Examples:

- fake Members;
- duplicate identities;
- test Bookings;
- fabricated Customers;
- false Sold By;
- deliberate reward recycling;
- collusive transactions.

Accepted commercial flexibility — such as related-party sales — does not protect actual fraud.

## Staff / staff-relative entitlements

Staff and defined close relatives do not receive Direct/Loyalty/Trip/Royalty automatically.

Any such entitlement requires:

- conflict-of-interest disclosure;
- MD approval;
- independent processing;
- the staff member must not create/approve their own entitlement.

# 73. Test/mock data

Internal test, QA, migration and dummy records create no real entitlement.

Before production go-live:

> test/mock reward records should be reset/migrated to Business Model v2.

---

# 74. Controlled post-approval changes

## Primary Customer Change

An approved Primary Customer Change:

> **changes customer ownership/details only.**

It does not automatically re-run the original:

- Direct classification;
- Loyalty classification;
- self-purchase classification;
- original reward economics.

This is an intentional Owner-accepted risk.

Any separate Sold By/benefit correction must use its own controlled workflow.

## Same-Project Change Plot

The Booking keeps its frozen percentage/programme version.

For Trip Credit:

> the final valid unit must be eligible under the Booking's frozen Trip Programme version, otherwise the Trip Credit reverses.

For monetary commission amount:

> the amount follows the final valid unit's Commissionable Sale Value.

If Direct was already paid on a more expensive unit:

- overpayment becomes Recovery;
- underpayment follows normal approval.

## Cross-Project move

Requires cancellation/new Booking under the approved workflow and uses the new Project's settings.

# 75. Sold By correction

A controlled Sold By correction may affect:

- Direct;
- Loyalty;
- Own-Sale Trip Credit;
- Reference Credit;
- Royalty relationship;
- Royalty Reward.

Recalculate using the Booking's frozen versions, not today's Project settings.

Only the correct final beneficiary retains future/current entitlement as applicable.

## After Trip/Gift fulfilment

If a Trip has already been travelled or a Gift delivered:

- the fulfilled reward remains consumed for that event;
- correction requires **MD approval**;
- no automatic second Trip/Gift is generated for the corrected person;
- any exceptional compensation is a separate MD settlement outside the reward-credit engine.

# 76. Payment correction

Payment corrections must not create duplicate rewards.

A milestone corrected below threshold may reverse normal qualification unless an approved Buyback alternative keeps it eligible.

If later restored, the same entitlement re-qualifies without duplication.

---

# 77. Identity, KYC and bank controls

Identity merge must not duplicate:

- inviter;
- lifetime Reference opportunity;
- Royalty relationship/opportunity;
- Loyalty for the same Booking;
- Trip Credit for the same event;
- Recovery.

One real person maintains one consolidated entitlement history.

## General KYC timing — Owner-approved rule

General buyer KYC may be completed:

> **before payout rather than universally before Booking approval.**

Therefore an ordinary Booking may be approved before buyer KYC is verified if other Booking rules permit.

However:

- no monetary payout is released without required beneficiary verification;
- a Sold By Customer must satisfy the stricter Customer-closer KYC rule before Customer-closing Loyalty eligibility;
- fraud/duplicate review remains available.

## Bank account uniqueness

Default:

> **one verified bank account = one Person.**

A genuine joint account may be used for multiple Persons only with:

- proof of joint account holders;
- Accounts approval;
- MD approval where required;
- audit.

# 78. Selected Projects & regulatory wording

Use:

> **3% Club works with selected Projects. Applicable Project and regulatory details are shared separately.**

Do not guarantee:

- title;
- blanket RERA approval;
- registry;
- possession;
- appreciation;
- resale;
- loan approval.

90A, RERA, title and other approvals remain separate concepts.

---

# 79. Customer money safeguard

Members and eligible Customer closers must not:

- collect Customer money into personal accounts;
- issue unofficial receipts;
- bind the Company without authority;
- promise unauthorised discounts/terms;
- make unauthorised income, Project or reward claims.

Payments use authorised channels only.

Customer Terms for a Customer closer must expressly bind the closer to these restrictions.

# 80. Effective Date

Business Model v2 becomes effective at:

> **actual production go-live date/time in Asia/Kolkata**

Prerequisites:

- Business Model v2 approved;
- Project settings approved;
- Trip Terms ready;
- Royalty catalogue/terms ready;
- Member/Customer Terms updated;
- marketing updated;
- staff trained;
- CRM implemented;
- UAT passed.

---

# 81. No legacy transition engine

Because only mock/test data exists:

- no old cash Invite rights need grandfathering;
- no old monetary Royalty rights need grandfathering;
- no old cycles continue;
- no old Loyalty transition engine is required.

Production launches directly on Business Model v2.

---

# 82. Legal / tax / accounting review

Before public launch, qualified advisers should review:

- Member Terms;
- Customer Terms;
- Trip Terms;
- Royalty Gift Terms;
- non-cash reward tax/accounting treatment;
- frequent Customer-selling activity;
- RERA/direct-selling/referral implications;
- reward marketing language.

Do not claim Trips/Gifts are tax-free unless professionally confirmed.

---

# 83. Owner-Accepted Commercial Risks

The following are deliberate Owner decisions, not missing requirements. Developers, staff and future reviewers must not silently change them without a new approved business-rule change.

## 83.1 Related-party Member sales

A Member may sell to relatives/related persons and retain normal third-party treatment unless the formal Primary Customer is an Active Member under the self-purchase rule.

## 83.2 Customer closer may be related/co-buyer

A qualified Sold By Customer is not automatically disqualified because they are related to a buyer or are an Additional Customer/co-buyer.

## 83.3 Primary Customer Change does not re-run original benefit classification

Ownership changes do not automatically rewrite the original Direct/Loyalty/self-purchase economics.

## 83.4 Immediate repeat purchase

A second personal Booking may qualify as repeat purchase without a minimum time gap.

## 83.5 Reciprocal Customer sales

Friends/Customers may close sales for each other without an automatic reciprocal-pair restriction.

## 83.6 Full Direct at 25%

Full Direct remains eligible at 25% Payment Received. Risk is controlled through Recovery, set-off and payment-source recording rather than staged payout.

## 83.7 Formal discounts only

Off-book concessions do not automatically reduce Commissionable Sale Value unless formally recorded as Authorised Discount.

## 83.8 General KYC at payout

General buyer KYC is not a universal pre-Booking-approval condition. Customer closer has a stricter role-specific KYC requirement.

## 83.9 Final Sold By controls Club-direct repeat purchase

Background Member involvement does not automatically override the final approved Sold By selection.

## 83.10 Original sale participant may earn Buying Commission

Original selling Member/Customer closer/Royalty Linked Member is not automatically barred from Buying Commission on a later Buyback if normal Buying Commission rules are satisfied.

## 83.11 Reference Project steering by payment timing

Qualification timing may influence which Project consumes the one lifetime Reference opportunity. This low-risk behaviour is accepted.

These choices remain subject to fraud/sham/collusion controls.

# 84. Final approved rule summary

## Project Direct
- Project-specific
- max 5%
- may be Disabled
- frozen on the Booking Request version Accounts ultimately approves
- full third-party Direct entitlement at 25% Payment Received
- formal Member self-purchase Direct at 100%
- Buyback does not accelerate Direct
- later invalidity/cancellation may create Recovery/set-off

## Customer-closing Loyalty
- Project-specific
- max 3%
- closer must be a real existing Customer with own approved purchase, verified KYC and accepted Customer Terms
- maximum 3 successful Customer-closing events for life
- Membership required after the third for further third-party selling earnings
- related/co-buyer closer is not automatically disqualified

## Repeat-purchase Loyalty
- Project-specific
- unlimited
- any second qualifying personal Booking may count immediately
- first personal purchase excluded
- Buyback alternative milestone requires at least 25% source Payment Received

## Trip
- Project-specific and independently Enabled/Disabled
- Own-Sale Credit is unit-based
- one Own-Sale Credit per Member/unit/programme across all sale types
- subdivision uses parent-unit credit pool unless a new Programme Version explicitly changes it
- one lifetime Reference Credit per directly introduced Member
- Total Target + Minimum Own + Maximum Reference
- extra Reference Credits banked subject to 12-month expiry
- Trip bucket freezes only when an eligible Booking Request version is approved
- Buyback alternative qualification requires 25% source Payment Received
- Buyback-qualified fulfilment waits for Stable Buyback Completion
- fulfilled Trip credits/opportunities remain consumed forever
- immediate-family nominee or one MD-approved non-family nominee

## Royalty Relationship Reward
- Primary Customer only
- non-cash; no percentage/bands/cycles
- one Royalty opportunity per qualifying Primary Customer
- final approved Sold By selection controls Club-direct treatment
- one Royalty Credit = one Gift entitlement
- Buyback eligibility requires at least 25% source Payment Received
- Gift fulfilment waits for normal 100% or Stable Buyback Completion
- delivered Gift keeps its opportunity consumed forever
- nominee rule mirrors Trip nominee control

## Buying Commission
- percentage of Acquisition Price
- max 5%
- one beneficiary
- frozen at Acquisition approval
- 100% Payment Given milestone
- original sale participant may separately qualify under normal Buying Commission rules
- returning owner cannot earn merely for arranging own return

## Global controls
- no combined 4% monetary cap
- Direct and Loyalty cannot apply to the same sale action
- Project versions cannot be backdated
- exact frozen Version ID stored
- general KYC before payout, with stricter Customer-closer KYC
- default one bank account per Person; controlled joint-account exception
- Recovery set-off and Circumvention Review
- staff conflict-of-interest approval
- no retroactive eligibility
- no legacy transition engine required

# 85. Final business principle

> **3% Club rewards genuine property activity under explicit frozen rules, while preserving the commercial flexibility deliberately chosen by the Owner. Accepted commercial risks are documented so that developers, staff and future reviewers do not silently rewrite the business model.**

Core brand message:

> **YOUR BUSINESS RELATIONSHIPS SHOULD GROW BEYOND ONE DEAL.**
