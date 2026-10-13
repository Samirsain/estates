# Dashboard Tasks Review

**Prepared:** 13 Oct 2026
**Scope:** every task that appears in the staff Dashboard work list: what creates it, who gets it, and what closes it. Most attention goes to the tasks the system creates by itself.

> How to read this: the body is written for the business owner. Code file references for the developer are collected in the Appendix at the end.

### Words used in this document

This document uses the **same words as the CRM screens**: the menu names and the button labels staff actually click. Button names are in **bold**, for example **Approve deal**. The "System code" column in the task tables is the short internal name of each task, kept so the developer can find it.

| On screen (used here) | Where you see it |
|---|---|
| **Buyback / Resale** (a "deal") | Menu: Plots & Sales › Buyback / Resale |
| **Approve deal** / **Reject deal** / **Cancel deal** | Buyback / Resale deal page |
| **Confirm Payment Given** / **Correct Payment Given** | Buyback / Resale deal page |
| **Papers back** | Buyback / Resale deal page |
| **Commission** / **Loyalty Points** | Rewards › Commission & Loyalty Points tab; Booking page |
| **Royalty Points**, **Record a points redemption** | Rewards › Royalty Points tab; Member page |
| **Trip** (Rewards tab), **Who travels**, **Trip booked**, **Trip travelled** | Rewards › Rewards tab; Member page Trip section |
| **Reviews** tab: **Clear** / **Restrict**, **Approve** / **Reject** | Rewards › Reviews |
| **Verify Bank Details** / **Reject Bank Details** | Members list |
| **Record follow-up** / **Close Enquiry** | Enquiries |
| **Open Review**, **Action › Done / Revise**, **+ Add Task**, **Show all assignees** | Dashboard |

---

## 1. Summary

| | Count |
|---|---|
| **Automatic task types** (raised by the system by itself) | **33** |
| of which are **decisions** (Approve / Reject on the record's own page, reached through **Open Review**) | 15 |
| of which are **work / follow-up** tasks (**Action › Done / Revise** on the Dashboard) | 18 |
| Automatic task types raised **by a scheduled job** (fully or partly) | 4 (Payment Follow-up, Payment Given Follow-up, RERA expiry, Trip wind-down). 2 more jobs only change existing tasks |
| **Manual task types** | **1** (**+ Add Task** with any title, from the Dashboard, a Member page or a Plot page) |

One task type, "Non-Family Reward Nominee Approval", is used for two things: a Trip traveller (**Who travels**) and a **Royalty Points** redemption (**Record a points redemption**). The count of 33 counts it once.

**Who receives them (automatic types):**

| Role | Number of task types | Notes |
|---|---|---|
| Accounts | 15 | Mostly "Accounts Verification —" decisions, reward reviews and money follow-ups |
| CRM | 12 | Follow-ups, paperwork, Trip fulfilment, Member reminders |
| MD | 6 | Paid Early, Sold By Correction, staff conflict, non-family nominee, old-recovery exception, Management Action Required. An Enquiry Follow-up also goes to MD when MD is the assigned person |

**Grouping:** the types fall into 11 groups: Bookings & booking changes, Payments, Completion/paperwork, Enquiries, Buyback / Resale, Commission & Paid Early, Recovery, Buyback reward reviews, Trip & Royalty Points, Controls, and Members. See section 5.

**Top open problems** (details in section 6):
1. **There is no screen to mark a Buying Commission as paid.** Because of that, the Accounts task for a Ready Buying Commission, which the business rules require, has not been added yet.
2. **Management Action Required does not close by itself** when the conflicting Hold or Booking ends.
3. **Pressing Done on an Enquiry Follow-up** leaves an active Enquiry with no follow-up task.
4. **Some tasks have no page to open:** the joint bank account task, Buying Commission tasks and deactivated-Member tasks.
5. **Hold Follow-up** is required by the business rules but is not raised.

---

## 2. Current setup

- **One senior role: MD.** All old senior accounts were disabled and turned into MD accounts. Their tasks were moved to MD. MD sees every task on the Dashboard.
- **Project settings** (commission and Rewards settings) are created by MD and are active at once. No settings approval task and no economics review task is raised any more.
- **MD's own actions apply at once, with no approval task.** This covers four actions:
  - MD's own **Sold By Correction**
  - MD's own non-family **Royalty Points** redemption
  - MD's own non-family Trip traveller
  - MD's own **Person Merge**

  When anyone else does any of these, it still goes to MD as an approval task.

---

## 3. Already fixed

- **Reward reviews no longer get stuck.** "Reward Review — Approved Buyback", "Reward Review — Buyback Unwind" and "Accounts Verification — Commission after Sold By Correction" are now normal work tasks, so Accounts closes them with **Action › Done**.
- **The Dashboard shows all pending work.** It loads every pending task plus the 100 most recently completed ones. The old limit of 300 tasks is gone.
- **The Commission Conflict task at Booking approval is now saved.** When Accounts tries to **Approve** a Booking Request that has a conflict, the approval is refused and CRM now does get the "Commission Conflict — correct the source details" task.
- **Payment Given Follow-up keeps up.** After each **Confirm Payment Given**, the task moves to the next instalment's due date.
- **Replaced commission lines no longer leave tasks behind.** When a correction replaces a Commission line, its "Accounts Verification — Commission" and "Paid Early Approval — MD" tasks close by themselves. An "Accounts Adjustment Required" task, if one is needed, stays open.
- **Clearing a Recovery closes its circumvention reviews.** When a Recovery is repaid or set off, any Recovery Circumvention Review still waiting on it is marked Cleared and its task closes.
- **Update RERA closes the RERA reminder.** If the new expiry date is still within 7 days, the next reminder run raises it again.
- **The live database was tidied to match.** The one stuck Buyback reward review was switched so **Done** closes it, and any leftover settings-approval or economics-review tasks were closed.

---

## 4. How the task system works

### 4.1 What a task is

A task is one line of work on the Dashboard. It is always attached to one business record (a Booking, an Enquiry, a Commission line, a Member, and so on) and has one **purpose**, such as "Accounts Verification — Booking". It is assigned to a **role** (MD, Accounts, CRM, MIS, PC). It can also be assigned to a named staff member. It has a **due date and time**.

A task has only two states: **Pending** or **Completed**. A task is never deleted. Completing it, revising it or moving it is written into the task's history.

### 4.2 What each task stores

| Field | Meaning |
|---|---|
| Task number | TSK-number shown to staff |
| Record | Which Booking, Enquiry, deal, Member, etc. the task is about, plus a one-line label |
| Purpose | The kind of obligation. Used to stop duplicates |
| Title | Text shown on the row |
| Role / named person | Which queue the task sits in, and optionally who exactly |
| Due, Urgent | When it is due. Urgent shows yellow |
| Status | Pending or Completed |
| Decision | Yes = approve/reject happens on the record's own page, not on the Dashboard row |
| Latest result | The "what happened / waiting for" line |
| Revised count, Recurrence, Origin | Times revised. Recurrence (manual tasks only). System or manual |
| Needs reassignment | Set when the assigned staff account is disabled in an emergency |

### 4.3 Who sees which tasks

- **MD** sees every task. On first load, the **Show all assignees** box is ticked.
- **Everyone else** sees tasks for their role plus tasks assigned to them by name. The screen then also hides any task whose role differs from the viewer's role, so a task assigned to a person by name under another role does not show (see 6.7).
- **MIS** sees the list read-only. MIS may use **+ Add Task** but cannot mark a task Done.
- **PC** may mark tasks Done but may not create them.
- The reward summary cards above the list are shown to MD, Accounts and CRM.

### 4.4 Views, due dates and overdue

- Views: Today, Overdue, Upcoming, Completed, All, Date range. All dates are India time.
- **Overdue** = pending and past its due time. It shows red, and red wins over urgent yellow.
- Sort order: overdue first, then urgent, then earliest due.
- Most automatic tasks are due "now" (the moment they are raised). The exceptions are listed in the catalogue (section 5).

### 4.5 Decision tasks vs work tasks

- **Decision tasks** show one button, **Open Review**. It opens the record's page, where Approve/Reject is done. The Dashboard offers no Done or Revise for them. They close only when the matching approve/reject button is used. If the record has no page, the button is greyed out.
- **Work tasks** show an **Action** menu with **Done** and **Revise**. Done completes the task. Revise keeps it pending with a new date and a remark.

### 4.6 How duplicates are avoided

- A record can hold only **one pending task per purpose**. If the system tries to raise the same task again, it finds the existing pending one and does not create a second. The database enforces the same rule.
- One record may still carry several pending tasks with **different** purposes, for example a Payment Follow-up and an Accounts Verification on the same Booking.

### 4.7 How tasks close automatically

- When a business action finishes the work, the system completes the matching task and writes the reason as the result. For example, **Approve** on a Booking Request completes "Accounts Verification — Booking".
- A few actions close **every** task on a record at once:
  - **Approve deal** on a Buyback closes every pending task on the Booking being taken back.
  - **Cancel deal** on a Buyback / Resale closes every task on that deal.
  - **Trip travelled** closes every task on that Trip.

### 4.8 Manual tasks

- **+ Add Task** is on the Dashboard. An **Add Task** button is also on the Member page and the Plot page; those link the task to that Member or Plot.
- Fields: title, assignee name, assignee role, due date/time, recurrence (None/Daily/Weekly/Monthly), urgent, optional linked record, remark.
- One record cannot hold two pending manual tasks with the same title. MD, Accounts, CRM and MIS may create manual tasks.

---

## 5. Catalogue of every automatic task

Legend: **Type** = Decision (closed by Approve/Reject on the record's page) or Work (closed by the system or by **Action › Done**). **Due** "now" = due at the moment it is raised.

### 5.1 Bookings & booking changes

| # | Title shown | Created when | Who | Type | Due | Closed when | System code |
|---|---|---|---|---|---|---|---|
| 1 | Accounts Verification — Booking | CRM sends a Booking Request (**Start Booking Request**), or sends it again after **Revise request** | Accounts | Decision | 7 days after sending | **Revise request** replaces it with a new one; **Reject**; **Approve**; **Cancel Booking** before approval. After 7 days a job marks it urgent | `BOOKING_REVIEW` |
| 2 | Accounts Verification — Refund | **Cancel Booking** on an approved Booking (status Refund Pending) | Accounts | Decision | now | **Reject cancellation**; **Approve cancellation** | `REFUND_REVIEW` |
| 3 | Accounts Verification — Change Plot | **Change Plot** submitted | Accounts | Decision | now | **Reject Change Plot**; **Approve Change Plot** | `CHANGE_PLOT_REVIEW` |
| 4 | Accounts Verification — Primary Customer Change | **Change Primary Customer** submitted | Accounts | Decision | now | **Approve / Reject Primary Customer change** | `PRIMARY_CUSTOMER_CHANGE_REVIEW` |
| 5 | Sold By Correction — MD approval | **Sold By Correction** submitted by anyone other than MD (the Booking shows "Sold By Correction — Waiting Approval"). MD's own correction applies at once | MD | Decision | now | **Approve / Reject Sold By Correction** | `SOLD_BY_CORRECTION_REVIEW` |
| 6 | Accounts Verification — Commission after Sold By Correction | A Sold By Correction is applied | Accounts | Work | now | **Action › Done** after checking the commission impact | `SOLD_BY_COMMISSION_IMPACT` |

### 5.2 Payments

| # | Title shown | Created when | Who | Type | Due | Closed when | System code |
|---|---|---|---|---|---|---|---|
| 7 | Payment Follow-up | Booking **Approve**, **Confirm Payment Received**, **Correct Payment Entry**, **Approve schedule revision**, **Approve Change Plot**, **Reject cancellation**, and a daily job | CRM | Work | Due date of the next unpaid instalment. It moves as instalments are paid. A job marks it urgent once overdue | Payment Received reaches 100%; **Cancel Booking** after approval pauses it; **Approve cancellation** | `PAYMENT_FOLLOW_UP` |
| 8 | Accounts Verification — Payment | CRM clicks **Revise Remaining Payment Schedule** | Accounts | Decision | now | **Approve / Reject schedule revision** | `PAYMENT_SCHEDULE_REVIEW` |

### 5.3 Completion / paperwork

| # | Title shown | Created when | Who | Type | Due | Closed when | System code |
|---|---|---|---|---|---|---|---|
| 9 | Complete Final Buyer Details | Payment Received reaches 100%, or **Reopen a Delivered Booking** | CRM | Work | now | **Final buyer details** saved; **Record Allotment / Registry**; a correction takes payment back below 100% | `FINAL_BUYER_DETAILS` |
| 10 | Prepare Allotment / Registry | Same as above | CRM | Work | now | **Record Allotment / Registry**; payment back below 100% | `ALLOTMENT_REGISTRY` |

### 5.4 Enquiries

| # | Title shown | Created when | Who | Type | Due | Closed when | System code |
|---|---|---|---|---|---|---|---|
| 11 | Enquiry Follow-up | Staff add an Enquiry on the Enquiries screen, or a Member adds one in the Member Portal | CRM, or MD when MD is the assigned person | Work | Staff: the chosen next follow-up time. Portal: one day later | **Record follow-up** moves it to the next date; **Close Enquiry**; Booking **Approve** | `ENQUIRY_FOLLOW_UP` |

### 5.5 Buyback / Resale

| # | Title shown | Created when | Who | Type | Due | Closed when | System code |
|---|---|---|---|---|---|---|---|
| 12 | Acquisition approval | **New Buyback** or a new Resale deal is created | Accounts | Decision | now (the text says it waits for 20% Payment Given) | **Reject deal**; **Approve deal**; **Cancel deal** | `ACQUISITION_REVIEW` |
| 13 | Payment Given Follow-up | **Confirm Payment Given** / **Correct Payment Given**, and a daily job (within 7 days of the next due date) | Accounts | Work | The next unpaid instalment's due date, moving forward after each payment | Payment Given reaches 100%; **Cancel deal** | `PAYMENT_GIVEN_FOLLOW_UP` |
| 14 | Management Action Required | **Correct Payment Given** while a new Hold or Booking is active on that Plot | MD (urgent) | Work | now | Only **Cancel deal**; otherwise **Action › Done** | `MANAGEMENT_ACTION_REQUIRED` |
| 15 | Collect Allotment Papers Back / Complete Registry Back | **Approve deal** on a Buyback whose Booking already had Allotment or Registry | CRM | Work | now | **Papers back**; **Cancel deal** | `BUYBACK_PAPERS` |

### 5.6 Commission, Paid Early, Recovery

All of these are acted on from the Booking page (Commission section).

| # | Title shown | Created when | Who | Type | Due | Closed when | System code |
|---|---|---|---|---|---|---|---|
| 16 | Accounts Verification — Commission | A Commission or Loyalty Points line becomes Ready and is unpaid | Accounts | Decision | now | **Mark Commission Paid** / **Mark Commission Paid Early**; the Customer-closing limit was already used; Booking cancelled or bought back; **Set off against Recovery**; a correction replaces the line | `COMMISSION_PAYMENT` |
| 17 | Commission Conflict — correct the source details | The system finds an invalid Sold By / beneficiary combination, including when Accounts tries to **Approve** such a Booking Request | CRM (urgent) | Work | now | The source details are corrected and commission recalculates cleanly | `COMMISSION_CONFLICT` |
| 18 | Paid Early Approval — MD | Accounts clicks **Request Paid Early** | MD | Decision | now | **Reject Paid Early**; **Approve Paid Early**; a correction replaces the line | `PAID_EARLY_APPROVAL` |
| 19 | Accounts Adjustment Required | A line that was already paid becomes invalid (cancellation, correction, **Approve Change Plot**, Buying Commission stepped back, etc.) | Accounts | Decision | now | **Open Recovery**; **Close adjustment without Recovery** | `ACCOUNTS_ADJUSTMENT` |
| 20 | Recovery Outstanding Follow-up | **Open Recovery** | Accounts | Work | Notice date + 15 days | **Recovery repaid** / **Set off against Recovery** | `RECOVERY_FOLLOW_UP` |
| 21 | Correct Beneficiary Before Old Recovery — MD Approval | The corrected beneficiary reaches the milestone while the old beneficiary's paid line is not yet recovered | MD | Decision | now | The old Recovery is resolved; **Pay before the old Recovery** | `BENEFICIARY_BEFORE_RECOVERY` |
| 22 | Reward Review — Approved Buyback | **Approve deal** on any Buyback | Accounts | Work | now | **Action › Done** after the review; also closed if that Buyback later gets **Cancel deal** | `BUYBACK_COMMISSION_REVIEW` |
| 23 | Reward Review — Buyback Unwind | **Cancel deal** on an already approved Buyback | Accounts | Work | now | **Action › Done** after the review | `BUYBACK_UNWIND_REVIEW` |
| 24 | Customer-Closing Limit Reached — Membership Required for Future Selling | A Customer earns their third Customer-closing Loyalty Points event | CRM | Work | now | **Activate Member** for that Person (Members screen) | `CUSTOMER_CLOSING_LIMIT` |

### 5.7 Controls

| # | Title shown | Created when | Who | Type | Due | Closed when | System code |
|---|---|---|---|---|---|---|---|
| 25 | Staff / Relative Benefit Conflict Review | A Commission, Loyalty Points, Trip or Royalty Points benefit would go to staff or a declared relative of staff | MD | Decision | now | **Approve / Reject** on Rewards › **Reviews**; the relative declaration is ended | `STAFF_CONFLICT_REVIEW` |
| 26 | Recovery Circumvention Review | The benefit receiver shares a bank account, mobile or address with someone owing a Recovery | Accounts (MD can also decide) | Decision | now | **Clear / Restrict** on Rewards › **Reviews**; the Recovery is repaid or set off (the review is then marked Cleared) | `RECOVERY_CIRCUMVENTION_REVIEW` |
| 27 | Joint Bank Account Exception — Approval | Bank details are entered for an account already verified for someone else, with proof that it is a joint account | Accounts | Decision | now | **Verify Bank Details** / **Reject Bank Details** (Members list) | `BANK_VERIFICATION` |

### 5.8 Trip and Royalty Points

Both are acted on in the Member page's Trip and Royalty Points sections. The Rewards menu has matching **Rewards** (Trip) and **Royalty Points** tabs.

| # | Title shown | Created when | Who | Type | Due | Closed when | System code |
|---|---|---|---|---|---|---|---|
| 28 | Trip Reward Fulfilment | A Trip becomes **Earned** with nothing holding it | CRM | Work | now | **Trip travelled** | `TRIP_REWARD_FULFILMENT` |
| 29 | Trip Reward Deficiency Review | A credit used by an Earned or Booked Trip is no longer valid (the Trip shows **Deficient**) | CRM | Work | now | Another credit fills the gap; **Trip travelled** | `TRIP_REWARD_DEFICIENCY` |
| 30 | Trip Credit Expiry / Bucket Wind-Down Review | Job: the Project's Trip programme has closed and the Member's Trip progress is still open | CRM | Work | The programme's final wind-down date | It expires at that date | `TRIP_BUCKET_WIND_DOWN` |
| 31 | Non-Family Reward Nominee Approval | Anyone other than MD (a) uses **Who travels** for someone outside immediate family, or (b) uses **Record a points redemption** for a non-family recipient (shows "Waiting for MD"). MD's own entry applies at once | MD | Decision | now | (a) **Approve / Reject the nominee**, traveller changed to family, or **Trip travelled**; (b) **Approve / Reject the non-family recipient** | `REWARD_NOMINEE_APPROVAL` |

### 5.9 Members

| # | Title shown | Created when | Who | Type | Due | Closed when | System code |
|---|---|---|---|---|---|---|---|
| 32 | Review Hold Requests of a deactivated Member | **Deactivate Member** while that Member has Hold Requests waiting | CRM (urgent) | Work | now | **Reactivate Member**; otherwise **Action › Done** | `DEACTIVATED_MEMBER_REQUEST_REVIEW` |
| 33 | RERA registration expiring | Job: the Member's RERA expires within 7 days | CRM (urgent) | Work | The RERA expiry date | **Update RERA** (if the new expiry is still within 7 days, the next reminder raises it again); **Action › Done** | `RERA_EXPIRY` |

### 5.10 Scheduled jobs and tasks

| Job | Effect on tasks |
|---|---|
| Payment Received reminder | Raises or moves the Payment Follow-up for every booked Booking |
| Payment Given reminder | Raises the Payment Given Follow-up when the next instalment is due within 7 days |
| RERA expiry reminder | Raises "RERA registration expiring" |
| Trip wind-down | Raises or closes the Trip wind-down review |
| Instalment overdue | Marks an overdue Payment Follow-up as urgent. Raises nothing |
| Booking decision alert | Marks a 7-day-old "Accounts Verification — Booking" as urgent and adds a revision line. Raises nothing |
| Hold expiry, Hold Request expiry, settings activation, Trip credit expiry | No task effect. This is intended: automatic status changes do not need a person |

---

## 6. Open problems

Severity: **High** = wrong or stuck work that staff will notice; **Medium** = confusing or incomplete; **Low** = tidy-up.

### 6.1 Tasks that stay open after the work is done

| Sev | Task | What happens |
|---|---|---|
| Medium | Management Action Required | Closes only on **Cancel deal**. It is not closed when the conflicting Hold or Booking ends |
| Low | Accounts Verification — Commission when a line goes back On Hold | A line that was Ready and then goes On Hold (for example, a Recovery is opened against the person) keeps its payment task |
| Low | Complete Final Buyer Details after a reopen | **Reopen a Delivered Booking** raises it again even when **Final buyer details** were already saved |

### 6.2 Timing and rolling-task issues

| Sev | Issue |
|---|---|
| Medium | Payment Follow-ups are raised the moment a Booking is approved or **Confirm Payment Received** is used. The business rules say "seven days before the next due date". The Payment Given job does use the 7-day window, so the two sides behave differently |
| Medium | Urgent flag is never cleared. Once the overdue job marks a Payment Follow-up urgent, it stays yellow after it rolls to the next instalment |
| Medium | **Done on a rolling task breaks the rule "each active Enquiry has one follow-up".** If CRM uses **Action › Done** on an Enquiry Follow-up, the Enquiry stays Active with no task. **Record follow-up** only moves an existing task, so nothing raises a new one. On a Payment Follow-up, **Done** is undone by the next job run |
| Low | The booking decision alert adds 1 to the "Revised ×" count without a real revision |

Two pending copies of the same task on the same record are not possible. The database prevents it.

### 6.3 Tasks with no page to open

| Sev | Task | Problem |
|---|---|---|
| High | Buying Commission payment | **There is no screen to mark a Buying Commission as paid.** **Mark Commission Paid** exists only on a Booking page, and a Buying Commission belongs to a Buyback / Resale deal, which has no Booking. For this reason the Accounts task for a Ready Buying Commission was deliberately not added yet: nothing could close it |
| Medium | Joint Bank Account Exception — Approval | **Open Review** is greyed out. **Verify Bank Details** is on the Members list, and a Person page exists that it could open |
| Medium | Commission tasks on a **Buying Commission** line (on a Buyback / Resale deal, no Booking) | **Open Review** needs a Booking, so it is greyed out (for example on a Paid Early request for a Buying Commission) |
| Low | Review Hold Requests of a deactivated Member | No link (it is a work task, so **Done** still works) |
| Low | Acquisition approval and other Buyback / Resale tasks | **Open Review** goes to the Buyback / Resale list, not the deal itself, although a deal page exists |
| Low | Manual tasks linked by a typed reference (for example "CUS-3390") | No link, and the Project/Plot/Name columns stay empty |

### 6.4 Tasks the business rules require that the system does not raise

| Sev | Required task | Current behaviour |
|---|---|---|
| High | **Accounts Verification — Buying Commission** | Not raised yet, on purpose (see 6.3: there is no button to pay it). After **Record Buying Commission** and 100% **Confirm Payment Given**, the line turns Ready. Accounts must find these on Rewards › Commission & Loyalty Points |
| Medium | **Hold Follow-up** (CRM, until the Hold is booked or cancelled; **Revise** = extend) | Not raised. The system already closes Hold tasks when a Hold ends, but nothing creates one |
| Medium | **Booking Decision Follow-up** for CRM after 7 days ("keep with new date / cancel") | Not raised. The job marks the Accounts task urgent instead |
| Medium | **Accounts Verification — Payment Correction** (a second person checks) | Not raised. **Correct Payment Entry** by Accounts applies at once. The Payment Given side does require a different person to check |
| Low | Accounts Verification — Bank Details for every new bank account | Bank details are verified when entered. Only the joint-account exception raises a task. Probably an accepted change; to confirm |
| Low | Accounts Verification — External Reference | Not raised |
| Low | Manual tasks: recurrence options Every 15 Days / Quarterly / Half-yearly / Yearly, and a named assignee | Only None/Daily/Weekly/Monthly are offered. **Recurrence is saved but nothing ever creates the next task.** The assignee name is collected and then not saved, so manual tasks always show "Unassigned" |

### 6.5 Tasks worth questioning

- **Accounts Verification — Commission after Sold By Correction:** the commission system already raises "Accounts Verification — Commission", "Commission Conflict" and "Accounts Adjustment Required" for every real piece of follow-on work. This task adds a second look on top of those.
- **Review Hold Requests of a deactivated Member:** Hold Requests also expire on their own, and the task does not close when they do.

### 6.6 Confusing titles

| Current title | Problem | Suggested |
|---|---|---|
| Accounts Verification — Payment | It is a **schedule revision**, not a payment | Accounts Verification — Payment Schedule Revision |
| Acquisition approval | "Acquisition" is not a word the screens use; the menu says **Buyback / Resale**. It is also out of step with the other Accounts titles | Accounts Verification — Buyback / Resale |
| Commission Conflict — correct the source details | It now covers Loyalty Points too, not only Commission | Benefit Attribution Conflict — Correct Source Details |
| RERA registration expiring | The business rules call it RERA Renewal | RERA Renewal |
| Accounts Verification — Commission after Sold By Correction | See 6.5 | Remove |
| Non-Family Reward Nominee Approval (two meanings) | Same title for a Trip traveller and a Royalty Points recipient | Keep the title; the row's reference column already differs (Trip code vs "N points") |

### 6.7 The Dashboard list itself

| Sev | Issue |
|---|---|
| Medium | A staff member (other than MD) does not see a task assigned to them by name under another role. The list filters by role only |
| Low | **+ Add Task** is shown to PC, who is not allowed to create tasks, so saving fails |
| Low | The Dashboard hides **Done** on decision rows, but the system itself does not refuse a Done on a decision task |

---

## 7. Recommendations

Each item says whether it is **required by the business rules** or **my suggestion**.

### 7.1 Fix first

1. **Build Mark Commission Paid on the Buyback / Resale deal page, then raise the Buying Commission task.** Once Accounts can pay a Buying Commission from the deal page, raise "Accounts Verification — Buying Commission" when the line turns Ready, with **Open Review** going to that deal. *The task is required by the business rules; the order is my suggestion.*
2. **Close Management Action Required automatically** when the conflicting Hold or Booking ends. *Suggestion.*

### 7.2 Add

| Task | Why | Basis |
|---|---|---|
| **Accounts Verification — Buying Commission** | Accounts has no task when a Buying Commission becomes Ready. Add it only after the deal-page **Mark Commission Paid** exists (see 7.1) | Required by the business rules |
| **Hold Follow-up** (CRM) | Cheap to add, because the system already closes Hold tasks when a Hold ends | Required by the business rules; the owner may waive it, since Holds expire on their own after 72 hours |
| Payment Correction check task | Only if the owner wants a second person to check **Correct Payment Entry** | Required by the business rules; owner decision |

### 7.3 Change

- Hide **Action › Done** on the system's rolling tasks (Enquiry Follow-up, Payment Follow-up, Payment Given Follow-up). Staff should use **Record follow-up**, **Confirm Payment Received** or **Confirm Payment Given** instead, so the "one active task" rule holds. *Suggestion.*
- Clear the urgent flag when a rolling task moves to its next instalment. *Suggestion.*
- Make **Open Review** reach the right page: joint bank task → the Person page, deactivated-Member task → the Member page, Buyback / Resale tasks and Buying Commission tasks → the deal page. *Suggestion.*
- Rename the titles listed in 6.6. *Suggestion.*
- Consider removing "Accounts Verification — Commission after Sold By Correction" (see 6.5). *Suggestion.*
- Manual tasks: save the chosen assignee. Either build recurrence (create the next task when one is completed) or remove the field. Hide **+ Add Task** for PC. *The named assignee and recurrence are required by the business rules.*
- Booking decision after 7 days: keep the single Accounts task turning red/urgent rather than adding a second CRM task. *Suggestion; this differs from the business rules, so the owner should confirm.*

### 7.4 Proposed final task list

**Status key:** Keep = no change · Keep* = keep with the change listed · Add = new · Remove = drop · Removed = already gone.

| # | Title (proposed) | Who | Type | Status | Basis |
|---|---|---|---|---|---|
| 1 | Accounts Verification — Booking | Accounts | Decision | Keep | Business rules |
| 2 | Accounts Verification — Refund | Accounts | Decision | Keep | Business rules |
| 3 | Accounts Verification — Change Plot | Accounts | Decision | Keep | Business rules |
| 4 | Accounts Verification — Primary Customer Change | Accounts | Decision | Keep | Business rules |
| 5 | Sold By Correction — MD Approval | MD | Decision | Keep (MD's own correction already applies at once) | Business rules |
| 6 | Accounts Verification — Commission after Sold By Correction | Accounts | Work | **Remove** (covered by tasks 16, 17 and 19) | Suggestion |
| 7 | Payment Follow-up | CRM | Work | Keep*: hide **Done**, reset urgent | Business rules |
| 8 | Accounts Verification — Payment Schedule Revision | Accounts | Decision | Keep* (rename) | Business rules |
| 9 | Complete Final Buyer Details | CRM | Work | Keep | Business rules |
| 10 | Prepare Allotment / Registry | CRM | Work | Keep | Business rules |
| 11 | Enquiry Follow-up | CRM (or MD if assigned) | Work | Keep*: hide **Done** | Business rules |
| 12 | Accounts Verification — Buyback / Resale | Accounts | Decision | Keep* (rename, open the deal page) | Business rules |
| 13 | Payment Given Follow-up | Accounts | Work | Keep | Business rules |
| 14 | Management Action Required | MD | Work | Keep* (close when the conflicting Hold/Booking ends) | Business rules |
| 15 | Collect Allotment Papers Back / Complete Registry Back | CRM | Work | Keep | Business rules |
| 16 | Accounts Verification — Commission | Accounts | Decision | Keep* (close when the line goes On Hold) | Business rules |
| 17 | Benefit Attribution Conflict — Correct Source Details | CRM | Work | Keep* (rename) | Business rules |
| 18 | Paid Early Approval — MD | MD | Decision | Keep | Business rules |
| 19 | Accounts Adjustment Required | Accounts | Decision | Keep | Business rules |
| 20 | Recovery Outstanding Follow-up | Accounts | Work | Keep | Business rules |
| 21 | Correct Beneficiary Before Old Recovery — MD Approval | MD | Decision | Keep | Business rules |
| 22 | Reward Review — Approved Buyback | Accounts | Work | Keep | Business rules |
| 23 | Reward Review — Buyback Unwind | Accounts | Work | Keep | Business rules |
| 24 | Accounts Verification — Buying Commission | Accounts | Decision | **Add**, after **Mark Commission Paid** exists on the deal page | Business rules |
| 25 | Customer-Closing Limit Reached — Membership Required for Future Selling | CRM | Work | Keep | Business rules |
| 26 | Staff / Relative Benefit Conflict Review | MD | Decision | Keep | Business rules |
| 27 | Recovery Circumvention Review | Accounts (MD can also decide) | Decision | Keep | Business rules |
| 28 | Accounts Verification — Joint Bank Account | Accounts | Decision | Keep* (Open Review → Person page, rename) | Business rules |
| 29 | Trip Reward Fulfilment | CRM | Work | Keep | Business rules |
| 30 | Trip Reward Deficiency Review | CRM | Work | Keep | Business rules |
| 31 | Trip Credit Expiry / Bucket Wind-Down Review | CRM | Work | Keep | Business rules |
| 32 | Non-Family Reward Nominee Approval | MD | Decision | Keep (MD's own entry already applies at once) | Business rules |
| 33 | Review Hold Requests of a Deactivated Member | CRM | Work | Keep* (close when no Hold Requests are waiting) | Business rules |
| 34 | RERA Renewal | CRM | Work | Keep* (rename) | Business rules |
| 35 | Hold Follow-up | CRM | Work | **Add** (or the owner waives it) | Business rules |
| — | Project Settings Approval / Project Economics Review | — | — | **Removed** (MD creates settings and they are active at once) | Owner decision |
| — | Manual task (any title) | any | Work | Keep* (save the assignee; build or remove recurrence) | Business rules |

**Result:** 33 automatic task types today. The proposal removes 1 and adds 2 (Buying Commission and Hold Follow-up), giving **34 task types**. The final role split is MD 6, Accounts 15, CRM 13. The Buying Commission task can reuse the existing Commission task underneath, so the developer adds only one new kind (Hold Follow-up).

---

## Appendix: code file references (for the developer)

All paths are under `C:\Users\Sai\Desktop\3pre\`. Line numbers are as of 13 Oct 2026.

**Task core**
- `src/lib/services/task-service.ts`: `ensureTask` 31, `completeTask` 67, `reviseTask` 83, `closeTasksFor` 118, `taskSubjects` 152
- `src/lib/tasks.ts`: views/emphasis/sort 271-311, `recordHref` (Open Review links) 342-378
- `src/lib/jobs.ts`: Hold expiry 45, Hold Request expiry 75, Payment Received reminder 94, Payment Given reminder 118 (task at 137), Instalment overdue 162, Booking decision alert 181, RERA reminder 210 (task at 222), settings activation 248, Trip credit expiry 260, Trip wind-down 272, job list 293
- `prisma/schema.prisma`: `StaffRole` 21, `Task` 936, `TaskEvent` 972
- `prisma/constraints.sql`: 43 (one pending task per record + purpose)

**Dashboard**
- `src/app/dashboard/page.tsx`: pending + 100 recent completed, 28-29
- `src/app/dashboard/dashboard-client.tsx`: MIS read-only 118, role filter 124, Add Task 166, Open Review 423, Done 446, Add Task dialog 618
- `src/app/dashboard/actions.ts`: Done 17, Revise 44, Add Task 76 (task at 119)
- `src/app/members/[id]/add-task-button.tsx` (Add Task on Member and Plot pages)
- `src/app/dashboard/reward-cards.tsx`, `src/lib/rewards-overview.ts` (reward cards)
- `src/lib/security/permissions.ts`: task permissions per role 82-128

**Where each task is raised (R) and closed (C)**

| # | Task | File: lines |
|---|---|---|
| 1 | `BOOKING_REVIEW` | `booking-service.ts` R 192; C 556, 676, 766, 917; escalation `jobs.ts:181-207` |
| 2 | `REFUND_REVIEW` | `booking-service.ts` R 991; `cancellation-service.ts` C 111, 242 |
| 3 | `CHANGE_PLOT_REVIEW` | `change-plot-service.ts` R 146; C 284, 450 |
| 4 | `PRIMARY_CUSTOMER_CHANGE_REVIEW` | `booking-service.ts` R 1172; C 1285 |
| 5 | `SOLD_BY_CORRECTION_REVIEW` | `booking-service.ts` R 1391; C 1475 |
| 6 | `SOLD_BY_COMMISSION_IMPACT` | `booking-service.ts` R 1537 (work task) |
| 7 | `PAYMENT_FOLLOW_UP` | `payment-service.ts` R 161 (date roll 150-158); C 125; `booking-service.ts` C 979; `cancellation-service.ts` C 250; urgent `jobs.ts:162-178` |
| 8 | `PAYMENT_SCHEDULE_REVIEW` | `payment-service.ts` R 616; C 695 |
| 9-10 | `FINAL_BUYER_DETAILS`, `ALLOTMENT_REGISTRY` | `completion-service.ts` R 52, 61; C 74-75, 240 |
| 11 | `ENQUIRY_FOLLOW_UP` | `enquiry-service.ts` R 170, revise 228-238, C 276-280; `src/app/portal/actions.ts` R 85; `booking-service.ts` C 756 |
| 12 | `ACQUISITION_REVIEW` | `acquisition-service.ts` R 311; C 729, 934, 1226 |
| 13 | `PAYMENT_GIVEN_FOLLOW_UP` | `acquisition-service.ts` R 658, C 630; `jobs.ts` R 137 |
| 14 | `MANAGEMENT_ACTION_REQUIRED` | `acquisition-service.ts` R 576; C 1226 |
| 15 | `BUYBACK_PAPERS` | `acquisition-service.ts` R 903; C 1141, 1226 |
| — | Buyback approval closes all Booking tasks | `acquisition-service.ts` 864 |
| 16 | `COMMISSION_PAYMENT` | `commission-service.ts` R 720; C 492 (`supersedeRecord` 464), 585, 1092, 1300; `recovery-service.ts` C 406 |
| 17 | `COMMISSION_CONFLICT` | `commission-service.ts` R 300 (callers 393, `booking-service.ts:624`); C 429 |
| 18 | `PAID_EARLY_APPROVAL` | `commission-service.ts` R 851; C 493, 911, 992 |
| 19 | `ACCOUNTS_ADJUSTMENT` | `commission-service.ts` R 145; `recovery-service.ts` C 96, 155 |
| 20 | `RECOVERY_FOLLOW_UP` | `recovery-service.ts` R 97; C 204 (`clear` 176) |
| 21 | `BENEFICIARY_BEFORE_RECOVERY` | `commission-service.ts` R 700, C 714; `recovery-service.ts` C 279 |
| 22 | `BUYBACK_COMMISSION_REVIEW` | `commission-service.ts` R 1309 (work task); `acquisition-service.ts` C 1059 |
| 23 | `BUYBACK_UNWIND_REVIEW` | `commission-service.ts` R 1161 (work task) |
| 24 | `CUSTOMER_CLOSING_LIMIT` | `commission-service.ts` R 229; `network-service.ts` C 306 |
| 25 | `STAFF_CONFLICT_REVIEW` | `benefit-control-service.ts` R 71, C 60; `control-review-service.ts` C 107 |
| 26 | `RECOVERY_CIRCUMVENTION_REVIEW` | `benefit-control-service.ts` R 133; `control-review-service.ts` C 141; `recovery-service.ts` C 219-223 (Recovery cleared) |
| 27 | `BANK_VERIFICATION` | `bank-service.ts` R 121; C 247 |
| 28 | `TRIP_REWARD_FULFILMENT` | `trip-service.ts` R 421; C 596 |
| 29 | `TRIP_REWARD_DEFICIENCY` | `trip-service.ts` R 364; C 323, 596 |
| 30 | `TRIP_BUCKET_WIND_DOWN` | `trip-service.ts` R 717; C 713 |
| 31 | `REWARD_NOMINEE_APPROVAL` | `trip-service.ts` R 503, C 515, 539, 596; `royalty-service.ts` R 570, C 628 |
| 32 | `DEACTIVATED_MEMBER_REQUEST_REVIEW` | `network-service.ts` R 418; C 431 |
| 33 | `RERA_EXPIRY` | `jobs.ts` R 222; `network-service.ts` C 520 (`updateMemberRera` 479) |
| — | Buying Commission turns Ready (no task) | `commission-service.ts` 763 (`refreshBuyingCommission`) |
| — | Live database task fixes (stuck Buyback review, leftover settings tasks) | `prisma/migrations/20261013200000_task_fixes` |
| — | Hold tasks closed (none raised) | `hold-service.ts` 222 |

All service files are in `src/lib/services/`.
