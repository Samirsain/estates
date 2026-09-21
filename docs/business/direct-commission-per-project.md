# Direct Commission — Moving from One Fixed Rate to a Rate Set Per Project

**Date:** 21 September 2026
**Status:** Build deferred for twelve months by management decision. The
proposal below stands and is not withdrawn — see Section 14 for the decision,
what it costs, and the three things that still need doing this year.
**Audience:** MD, Admin, Accounts

---

> **Read Section 14 first.** Management has decided to hold this change for
> twelve months, while membership is free, and revisit it at the membership
> upgrade. Sections 1 to 13 explain what the change is and remain the basis for
> that later decision.

---

## 1. What this document is for

Today the company pays one single rate of direct commission — 3% — on every
sale, on every project, without exception. The proposal is to make that rate a
setting that belongs to each project, and to allow it to be changed as many
times as the business needs over the life of that project.

This document explains what that means in business terms, what it will change,
what it will not change, and the small number of decisions management has to
make before the work can start. There is nothing technical in it.

The most important thing in this document is **Section 5**. There is an
existing company rule that makes the proposal impossible to deliver as stated
until management answers one question. Everything else is straightforward.

---

## 2. How direct commission works today

Direct commission is the money paid to the member who closes a sale. It is
fixed at 3% of the sale value everywhere in the business.

It is paid in two situations:

- **A member sells to a buyer.** The member earns 3%. It becomes payable once
  the buyer has paid 25% of the sale value and that payment is verified.
- **A member buys a plot for themselves.** The member earns 3% on their own
  purchase. It becomes payable once 100% of the payment is received.

The 3% is built into the system as a fixed number. Nobody in the business —
not MD, not Admin — can change it from any screen. Changing it today requires
a developer to change it for the whole company at once.

Direct commission is separate from, and paid in addition to, the other
commissions the business runs: invite commission, royalty, and loyalty bonus.
Those are not part of this proposal.

---

## 3. What we want to change

Three things.

**First — the rate belongs to the project.** Each project carries its own
direct commission rate. A premium project with a healthy margin can pay a
different rate from a project the company is trying to move quickly.

**Second — the rate can be changed more than once.** A project is not stuck
with whatever rate it was given at launch. Management can revise it whenever
the commercial situation changes, as often as needed.

**Third — every change is kept on record.** A rate change never erases the old
rate. The old rate stays visible as history, with the date it was in force,
who changed it, and a written reason. At any time the business can look at a
project and see its full rate history from launch to today.

---

## 4. What this looks like in money

A sale of **₹50,00,000**, closed by a member who was themselves invited into
the club at a position that earns the top 1% invite band.

| Project rate | To the selling member | To the inviting member | Total paid out |
| --- | --- | --- | --- |
| 2% | ₹1,00,000 | ₹50,000 | ₹1,50,000 (3%) |
| 3% (today) | ₹1,50,000 | ₹50,000 | ₹2,00,000 (4%) |
| 4% | ₹2,00,000 | ₹50,000 | ₹2,50,000 (4.5%) |

The first two rows are fine. **The third row is the problem**, and it is the
subject of the next section.

---

## 5. The rule that blocks this today — the 4% ceiling

### What the rule is

The company has a standing rule that the total commission paid on any one sale
never goes above 4% of the sale value.

The system enforces this rule strictly, and it is worth being precise about
how. It does **not** quietly reduce anyone's commission to squeeze under the
ceiling. If a sale's combined commission comes to more than 4%, the system
stops the sale from being approved by Accounts, and raises it to the CRM team
as something to correct.

### Why it blocks the proposal

Look at the middle row of the table above. On a normal member sale today:

- direct commission to the selling member: **3%**
- invite commission to the member who invited them: **1%**
- **total: exactly 4.00%**

The business is already sitting exactly on the ceiling, with nothing to spare.

This means that the moment a project is set to anything above 3%, every sale on
that project that also carries an invite commission crosses the ceiling — and
under today's rule, those bookings cannot be approved. Accounts will be blocked
and the CRM team will receive a correction task for each one.

This is not a rare edge case. A member selling to a buyer, where that member was
invited by another member, is the main way business is done.

So: as written, the proposal delivers only the ability to move project rates
**down** from 3%. It cannot deliver the ability to move them **up** until the
ceiling question is answered.

### The three ways forward

**Option A — leave the ceiling fixed at 4%.**
Project rates can go down but effectively never up. This is a real option if
the business intent is to pay less on thin-margin projects, and nothing more.
It is the cheapest option and changes no existing rule. It is the wrong option
if the intent was ever to pay more on hard-to-sell stock.

**Option B — give every project its own ceiling as well.**
Maximum flexibility. The cost is that "4%" stops being a company-wide
commitment anyone can rely on, and there are now two numbers to set and govern
on every project instead of one.

**Option C — let the ceiling move with the rate.**
The ceiling becomes one percentage point above whatever that project's direct
rate is. At 3% the ceiling is 4%, which is exactly today's behaviour, unchanged.
At 4% the ceiling is 5%. The business sets one number per project and the
ceiling follows.

### What we recommend, and the argument against it

**We recommend Option C, with one addition: a company-wide absolute maximum
rate, set once by MD, that no individual project may be set above.**

The argument for Option C is that the 4% figure appears to have been derived
from its parts rather than chosen as an independent budget. It is exactly 3%
direct plus the 1% top invite band — the highest combination the rules can
produce. And when a sale does cross the ceiling, the system's own response is
to ask the team to check who was recorded as the seller and who the beneficiary
is. That is the behaviour of a check designed to catch a data entry mistake,
not the behaviour of a spending limit.

**The honest argument against it** is this: if management chose 4% because the
business genuinely cannot afford to pay more than 4% of sale value on any
transaction, then Option C removes the only automatic protection the company
has against total payout running away. Under Option C on its own, there would be
no absolute maximum anywhere in the business — every project's maximum would be
whatever figure someone last typed into a screen.

That is why we pair it with a company-wide absolute maximum. Management sets a
single hard number — say 5% or 6% — that no project rate may ever exceed,
regardless of who is editing it. Individual projects stay flexible; the company
keeps a real backstop. This is the only option that gives both.

**This decision must be made before any work starts.** It is not a detail that
can be settled later, because it determines what the feature actually is.

---

## 6. Sales that are already done

### The question

A member sells a plot in January, when the project pays 3%. In June, management
raises that project to 4%. Does the member now get 4% on the January sale?

### Our recommendation: no. The rate locks at the sale and never moves again.

Three reasons.

**The member was told 3%.** They closed that sale on that basis. Changing it
afterwards breaks the arrangement — and it breaks it in both directions. A rate
that can rise retrospectively can also fall retrospectively, and no member will
accept a business where a payout they have already earned can be reduced by a
decision taken months later.

**The money may already be out the door.** Commission that has reached its
milestone may be paid. Repricing old sales means going back to members for
recoveries, or issuing top-ups on settled accounts. Neither is a position the
business wants to be in as a routine consequence of a pricing decision.

**There are ordinary reasons the system revisits an old sale's commission.** If
the record of who sold a plot is corrected, or a buyer is moved to a different
plot, the commission on that booking is worked out again. If the rate were not
locked, each of those routine corrections would quietly reprice old business at
today's rate — with nobody intending it and nobody noticing.

So: **a project rate change applies to new business from the day it takes
effect, and to nothing that came before.** Old sales keep the rate they were
sold at, permanently, and that rate stays on the record.

### A second, narrower question

A booking request is submitted on Monday. Management changes the project rate on
Tuesday. Accounts approves the booking on Wednesday. Which rate applies?

**We recommend the rate in force on the day the booking was submitted.**

The member closed that sale on Monday's rate. How long the request then sits
waiting for internal approval is a back-office matter the member has no control
over — a request might be approved the same day or a week later. Allowing an
internal delay to change a member's payout is unfair, and it will produce
disputes the business cannot defend.

There is also a consistency argument. The project's location charge is already
locked onto a booking when the request is submitted, not when it is approved.
Locking the commission rate at the same moment keeps one rule for the business
to remember instead of two that work differently.

---

## 7. History, and why it matters

Every rate change creates a new version of that project's rate. The previous
version is marked as no longer current, but it is never deleted and never
edited. Each version carries:

- the rate
- the date and time it came into force
- the date it stopped being current, if it has been replaced
- who made the change
- **a written reason, which is compulsory**

The compulsory reason is deliberate. A rate change is a commercial decision
about money, and six months later nobody remembers why a project moved from 3%
to 2.5%. Requiring one line at the time costs the person making the change ten
seconds and saves the business an argument.

The practical value shows up in disputes. When a member asks why they were paid
3% on one sale and another member was paid 4% on a similar sale, the business
can show the rate that was in force on each project on each date, and the
reason it was set that way. Without history, that conversation has no evidence
in it.

---

## 8. Who should be allowed to change a rate

This is a business decision, not a technical one, and it needs an explicit
answer.

At present, project setup — including the location charge percentages, which
affect what the buyer pays — can be changed by the Project Coordinator role.

Direct commission is a different kind of number. It is not a price to a buyer;
it is what the company pays its own members. **We recommend that changing a
project's direct commission rate is restricted to MD and Admin, and is not
available to Project Coordinators**, even though they can already change other
project settings.

If the business would rather keep it with whoever handles project setup, that
is a legitimate choice — but it should be a choice that is made, not one that
happens by default because the two settings sit on the same screen.

---

## 9. Two smaller questions that need answers

### Can a project pay 0%?

Some projects may be sold entirely by the company's own team, with no member
commission at all.

**We recommend allowing 0%.** If a member does close a sale on such a project,
the sale should still show a commission line at 0% rather than showing nothing.
Showing nothing looks like an error or an oversight; showing an explicit zero
tells everyone the sale was recorded and that nothing is due, and why. The
business already works this way elsewhere — when an inviting member's position
is past the ninth they earn nothing, and the system still shows a zero line so
the position can be seen to have been used.

### Should the rate apply to both kinds of direct commission?

Today one number, 3%, covers two economically different things:

- a member **selling to a buyer** — this is a cost of sale
- a member **buying a plot for themselves** — this is effectively a 3% discount
  on their own purchase

These are not the same commercially, and a business could reasonably want them
to be different numbers. **We recommend keeping them on one rate for now**, as
they are today, because splitting them doubles the number of settings on every
project for a benefit nobody has yet asked for. But management should confirm
this rather than inherit it.

---

## 10. What does not change

To be clear about the boundaries of this proposal, none of the following is
affected:

- **Invite commission** — the bands of 1%, 0.5% and 0.25% by position, and no
  commission past the ninth position, all stay exactly as they are
- **Royalty** — unchanged, including the rule that it is earned through a
  completed cycle
- **Loyalty bonus** — 1%, and a maximum of three in a member's lifetime,
  unchanged
- **When commission becomes payable** — 25% payment received for a member's
  sale to a buyer, 100% for everything else, unchanged
- **All verification requirements** — the document, bank and registration
  checks that hold a commission before it can be paid are untouched
- **Buying commission on acquisitions** — a separate arrangement, outside this
  proposal entirely
- **Who earns the commission** — the rules about who is credited on a sale do
  not change. Only the rate changes.

---

## 11. What happens on the day this goes live

Nothing visibly changes, and that is deliberate.

- Every project in the system is set to 3% automatically. That is the rate they
  are on today, so no project's behaviour changes on day one.
- Every sale that has already been approved keeps the rate it was approved at,
  recorded permanently against that sale.
- From that day onward, the rate becomes a setting MD and Admin can change on
  any project, as often as needed.

There is no cut-over event for the business to manage, no period where
commissions behave differently, and nothing for the CRM or Accounts teams to do
on the day. The first real change happens only when someone deliberately sets a
project to something other than 3%.

---

## 12. Decisions needed before work can start

| # | Decision | Our recommendation |
| --- | --- | --- |
| 1 | **The 4% ceiling.** Fixed, per-project, or moving with the rate? | Moves with the rate (one point above it), plus a company-wide absolute maximum set by MD |
| 2 | **The company-wide absolute maximum**, if decision 1 is accepted. What is the number? | Management to set — 5% or 6% are the sensible candidates |
| 3 | **Old sales.** Do they keep their original rate permanently? | Yes. Permanently, and never revisited |
| 4 | **Pending bookings.** Submission date rate, or approval date rate? | Submission date |
| 5 | **Who can change a rate.** | MD and Admin only. Not Project Coordinator |
| 6 | **Is 0% allowed**, and does it show as a zero line? | Yes to both |
| 7 | **One rate or two** — is a member's own purchase on the same rate as their sale to a buyer? | One rate, as today. Confirm rather than assume |

Decision 1 is the only one that blocks everything else. The rest can be
confirmed while the work is in progress, but the sooner they are settled the
less rework there is.

---

## 13. What this document does not cover

- How the change is built. That is a separate piece of work and is not a
  management decision.
- Any change to invite, royalty, loyalty or buying commission.
- Any change to who is credited on a sale.
- Reporting on commission by project. Once rates vary by project, the business
  will want to compare payout across projects — worth raising, but it is a
  separate request and is not part of this proposal.

---

## 14. Decision — held for twelve months

### The decision

Nothing changes for the next twelve months. Direct commission stays at 3% on
every project, exactly as it is today. Membership is free during this period,
and the question of per-project rates is revisited when membership moves to
paid.

### Why this holds

The strongest reason is one that deserves stating plainly: commission and
membership fee are two halves of the same offer to a member. What a member
earns and what a member pays only make sense together. Fixing the earning side
now, while the paying side is still zero and undecided, means setting one half
of an equation before the other half exists.

The second reason is that no project currently needs a different rate. Nobody
has named a project where 3% is wrong. Building a capability for a situation
that has not arrived is work spent on a guess.

The third is that a year of trading gives real evidence. By the upgrade, the
business will know which projects sold quickly and which needed pushing. That
is a far better basis for setting rates than an opinion formed today.

### What the delay costs

The delay is close to free, but not entirely, and there are three things worth
being honest about.

**The clean starting point has to be protected.** Right now every sale in the
system was commissioned at 3%, with no exceptions anywhere. That uniformity is
what makes it simple to introduce project rates later — every past sale can be
marked 3% with complete confidence. If during this year anyone settles a
commission at a different figure outside the system, as a one-off arrangement
for a particular project or member, that confidence is gone and a year of
records becomes ambiguous. **The deferral is safe only if the 3% rule is kept
absolutely, with no informal exceptions.**

**The work is postponed, not avoided.** The same effort is required whenever it
is done. Deferring moves it to the twelve-month mark, which is also when the
membership upgrade lands — the busiest and most sensitive moment in the
calendar.

**Decisions left unwritten get made by accident.** In twelve months someone
will set a project to 4% and immediately be asked what happens to last year's
sales on that project. If there is no written answer, that becomes an argument
at the worst possible time.

### Three amendments to the plan

**First — do not bundle this with the membership upgrade.** Shipping paid
membership and variable commission in the same release is the one sequencing
that should be avoided. A member who begins paying a fee and at the same moment
sees their commission rate become a variable will read those as a single event:
"I started paying and my earnings were cut." Even if both changes are correct
individually, together they are one bad message.

The better sequence is to build the capability a little before the upgrade and
switch it on with every project set to 3%, so nothing changes for anyone. The
membership upgrade then happens on its own. Actual rate changes come later
still, as a separate and visible decision. Three quiet steps instead of one
loud one, for the same total work.

**Second — settle the 4% ceiling question now, even though nothing is being
built.** This is not a technical decision and it does not wait for the build.
During this free year the company will be telling members what they earn: 3%
on a sale, and 1% to whoever invited them. That is a promise, and it goes into
the membership terms being written now. If management intends to raise rates
on some projects later, the terms need to leave room for it. Write the
commitment carefully this year and the change is straightforward in twelve
months; write it loosely and the business will have promised away the
flexibility it is planning to use.

**Third — record the answers to the seven questions in Section 12 now, even
though nothing is built.** They cost one sitting to decide and one paragraph
each to write down. Deciding them in twelve months, under the pressure of a
membership launch, will produce worse answers and take longer.

### What actually needs doing this year

- Keep the 3% rule absolutely, with no off-system exceptions for any project
  or any member
- Write the membership terms so they do not promise a permanent 3% on every
  project, unless that is genuinely the intention
- Record management's answers to the seven questions in Section 12, so the
  later work starts from decisions rather than from a discussion
- Revisit this document at the membership upgrade, with a year of project
  performance to reason from
