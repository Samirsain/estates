# 3% Club CRM — Complete Mock Data & End-to-End Test Plan

## Purpose

This document provides a deliberately broad fictional dataset and UAT plan for testing the CRM, transaction engine, commission/royalty calculations and dashboards.

All names, projects, plots and values below are fictional test data.

## 1. Mock Projects

| Project | Code | Type | Location |
|---|---|---|---|
| Royal Greens Estate | RGE | Plots | Jaipur |
| Desert Pearl Residency | DPR | Plots | Jodhpur |
| Aravali Heights | ARH | Flats | Jaipur |
| Blue Horizon Commercial | BHC | Commercial | Jodhpur |

## 2. Mock Plots / Units

Create at least 78 units across the four projects.

### Royal Greens Estate
RGE-001 to RGE-030

### Desert Pearl Residency
DPR-001 to DPR-020

### Aravali Heights
ARH-101 to ARH-116

### Blue Horizon Commercial
BHC-01 to BHC-12

Each unit should include:

- Unit/plot number
- Project
- Area
- Base price
- PLC where applicable
- Status
- Booking status
- Customer/member reference

## 3. Members

Use at least 17 fictional Members:

1. Aarav Mehta
2. Rohan Sharma
3. Neha Jain
4. Vikram Singh
5. Priya Kapoor
6. Karan Choudhary
7. Simran Rathore
8. Mohit Bansal
9. Anjali Gupta
10. Deepak Joshi
11. Pooja Soni
12. Rahul Pareek
13. Manish Agarwal
14. Shikha Verma
15. Sandeep Rathore
16. Nitin Sharma
17. Kavita Meena

Store Member activation date and status.

## 4. Customers / Persons

Create 50+ fictional customers/person records.

Include repeated families/phone/email combinations where appropriate to test identity matching and duplicate prevention.

Example names:

- Rajesh Kumar
- Sunita Kumar
- Amit Jain
- Meena Jain
- Gaurav Sharma
- Nisha Sharma
- Rohit Mehta
- Pankaj Gupta
- Seema Gupta
- Arjun Singh
- Kavita Singh
- Manish Soni
- Deepa Soni
- Ashok Pareek
- Rekha Pareek
- Mahesh Choudhary
- Anita Choudhary
- Sameer Khan
- Farah Khan
- Vivek Agarwal
- Ritu Agarwal
- Yogesh Joshi
- Komal Joshi
- Tarun Bansal
- Shalini Bansal

Continue to at least 50 records.

## 5. Enquiries

Create at least 20 enquiries covering:

- New lead
- Follow-up
- Site visit requested
- Site visit completed
- Negotiation
- Lost
- Converted

Each enquiry should have customer, source, project interest, assigned person and status.

## 6. Holds

Create at least 12 holds.

Test:

- Active hold
- Expired hold
- Released hold
- Converted hold
- Hold against an already-booked unit (must be rejected/flagged)

## 7. Bookings

Create at least 60 bookings across:

- Customer Booking
- Member Booking
- Primary Customer self-purchase
- Customer who later becomes Member
- Conversion-related booking
- Change Plot
- Recovery
- Buyback/unwind

### Critical historical-classification test

1. Create an approved Customer Booking for Rajesh Kumar.
2. Later activate Rajesh Kumar as a Member.
3. Do not change the original booking classification.
4. Confirm the original booking remains **Customer Booking**.
5. Create a new qualifying transaction after activation.
6. Confirm the new transaction follows Member rules.

## 8. Payment Received References

Create at least 90 payment records.

Include:

- Booking reference
- Payment amount
- Payment date
- Payment mode
- Receipt/reference number
- Approved status
- Linked customer/member
- Linked project/unit

Test multiple payments against one booking and partial-payment scenarios.

## 9. Royalty / Performance Cycle Tests

### TC-ROY-001 — Completed Cycle
Given qualifying transactions satisfy all cycle conditions:

- Mark cycle complete.
- Confirm royalty becomes earned.
- Confirm dashboard counts it as earned.

### TC-ROY-002 — Incomplete Cycle
Given only part of the qualifying conditions are met:

- Keep cycle pending.
- Do not pay/recognize earned royalty.

### TC-ROY-003 — Historical Customer Booking
A Customer Booking exists before Member activation:

- Activate the person as Member.
- Keep historical booking as Customer Booking.
- Confirm royalty logic does not retroactively rewrite the source classification.

## 10. Buyback / Unwind Tests

### TC-BUY-001 — Approved Buyback

- Start from an approved booking.
- Process Buyback.
- Confirm transaction becomes Bought Back / Unwound.
- Confirm related commission/royalty effects are reversed or adjusted under Option B.
- Confirm original transaction remains in audit history.

### TC-BUY-002 — Buyback Dashboard
Confirm:

- Original booking is traceable.
- Buyback appears in reversal/unwind reporting.
- Net commission is correct.
- No duplicate active sale remains.

## 11. Customer → Member Tests

### TC-CM-001
Customer exists and has approved historical bookings.

Action:

- Activate customer as Member.

Expected:

- Person profile becomes Member.
- Existing approved Customer Bookings remain Customer Bookings.
- New qualifying business uses Member logic.

### TC-CM-002
Attempt duplicate Member activation.

Expected:

- CRM prevents duplicate Member records for the same person.

## 12. Paid Early MD Tests

### TC-MD-001 — Approved

- Submit eligible case.
- Record MD approval.
- Confirm Paid Early MD is approved.

### TC-MD-002 — Not Approved

- Submit otherwise eligible case.
- Do not record MD approval.
- Confirm benefit remains pending/not approved.

## 13. Primary Customer Self-Purchase

### TC-SELF-001
A Primary Customer purchases directly.

Expected:

- Transaction is identified as self-purchase.
- No referral commission is accidentally created.
- No duplicate economic event is counted.

## 14. Buying Commission — 5% Cap

### TC-BC-001
Calculate Buying Commission below 5%.

Expected:

- Full valid amount is recorded.

### TC-BC-002
Attempt a calculation above 5%.

Expected:

- System enforces the 5% maximum or flags the transaction for correction.
- Dashboard must not report an amount above the approved cap.

## 15. Recovery Tests

Test:

- Partial recovery
- Full recovery
- Recovery after commission calculation
- Recovery after Member activation
- Recovery followed by re-booking

Expected:

- Original records remain auditable.
- Current status and financial/commission calculations remain consistent.

## 16. Change Plot Tests

Test:

1. Customer changes from RGE-005 to RGE-012.
2. Original plot is released according to approved business state.
3. New plot is linked to the same booking/customer.
4. No duplicate booking is created.
5. Commission is not double-counted.

## 17. Duplicate / Identity Tests

Create cases with:

- Same mobile number
- Same email
- Same name with different mobile
- Spouse/family members
- Customer later becoming Member
- Duplicate enquiry converted into one customer

Expected:

- CRM identifies likely duplicates.
- Existing history remains linked correctly.
- No duplicate commissions.

## 18. Dashboard UAT

Verify dashboard totals for:

- Total enquiries
- Holds
- Bookings
- Customer bookings
- Member bookings
- Active bookings
- Bought Back / unwound bookings
- Payments received
- Earned royalty
- Pending royalty
- Performance cycles
- Buying Commission
- Paid Early MD
- Recoveries
- Customer → Member conversions

Every dashboard number must reconcile to transaction-level CRM records.

## 19. Negative Tests

The system should reject or flag:

- Booking an unavailable unit
- Duplicate active booking for the same unit
- Buying Commission >5%
- Paid Early MD without approval
- Duplicate Member activation
- Invalid payment reference
- Commission on cancelled/unwound business where not permitted
- Retroactive reclassification of an approved historical Customer Booking
- Duplicate commission for a Change Plot event

## 20. UAT Sign-Off

Before production approval, confirm:

- [ ] All mock projects loaded.
- [ ] All test units loaded.
- [ ] 17+ Members loaded.
- [ ] 50+ Customers/persons loaded.
- [ ] 20+ Enquiries loaded.
- [ ] 12+ Holds loaded.
- [ ] 60+ Bookings loaded.
- [ ] 90+ Payment references loaded.
- [ ] Royalty tests passed.
- [ ] Performance-cycle tests passed.
- [ ] Buyback Option B passed.
- [ ] Customer → Member historical classification passed.
- [ ] Paid Early MD approval tests passed.
- [ ] Primary Customer self-purchase passed.
- [ ] 5% Buying Commission cap passed.
- [ ] Recovery tests passed.
- [ ] Change Plot tests passed.
- [ ] Duplicate identity tests passed.
- [ ] Dashboard reconciliation passed.
- [ ] Negative tests passed.
- [ ] Audit trail verified.

**Final UAT status:** Not Ready / Ready for Fixes / Ready for Production
