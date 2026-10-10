# Business Model v2 — Part 2: Royalty Gift, Stable Buyback Completion, fulfilment holds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A final Royalty Linked Member earns one non-cash Royalty Credit (one Gift) when their Customer's first Club-direct repeat purchase qualifies, under the Gift Programme Version frozen on that Booking. The Gift is selected, ordered and delivered through a held/released fulfilment flow. Buyback-based eligibility waits for Stable Buyback Completion.

**Spec:** SSOT §59–§62, §64, §67–§83, §97–§98, §101; CP §10, §40–§51, §60, §64–§66 (NT06, NT07, NT10), §79, §83–§85; Terms 6.2 and doc 5 Part I, III, IV; UAT ROY-01..18, BB-05/06/09/12, FRZ-08, COR-05, TSK-10/12, VIS-03/10, SYS-03/09.

## Global Constraints

- Non-cash: no rate, amount or cash field anywhere (CP §45 "No percentage/rate/amount fields").
- The catalogue lives outside the CRM; the CRM stores Programme Version, the selected Reward Reference, recipient and fulfilment states and dates (SSOT §78, §77; Terms 6.2 §39).
- Owner direction 10 Oct 2026: decide from the docs, list the reading here, don't ask.
- Local branch only; never push.

## Readings of the docs (no new rules)

1. **Relationship record.** The existing Customer link fields stay the relationship: Provisional = first Booking set, not final; Final = `royaltyLinkFinalAt`. Added: the finalisation route and the opportunity (consumed at / by which Booking). CP §41 *recommends* an entity; the fields carry every listed state, and a removed provisional link stays in Booking history (SSOT §70 "History remains auditable").
2. **Buyback-final link unwinds (SSOT §62).** A link made final only by an Approved Buyback becomes provisional again if that Buyback unwinds before the first purchase reaches 100%, unless the opportunity is already consumed.
3. **Programme Version** is company-wide (UAT seeds `RGP-01`, `RGP-02`; SSOT §76). Admin prepares and MD approves (NT07), with the same Draft → Pending → Approved → Active lifecycle as Project settings. MD's approval also records the economics review (CP §7.4, SSOT §101: Economics Reviewed = Yes, approver, date, Programme Version), so a version cannot activate without it (UAT SET-10).
4. **Freeze (SSOT §76; CP §46).** Every Booking Request freezes the Active Programme Version (or none) on submission and on revision, like the commission version. The approved request's value is the one that counts.
5. **Trigger (SSOT §72; CP §43).** The relationship is Final and names a Member; the opportunity is unused; the Booking is the same Primary Customer's other approved, uncancelled Booking; final Sold By is 3% Club; it froze a live Programme Version; and it qualifies by 100% Payment Received, or by an Approved Buyback with ≥ 25% received. If several Bookings already qualify when the relationship becomes final, the lower Booking Number wins. One Credit per Customer, ever, while not reversed (CP §80 (8)).
6. **States (CP §45, §62.2).** Eligible → Selected → Ordered → Delivered, or Reversed. "On Hold" is shown when a hold reason is set; holds stop ordering and delivery, but not selection or nomination (Terms 6.2 §18 selection "after fulfilment-ready"; doc 5 §6 "no fulfilment while approval pending").
7. **Holds (CP §85; doc 5 §88).** Recovery Outstanding, Member Deactivated, Buyback Stable Completion Pending (the trigger is below 100% and its Buyback is not Stable), Nominee Approval Pending. They are recomputed on each related event, idempotently (CP §76.3, §76.4).
8. **Reversal before delivery (SSOT §62, §99; CP §47, §84).** If the trigger Booking stops qualifying (payment corrected, Buyback unwound below 100%, cancelled, Sold By no longer 3% Club), the Credit is Reversed and the opportunity reopens; no replacement is created on that event. If the same Booking re-qualifies, the same Credit comes back (SSOT §99 "re-qualifies the same entitlement"). Delivered never reverses (SSOT §64).
9. **Nominee (SSOT §81; doc 5 §6, §7).** Recipient is the Member or an immediate-family member (spouse, parent, child, sibling), with no approval needed; a non-family recipient needs MD (NT10) and is held until approved.
10. **Stable Buyback Completion (SSOT §61).** Approved + Payment Given 100% + not unwound + document return done where the old sale had an Allotment/Registry. Document return is recorded by a new command that also closes the existing "Collect Allotment Papers Back / Complete Registry Back" task. It is stored with achieved/lost audit (CP §79).
11. **Sold By Correction (CP §59, §60).** Correcting the first purchase re-links the relationship to the corrected Member. A Credit not yet delivered moves (old Reversed, new one created under the same rules). After a Gift is Delivered, only MD may approve a correction on that Customer's first purchase or trigger Booking, and no second Gift follows.
12. **Tasks.** NT07 (MD) on send; NT06 "Royalty Gift Selection / Fulfilment" (CRM) when a Credit is Eligible with no hold, closed at Delivered/Reversed; NT10 (MD) for a non-family recipient.

## Tasks
1. Schema + constraints + migration: RoyaltyProgrammeVersion, RoyaltyCredit, enums, Booking freeze field, Customer opportunity fields, Acquisition document-return / stable fields.
2. `royalty-service.ts`: programme lifecycle, `syncRoyaltyReward`, holds, fulfilment commands; link unwind and correction re-link in `network-service.ts`.
3. Stable Buyback Completion in `acquisition-service.ts`; hooks from payment, Buyback, cancellation, Sold By Correction, Recovery, Member status.
4. Screens: Royalty programme admin (Administration), Booking/Customer/Member/portal Royalty views, Acquisition document return + stable state; ROYALTY report; T24/T25 wording.
5. Checks: new `prisma/royalty.check.ts` covering the ROY/BB/COR cases above; added to `db:check`.
