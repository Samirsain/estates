# Dashboard Tasks — Review

**Prepared:** 13 Oct 2026 · **Updated:** 14 Oct 2026 with the owner's task titles and decisions

This document answers three questions about the work list on the staff Dashboard:

1. **Which tasks the system creates by itself** (Part 1)
2. **Which actions need someone's approval, and who gives it** (Part 2)
3. **Which further tasks we recommend adding** (Part 3)

Button and menu names are written exactly as staff see them on screen, in **bold**.

---

## Summary

| | Number |
|---|---|
| Tasks the system creates by itself | **31** |
| of which need an **approval** (Approve / Reject) | **14** |
| of which are **follow-up / work** tasks | **17** |
| Tasks staff can create by hand (**+ Add Task**) | 1 kind, any title |
| New tasks we recommend | **5** (R1 is built) |

Who receives the automatic tasks: **Accounts 16**, **CRM 11**, **MD 4**.

There is one senior role, **MD**. When MD does something that would normally need MD's approval, it applies at once, with no approval task. This covers:
- a Sold By Correction
- a Person Merge
- Project commission and Rewards settings

---

## Part 1 — Tasks the system creates by itself

Nobody adds these by hand. The system raises each one when the event in the second column happens, and closes it when the work is done.

### Bookings and payments

| # | Task | Created when | Goes to |
|---|---|---|---|
| 1 | Verify — Booking Payment | CRM sends a Booking Request | Accounts |
| 2 | Verify — Refund | An approved Booking is cancelled | Accounts |
| 3 | Verify — Change Plot | A Change Plot is submitted | Accounts |
| 4 | Verify — Primary Customer Change | A Primary Customer change is submitted | Accounts |
| 5 | Sold By Correction — MD Approval | Staff other than MD submit a Sold By Correction | MD |
| 7 | Payment Follow-Up | A Booking is approved; the task moves to each next instalment's due date | CRM |
| 8 | Verify — Payment Schedule | CRM revises the remaining payment schedule | Accounts |
| 9 | Complete Customer Details | Payment Received reaches 100% | CRM |
| 10 | Prepare Allotment / Registry | Payment Received reaches 100% | CRM |
| 11 | Enquiry Follow-Up | An Enquiry is added by staff or by a Member in the portal | CRM |

### Buyback / Resale

| # | Task | Created when | Goes to |
|---|---|---|---|
| 12 | Verify — Buyback/Resale | A new Buyback or Resale deal is created | Accounts |
| 13 | Payment Given Follow-Up | Payment Given is recorded; the task moves to each next instalment's due date | Accounts |
| 14 | Selling Buyback/Resale Plot | Payment Given is corrected while a new Hold or Booking is active on that Plot | MD |
| 15 | Collect Allotment / Complete Registry | A Buyback is approved on a Booking that already had Allotment or Registry | CRM |

### Commission, Loyalty Points and Recovery

| # | Task | Created when | Goes to |
|---|---|---|---|
| 16 | Verify — Commission Paid | A Commission or Loyalty Points line becomes Ready to pay | Accounts |
| R1 | Verify — Buying Commission | A Buying Commission on a Buyback / Resale deal becomes Ready (100% Payment Given) | Accounts |
| 17 | Commission Conflict — Correct Sold By | The Sold By / beneficiary details do not fit together | Accounts |
| 18 | Early Commission — Pay After Approval | Accounts asks to pay a commission before its milestone | MD |
| 19 | Paid Commission Conflict | A line that was already paid becomes invalid | Accounts |
| 20 | Recovery Follow-Up | A Recovery is opened | Accounts |
| 21 | Double Commission — MD Approval | A corrected beneficiary is due payment while the old one's Recovery is still open | MD |
| 22 | Reward Review — Approved Buyback | A Buyback is approved | Accounts |
| 23 | Reward Review — Buyback Unwind | An approved Buyback is cancelled | Accounts |
| 24 | Membership — Upgrade Customer | A Customer earns their third Customer-closing Loyalty Points | CRM |

### Controls and checks

| # | Task | Created when | Goes to |
|---|---|---|---|
| 26 | Check Bank Account | The person receiving a benefit shares a bank account, mobile or address with someone who owes a Recovery | Accounts |
| 27 | Check Joint Bank Account — Approval | Bank details are entered for an account already used by someone else, with proof that it is joint | Accounts |

### Rewards (Trip) and Royalty Points

| # | Task | Created when | Goes to |
|---|---|---|---|
| 28 | Reward Earned | A Member earns a Trip | CRM |
| 29 | Reward Sale Cancelled | A sale that counted toward an earned Trip is no longer valid | CRM |
| 30 | Reward Expiry | A Project's Rewards programme closes while a Member still has Trip progress | CRM |

### Members

| # | Task | Created when | Goes to |
|---|---|---|---|
| 32 | Plot Hold by Deactivated Member | A Member with waiting Hold Requests is deactivated (closes by itself once none waits) | CRM |
| 33 | RERA Registration Expiring | A Member's RERA registration expires within 7 days | CRM |

### Removed by the owner (14 Oct 2026)

| # | Task | Why it is gone |
|---|---|---|
| 6 | Verify — Commission after Sold By Correction | Its work is already covered by tasks 16, 17 and 19 |
| 25 | Staff / Relative Benefit Conflict Review | Every sale by 3% Club staff is a 3% Club sale. Staff or their family who buy as a Customer or become a Member earn benefits like anyone else, with no MD approval. A staff member still cannot approve or pay their own or a relative's benefit; another staff account does that |
| 31 | Non-Family Reward Nominee Approval | Any staff member may record a Trip traveller or Royalty Points recipient outside the immediate family, and it applies at once with no MD approval |

---

## Part 2 — Actions that need approval

These 14 tasks are approvals. Nothing changes until the approver clicks **Approve** or **Reject** on the record's own page. The Dashboard row only shows **Open Review**, which takes the approver there.

The person who raises a request can never approve it themselves. The one exception is MD, as explained in the Summary.

### Approved by Accounts (11)

| # | What needs approval | Who raises it | What approval does |
|---|---|---|---|
| 1 | A new Booking | CRM | The Booking Request becomes a Booking, and the plot is sold |
| 2 | A refund after cancellation | CRM | The cancellation and refund go ahead |
| 3 | A Change Plot | CRM | The Booking moves to the new plot |
| 4 | A Primary Customer change | CRM | The Booking's main customer changes |
| 8 | A revised payment schedule | CRM | The new instalment dates take effect |
| 12 | A Buyback or Resale deal | CRM | The plot comes back into stock (needs at least 20% Payment Given) |
| 16 | Paying a Commission or Loyalty Points line | System, when the line is Ready | Accounts marks it paid |
| R1 | Paying a Buying Commission | System, at 100% Payment Given | Accounts clicks **Commission Paid** on the deal page |
| 19 | An adjustment on an already-paid line | System | Accounts opens a Recovery, or closes it with a reason |
| 26 | A benefit to someone linked to an unpaid Recovery | System | **Approve** releases the benefit; **Reject** keeps it held |
| 27 | A bank account shared with another person | Staff entering bank details | The joint account is accepted or refused |

### Approved by MD (3)

| # | What needs approval | Who raises it | What approval does |
|---|---|---|---|
| 5 | A Sold By Correction | CRM | Commission is recalculated for the corrected seller |
| 18 | Paying a commission early | Accounts | Accounts may pay before the normal milestone |
| 21 | Paying a corrected beneficiary before the old Recovery is settled | System | The new beneficiary is paid now |

### Things MD now does without any approval

| Action | Before | Now |
|---|---|---|
| Project commission and Rewards settings | Prepared, then sent to MD for approval and an economics review | MD saves them and they are active at once (or at the chosen future date) |
| MD's own Sold By Correction | Waited for a second approver | Applies at once |
| MD's own Person Merge | Waited for a second decision | Merges at once |

---

## Part 3 — Recommended new tasks

These are tasks the system does not create today. For each one we give the reason, and whether the business rules already require it (**Required**) or it is **our recommendation**. None of these is built yet. (R1, Verify — Buying Commission, was built on 14 Oct 2026 and is now in Part 1.)

| # | New task | Goes to | Created when | Closed when | Why | Basis |
|---|---|---|---|---|---|---|
| R2 | **Hold Follow-Up** | CRM | A plot is put on Hold | The Hold is booked, cancelled or expires | CRM gets a reminder to convert the Hold before it lapses | Required (the owner may waive it, since Holds expire on their own after 72 hours) |
| R3 | **Commission On Hold — Collect Details** | CRM | A Commission or Loyalty Points line is otherwise due but held because something is missing: Aadhaar, bank details, Customer Terms acceptance, the closer's KYC, or RERA | The missing item is recorded and the line becomes Ready | Today the money just sits On Hold and nobody is told to chase the missing document. This is the most common reason a payout is delayed | Our recommendation |
| R4 | **Verify — Payment Correction** | Accounts | Accounts corrects a recorded payment received | MD approves or rejects the correction | A change to money received is applied at once today, with no second check. The Buyback side already requires a second person | Required (owner decision) |
| R5 | **Booking Request Waiting** | CRM | A Booking Request has waited 7 days for Accounts | Accounts decides it | CRM should know a deal is stuck so they can update the customer. Today only the Accounts task turns urgent | Required (alternative: keep only the urgent Accounts task) |
| R6 | **Recovery Overdue — escalate to MD** | MD | A Recovery passes its due date with no repayment or set-off | The Recovery is cleared | Today only Accounts follows up. Unpaid recoveries are money owed to the company, so MD should see the overdue ones | Our recommendation |

### Changes to existing tasks — approved by the owner and done (14 Oct 2026)

- **"Selling Buyback/Resale Plot" closes by itself** when the conflicting Hold or Booking ends (checked every 30 minutes).
- **"Verify — Commission after Sold By Correction" is removed.** Its work is covered by tasks 16, 17 and 19.
- **Follow-up tasks** (Enquiry, Payment, Payment Given) have no **Done** button. The Dashboard shows **Open record** instead; staff use **Record Follow-Up**, **Confirm Payment Received** or **Confirm Payment Given**, so the follow-up is never lost.
- **New titles** (Part 1) are in use.
- **Open Review links** open the right page:
  - the joint bank account task → the person's page
  - Buying Commission tasks → the Buyback / Resale deal page
  - deactivated-Member tasks → the Member's page
  - Buyback / Resale tasks → the deal page
- **Manual tasks:** the chosen staff member is saved (or "Anyone in CRM / Accounts / MD"), and a repeating task (daily, weekly, monthly) creates the next one when it is done.

### Suggestions approved by the owner and done (14 Oct 2026)

- **Commission Paid** button on the Buyback / Resale deal page (Accounts), and the **Verify — Buying Commission** task (R1).
- Task 19 is now **Paid Commission Conflict**: it covers any already-paid line, Paid or Paid Early.
- The Booking page and blocked messages say **Selling Buyback/Resale Plot**, the same as task 14.
- **Plot Hold by Deactivated Member** closes by itself once none of the Member's Hold Requests is waiting.

---

## Already fixed (13 Oct 2026)

- The two Buyback reward reviews and the Sold By commission review could never be closed. They can now be closed with **Done**.
- The Dashboard could hide pending work once it held more than 300 tasks. It now always shows every pending task.
- The Commission Conflict task raised at Booking approval was being lost. It now reaches its team.
- Payment Given Follow-up now moves to the next instalment's date.
- Tasks on a replaced commission line, on a cleared Recovery and on an updated RERA now close by themselves.
- MD's own actions no longer wait for an approval task.

*A detailed technical version of this review, with code references for the developer, is in `docs/Dashboard_Tasks_Technical_Review.md`.*
