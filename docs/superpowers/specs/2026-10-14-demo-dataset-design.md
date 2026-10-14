# Demo Dataset — Design

**Date:** 14 Oct 2026 · **Status:** approved in chat (sections 1–3), awaiting spec review

## 1. Purpose

A dataset that makes the CRM look like a business that has been running for six
months, so the owner can see how every screen works with real-looking data. It
replaces the UAT mock data (`seed:mock-v2`), whose codes and names ("UAT-PRJ-A",
"Filler buyer", "UATV2-…") read as test data.

**Success:** any screen the owner opens — Dashboard, Plots, Bookings, Members,
Customers, Rewards, Buyback / Resale, Land Inquiries, the notification bell —
shows plausible records with dates spread from April to today, and nothing on
screen reads as a test.

**Decided in chat (user):** remove the old mock data; history spans six months
(April → 14 Oct 2026); medium size; approach A (build through the services,
then move system timestamps to their story dates).

## 2. Setting

"3% Real Estate Club", Jaipur, trading since April 2026. Staff are the existing
9 accounts (MD, Accounts, CRM, MIS, PC); none are created or changed.

| Project | Location | Kind | Plots | Launch | Notes |
|---|---|---|---|---|---|
| Shri Ram Enclave | Jagatpura, Jaipur | Residential | 30 | April | Oldest; most Bookings, Allotment / Registry done; settings v2 in August |
| Aravali Heights | Ajmer Road, Jaipur | Residential + villa plots | 25 | June | Carries the Trip Rewards programme |
| Mansarovar Business Park | Mansarovar, Jaipur | Commercial | 20 | August | Newest; shops / offices |

Each Project has: a published PLC rule set (corner, park-facing, main road),
Plots of mixed sizes (e.g. 150 / 200 / 250 gaj; shop sizes for commercial), and
an active commission settings version with a Royalty points rate.

**People:** ~45 Customers and ~14 Members with real-looking Indian / Rajasthani
names and unique mobiles beginning **93** (the other seeds use 94–97), so a
re-run can find and remove its own people. Members form an invite network (two or three levels), some
with RERA registration. Most have verified Aadhaar and bank details; 3–4 do not,
so their commission sits On Hold for a reason the screen names.

## 3. The six-month story

| Month | Events |
|---|---|
| April | Shri Ram Enclave launches. Members activate. Enquiries arrive (walk-in, Member, online). First 8 Bookings; first instalments received. |
| May | More Bookings, several sold by Members. First commission Ready and Paid. One Booking Request rejected by Accounts. |
| June | Aravali Heights launches with its Trip programme. Member Hold Requests: some approved, one rejected. Instalments continue. |
| July | One Change Plot, one Primary Customer change, one Sold By Correction. One Booking cancelled and refunded. One duplicate Customer merged. |
| August | Mansarovar Business Park launches. Shri Ram Enclave gets settings version 2 (changed rate). First Buyback (seller exits). One commission Paid Early with MD approval. |
| September | Several Bookings reach 100%: Final Buyer details, Allotment, Registry. A Member earns a Trip and travels. Royalty points earned and spent. One Purchase for Resale. |
| October (today) | Live work: active Holds, Booking Requests waiting for Accounts, overdue instalments, one Recovery Outstanding, one Check Recovery Link review, one joint bank account approval, one deactivated Member with a Hold Request waiting, one RERA expiring, Land Inquiries at different stages, one Buyback whose Buying Commission is Ready (so **Commission Paid** shows on its deal page). |

Every Dashboard task type that the system raises appears at least once, with a
mix of due today, overdue and upcoming. The exact cast (who is who, which Plot)
is fixed in the implementation plan and listed in the guide (§6).

## 4. How it is built (approach A)

New script `prisma/demo-seed.ts`, run as `npm run seed:demo`, guarded by
`assertCheckDatabase()` like every seed.

- **Through the services.** Every Booking, payment, approval, commission,
  Buyback, Trip and points entry is made by the same service the screen calls,
  so every business rule applies and no impossible state is created. Different
  staff accounts act as maker and checker where the rules require it.
- **Story clock.** The story is a list of steps, each with a story date. A step
  runs at the real time; when it finishes, one SQL statement moves every
  timestamp written during that step's real-time window (`started ≤ value ≤
  finished`, across all timestamp columns of all tables) back by
  `started − storyDate`. Business dates far from that window — instalment due
  dates, a future Effective from — are untouched. One round trip per step,
  so the shift adds little time.
- **Business dates** the services take as input (Paid on, Purchase date,
  Booking date) are passed as story dates. Where a service insists that a past
  Booking date carries a reason, the seed sets the Booking date to its story
  date directly after creation instead, so no "backdated" remark appears.
- **Jobs last.** After the final step the scheduled jobs run once at the real
  time, so Holds placed in the past expire, overdue instalments turn urgent and
  follow-ups land on their real dates — exactly as production would show it.

**Order to run:** `npm run data:reset` (removes all data, keeps staff) →
`npm run seed:demo`. The script is re-runnable: it first removes its own
Projects and People, so a run cut off by a dropped database connection can
simply be run again.

The UAT dataset (`seed:mock-v2`) and its key stay in the repo for testing; they
are not run for the demo.

## 5. What is out of scope

- No new screens or business rules; only data.
- No changes to staff accounts or passwords.
- No Member portal walkthrough beyond what the data naturally supports (portal
  accounts exist for Members; their initial password is the documented one).

## 6. Guide for the demo

`docs/Demo_Data_Guide.md`: the Projects, the cast (name → what happened to them
→ which screen shows it), and a suggested walk-through order (Dashboard →
Plots → a Booking from enquiry to Registry → a Member's network and rewards →
Buyback → Rewards → Land Inquiries → notification bell).

## 7. Testing

- Type check and unit checks pass.
- The seed runs end to end against the development database.
- After seeding, open every main screen in the browser and confirm it is
  populated, dated across April–October, and free of test-looking text; fix
  anything that is not.
- **Rule:** do not run the `*:check` scripts against the demo database — they
  add "ZZ-" test records and notifications. Re-seed after any check run.

## 8. Risks

- The Supabase connection dropped several times today; a long seed may be cut
  off. Mitigation: re-runnable script; steps are short transactions.
- The time shift relies on nothing else writing to the database while the seed
  runs (checks, other users). The seed is run when the database is otherwise
  idle.
