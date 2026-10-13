# Dashboard Tasks — Review

**Prepared:** 13 Oct 2026

This document answers three questions about the work list on the staff Dashboard:

1. **Which tasks the system creates by itself** (Part 1)
2. **Which actions need someone's approval, and who gives it** (Part 2)
3. **Which further tasks we recommend adding** (Part 3)

Button and menu names are written exactly as staff see them on screen, in **bold**.

---

## Summary

| | Number |
|---|---|
| Tasks the system creates by itself | **33** |
| of which need an **approval** (Approve / Reject) | **15** |
| of which are **follow-up / work** tasks (marked **Done** on the Dashboard) | **18** |
| Tasks staff can create by hand (**+ Add Task**) | 1 kind, any title |
| New tasks we recommend | **6** |

Who receives the automatic tasks: **Accounts 15**, **CRM 12**, **MD 6**.

There is one senior role, **MD**. When MD does something that would normally need MD's approval, it applies at once, with no approval task. This covers:
- a Sold By Correction
- a non-family Royalty Points redemption
- a non-family Trip traveller
- a Person Merge
- Project commission and Rewards settings

---

## Part 1 — Tasks the system creates by itself

Nobody adds these by hand. The system raises each one when the event in the second column happens, and closes it when the work is done.

### Bookings and payments

| # | Task | Created when | Goes to |
|---|---|---|---|
| 1 | Accounts Verification — Booking | CRM sends a Booking Request | Accounts |
| 2 | Accounts Verification — Refund | An approved Booking is cancelled | Accounts |
| 3 | Accounts Verification — Change Plot | A Change Plot is submitted | Accounts |
| 4 | Accounts Verification — Primary Customer Change | A Primary Customer change is submitted | Accounts |
| 5 | Sold By Correction — MD approval | Staff other than MD submit a Sold By Correction | MD |
| 6 | Accounts Verification — Commission after Sold By Correction | A Sold By Correction is applied | Accounts |
| 7 | Payment Follow-up | A Booking is approved; the task moves to each next instalment's due date | CRM |
| 8 | Accounts Verification — Payment | CRM revises the remaining payment schedule | Accounts |
| 9 | Complete Final Buyer Details | Payment Received reaches 100% | CRM |
| 10 | Prepare Allotment / Registry | Payment Received reaches 100% | CRM |
| 11 | Enquiry Follow-up | An Enquiry is added by staff or by a Member in the portal | CRM |

### Buyback / Resale

| # | Task | Created when | Goes to |
|---|---|---|---|
| 12 | Acquisition approval | A new Buyback or Resale deal is created | Accounts |
| 13 | Payment Given Follow-up | Payment Given is recorded; the task moves to each next instalment's due date | Accounts |
| 14 | Management Action Required | Payment Given is corrected while a new Hold or Booking is active on that Plot | MD |
| 15 | Collect Allotment Papers Back / Complete Registry Back | A Buyback is approved on a Booking that already had Allotment or Registry | CRM |

### Commission, Loyalty Points and Recovery

| # | Task | Created when | Goes to |
|---|---|---|---|
| 16 | Accounts Verification — Commission | A Commission or Loyalty Points line becomes Ready to pay | Accounts |
| 17 | Commission Conflict — correct the source details | The Sold By / beneficiary details do not fit together | CRM |
| 18 | Paid Early Approval — MD | Accounts asks to pay a commission before its milestone | MD |
| 19 | Accounts Adjustment Required | A line that was already paid becomes invalid | Accounts |
| 20 | Recovery Outstanding Follow-up | A Recovery is opened | Accounts |
| 21 | Correct Beneficiary Before Old Recovery — MD Approval | A corrected beneficiary is due payment while the old one's Recovery is still open | MD |
| 22 | Reward Review — Approved Buyback | A Buyback is approved | Accounts |
| 23 | Reward Review — Buyback Unwind | An approved Buyback is cancelled | Accounts |
| 24 | Customer-Closing Limit Reached — Membership Required | A Customer earns their third Customer-closing Loyalty Points | CRM |

### Controls and checks

| # | Task | Created when | Goes to |
|---|---|---|---|
| 25 | Staff / Relative Benefit Conflict Review | A benefit would go to a staff member or a staff member's declared relative | MD |
| 26 | Recovery Circumvention Review | The person receiving a benefit shares a bank account, mobile or address with someone who owes a Recovery | Accounts |
| 27 | Joint Bank Account Exception — Approval | Bank details are entered for an account already used by someone else, with proof that it is joint | Accounts |

### Rewards (Trip) and Royalty Points

| # | Task | Created when | Goes to |
|---|---|---|---|
| 28 | Trip Reward Fulfilment | A Member earns a Trip | CRM |
| 29 | Trip Reward Deficiency Review | A sale that counted toward an earned Trip is no longer valid | CRM |
| 30 | Trip Credit Expiry / Bucket Wind-Down Review | A Project's Rewards programme closes while a Member still has Trip progress | CRM |
| 31 | Non-Family Reward Nominee Approval | Staff other than MD record a Trip traveller or a Royalty Points recipient outside the immediate family | MD |

### Members

| # | Task | Created when | Goes to |
|---|---|---|---|
| 32 | Review Hold Requests of a deactivated Member | A Member with waiting Hold Requests is deactivated | CRM |
| 33 | RERA registration expiring | A Member's RERA registration expires within 7 days | CRM |

---

## Part 2 — Actions that need approval

These 15 tasks are approvals. Nothing changes until the approver clicks **Approve** or **Reject** on the record's own page. The Dashboard row only shows **Open Review**, which takes the approver there.

The person who raises a request can never approve it themselves. The one exception is MD, as explained in the Summary.

### Approved by Accounts (10)

| # | What needs approval | Who raises it | What approval does |
|---|---|---|---|
| 1 | A new Booking | CRM | The Booking Request becomes a Booking, and the plot is sold |
| 2 | A refund after cancellation | CRM / staff | The cancellation and refund go ahead |
| 3 | A Change Plot | CRM | The Booking moves to the new plot |
| 4 | A Primary Customer change | CRM | The Booking's main customer changes |
| 8 | A revised payment schedule | CRM | The new instalment dates take effect |
| 12 | A Buyback or Resale deal | CRM / staff | The plot comes back into stock (needs at least 20% Payment Given) |
| 16 | Paying a Commission or Loyalty Points line | System, when the line is Ready | Accounts marks it paid |
| 19 | An adjustment on an already-paid line | System | Accounts opens a Recovery, or closes it with a reason |
| 26 | A benefit to someone linked to an unpaid Recovery | System | **Clear** releases the benefit; **Restrict** keeps it held |
| 27 | A bank account shared with another person | Staff entering bank details | The joint account is accepted or refused |

### Approved by MD (5)

| # | What needs approval | Who raises it | What approval does |
|---|---|---|---|
| 5 | A Sold By Correction | CRM | Commission is recalculated for the corrected seller |
| 18 | Paying a commission early | Accounts | Accounts may pay before the normal milestone |
| 21 | Paying a corrected beneficiary before the old Recovery is settled | System | The new beneficiary is paid now |
| 25 | A benefit to staff or a staff relative | System | The benefit is released, or refused |
| 31 | A Trip traveller or Royalty Points recipient outside the family | CRM | The Trip can be booked, or the points count as spent |

### Things MD now does without any approval

| Action | Before | Now |
|---|---|---|
| Project commission and Rewards settings | Prepared, then sent to MD for approval and an economics review | MD saves them and they are active at once (or at the chosen future date) |
| MD's own Sold By Correction | Waited for a second approver | Applies at once |
| MD's own non-family Trip traveller or Royalty Points recipient | Waited for MD approval | Applies at once |
| MD's own Person Merge | Waited for a second decision | Merges at once |

---

## Part 3 — Recommended new tasks

These are tasks the system does not create today. For each one we give the reason, and whether the business rules already require it (**Required**) or it is **our recommendation**.

| # | New task | Goes to | Created when | Closed when | Why | Basis |
|---|---|---|---|---|---|---|
| R1 | **Accounts Verification — Buying Commission** | Accounts | A Buying Commission on a Buyback / Resale deal becomes Ready (100% Payment Given) | Accounts marks it paid | Today Accounts gets no task and must search the Rewards tab. **First a "Mark Commission Paid" button must be built on the Buyback / Resale deal page.** At present a Buying Commission cannot be marked paid anywhere | Required |
| R2 | **Hold Follow-up** | CRM | A plot is put on Hold | The Hold is booked, cancelled or expires | CRM gets a reminder to convert the Hold before it lapses | Required (the owner may waive it, since Holds expire on their own after 72 hours) |
| R3 | **Commission On Hold — collect missing details** | CRM | A Commission or Loyalty Points line is otherwise due but held because something is missing: Aadhaar, bank details, Customer Terms acceptance, the closer's KYC, or RERA | The missing item is recorded and the line becomes Ready | Today the money just sits On Hold and nobody is told to chase the missing document. This is the most common reason a payout is delayed | Our recommendation |
| R4 | **Accounts Verification — Payment Correction** | Accounts (a second person) | Accounts corrects a recorded payment received | A different Accounts user approves or rejects the correction | A change to money received is applied at once today, with no second check. The Buyback side already requires a second person | Required (owner decision) |
| R5 | **Booking Request waiting too long** | CRM | A Booking Request has waited 7 days for Accounts | Accounts decides it | CRM should know a deal is stuck so they can update the customer. Today only the Accounts task turns urgent | Required (alternative: keep only the urgent Accounts task) |
| R6 | **Recovery overdue — escalate to MD** | MD | A Recovery passes its due date with no repayment or set-off | The Recovery is cleared | Today only Accounts follows up. Unpaid recoveries are money owed to the company, so MD should see the overdue ones | Our recommendation |

### Changes we recommend to existing tasks

- **Close "Management Action Required" by itself** when the conflicting Hold or Booking ends. Today it closes only if the deal is cancelled.
- **Remove "Accounts Verification — Commission after Sold By Correction".** Its work is already covered by tasks 16, 17 and 19.
- **Follow-up tasks** (Enquiry, Payment, Payment Given): hide the **Done** button. Staff should use **Record follow-up**, **Confirm Payment Received** or **Confirm Payment Given** instead, so the follow-up is never lost.
- **Clearer titles:**
  - "Accounts Verification — Payment" → "Payment Schedule Revision"
  - "Acquisition approval" → "Accounts Verification — Buyback / Resale"
  - "RERA registration expiring" → "RERA Renewal"
- **Open Review links:** make them open the right page for these tasks, which today open no page or only a list:
  - the joint bank account task
  - Buying Commission tasks
  - deactivated-Member tasks
  - Buyback / Resale tasks
- **Manual tasks:** save the chosen staff member (today it is lost), and make "repeat" actually create the next task.

---

## Already fixed (13 Oct 2026)

- The two Buyback reward reviews and the Sold By commission review could never be closed. They can now be closed with **Done**.
- The Dashboard could hide pending work once it held more than 300 tasks. It now always shows every pending task.
- The Commission Conflict task raised at Booking approval was being lost. It now reaches CRM.
- Payment Given Follow-up now moves to the next instalment's date.
- Tasks on a replaced commission line, on a cleared Recovery and on an updated RERA now close by themselves.
- MD's own actions no longer wait for an approval task.

*A detailed technical version of this review, with code references for the developer, is in `docs/Dashboard_Tasks_Technical_Review.md`.*
