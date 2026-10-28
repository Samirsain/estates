# IDs in the CRM — Simple Guide

The CRM gives many records an ID on its own. Every such ID looks the same:
a short name, a dash, and 6 digits — for example `BKG-000054`.

The ID never changes and is never reused. Even when an ID is hidden on the screen,
it stays in the database, the history and the audit, so it can be shown again any time.

---

## 1. IDs the CRM makes on its own

| ID | Example | What it is | When it is made | Use case | Suggestion |
|---|---|---|---|---|---|
| **Member ID** | `MEM-000017` | One Member | When the Membership is activated | Find a Member, Sold By Member, Members Invited, portal login | **Show** |
| **Customer ID** | `CUS-000044` | One Customer | When the person first buys in a Booking Request | Find a Customer, Sold By Customer, Royalty Customers | **Show** |
| **Booking Number** | `BKG-000054` | One approved Booking | When Accounts approves the Booking Request | Payments, receipts, agreement, registry, commission, payout, rewards, reports. One Plot can have many Bookings over time (after a cancellation, a Buyback or a Resale), so the Plot number alone is not enough | **Show** |
| **Recovery No.** | `REC-000003` | Money the CRM must get back | When a Recovery is opened | Accounts follow-up, setting it off against a payout, talking to the person. One person can have more than one Recovery | **Show** |
| **Land Inquiry No.** | `LI-000012` | One land call | When a land inquiry is logged | Land owners are not Customers and have no Plot, so this number is their only reference | **Show** (on Land Inquiries) |
| **Request No.** | `REQ-000057` | One Booking Request | When the request is sent | The only number a Booking has before approval | **Hide** — show the Plot, the Customer and the date |
| **Buyback / Resale No.** | `ACQ-000004` | One Buyback or Resale deal | When the deal is made | Buying Commission and its tasks | **Hide** — show "Buyback · TN-27 · date" |
| **Enquiry No.** | `ENQ-000012` | One enquiry | When the enquiry is logged | Follow-ups | **Hide** — show the name, the Plot and the date |
| **Task No.** | `TSK-000123` | One task | When the task is made | Staff talk about a task | **Hide** — show the task title |
| **Investor Lead No.** | `PI-000001` | One Investor Lead | When the lead is added | The Investor Leads list | **Hide** — the name and mobile are enough |

---

## 2. IDs typed in by staff (not made by the CRM)

| ID | Example | Who types it | Use case |
|---|---|---|---|
| **Staff ID** | `STF-0001` | Admin, when adding a staff account | Who did what ("submitted by STF-0005"). If hidden, show the staff name |
| **Plot No.** | `TN-01` | Staff, when the Project inventory is set up | The Plot on every screen — **Show** |
| **Project** | `Test Nagar` | Staff, when the Project is made | The Project on every screen — **Show** |
| **Rewards programme code** | `TRIP-TN-26` | Staff, in the Project's Rewards settings | Internal only. It still says "TRIP" |
| **Customer Terms version** | `CT-2026-10` | CRM or MD, when recording acceptance | Which terms the Customer accepted |
| **Payment Reference / UTR** | `UTR123…` | Accounts, when a payment or payout is recorded | Matching the bank statement |

---

## 3. Where hidden IDs still show today

Some IDs are hidden from their own lists but still appear in other places:

- **Enquiry No.** — the Close and Follow-up dialog titles, the Plot page, Administration, and the **Member portal**.
- **Request No.** — the Booking page header ("BKG-000054 · REQ-000057"), and in place of the Booking Number before approval.
- **Buyback / Resale No.** — the **Task List** (as the record name) and the Members list quick view.
- **Recovery No.** — the Customer and Member profiles, the Booking's Commission tab, Rewards → Reviews, and the Task List.
- **Task No.** — Administration and one error message.

---

## 4. What we lose by hiding an ID

- **Talking about a record gets harder.** On a call it is easy to say one number. Without it, staff must say the name, the Plot and the date, and mistakes grow.
- **Search works only with what is shown.** A hidden ID cannot be searched for.
- **Booking Number and Recovery No. matter most.** Money and paperwork are matched with them, so they should stay visible.

## 5. Claude's suggestion, in short

- **Show:** Member ID, Customer ID, Plot No., Project, Booking Number, Recovery No., and Land Inquiry No. (on Land Inquiries).
- **Hide:** Request No., Buyback / Resale No., Enquiry No., Task No. and Investor Lead No. — and show the name, Plot and date in their place.
- **Fix the leaks** in section 3 when an ID is hidden, so it does not appear somewhere else by accident.
