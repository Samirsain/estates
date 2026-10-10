# Business Model v2 — Part 3: Sales & Reference Trip Reward — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Project-specific, versioned Trip Programmes. Unit-based Own-Sale Credits and one lifetime Reference Credit per directly introduced Member. Buckets frozen on opening, FIFO allocation, 12-month expiry, Earned → Booked → Travelled fulfilment with holds, deficiency and wind-down.

**Spec:** SSOT §12.3, §15, §37–§58, §60–§66, §97–§99, §107; CP §7–§9, §22–§39, §60, §65 (NT02–NT05, NT10), §73.2–§73.3, §76, §79–§81, §86; Trip Terms 6.1 and doc 5 Part II; UAT TRP-01..28, REF-01..12, SET-09/10, BB-04/08/11, COR-03/04, SYS-01/02/07/10, VIS-02/08/09, TSK-09/11, CTL-02/12.

## Global Constraints

- Non-cash: no rupee value anywhere (CP §24 "Do not store monetary value").
- Local branch; never push. Owner direction 10 Oct 2026: decide from the docs, don't ask.

## Readings of the docs (no new rules)

1. **Trip settings live on the Project Settings Version** (CP §7.1): enabled, Total Target, Minimum Own, Maximum Reference, Trip Programme code + Programme Version ref + Terms Version ref (SSOT §12.3), cut-off and final wind-down deadline (CP §36 "store closure/cut-off metadata in programme/version configuration"). Validation: target > 0, 0 ≤ min ≤ target, 0 ≤ max ≤ target (CP §7.2).
2. **Programme identity** (CP §25.3 "spans all versions belonging to the same Project Trip Programme") = Project + Trip Programme code. Anti-recycling and buckets key on it, so a new settings version does not reset them.
3. **Economics review (CP §7.4, §65 NT02; UAT SET-10).** Sending a Trip-enabled version raises NT02 to MD. MD records Economics Reviewed (who, when, version only), which closes NT02. MD cannot approve a Trip-enabled version before that.
4. **Inventory (CP §9; SSOT §44).** Every Plot of the Project is eligible unless the version excludes it. A child Plot may name a parent whose credit pool it shares; with no split feature in the CRM, Admin records the parent on the version's rule (CP §9 `parentCreditPoolPlotId`). Rules belong to the version and are frozen with it.
5. **Own-Sale Credit (SSOT §41–§43, §60; CP §25–§27).** Created Pending when Accounts approves a Booking whose frozen version has Trip enabled, Sold By Member (third-party or formal self-purchase), on an eligible final Plot, approved before cut-off, and not already earned by that Member on that Plot (or pool) in that programme. It is Qualified at 100%, or at an Approved Buyback after 25%, and expires 12 months later. One Booking = one Plot in this CRM, so "one credit per unit" is one per Booking.
6. **Reference Credit (SSOT §49–§55; CP §28–§30).** When the first Reference-eligible third-party sale of a directly introduced Member qualifies (an Own-Sale Credit exists for it, and the buyer is not the seller), the immediate inviter gets one Qualified Reference Credit in that Project's programme. The introduced Member's lifetime opportunity is consumed atomically (lock per introduced Member; the first to qualify wins). A Deactivated inviter's credit is created Held and becomes usable on reactivation.
7. **Qualification lost (SSOT §99).** A payment correction below 100% with no qualifying Buyback returns an Own-Sale Credit to Pending and reverses that Booking's Reference Credit, reopening the opportunity. A cancellation, Sold By Correction away from the Member, or Change Plot to an excluded Plot reverses the Own-Sale Credit (SSOT §45, §63).
8. **Bucket (SSOT §47; CP §31–§34).** Opens on the Member's first Pending Own-Sale Credit in the programme when no bucket is open, freezing target, composition, programme/terms refs and wind-down from that Booking's frozen version. Earned when FIFO allocation (earliest qualified, then id) meets target with ≥ Min Own and ≤ Max Reference; allocated credits are Allocated, then Used at Travelled. An opening credit that reverses with nothing else valid closes the empty bucket (CP §32). Reference Credits without a bucket stay banked (SSOT §54).
9. **Reward (CP §37–§39).** Earned → Booked → Travelled. Holds: Recovery Outstanding, Member Deactivated, Buyback Stable Completion Pending, non-family nominee awaiting MD. A used credit invalid before booking is backfilled from FIFO, else the reward is Deficient (NT04). Once Booked, Trip Terms govern; the CRM raises NT04 for review. Travelled is final (SSOT §64).
10. **Expiry and wind-down (CP §35, §76).** A daily job expires Qualified, unallocated credits at 12 months. Another job raises NT05 once per open bucket whose programme cut-off has passed, and expires the bucket at its wind-down deadline. Both are idempotent.
11. **Inviter (SSOT §37, §38; CP §22).** The inviter freezes at Member activation, the CRM's Membership application event. Admin/MD may correct it with a reason until the introduced Member's first Reference-eligible Booking Request is submitted; after that it is refused and the refusal is audited (UAT REF-11/12).
12. **Correction after travel (CP §60).** A Sold By Correction on a Booking whose credit was used in a Travelled Trip needs MD; no second Trip.

## Tasks
1. Domain `src/lib/domain/trip.ts`: settings validation, FIFO allocation, composition — with unit checks.
2. Schema + migration + constraints: settings fields, inventory rules, TripCredit, TripBucket, TripReward (+ events), Member reference fields.
3. `trip-service.ts`: `syncTripForBooking`, buckets, rewards, holds, fulfilment commands, inviter correction, jobs; hooks from approval, payment, cancellation, Buyback, Change Plot, Sold By Correction, Recovery, Member status, merge.
4. Screens: Project settings Trip section + inventory + economics review; Member Trip and Reference views with fulfilment and inviter correction; portal Trip progress; TRIP and REFERENCE reports.
5. `prisma/trip.check.ts`; add to `db:check`.
