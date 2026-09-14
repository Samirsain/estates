# Showcase mock data — one Project to test every screen

```
npm run seed:showcase
```

Builds **Project SHW — SHOW Sunrise Showcase City** (Jaipur, 30 Plots) and 14 People whose
mobile numbers start with **94**. Every record is made through the same services the
screens use, so commission, tasks, History and Loyalty behave exactly as real data would.

- **Safe to re-run.** It deletes only Project SHW and the 94 People, then rebuilds.
  The v1 (97), v2 (96) and demo data are not touched.
- **Development database only.** It refuses to run unless `ALLOW_CHECK_WRITES="true"`.
- **Customer and Member IDs change on every run** (CUS-/MEM- numbers are never reused).
  Search by name or by the mobile number below.
- Staff sign in with the usual accounts: MD `STF-0001`, Admin `STF-0002`,
  Accounts `STF-0003`, CRM `STF-0005`.

Two states were placed by hand because only the clock makes them: Kiran's Hold on SHW-004
is set to expire **5 hours after the seed runs**. Run the seed again for a fresh one.

## Who is who

| Person | Mobile | Is | Open it to test |
| --- | --- | --- | --- |
| **Kiran Deshmukh** | 9400000004 | Customer | The full Customer profile — see below |
| Farhan Siddiqui | 9400000008 | Customer | Additional Customer (40%) on SHW-002; Primary Customer of SHW-003 after a change |
| Neelam Chauhan | 9400000007 | Customer | Lost SHW-003 to Farhan — History shows the Primary Customer change |
| Rohit Bhandari | 9400000005 | Customer | **No Aadhaar, no bank** — alert "Aadhaar Pending" holding his Loyalty Bonus |
| Gita Solanki | 9400000009 | Customer | SHW-005 sold by Rohit (a Customer), Delivered by Registry — "No Royalty Member" |
| Sonal Mathur | 9400000006 | Customer + Member | "Also a Member" link; Sold By corrected from 3% Club to Chetna — Royalty "Provisional" |
| Harish Menon | 9400000010 | Customer | SHW-007 Delivered by **Allotment**, then **Buyback** with Harish as seller |
| Isha Kapoor | 9400000011 | Customer | SHW-008 **Cancelled** with refund; SHW-009 **Change Plot** to SHW-010 |
| Jatin Arora | 9400000012 | Customer | **Rejected** request SHW-011, **waiting** request SHW-012, Member Hold Requests |
| Kiran Deshmukh (2nd) | 9400000013 | Customer | Duplicate of Kiran — a **Person Merge waiting for the MD** |
| Lalit Joshi | 9400000014 | Enquiry only | Walk-in lead with no Plot and no Customer ID yet |
| Aarti Kulkarni | 9400000001 | Member (root) | RERA Registered; invited Bhavesh, Chetna and Sonal — Invite commission |
| Bhavesh Trivedi | 9400000002 | Member | Sold Kiran's first Plot — Direct **Paid**; Royalty on SHW-002; Hold Requests for Jatin |
| Chetna Rawat | 9400000003 | Member | Sold SHW-006 (after correction) and SHW-007 |

## Kiran Deshmukh — what the profile should show

| Section | Expected |
| --- | --- |
| Header | Kiran Deshmukh · CUS-… · Investor (latest deal) |
| Alerts | **Complete Customer Details** (SHW-002 paid in full, final buyer not recorded) · **Hold expiring** (SHW-004) |
| Summary | 1 booked · 1 delivered · Loyalty 1 of 3 · Royalty linked to Bhavesh, final |
| Properties | SHW-001 Delivered (Registry, Sold By Bhavesh) · SHW-002 Payment completed, Primary 60% |
| Property Activity | 2 Enquiries (one closed), Hold on SHW-004 with time left and 0 extensions, 2 Bookings, Registry, Delivery |
| Loyalty slots | Slot 1 = SHW-002 · Slots 2 and 3 Open. A slot is taken when that Booking's payment reaches 100%, so SHW-003 (30%) has not taken one yet |
| Commission paid | SHW-002 Loyalty Bonus 1% — Ready, **Paid** · SHW-003 Loyalty Bonus 1% (Kiran closed the sale) — Milestone Pending |
| History | Profile created, bank details entered, ownership share 100% → ended on SHW-002, merge pending |

## Things to try, and what should happen

| Try this | Signed in as | Where | Expected result |
| --- | --- | --- | --- |
| Record 70% on SHW-003 | Accounts / MD | Farhan's profile → Properties → **Payment** | Payment completed; **Kiran's Loyalty slot 2** fills |
| Record 70% on SHW-006 | Accounts / MD | Sonal's profile → Payment | SHW-006 becomes Payment Completed; check the commission lines on Chetna's and Aarti's profiles |
| Complete final buyer details | CRM | Kiran's alert → **Complete details** | Alert disappears; SHW-002 can be Delivered |
| Decide the Hold extension | Admin / MD | Plot Inventory → SHW-004 → Cancel menu → Approve extension | The Hold's expiry moves later; the "Hold expiring" alert goes once more than 24 hours are left |
| Book SHW-004 from the Hold | CRM | Kiran's profile → **Start Booking** | Request goes to Accounts; the Hold freezes |
| Hold another Plot for Kiran | CRM | **Hold a Plot** (SHW-015 to SHW-028 are Available) | Hold dialog opens with Kiran already chosen |
| Decide Jatin's waiting request | Accounts | Bookings → SHW-012 | Approve gives a BKG- number; reject needs a reason |
| Decide Jatin's Hold Request | CRM | Plot Inventory → Hold Requests → SHW-013 | Approve creates a Hold for Jatin |
| Decide the merge | MD | Administration → Person Merge | The 2nd Kiran merges into the first; its CUS- ID stays searchable |
| Enter Rohit's bank details | CRM | Rohit's profile → Edit details | Bank shows Verified; his Loyalty stays held while no Aadhaar is recorded (Edit details does not take Aadhaar) |
| Pay a Ready commission | Accounts | Bookings → SHW-002 (Royalty) or SHW-010 (Direct) → commission | Both are Ready for Bhavesh; marking Paid needs a Payment Reference No. |
| Try an unavailable Plot | CRM | SHW-029 (Not Available), SHW-030 (Pledge) | SHW-029 offers nothing. SHW-030 shows Hold but saving is refused; Book is not offered |
| Start an Enquiry | CRM | Any profile → **Start Enquiry** | New Enquiry form opens with the person chosen |

## Plots at a glance

| Plot | State |
| --- | --- |
| SHW-001 | Delivered — Kiran |
| SHW-002 | Payment Completed — Kiran 60% + Farhan 40% |
| SHW-003 | Booked 30% — Farhan (sold by Kiran) |
| SHW-004 | Hold — Kiran, expiring, extension waiting |
| SHW-005 | Delivered — Gita (sold by Rohit) |
| SHW-006 | Booked 30% — Sonal (Sold By corrected to Chetna) |
| SHW-007 | Bought back from Harish |
| SHW-008 | Cancelled — Isha |
| SHW-009 | Released by Change Plot |
| SHW-010 | Booked 30% — Isha (moved from SHW-009) |
| SHW-011 | Request rejected — Jatin |
| SHW-012 | Waiting for Booking approval — Jatin |
| SHW-013 | Member Hold Request waiting — Jatin via Bhavesh |
| SHW-014 | Member Hold Request rejected |
| SHW-015 – SHW-028 | Available for testing Hold and Book |
| SHW-029 | Not Available |
| SHW-030 | Available, Pledge restriction |
