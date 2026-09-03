# 3% CLUB — COMPLETE MOCK DATA & END-TO-END TEST PLAN v2 FINAL

**Purpose:** Build one controlled synthetic dataset to test the complete corrected v3.1 CRM plus every newly approved commission/benefit change.

**Important:** Every name, Project, ID, payment reference and record below is fictional test data. Never use real Aadhaar, PAN, bank or RERA numbers.

---

# 1. TEST COVERAGE

This pack must test:

- Projects, Plots, dimensions, restrictions and lifecycle
- PLC versions, snapshots and deduplication
- Enquiries/follow-up
- Holds / Member Hold Requests
- three-open-position limit
- Booking Request snapshot/review
- Booking approval/rejection/cancellation
- Payment Received
- Payment Given
- Direct Commission
- Invite
- Royalty
- Loyalty
- Customer-to-Member conversion
- earned independent Invite/Royalty cycle upgrades
- Position 10+ 0%
- Buyback before Delivered
- Buyback alternative milestone
- Buyback unwind/reversal
- Paid Early
- recovery/negative-account status
- Sold By correction
- Primary Customer correction
- Change Plot
- multiple buyers/shares
- deactivation/reactivation
- Aadhaar/bank/RERA holds
- duplicate Person merge
- Purchase for Resale / Buying Commission
- resale
- Allotment / Registry / Delivered
- scheduled jobs
- idempotency/concurrency
- Member portal privacy
- reports/exports
- external-reference correction

---

# 2. MINIMUM DATASET SIZE

| Entity | Minimum |
|---|---:|
| Staff users | **10** |
| Projects | **5** |
| Derived External Resale Property Group | 1 |
| Physical Project Plots | **116** |
| External acquisition properties | 4 |
| Members | **21** |
| Unique Customer/person records | **70+** |
| Duplicate Person profiles | 2 |
| Enquiries | **30+** |
| Holds / Member Hold Requests | **20+** |
| Approved Bookings / sales | **85+** |
| Payment Received references | **130+** |
| Payment Given references | **20+** |
| Recovery cases | **6+** |
| Change Plot requests | **6+** |
| Primary Customer changes | **4+** |
| Person merge | **2** |
| Delivered records | **4+** |
| Scheduled-job date cases | **15+** |

---

# 3. STAFF

| ID | Name | Role | Purpose |
|---|---|---|---|
| ST-MD-01 | Test MD | MD | Paid Early, exception, recovery approval |
| ST-ADM-01 | Test Admin | Admin | Project/Member/corrections |
| ST-ACC-01 | Test Accounts Maker | Accounts | Booking/payment maker |
| ST-ACC-02 | Test Accounts Checker | Accounts | maker-checker corrections |
| ST-CRM-01 | Test CRM A | CRM | Enquiry/Hold/Booking |
| ST-CRM-02 | Test CRM B | CRM | reassignment/concurrency |
| ST-MIS-01 | Test MIS | MIS | read-only reports |
| ST-PC-01 | Test Project Coordinator | PC | Project/Plot preparation |

MD/Admin MFA = enabled.

---

# 4. PROJECTS

| Project ID | Name | Location | Type | Initial Status |
|---|---|---|---|---|
| PRJ-001 | TEST Amber Greens Township | Hanumangarh, Rajasthan | Residential | Active |
| PRJ-002 | TEST Canal View Enclave | Sri Ganganagar, Rajasthan | Residential | Active |
| PRJ-003 | TEST Meridian Commercial Park | Hanumangarh, Rajasthan | Commercial | Setup / Not Active |
| PRJ-004 | TEST Heritage Meadows | Bikaner, Rajasthan | Residential | Sold Out |

Use:
- PRJ-001 as primary commission Project.
- PRJ-002 as second Project for lifetime/cross-project proof.
- PRJ-003 to prove Not Active blocks normal Hold/Booking.
- PRJ-004 to prove Sold Out does not stop existing approved work.

---

# 5. PLC CONFIG

| Code | PLC | Rate |
|---|---|---:|
| PLC-CORNER | Corner | 5% |
| PLC-PARK | Park Facing | 3% |
| PLC-R60 | 60-ft Road | 4% |
| PLC-R40 | 40-ft Road | 2% |
| PLC-NORTH | North Facing | 1.5% |
| PLC-COMM | Commercial Frontage | 4% |

Create Version 2 effective 2026-10-01:
- Park Facing 3% → 3.5%
- 40-ft Road 2% → 2.5%

Test:
- latest version for Available;
- Hold/Booking freeze;
- same category on multiple sides charged once;
- distinct categories add once;
- Change Plot replacement snapshot;
- correction history.

---

# 6. COMPLETE PLOT INVENTORY — 78

| Project | Plot | Size | Area sq ft | PLC seed | Initial Status |
|---|---|---|---|---|---|
| PRJ-001 | AG-001 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-001 | AG-002 | 30x50 | 1500 | Standard 0% | Available |
| PRJ-001 | AG-003 | 30x60 | 1800 | 60-ft Road 4% | Available |
| PRJ-001 | AG-004 | 40x60 | 2400 | Park Facing 3% | Available |
| PRJ-001 | AG-005 | 25x50 | 1250 | Corner 5% | Available |
| PRJ-001 | AG-006 | 30x50 | 1500 | 60-ft Road 4% | Available |
| PRJ-001 | AG-007 | 30x60 | 1800 | Standard 0% | Available |
| PRJ-001 | AG-008 | 40x60 | 2400 | Park Facing 3% | Available |
| PRJ-001 | AG-009 | 25x50 | 1250 | 60-ft Road 4% | Available |
| PRJ-001 | AG-010 | 30x50 | 1500 | Corner 5% | Available |
| PRJ-001 | AG-011 | 30x60 | 1800 | Standard 0% | Available |
| PRJ-001 | AG-012 | 40x60 | 2400 | Park Facing 3%, 60-ft Road 4% | Available |
| PRJ-001 | AG-013 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-001 | AG-014 | 30x50 | 1500 | Standard 0% | Available |
| PRJ-001 | AG-015 | 30x60 | 1800 | Corner 5%, 60-ft Road 4% | Available |
| PRJ-001 | AG-016 | 40x60 | 2400 | Park Facing 3% | Available |
| PRJ-001 | AG-017 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-001 | AG-018 | 30x50 | 1500 | 60-ft Road 4% | Available |
| PRJ-001 | AG-019 | 30x60 | 1800 | Standard 0% | Available |
| PRJ-001 | AG-020 | 40x60 | 2400 | Corner 5%, Park Facing 3% | Available |
| PRJ-001 | AG-021 | 25x50 | 1250 | 60-ft Road 4% | Available |
| PRJ-001 | AG-022 | 30x50 | 1500 | Standard 0% | Available |
| PRJ-001 | AG-023 | 30x60 | 1800 | Standard 0% | Available |
| PRJ-001 | AG-024 | 40x60 | 2400 | Park Facing 3%, 60-ft Road 4% | Available |
| PRJ-001 | AG-025 | 25x50 | 1250 | Corner 5% | Available |
| PRJ-001 | AG-026 | 30x50 | 1500 | Standard 0% | Available |
| PRJ-001 | AG-027 | 30x60 | 1800 | 60-ft Road 4% | Available |
| PRJ-001 | AG-028 | 40x60 | 2400 | Park Facing 3% | Available |
| PRJ-001 | AG-029 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-001 | AG-030 | 30x50 | 1500 | Corner 5%, 60-ft Road 4% | Available |
| PRJ-001 | AG-031 | 30x60 | 1800 | Standard 0% | Available |
| PRJ-001 | AG-032 | 40x60 | 2400 | Park Facing 3% | Available |
| PRJ-001 | AG-033 | 25x50 | 1250 | 60-ft Road 4% | Available |
| PRJ-001 | AG-034 | 30x50 | 1500 | Standard 0% | Available |
| PRJ-001 | AG-035 | 30x60 | 1800 | Corner 5% | Available |
| PRJ-001 | AG-036 | 40x60 | 2400 | Park Facing 3%, 60-ft Road 4% | Available |
| PRJ-001 | AG-037 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-001 | AG-038 | 30x50 | 1500 | Standard 0% | Available |
| PRJ-001 | AG-039 | 30x60 | 1800 | 60-ft Road 4% | Available |
| PRJ-001 | AG-040 | 40x60 | 2400 | Corner 5%, Park Facing 3% | Available |
| PRJ-002 | CV-001 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-002 | CV-002 | 30x60 | 1800 | Standard 0% | Available |
| PRJ-002 | CV-003 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-002 | CV-004 | 30x60 | 1800 | 40-ft Road 2% | Available |
| PRJ-002 | CV-005 | 25x50 | 1250 | North Facing 1.5% | Available |
| PRJ-002 | CV-006 | 30x60 | 1800 | Corner 5% | Available |
| PRJ-002 | CV-007 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-002 | CV-008 | 30x60 | 1800 | 40-ft Road 2% | Available |
| PRJ-002 | CV-009 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-002 | CV-010 | 30x60 | 1800 | North Facing 1.5% | Available |
| PRJ-002 | CV-011 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-002 | CV-012 | 30x60 | 1800 | Corner 5%, 40-ft Road 2% | Available |
| PRJ-002 | CV-013 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-002 | CV-014 | 30x60 | 1800 | Standard 0% | Available |
| PRJ-002 | CV-015 | 25x50 | 1250 | North Facing 1.5% | Available |
| PRJ-002 | CV-016 | 30x60 | 1800 | 40-ft Road 2% | Available |
| PRJ-002 | CV-017 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-002 | CV-018 | 30x60 | 1800 | Corner 5% | Available |
| PRJ-002 | CV-019 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-002 | CV-020 | 30x60 | 1800 | 40-ft Road 2%, North Facing 1.5% | Available |
| PRJ-002 | CV-021 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-002 | CV-022 | 30x60 | 1800 | Standard 0% | Available |
| PRJ-002 | CV-023 | 25x50 | 1250 | Standard 0% | Available |
| PRJ-002 | CV-024 | 30x60 | 1800 | Corner 5%, 40-ft Road 2% | Available |
| PRJ-003 | MC-001 | 20x40 | 800 | Commercial Frontage 4% | Not Active |
| PRJ-003 | MC-002 | 20x40 | 800 | Corner 5%, Commercial Frontage 4% | Not Active |
| PRJ-003 | MC-003 | 20x40 | 800 | Commercial Frontage 4% | Not Active |
| PRJ-003 | MC-004 | 20x40 | 800 | Corner 5%, Commercial Frontage 4% | Not Active |
| PRJ-003 | MC-005 | 20x40 | 800 | Commercial Frontage 4% | Not Active |
| PRJ-003 | MC-006 | 20x40 | 800 | Corner 5%, Commercial Frontage 4% | Not Active |
| PRJ-003 | MC-007 | 20x40 | 800 | Commercial Frontage 4% | Not Active |
| PRJ-003 | MC-008 | 20x40 | 800 | Corner 5%, Commercial Frontage 4% | Not Active |
| PRJ-004 | HM-001 | 30x60 | 1800 | Standard 0% | Sold Out |
| PRJ-004 | HM-002 | 30x60 | 1800 | Park Facing 3% | Sold Out |
| PRJ-004 | HM-003 | 30x60 | 1800 | Standard 0% | Sold Out |
| PRJ-004 | HM-004 | 30x60 | 1800 | Park Facing 3% | Sold Out |
| PRJ-004 | HM-005 | 30x60 | 1800 | Standard 0% | Sold Out |
| PRJ-004 | HM-006 | 30x60 | 1800 | Park Facing 3% | Sold Out |

Special setup:
- AG-037 uses newer PLC before CP01.
- AG-039/040 reserved for Buyback acceleration.
- MC-001 Hold attempted while Not Active.
- MC-002 used after Project activation.
- At least 3 spare Plots carry Not for Sale/Pledge restriction.
- One spare Plot uses irregular exact-area override with compulsory reason.

---

# 7. MEMBER MASTER — 17

| Member ID | Name | Town | Activation | Inviter | Purpose | Status |
|---|---|---|---|---|---|---|
| M001 | Arjun Mehta | Hanumangarh | 2025-04-01 | None | Root for Invite/Royalty cycles | Active |
| M002 | Neeraj Bansal | Sri Ganganagar | 2025-07-15 | None | Secondary root / voluntary conversion inviter | Active |
| M101 | Raghav Soni | Hanumangarh | 2026-04-02 | M001 | Invite Cycle 1 Position 1 | Active |
| M102 | Deepak Arora | Hanumangarh | 2026-04-03 | M001 | Invite Cycle 1 Position 2 | Active |
| M103 | Kunal Bhatia | Hanumangarh | 2026-04-04 | M001 | Invite Cycle 1 Position 3 | Active |
| M104 | Nitin Goyal | Hanumangarh | 2026-04-05 | M001 | Invite Cycle 1 Position 4 | Active |
| M105 | Harsh Vyas | Hanumangarh | 2026-04-06 | M001 | Invite Cycle 1 Position 5 | Active |
| M106 | Manav Jain | Hanumangarh | 2026-04-07 | M001 | Invite Cycle 1 Position 6 | Active |
| M107 | Aman Chawla | Hanumangarh | 2026-04-08 | M001 | Invite Cycle 1 Position 7 | Active |
| M108 | Ritesh Beniwal | Hanumangarh | 2026-04-09 | M001 | Invite Cycle 1 Position 8 | Active |
| M109 | Vikas Dhingra | Hanumangarh | 2026-04-10 | M001 | Invite Cycle 1 Position 9 | Active |
| M110 | Gaurav Nanda | Hanumangarh | 2026-04-11 | M001 | Invite Cycle 1 Position 10 | Active |
| M111 | Yash Khatri | Hanumangarh | 2027-04-02 | M001 | Invite Cycle 2 Position 1 | Active |
| M112 | Pranav Khanna | Bikaner | 2026-06-10 | None | No-inviter Direct / resale tests | Active |
| M113 | Siddharth Lamba | Hanumangarh | 2026-08-01 | M002 | Deactivation / bank / RERA / recovery | Active |
| M201 | Kavya Jain | Hanumangarh | 2027-01-15 | None | Converted after 3 Loyalty; no Invite beneficiary | Active |
| M202 | Rohit Verma | Sri Ganganagar | 2027-02-01 | M002 | Voluntary Customer-to-Member conversion | Active |

Compliance seed:
- M001–M112: Aadhaar Available, Bank Verified, RERA Registered.
- M113: Bank Pending and RERA Pending initially, later corrected.
- M201: no inviter.
- M202: inviter M002.
- use only synthetic references such as `TEST-RERA-M101`.

---

# 8. INVITE CYCLE SEED

Under M001 Cycle 1:

| Position | Member | Rate |
|---|---|---:|
| 1 | M101 | 1% |
| 2 | M102 | 1% |
| 3 | M103 | 1% |
| 4 | M104 | 0.5% |
| 5 | M105 | 0.5% |
| 6 | M106 | 0.5% |
| 7 | M107 | 0.25% |
| 8 | M108 | 0.25% |
| 9 | M109 | 0.25% |
| 10 | M110 | 0% |

Complete positions 1–9 before 2027-04-01.

Expected:
- Cycle 1 Upgrade Eligible.
- Invite Cycle 2 opens 2027-04-01.
- M111 activated 2027-04-02 = Cycle2 Position1.
- Position10 stays visible 0% and never re-rates.

---

# 9. ROYALTY CUSTOMER MASTER

| Customer ID | Name | Royalty Linked Member | Purpose | Expected Rate |
|---|---|---|---|---|
| C201 | Aarav Malhotra | M001 | Cycle1 Pos1 | 1% |
| C202 | Meera Sethi | M001 | Cycle1 Pos2 | 1% |
| C203 | Tanya Bansal | M001 | Cycle1 Pos3 | 1% |
| C204 | Kabir Ahuja | M001 | Cycle1 Pos4 | 0.5% |
| C205 | Ishita Grover | M001 | Cycle1 Pos5 | 0.5% |
| C206 | Dev Khurana | M001 | Cycle1 Pos6 | 0.5% |
| C207 | Naina Arora | M001 | Cycle1 Pos7 | 0.25% |
| C208 | Arnav Gera | M001 | Cycle1 Pos8 | 0.25% |
| C209 | Rhea Madan | M001 | Cycle1 Pos9 | 0.25% |
| C210 | Viraj Puri | M001 | Cycle1 Pos10 | 0% |
| C211 | Sana Kothari | M001 | Cycle2 Pos1 | 1% |

Critical seed:
- for C201, let Enquiry be entered by M102 but first qualifying sale be M001.
- expected Royalty Linked Member = M001.
- repeat similarly for other Customers with intentionally different Enquiry sources.

---

# 10. ROYALTY CYCLE TIMING

- Positions 1–8 complete Royalty before 2027-04-01.
- Position 9 completes only on 2027-04-05.
- Therefore Royalty does **not** upgrade on 2027-04-01.
- Cycle1 becomes Upgrade Eligible on 2027-04-05.
- Royalty Cycle2 starts 2028-04-01.
- C211 becomes Cycle2 Position1.

This must prove Invite and Royalty cycles can be on different cycle numbers.

---

# 11. OTHER CUSTOMER MASTER

| ID | Name | Type | Purpose |
|---|---|---|---|
| C301 | Kavya Jain | Customer → M201 | 3 Loyalty then convert; no inviter |
| C302 | Rohit Verma | Customer → M202 | 1 Loyalty then voluntary conversion with M002 inviter |
| C303 | Manish Batra | Customer | 3 Loyalty close events then blocked |
| C304 | Pooja Saluja | Customer | Repeat direct Loyalty / Buying beneficiary |
| C305 | Ajay Wadhwa | Customer | First purchase Sold By 3% CLUB; never Royalty-linked |
| C306 | Simran Kaur | Customer | First purchase Sold By Customer; never Royalty-linked |
| C307 | Nikhil Taneja | Customer | Cancelled provisional Royalty then valid seller |
| C308 | Ritu Bedi | Customer | Member-closed repeat must not consume Royalty |
| C309 | Sameer Gulati | Customer | Buyback-accelerated Royalty |
| C310 | Anjali Walia | Customer | Buyback-accelerated Loyalty |
| C311 | Mohit Daga | Customer | Primary normal + additional Active Member |
| C312 | Shreya Vohra | Customer | Additional buyer/share test |
| C313 | Reena Mehta | Customer | Related-party simple legal identity |
| C314 | Tarun Sikka | Customer | Company first purchase |
| C315 | Aditi Saran | Customer | Allotment route |
| C316 | Rohan Kohli | Customer | Registry route |
| C317A | Vivek Anand Duplicate A | Duplicate | Person merge |
| C317B | Vivek Anand Duplicate B | Duplicate | Person merge |
| C318 | Jatin Nagpal | Customer | Primary Customer correction |
| C319 | Shruti Tandon | Customer | Change Plot |
| C320 | Varun Oberoi | Customer | Cancellation/recovery |

Also create synthetic buyers:
- W001–W011
- L-BUYER-1 to L-BUYER-4
- CTM-BUYER-3 to CTM-BUYER-7
- COR-BUYER-1
- BA-BUYER-1
- PE-BUYER-1/2
- MRG-BUYER-1/2
- RS-BUYER-1/2

---

# 12. ENQUIRIES — MINIMUM 20

Required examples:

| Enquiry | Person | Entered By | Purpose |
|---|---|---|---|
| E001 | C201 | M102 | prove Enquiry does not decide Royalty |
| E002 | C201 | M001 | later duplicate Enquiry |
| E003 | C202 | M104 | Enquiry different from Royalty seller |
| E004 | C203 | M103 | same |
| E005 | C305 | M001 | Customer later first-buys from 3% CLUB; still no Royalty |
| E006 | C307 | M101 | provisional/cancellation case |
| E007 | C307 | M103 | later enquiry; no earning effect |
| E008–E020 | various | mixed | follow-up/Plot-wise enquiry cases |

Expected:
- no Enquiry creates Royalty Link;
- Active Enquiry gets one pending follow-up task;
- separate Plot-wise Enquiries remain separate;
- Booking rejection/cancellation returns linked Enquiry appropriately;
- Member never sees private existing Person data.

---

# 13. HOLDS / MEMBER HOLD REQUESTS — 12+

| Test | Person | Plot | Expected |
|---|---|---|---|
| H01 | C201 | AG-001 | first open position |
| H02 | C201 | AG-002 | second |
| H03 | C201 | AG-003 | third |
| H04 | C201 | AG-004 | fourth blocked |
| H05 | C202 | AG-005 | Member Hold Request |
| H06 | C202 | AG-005 again | duplicate returns existing |
| H07 | C203 | AG-006 | before cut-off expiry |
| H08 | C204 | AG-007 | after cut-off expiry |
| H09 | C205 | AG-008 | first extension by CRM |
| H10 | C205 | AG-008 | further extension requires Admin |
| H11 | C206 | MC-001 | blocked while Project Not Active |
| H12 | C206 | MC-002 after activation | allowed |

Also test withdrawal, expiry, different Customers on same Plot, and extension-after-expiry not reviving old Hold.

---

# 14. DETAILED BOOKING / COMMISSION SCENARIOS

| ID | Scenario | Project | Plot | Sold By | Primary Buyer | Trigger | Expected |
|---|---|---|---|---|---|---|---|
| S001 | Invite band sale | PRJ-001 | AG-001 | M101 | W001 | 25% → 100% | Direct 3%; Invite 1% to M001 |
| S002 | Invite band sale | PRJ-001 | AG-002 | M102 | W002 | 25% → 100% | Direct 3%; Invite 1% to M001 |
| S003 | Invite band sale | PRJ-001 | AG-003 | M103 | W003 | 30% + Approved Buyback | Direct 3% at 25%; Invite 1% accelerated by Approved Buyback before 100% |
| S004 | Invite band sale | PRJ-001 | AG-004 | M104 | W004 | 25% → 100% | Direct 3%; Invite 0.5% to M001 |
| S005 | Invite band sale | PRJ-001 | AG-005 | M105 | W005 | 25% → 100% | Direct 3%; Invite 0.5% to M001 |
| S006 | Invite band sale | PRJ-001 | AG-006 | M106 | W006 | 25% → 100% | Direct 3%; Invite 0.5% to M001 |
| S007 | Invite band sale | PRJ-001 | AG-007 | M107 | W007 | 25% → 100% | Direct 3%; Invite 0.25% to M001 |
| S008 | Invite band sale | PRJ-001 | AG-008 | M108 | W008 | 25% → 100% | Direct 3%; Invite 0.25% to M001 |
| S009 | Invite band sale | PRJ-001 | AG-009 | M109 | W009 | 25% → 100% | Direct 3%; Invite 0.25% to M001 |
| S010 | Invite band sale | PRJ-001 | AG-010 | M110 | W010 | 25% → 100% | Direct 3%; visible Invite Position10 0%; one-time Invite consumed |
| S011 | Second sale by M101 | PRJ-001 | AG-011 | M101 | W011 | 100% | Direct only; no second Invite from same invited Member |
| S012 | Member self-purchase | PRJ-001 | AG-012 | M104 | M104 Primary | 40% → 100% | 3% Direct only at 100%; no Invite/Royalty/Loyalty |
| S013 | Member self-purchase + Buyback | PRJ-001 | AG-013 | M105 | M105 Primary | 60% + Approved Buyback | Buyback does not accelerate self-purchase Direct |
| S014 | Primary normal + additional Member | PRJ-001 | AG-014 | M106 | C311 Primary + M107 10% | 100% | M106 Direct; additional Active Member does not create self-purchase |
| S015 | Primary Active Member + additional Customer | PRJ-001 | AG-015 | Attempt M108 | M109 Primary + C312 | 100% | M109 self-purchase Direct; M108 gets nothing |
| S016 | Related-party legal buyer | PRJ-001 | AG-016 | M101 | C313 Primary | 100% | Named Primary controls; no automatic family self-purchase |
| R01A | Royalty first purchase | PRJ-001 | AG-017 | M001 | C201 | 100% | M001 Direct; Customer finalises Royalty Position 1 @ 1% |
| R02A | Royalty first purchase | PRJ-001 | AG-018 | M001 | C202 | 100% | M001 Direct; Customer finalises Royalty Position 2 @ 1% |
| R03A | Royalty first purchase | PRJ-001 | AG-019 | M001 | C203 | 100% | M001 Direct; Customer finalises Royalty Position 3 @ 1% |
| R04A | Royalty first purchase | PRJ-001 | AG-020 | M001 | C204 | 100% | M001 Direct; Customer finalises Royalty Position 4 @ 0.5% |
| R05A | Royalty first purchase | PRJ-001 | AG-021 | M001 | C205 | 100% | M001 Direct; Customer finalises Royalty Position 5 @ 0.5% |
| R06A | Royalty first purchase | PRJ-001 | AG-022 | M001 | C206 | 100% | M001 Direct; Customer finalises Royalty Position 6 @ 0.5% |
| R07A | Royalty first purchase | PRJ-001 | AG-023 | M001 | C207 | 100% | M001 Direct; Customer finalises Royalty Position 7 @ 0.25% |
| R08A | Royalty first purchase | PRJ-001 | AG-024 | M001 | C208 | 100% | M001 Direct; Customer finalises Royalty Position 8 @ 0.25% |
| R09A | Royalty first purchase | PRJ-001 | AG-025 | M001 | C209 | 100% | M001 Direct; Customer finalises Royalty Position 9 @ 0.25% |
| R10A | Royalty first purchase | PRJ-001 | AG-026 | M001 | C210 | 100% | M001 Direct; Customer finalises Royalty Position 10 @ 0% |
| R01B | Royalty repeat direct | PRJ-002 | CV-001 | 3% CLUB | C201 | 100% | Loyalty 1% if available + Royalty 1% to M001 |
| R02B | Royalty repeat direct | PRJ-002 | CV-002 | 3% CLUB | C202 | 100% | Loyalty 1% if available + Royalty 1% to M001 |
| R03B | Royalty repeat direct | PRJ-002 | CV-003 | 3% CLUB | C203 | 100% | Loyalty 1% if available + Royalty 1% to M001 |
| R04B | Royalty repeat direct | PRJ-002 | CV-004 | 3% CLUB | C204 | 100% | Loyalty 1% if available + Royalty 0.5% to M001 |
| R05B | Royalty repeat direct | PRJ-002 | CV-005 | 3% CLUB | C205 | 100% | Loyalty 1% if available + Royalty 0.5% to M001 |
| R06B | Royalty repeat direct | PRJ-002 | CV-006 | 3% CLUB | C206 | 100% | Loyalty 1% if available + Royalty 0.5% to M001 |
| R07B | Royalty repeat direct | PRJ-002 | CV-007 | 3% CLUB | C207 | 100% | Loyalty 1% if available + Royalty 0.25% to M001 |
| R08B | Royalty repeat direct | PRJ-002 | CV-008 | 3% CLUB | C208 | 60% + Approved Buyback | Loyalty + Royalty 0.25% accelerated before 100% |
| R09B | Royalty repeat direct | PRJ-002 | CV-009 | 3% CLUB | C209 | 100% on 2027-04-05 | Royalty Pos9 completes after anniversary; Cycle1 becomes Upgrade Eligible only now |
| R10B | Royalty repeat direct | PRJ-002 | CV-010 | 3% CLUB | C210 | 100% | Loyalty 1%; visible Royalty Position10 0%; 0% opportunity consumed |
| R11A | Royalty Cycle2 first customer | PRJ-002 | CV-011 | M001 | C211 | 100% after 2028-04-01 | Cycle2 Position1 |
| R11B | Royalty Cycle2 repeat | PRJ-002 | CV-012 | 3% CLUB | C211 | 100% | Royalty 1% to M001 |
| RX01 | First purchase by 3% CLUB | PRJ-002 | CV-013 | 3% CLUB | C305 | 100% | No Royalty Link |
| RX02 | Later Member sells old Company Customer | PRJ-002 | CV-014 | M102 | C305 | 100% | M102 Direct; still no Royalty Link |
| RX03 | First purchase Sold By Customer | PRJ-002 | CV-015 | C303 | C306 | 100% | Loyalty to C303 if available; C306 never Royalty-linked |
| RX04 | Cancelled provisional Royalty | PRJ-002 | CV-016 | M102 | C307 | 40% then cancel | No final Royalty position |
| RX05 | Replacement valid first purchase | PRJ-002 | CV-017 | M103 | C307 | 100% | M103 becomes Royalty Linked Member |
| RX06 | Member-closed repeat | PRJ-002 | CV-018 | M104 | C308 | 100% | M104 Direct; C308's unused Royalty remains unused |
| L001 | Loyalty close 1 | PRJ-002 | CV-019 | C303 | L-BUYER-1 | 100% | C303 Loyalty 1/3 |
| L002 | Loyalty close 2 | PRJ-002 | CV-020 | C303 | L-BUYER-2 | 100% | C303 Loyalty 2/3 |
| L003 | Loyalty close 3 | PRJ-002 | CV-021 | C303 | L-BUYER-3 | 100% | C303 Loyalty 3/3; Membership Invitation Required |
| L004 | Fourth Customer close attempt | PRJ-002 | CV-022 | C303 | L-BUYER-4 | N/A | Block Sold By Customer |
| L005 | Repeat direct Loyalty | PRJ-002 | CV-023 | 3% CLUB | C304 | 100% | Loyalty 1% if available |
| L006 | Buyback accelerated Loyalty | PRJ-002 | CV-024 | 3% CLUB | C310 | 70% + Approved Buyback | Loyalty payable before 100% |
| CTM1 | Kavya third Loyalty | PRJ-001 | AG-027 | C301 | CTM-BUYER-3 | 100% | Third Loyalty; then convert to M201 no inviter |
| CTM2 | M201 first Member sale | PRJ-001 | AG-028 | M201 | CTM-BUYER-4 | 100% | M201 Direct; no Invite beneficiary |
| CTM3 | Rohit Loyalty before conversion | PRJ-001 | AG-029 | C302 | CTM-BUYER-5 | 100% | C302 Loyalty 1/3 |
| CTM4 | M202 first Member sale | PRJ-001 | AG-030 | M202 | CTM-BUYER-6 | 100% | M202 Direct; Invite may go to M002 |
| CTM5 | Existing Customer Booking survives activation | PRJ-001 | AG-031 | C302 | CTM-BUYER-7 | 60% before activation; 100% after | Remains Customer Loyalty classification |
| CXL1 | Paid sale then cancel | PRJ-001 | AG-032 | M113 | C320 | 100% then formal cancellation | Recovery Outstanding / Negative Account |
| CXL2 | Recovery unresolved 15 days | PRJ-001 | AG-033 | M113 | CXL-BUYER-2 | N/A | M113 deactivated; new activity blocked |
| COR1 | Sold By correction after payment | PRJ-001 | AG-034 | M101 → M102 | COR-BUYER-1 | 100% | M101 recovery; M102 payable only with MD approval before recovery |
| PC01 | Primary Customer correction | PRJ-001 | AG-035 | M103 | C318 → M104 Primary | 30% | Reclassify to Member self-purchase after approval |
| CP01 | Change Plot same Project | PRJ-001 | AG-036 → AG-037 | M104 | C319 | 35% | Same Booking; replacement PLC frozen; no duplicate commission |
| CP02 | Cross-Project Change Plot attempt | PRJ-001→002 | AG-038 → CV-001 | M104 | C319 | 35% | Reject same-Booking Change Plot; require cancellation + new Booking |
| BA01 | Buyback accelerated Invite then unwind | PRJ-001 | AG-039 | M103 | BA-BUYER-1 | 30% + Approved Buyback then unwind | Invite first eligible; unwind below100 reverses/reopens; Direct remains because >25% |
| BA02 | Buyback accelerated Royalty then unwind | PRJ-001 | AG-040 | 3% CLUB | C309 | 60% + Approved Buyback then unwind | Royalty/Loyalty accelerate then reverse/reopen if still <100% |
| PE01 | Paid Early with MD approval | PRJ-004 | HM-001 | M112 | PE-BUYER-1 | 10% + MD Paid Early | Allowed; no second payout at normal milestone |
| PE02 | Paid Early without MD approval | PRJ-004 | HM-002 | M112 | PE-BUYER-2 | 10% | Block |
| MRG1 | Duplicate identity A | PRJ-004 | HM-003 | C317A | MRG-BUYER-1 | 100% | Loyalty event A |
| MRG2 | Duplicate identity B | PRJ-004 | HM-004 | C317B | MRG-BUYER-2 | 100% | Merge rebuilds unique count |
| DEL1 | Allotment completion | PRJ-004 | HM-005 | M112 | C315 | 100% | Allotment route → Delivered once |
| DEL2 | Registry completion | PRJ-004 | HM-006 | M112 | C316 | 100% | Registry route → Delivered once |

---

# 15. EXTERNAL ACQUISITION / BUYING COMMISSION DATA

| ID | Property | Seller | Beneficiary | Rate | Trigger | Expected |
|---|---|---|---|---|---|---|
| ACQ1 | TEST External House 14 | EXT-S01 | M112 | 4.5% | 100% Payment Given | Valid Buying Commission |
| ACQ2 | TEST External Shop 7 | EXT-S02 | M112 | 5.5% | 100% Payment Given | Block >5% |
| ACQ3 | TEST External Plot 22 | EXT-S03 | EXT-S03 seller | 3% | 100% Payment Given | Block seller as beneficiary |
| ACQ4 | TEST External House 31 | EXT-S04 | C304 | 2% | 100%, then acquisition unwind | Buying Commission becomes recoverable |

Buying Commission:
- Acquisition Price base outside CRM.
- hard max 5%.
- one beneficiary.
- outside sale 4% cap.

---

# 16. ROYALTY ACCEPTANCE TESTS

1. Enquiry by A, first qualifying sale by B → B owns Royalty.
2. First approved Booking by B cancelled before 100%/Approved Buyback → no final position.
3. Later valid first purchase by C → C becomes Royalty Linked Member.
4. First purchase Sold By 3% CLUB → never later gets Royalty Member.
5. First purchase Sold By Customer → never later gets Royalty Member.
6. Member closes repeat purchase → Royalty does not pay and remains unused.
7. First direct repeat purchase qualifies → Royalty once only.
8. Third/fourth/fifth purchase → no second Royalty.
9. Position10 shows 0% and consumes.
10. Approved Buyback before 100% can accelerate Royalty.
11. Buyback unwind below 100% reverses accelerated Royalty.
12. If 100% independently reached before unwind, Royalty remains valid.

---

# 17. LOYALTY ACCEPTANCE TESTS

C303:
- close #1 → Loyalty 1.
- close #2 → Loyalty 2.
- close #3 → Loyalty 3.
- attempt #4 → Sold By Customer blocked.

Also test:
- first personal purchase = no repeat Loyalty;
- repeat direct purchase = Loyalty if slot remains;
- mixed 2 closing + 1 repeat = total 3;
- Active Member cannot earn new Customer Loyalty;
- Approved Buyback can accelerate Loyalty before 100%;
- unwind reverses if 100% not independently reached.

---

# 18. CUSTOMER → MEMBER

## C301 → M201
- exactly 3 Loyalty used.
- conversion via Company membership invitation.
- no inviter.
- first Member sale pays Direct only; no Invite beneficiary.
- past Customer sales do not create Royalty.

## C302 → M202
- 1 Loyalty used.
- voluntarily converts before 3.
- M002 recorded as inviter before activation.
- remaining Loyalty forfeited.
- existing approved Customer Booking remains Customer-classified.
- new Member sale uses Direct and may generate Invite to M002.

---

# 19. BUYBACK ALTERNATIVE MILESTONE

Must test separately:

### Invite
30% Payment Received + Approved Buyback:
- Direct already earned at 25%.
- Invite becomes eligible before 100%.

### Royalty
60% + Approved Buyback:
- Royalty becomes eligible before 100%.

### Loyalty
70% + Approved Buyback:
- Loyalty becomes eligible before 100%.

### Direct not accelerated
Member self-purchase 60% + Approved Buyback:
- Direct remains pending until 100%.

### Unwind
If Buyback later unwinds:
- if source remains <100%, accelerated Invite/Royalty/Loyalty reverses and opportunity reopens;
- if source reached 100%, normal milestone preserves it.

---

# 20. PAYMENT RECEIVED TESTS

Use references `TST-PR-<Booking>-<n>`.

Minimum:
1. 0% approved Booking.
2. 24% → Direct pending.
3. 25% → third-party Direct Ready.
4. 99% → Invite/Royalty/Loyalty pending unless Approved Buyback.
5. 100% → normal milestones.
6. correction 100 → 80.
7. restore 80 → 100 without duplicate payout.
8. duplicate ref blocked.
9. spaces/case-normalised duplicate blocked.
10. >100% blocked.
11. future date blocked.
12. unpaid schedule revision.
13. overdue starts next day.

---

# 21. PAYMENT GIVEN TESTS

Use `TST-PG-<Acquisition>-<n>`.

Test:
- 19% → acquisition approval threshold not met.
- 20% → approval threshold met.
- 99% → Buying Commission pending.
- 100% → Buying Commission Ready.
- correct 100 → 80 → Buying Commission back to pending/adjustment.
- duplicate ref blocked.
- future date blocked.

---

# 22. PAID EARLY

## Valid
- below normal milestone;
- MD approves;
- compulsory reason/ref/date;
- no second payout at normal milestone.

## Invalid
- Accounts attempts without MD approval → blocked.

## Later invalid
- cancellation/buyback unwind/correction → Accounts Adjustment Required / Recovery Outstanding.

---

# 23. RECOVERY TESTS

CRM stores status/reference, not rupee amount.

### REC-001 Member
- M113 paid then sale cancelled.
- `Recovery Outstanding / Negative Account`.
- external ref `TST-REC-001`.
- unresolved for 15 calendar days → deactivate M113.
- new Member sale/payout blocked.

### REC-002 corrected beneficiary
- M101 paid.
- Sold By corrected to M102.
- M101 Recovery Outstanding.
- MD may approve M102 payout before old recovery clears.

### REC-003 Customer
- Customer Loyalty paid then cancelled.
- future Loyalty blocked.
- Membership activation blocked until Recovery Cleared.

### REC-004 Buying
- ACQ4 Buying Commission paid.
- acquisition itself unwound.
- beneficiary Recovery Outstanding.

---

# 24. COMMISSIONABLE SALE VALUE — EXTERNAL ONLY

Example external Accounts worksheet:

- Base = ₹50,00,000
- PLC = ₹2,00,000
- Authorised Discount = ₹1,00,000

Commissionable Sale Value = **₹51,00,000**

Exclude taxes/pass-through charges.

Calculate externally:
- 3%
- 1%
- 0.5%
- 0.25%

Final result to 2 decimals; no intermediate rounding.

CRM stores percentage and payout reference/date/status only.

---

# 25. PAYOUT TESTS

For each Ready commission:
- verified bank required;
- pay within 7 working days;
- no minimum threshold;
- no invoice business-rule hold;
- PAN not business-rule hold;
- statutory deduction external;
- each commission separate transfer/reference;
- Paid or Paid Early cannot be paid again.

---

# 26. ELIGIBILITY HOLDS

Using M113:
1. Bank Pending → hold.
2. Bank Verified → recheck.
3. RERA Pending → Member commission hold.
4. RERA Registered → recheck.
5. Member deactivated → unpaid Member commissions hold.
6. Reactivated → same record resumes, no duplicate.
7. Aadhaar missing where baseline requires Available → hold.
8. Aadhaar Available → release.

Customer Loyalty does not inherit Member RERA hold unless person is operating as Member.

---

# 27. SOLD BY CORRECTIONS

Test:
- Member A → Member B unpaid.
- Member A → Member B after payment.
- Member → 3% CLUB.
- 3% CLUB → Member.

Expected:
- old current records superseded;
- paid old beneficiary recovery if needed;
- new correct records only;
- Invite/Royalty/Loyalty recalculated;
- no duplicate opportunity.

---

# 28. PRIMARY CUSTOMER / SHARES

Test:
1. one final buyer = 100% default.
2. two buyers total 100%.
3. total 90% blocked from Delivered.
4. total 110% blocked.
5. Primary normal + Additional Active Member → not self-purchase.
6. Primary Active Member + Additional normal Customer → self-purchase.
7. Primary change after approval → Accounts review.
8. change into Active Member Primary → commission reclassification.
9. old/new Primary remain History.

---

# 29. CHANGE PLOT

## Same Project
AG-036 → AG-037:
- same Booking;
- same Customer/Sold By;
- replacement PLC snapshot frozen;
- Payment Received re-applied by Accounts;
- commission rechecked once.

## Cross Project
AG-038 → CV-001:
- same-Booking Change Plot blocked;
- require Cancel Booking + new Booking Request.

Also test replacement Plot previously held by same Customer → use Hold PLC snapshot.

---

# 30. BOOKING REVIEW SNAPSHOT

Freeze at submission:
- Primary/Additional Customers
- shares
- Project/Plot
- PLC snapshot
- Sold By/linked beneficiary
- Booking Date
- Customer Type
- payment schedule

Silent edit under Accounts review → blocked.
Change requires cancelled review version + new version.

Approve one Booking at 0% Payment Received.

---

# 31. CANCELLATION

Before approval:
- close request;
- no Refund Pending;
- no permanent Booking cancellation;
- no commission treatment;
- restore Plot/Hold.

After approval:
- Refund Pending;
- Accounts verification;
- commission cancellation/adjustment;
- normal cancellation may reopen one-time benefits;
- Approved Buyback is treated separately.

---

# 32. PROJECT / RESTRICTION

Test:
- Not Active blocks normal Hold/Booking.
- activate PRJ-003 → permitted.
- Sold Out does not kill ongoing approved work.
- Not for Sale/Pledge survives return.
- Booking cancellation: no RESALE tag.
- Change Plot: no RESALE tag.
- Buyback/Purchase for Resale: RESALE.
- active restriction still keeps Plot Not Available.

---

# 33. PLOT GEOMETRY

Test:
- uniqueness = Project + Plot Type + Plot Number.
- duplicate blocked.
- same number in other Project allowed.
- regular area calculation.
- irregular exact-area override requires reason.
- sq yd / sq m derivation.
- boundary and road fields.
- Park Facing/facing/open-side display.

---

# 34. ALLOTMENT / REGISTRY / DELIVERED

DEL1:
- Allotment route data complete → Delivered once.

DEL2:
- Registry route data complete → Delivered once.

Do not create Allotment-then-Registry third route.

Incorrect Delivered reopen:
- MD/Admin only;
- reason/history required.

---

# 35. PERSON MERGE

Use C317A/C317B as same real test person.

Create:
- one unique Loyalty event in A;
- one unique in B;
- one duplicate event in both if test harness allows.

After merge:
- duplicate event counts once;
- Loyalty rebuilt from unique qualifying events;
- max consumed = 3;
- one surviving identity;
- old IDs searchable;
- Royalty Link reconstructed from genuine first qualifying purchase;
- two Active Members cannot ordinary-merge.

---

# 36. REFERENCE CORRECTION

For Payment Received, Payment Given and commission payout:
1. select wrong ref;
2. compulsory reason;
3. old ref Superseded;
4. replacement linked;
5. preserve action date/system timestamp;
6. never delete old ref.

Global active Payment Reference uniqueness must remain.

---

# 37. MEMBER PORTAL PRIVACY

Member may see:
- Project
- Plot
- commission type
- percentage
- milestone/status
- safe hold reason
- Invite/Royalty cycle/position/rate
- Upgrade Eligible
- anniversary
- 0% status
- Recovery Outstanding status

Member must not see:
- buyer identity/mobile/Customer ID
- Aadhaar/PAN/bank
- other Members' data
- internal Accounts notes
- rupee recovery amount.

---

# 38. SCHEDULED JOBS

Test controlled dates for:
1. Hold Expiry.
2. Member Hold Request expiry.
3. Instalment Overdue.
4. Payment Received reminder.
5. Payment Given reminder.
6. Booking decision red after 7 days.
7. RERA expiry reminder.
8. Invite Performance Cycle Anniversary Upgrade.
9. Royalty Performance Cycle Anniversary Upgrade.
10. 29-Feb activation → 28-Feb non-leap anniversary.
11. missed run recovery.
12. retry without duplicate cycle/task.

---

# 39. IDEMPOTENCY / CONCURRENCY

Double-submit:
- Hold
- Hold Request
- Booking Request
- Booking approval
- Payment Received
- payment correction
- Change Plot
- cancellation
- acquisition
- commission payout
- Paid Early
- Delivered

Second identical action must not duplicate.

Same-second Invite test:
- two sales by same invited Member reach qualifying point at same verified timestamp;
- lower permanent Booking Number wins;
- inviter paid once.

---

# 40. REPORT / EXPORT

Reports must:
- use current non-superseded commission only;
- not double-count merged Persons;
- separate Payment Received from Payment Given;
- show Position10 0%;
- show cycle numbers;
- never use Enquiry Source as Royalty ownership;
- exclude reversed Buyback-accelerated completion;
- mask export;
- log report/filters/time/user/row count.

---

# 41. STANDING INTEGRITY CHECKS — MUST RETURN ZERO

1. Duplicate Invite for same invited Member.
2. More than one Royalty per Customer.
3. More than three Loyalty per Customer.
4. Sale commission >4%.
5. Buying Commission >5%.
6. More than one Buying beneficiary per acquisition.
7. Seller/returning owner is own Buying beneficiary.
8. Primary Active Member self-purchase also pays another seller.
9. Additional Active Member alone forces self-purchase.
10. Final Royalty position not supported by first qualifying sale Sold By that Member.
11. Enquiry alone creates Royalty.
12. First purchase Sold By 3% CLUB has Royalty Linked Member.
13. First purchase Sold By Customer has Royalty Linked Member.
14. Position10 hidden or re-rated.
15. Incomplete cycle reset at anniversary.
16. Buyback acceleration counted after its Buyback was unwound below100%.
17. Buyback accelerates Direct.
18. paid/paid-early commission paid twice.
19. duplicate active Payment Reference.
20. Customer with 3 Loyalty selected as new Sold By Customer.
21. 3-Loyalty converted Member has inviter.
22. voluntary converted Member still has unused Loyalty.
23. old Customer sale creates retroactive Royalty after activation.
24. Recovery Outstanding Member receives new cash payout.
25. Recovery Outstanding Customer receives new benefit payout.
26. CRM stores deal/payment/commission/recovery rupee amount.
27. Member portal exposes buyer/private identity.

---

# 42. EXPECTED END-STATE COUNTS

After core tests:

- M001 Invite Cycle1 positions 1–10 exist.
- M001 Invite Cycle2 Position1 exists.
- M001 Royalty Cycle1 positions 1–10 exist.
- M001 Royalty Cycle2 Position1 exists only after 2028 anniversary.
- at least 1 visible Invite 0%.
- at least 1 visible Royalty 0%.
- at least 1 Buyback-accelerated Invite.
- at least 1 Buyback-accelerated Royalty.
- at least 1 Buyback-accelerated Loyalty.
- at least 1 reversed Buyback acceleration.
- at least 1 Member self-purchase.
- at least 1 Additional Member co-buyer not forcing self-purchase.
- at least 1 Customer with exactly 3 Loyalty.
- at least 1 blocked fourth Customer-close.
- M201 converted with no inviter.
- M202 voluntarily converted with M002 inviter.
- at least 1 Recovery Outstanding Member.
- at least 1 Recovery Outstanding Customer.
- at least 1 valid Buying Commission.
- at least 1 >5% Buying rejection.
- at least 1 acquisition cancellation recovery.
- at least 1 resale cancellation that leaves Buying Commission intact.
- 1 Allotment Delivered.
- 1 Registry Delivered.
- 1 Person merge.
- 1 valid same-project Change Plot.
- 1 blocked cross-project Change Plot.

---

# 43. FINAL OWNER/UAT QUESTIONS

Every answer must be correct before go-live:

1. Can Enquiry steal Royalty? **No.**
2. Can same invited Member generate Invite twice? **No.**
3. Can Customer generate Royalty twice? **No.**
4. Can Customer exceed 3 Loyalty? **No.**
5. Is Position10 visible? **Yes.**
6. Can Position10 later re-rate? **No.**
7. Can anniversary upgrade incomplete counter? **No.**
8. Can Invite upgrade while Royalty does not? **Yes.**
9. Can Approved Buyback accelerate Invite/Royalty/Loyalty? **Yes.**
10. Can Buyback accelerate Direct? **No.**
11. Can unwound Buyback leave unsupported accelerated payout? **No.**
12. Can Additional Member buyer alone create self-purchase? **No.**
13. Can 3-Loyalty converted Member generate Invite for someone? **No.**
14. Can voluntary converted Member have inviter? **Yes.**
15. Can old Customer activity become Direct/Royalty retrospectively? **No.**
16. Can Accounts Paid Early without MD approval? **No.**
17. Can Buying Commission exceed 5%? **No.**
18. Can seller earn Buying Commission on own return? **No.**
19. Can later resale cancellation erase valid Buying Commission? **No.**
20. Can Recovery Outstanding person keep receiving payouts? **No.**
21. Does CRM remain percentage-only? **Yes.**
22. Can recovery amount stay external while CRM shows Recovery Outstanding? **Yes.**
23. Are old corrected records preserved? **Yes.**
24. Can duplicate click/reference create duplicate payout? **No.**

---

# 44. TEST EXECUTION ORDER

1. Staff/security.
2. Projects/PLC/Plots.
3. Persons/Members.
4. Enquiries.
5. Holds.
6. Booking snapshot.
7. Direct/Invite.
8. Royalty first purchases.
9. Loyalty.
10. Payment milestone/corrections.
11. Royalty repeat purchases.
12. Invite/Royalty upgrades.
13. Customer-to-Member.
14. Multiple buyers/self-purchase.
15. Change Plot.
16. corrections.
17. Paid Early.
18. cancellation/recovery.
19. Buyback acceleration.
20. Buyback unwind.
21. acquisitions/Buying Commission.
22. resale.
23. Allotment/Registry/Delivered.
24. Person merge.
25. scheduled jobs.
26. concurrency/idempotency.
27. portal privacy.
28. reports/exports.
29. run standing integrity checks.
30. Owner/UAT sign-off.

---

# 45. FINAL TEST RULE

> Do not mark the CRM ready merely because normal sales work. Go-live requires every cancellation, correction, Buyback, conversion, concurrency, recovery, position-band and upgrade scenario above to produce the exact expected result without duplicate payout, lost history, hidden re-rating or Enquiry-based Royalty.

---

# 46. COMPLETE COVERAGE AUDIT — ADDITIONAL SCENARIOS THAT MUST BE ADDED

The earlier version covered the core commission and workflow paths well, but it was **not yet exhaustive** against the corrected v3.1 baseline plus the newly approved business changes.

The scenarios below are mandatory additions. They are not optional "nice-to-have" tests.

The updated minimum counts in Section 2 already include these additions.

---

# 47. ADDITIONAL TEST PROJECT AND PLOT DATA

## PRJ-005 — TEST Legacy Heights Archive

| Project ID | Project Name | Location | Type | Initial Status |
|---|---|---|---|---|
| PRJ-005 | TEST Legacy Heights Archive | Bikaner, Rajasthan | Residential | Completed |

Purpose:

- Completed Project is historical.
- No normal new Hold/Booking.
- Authorised historical correction remains possible.
- Delivered and audit history remain visible.

## Additional physical plots

These extend the physical inventory from 78 to 116.

| Project | Plot | Size | Area sq ft | PLC seed | Purpose |
|---|---|---:|---:|---|---|
| PRJ-001 | AG-041 | 25x50 | 1250 | Standard 0% | 4% cap conflict |
| PRJ-001 | AG-042 | 30x50 | 1500 | Corner 5% | incompatible commission |
| PRJ-001 | AG-043 | 30x60 | 1800 | 60-ft Road 4% | Invite personal-purchase-before-first-sale |
| PRJ-001 | AG-044 | 40x60 | 2400 | Park Facing 3% | Invite rejected Booking |
| PRJ-001 | AG-045 | 25x50 | 1250 | Standard 0% | Invite cancellation/reopen |
| PRJ-001 | AG-046 | 30x50 | 1500 | Corner 5% | replacement Invite winner |
| PRJ-001 | AG-047 | 30x60 | 1800 | Standard 0% | Royalty finalised by Buyback |
| PRJ-001 | AG-048 | 40x60 | 2400 | Park Facing 3% | source payment <25 + Buyback |
| PRJ-001 | AG-049 | 25x50 | 1250 | Standard 0% | Buyback Pending no acceleration |
| PRJ-001 | AG-050 | 30x50 | 1500 | Corner 5% | Buyback after normal 100% |
| PRJ-001 | AG-051 | 30x60 | 1800 | 60-ft Road 4% | Payment Direct correction 25→24 |
| PRJ-001 | AG-052 | 40x60 | 2400 | Park Facing 3% | Payment 100→99 Invite |
| PRJ-001 | AG-053 | 25x50 | 1250 | Standard 0% | Payment 100→99 Loyalty/Royalty |
| PRJ-001 | AG-054 | 30x50 | 1500 | Corner 5% | Booking 0% Keep Booking extensions |
| PRJ-001 | AG-055 | 30x60 | 1800 | Standard 0% | Booking rejection reason |
| PRJ-001 | AG-056 | 40x60 | 2400 | Park Facing 3% | Change Plot rejection |
| PRJ-001 | AG-057 | 25x50 | 1250 | Standard 0% | Change Plot replacement held by same Customer |
| PRJ-001 | AG-058 | 30x50 | 1500 | Corner 5% | conflicting-process matrix |
| PRJ-001 | AG-059 | 30x60 | 1800 | 60-ft Road 4% | share-change test |
| PRJ-001 | AG-060 | 40x60 | 2400 | Park Facing 3% | commission rule versioning |
| PRJ-002 | CV-025 | 25x50 | 1250 | Standard 0% | Loyalty exhausted repeat purchase |
| PRJ-002 | CV-026 | 30x60 | 1800 | 40-ft Road 2% | Customer recovery + Member Royalty |
| PRJ-002 | CV-027 | 25x50 | 1250 | North Facing 1.5% | converted Member personal purchase |
| PRJ-002 | CV-028 | 30x60 | 1800 | Corner 5% | payment schedule revision |
| PRJ-002 | CV-029 | 25x50 | 1250 | Standard 0% | payment schedule invalid date |
| PRJ-002 | CV-030 | 30x60 | 1800 | 40-ft Road 2% | bank replacement pending |
| PRJ-002 | CV-031 | 25x50 | 1250 | Standard 0% | Aadhaar/PAN duplicate |
| PRJ-002 | CV-032 | 30x60 | 1800 | Corner 5% | Member deactivation open work |
| PRJ-002 | CV-033 | 25x50 | 1250 | Standard 0% | Delivered blocked shares |
| PRJ-002 | CV-034 | 30x60 | 1800 | 40-ft Road 2% | Delivered reopen |
| PRJ-002 | CV-035 | 25x50 | 1250 | Standard 0% | same-Plot concurrent Booking |
| PRJ-002 | CV-036 | 30x60 | 1800 | Corner 5% | external-reference chain |
| PRJ-005 | LH-001 | 30x60 | 1800 | Standard 0% | Completed Project historical correction |
| PRJ-005 | LH-002 | 30x60 | 1800 | Park Facing 3% | Completed Project new Hold block |
| PRJ-005 | LH-003 | 25x50 | 1250 | Standard 0% | Allotment conditional Patta fields |
| PRJ-005 | LH-004 | 25x50 | 1250 | Corner 5% | Registry future-date rejection |
| PRJ-005 | LH-005 | 40x60 | 2400 | Standard 0% | audit/role test |
| PRJ-005 | LH-006 | 40x60 | 2400 | Park Facing 3% | migration/reconciliation test |

---

# 48. ADDITIONAL STAFF AND MEMBER DATA

## Additional authorised persons

| ID | Name | Role / Capability | Purpose |
|---|---|---|---|
| ST-SIG-01 | Test Signatory One | Recovery-continuity signatory | MD-unavailable continuity test |
| ST-SIG-02 | Test Signatory Two | Recovery-continuity signatory | second independent signatory |

These are **not** simultaneous ordinary MD accounts.

## Additional Members

| Member ID | Name | Activation | Inviter | Purpose |
|---|---|---|---|---|
| M114 | Leena Kapoor | 2024-02-29 | None | leap-year anniversary |
| M115 | Aakash Talwar | controlled test timestamp | M002 | simultaneous-position boundary |
| M116 | Bhavna Sood | same controlled timestamp as M115 | M002 | simultaneous-position boundary |
| M203 | Rashi Narang | 2027-03-10 | M002 | deactivation/open-work and rule-version test |

---

# 49. ADDITIONAL CUSTOMER DATA

| Customer ID | Name | Purpose |
|---|---|---|
| C321 | Akhil Sachdeva | Invite personal purchase before first third-party sale |
| C322 | Bharti Kalra | Invite rejected Booking / later qualifying sale |
| C323 | Chirag Makkar | Invite cancellation and reopened opportunity |
| C324 | Divya Suri | Royalty first purchase finalised through Approved Buyback |
| C325 | Ekansh Anand | Buyback Pending no acceleration |
| C326 | Falguni Mehra | Buyback after 100% no duplicate |
| C327 | Gagan Bedi | Direct correction below 25 |
| C328 | Hina Gulati | Invite correction below 100 |
| C329 | Imran Sood | Royalty/Loyalty correction below 100 |
| C330 | Juhi Wadhwa | 0% Keep Booking |
| C331 | Keshav Arora | Booking rejection-reason validation |
| C332 | Lavanya Puri | payment-schedule revision |
| C333 | Madhav Khanna | Customer with exhausted Loyalty repeat purchase |
| C334 | Niharika Jain | Customer Recovery Outstanding while Member Royalty exists |
| C335 | Ojas Batra | bank replacement pending |
| C336 | Palak Sethi | Aadhaar/PAN duplicate test |
| C337 | Qasim Ahuja | Member deactivation open-work buyer |
| C338 | Rashi Bansal | share-change test |
| C339 | Sahil Narula | simultaneous Loyalty final-slot test |
| C340 | Tanvi Gera | simultaneous Royalty use test |

Create additional walk-in buyers `W012–W025` as required.

---

# 50. 4% COMMISSION CAP AND COMPATIBILITY — MISSING CORE TESTS

The existing file had a standing integrity check, but it did not create a deliberate **above-4% conflict**. That is not enough.

## CAP-01 — exactly 4% allowed

- Plot: AG-041.
- Selling Member has Invite rate 1%.
- Generate Direct 3% + Invite 1%.
- Total = exactly 4%.
- Accounts approval allowed.

## CAP-02 — deliberately generate >4%

Create controlled invalid attribution/configuration that would generate more than 4%.

Expected:

- Booking Request may exist.
- Accounts approval is blocked.
- visible status: `Commission Conflict — Above 4%`.
- CRM/Admin correction task created.
- no commission becomes Ready/Paid.
- system does **not** trim any component automatically.
- after correction to a valid combination, approval may continue.

## CAP-03 — incompatible components even if total ≤4%

Example attempted combination:

- Member Direct + Customer Royalty on the same Member-closed sale.

Expected:

- block incompatible combination even if arithmetic total is below 4%.
- cap is not a substitute for compatibility.

## CAP-04 — Customer Loyalty must not combine with Member Direct on the same closing action

Expected:

- one final Sold By classification wins.
- no dual reward for one selling action.

---

# 51. INVITE — ADDITIONAL EDGE CASES

## INV-11 — Member self-purchase before first third-party sale

Use M115 or another invited Member whose Invite opportunity is unused.

1. First transaction = Member self-purchase.
2. 100% Payment Received.

Expected:

- buyer-Member Direct 3%.
- inviter gets no Invite.
- Invite opportunity remains unused.
- later first third-party qualifying sale may still generate Invite.

## INV-12 — rejected Booking Request does not consume

- invited Member submits third-party Booking Request;
- Accounts rejects before Booking approval.

Expected:

- no Invite consumption.
- later qualifying Booking may win.

## INV-13 — qualifying Invite sale later formally cancelled

- first third-party sale reaches normal 100%;
- Invite becomes eligible/paid;
- before final completion, sale is formally cancelled.

Expected:

- paid Invite becomes recovery/Accounts adjustment;
- Invite opportunity reopens under the normal cancellation rule;
- later qualifying sale may become the one valid Invite event.

## INV-14 — later sale takes reopened Invite

After INV-13:

- same invited Member completes another qualifying third-party sale.

Expected:

- inviter paid exactly once on the currently valid sale;
- old cancelled record stays historical/superseded;
- no two current Invite records.

## INV-15 — deactivated invited Member reaches milestone

- Booking Request was submitted while Member Active;
- Member deactivated before payment milestone;
- Booking continues;
- milestone reached.

Expected:

- commission remains On Hold — Member Deactivated;
- Invite entitlement is not duplicated;
- reactivation rechecks same record.

---

# 52. ROYALTY — ADDITIONAL EDGE CASES

## ROY-13 — first purchase finalised by Approved Buyback before 100%

C324:

- first approved purchase Sold By Member M002;
- source Payment Received = 40%;
- Approved Buyback occurs.

Expected:

- Royalty Link may become final under the approved alternative first-purchase condition;
- C324 receives the next Royalty position under M002;
- Direct is unaffected except by its own 25% milestone.

## ROY-14 — Customer has exhausted Loyalty but Royalty is still unused

C333:

- Customer already used all 3 Loyalty benefits.
- Customer has a valid unused Royalty Linked Member.
- Customer makes direct repeat purchase.

Expected:

- Customer gets no Loyalty.
- eligible Royalty Member may still receive Royalty.
- exhaustion of Customer Loyalty does not erase another person's Royalty right.

## ROY-15 — Customer Recovery Outstanding but separate Member Royalty exists

C334:

- Customer has Recovery Outstanding from an earlier Customer benefit.
- same Customer makes a qualifying direct purchase.
- Royalty Linked Member is otherwise eligible.

Expected:

- Customer's own Loyalty payout is blocked.
- Member Royalty must be evaluated independently.
- Customer recovery must not silently confiscate a different beneficiary's Royalty.

## ROY-16 — Royalty already consumed, later direct purchases

Run third, fourth and fifth direct purchases after Royalty was used.

Expected:

- no second Royalty.
- Customer Loyalty may continue only if lifetime slots remain.

---

# 53. LOYALTY — ADDITIONAL EDGE CASES

## LOY-07 — mixed lifetime cap with concrete data

One Customer earns:

1. Customer-close Loyalty #1.
2. Customer-close Loyalty #2.
3. repeat-direct Loyalty #3.
4. another repeat-direct purchase.

Expected:

- total consumed = 3.
- fourth Loyalty refused.

## LOY-08 — Customer with 3 Loyalty still buys personally

C333 makes another direct personal purchase.

Expected:

- Booking allowed as Customer buyer.
- no Loyalty.
- Royalty may still apply if independently eligible.

## LOY-09 — simultaneous events with one Loyalty slot left

C339 has exactly 2 consumed Loyalty benefits.

Two separate qualifying Loyalty transactions reach the qualifying milestone at the same verified timestamp.

Expected:

- only one may consume slot #3;
- lower permanent Booking Number wins under the existing concurrency tie rule;
- other event receives no fourth Loyalty.

## LOY-10 — Active Member cannot be Sold By Customer

Attempt to select M202 as Sold By Customer after activation.

Expected:

- blocked;
- Member route must be used;
- no new Customer Loyalty.

---

# 54. BUYBACK — ADDITIONAL ALTERNATIVE-MILESTONE CASES

## BB-06 — Buyback Pending is not Approved Buyback

C325:

- Invite/Royalty/Loyalty normally waits for 100%;
- source Payment Received <100%;
- Buyback Request initiated but remains Pending.

Expected:

- **no acceleration** while merely Pending.
- one-time opportunity remains in its current state.
- no accelerated payout task.

## BB-07 — source Payment Received below 25%

AG-048:

- third-party Member sale;
- source Payment Received = 20%;
- Approved Buyback.

Expected:

- Invite may accelerate if otherwise valid.
- Direct remains pending because Direct 25% was not reached.

## BB-08 — source Payment Received = 0%

Create a valid source Booking at 0%.

If the separate acquisition workflow later reaches Approved Buyback:

Expected under the approved "any Payment Received stage" rule:

- Invite/Royalty/Loyalty may use Approved Buyback as their alternative milestone when otherwise applicable.
- Direct remains unearned.
- Payment Given approval requirements still apply separately.

## BB-09 — Buyback after normal 100%

C326:

- benefit already qualified normally at 100%;
- later Approved Buyback.

Expected:

- no duplicate Invite/Royalty/Loyalty.
- already consumed opportunity stays consumed.

## BB-10 — Buyback after Delivered

Create one legally completed/Delivered source sale then Buyback.

Expected:

- already-earned/consumed benefits remain historical and used;
- Buyback creates acquisition/resale behavior without reopening old benefit.

---

# 55. IMPORTANT OWNER MICRO-DECISION — ROYALTY POSITION AFTER BUYBACK UNWIND

This is the only remaining financial edge discovered during the full mock-data audit.

Current approved rules say:

- a Customer's first purchase may finalise the Royalty Link/position through Approved Buyback;
- if the Buyback later unwinds below 100%, Buyback-accelerated benefits reverse.

But one detail is not explicit:

> If the **first purchase itself** became a final Royalty Link/position only because of Approved Buyback, and that Buyback is later unwound while Payment Received remains below 100%, what happens to that Royalty Link/position?

Do **not** let developers invent this.

### Recommended rule

> Reverse the final Royalty Link back to non-qualifying history, reopen that exact Royalty position for future use, do not renumber existing later positions, and allow the Customer's later genuine first qualifying purchase to establish the new Royalty Linked Member.

This recommendation must be owner-approved before test `ROY-BBU-01` receives a final expected result.

## ROY-BBU-01

- first purchase Sold By M002;
- Payment Received 40%;
- Approved Buyback finalises Royalty position;
- Buyback later unwinds;
- Payment Received still 40%.

Expected result = **OWNER CONFIRMATION REQUIRED** using the rule above.

---

# 56. PAYMENT RECEIVED — ADDITIONAL DETAILED TESTS

## PAY-R-14 — Direct correction below 25 after payout

AG-051:

- reach 25%;
- Direct marked Paid;
- correct cumulative progress to 24%.

Expected:

- Direct becomes Accounts Adjustment Required / Recovery Outstanding as applicable.
- no deletion.

Restore to 25%:

- same entitlement is re-evaluated;
- no duplicate payout record/task.

## PAY-R-15 — Invite 100→99

AG-052:

- Invite becomes valid at 100%;
- then Payment Received correction reduces to 99%.

Expected:

- if paid → adjustment/recovery;
- if unpaid → Milestone Pending;
- opportunity reopens where cancellation/payment reversal rules require;
- restore to 100% → one valid payout only.

## PAY-R-16 — Royalty/Loyalty 100→99

AG-053:

- Royalty and/or Loyalty qualified at 100%;
- correct to 99%;
- restore to 100%.

Expected:

- no double consumption;
- no second payout.

## PAY-R-17 — oldest unpaid instalment first

Create schedule:

- 20%
- 30%
- 50%

Enter cumulative/verified receipts that partially cover the schedule.

Expected:

- payment allocation follows oldest unpaid instalment logic inherited from baseline;
- visible status remains Upcoming / Received / Overdue only.

## PAY-R-18 — no Partially Received status

Part-pay one instalment.

Expected:

- show Scheduled %, Received %, Remaining %.
- status remains Upcoming or Overdue depending on due date.
- do not create a separate `Partially Received` status.

## PAY-R-19 — global duplicate across Received and Given

Use reference `TST-GLOBAL-REF-001` in Payment Received.

Attempt same normalised reference in Payment Given.

Expected:

- second active reference rejected/returns existing conflict;
- global uniqueness is cross-dataset.

---

# 57. PAYMENT SCHEDULE REVISION — ADDITIONAL TESTS

Use C332 / CV-028 and CV-029.

## SCH-01 — valid split

Already received = 25%.

Split remaining 75% into:

- 25%
- 25%
- 25%

Expected:

- allowed with reason and Accounts approval;
- received portion remains locked;
- history preserved.

## SCH-02 — valid combine

Combine two unpaid future instalments.

Expected:

- allowed if total remains 100%;
- chronological dates valid.

## SCH-03 — invalid total 99%

Expected: reject.

## SCH-04 — invalid total 101%

Expected: reject.

## SCH-05 — date before Booking Date

Expected: reject.

## SCH-06 — non-chronological dates

Expected: reject.

## SCH-07 — attempt to reduce already received portion

Expected: reject.

## SCH-08 — missing reason

Expected: reject.

## SCH-09 — Accounts rejects revision

Expected:

- old schedule remains current;
- proposed revision stays History/rejected.

---

# 58. BOOKING REVIEW / 0% / KEEP BOOKING

## BK-01 — 0% approval

Approve Booking at 0%.

Expected:

- allowed;
- absence of payment alone is not rejection.

## BK-02 — repeated Keep Booking extensions

AG-054 / C330:

- approved at 0%;
- extend follow-up multiple times.

Expected:

- no compulsory maximum extension count;
- each extension has new follow-up/decision date and compulsory remark;
- same Dashboard task remains Pending;
- overdue work stays red;
- no automatic cancellation;
- no Plot release;
- full extension history visible.

## BK-03 — invalid rejection reason at 0%

AG-055:

Accounts chooses `Payment Not Received` only because Payment Received = 0%.

Expected:

- reject that reason choice as invalid for that situation.

## BK-04 — valid Payment Not Received rejection reason

Booking Request claimed receipt was already made, but Accounts cannot verify.

Expected:

- `Payment Not Received` may be used.

## BK-05 — frozen review field edit

While Waiting for Booking Approval, attempt direct change to:

- Primary Customer,
- Plot,
- Sold By,
- PLC,
- schedule.

Expected:

- silent edit blocked;
- cancel review version;
- preserve History;
- create new version/task.

## BK-06 — same Plot concurrent Booking approvals

CV-035:

Two Booking Requests for the same Available Plot are approved concurrently.

Expected:

- database locking allows only one active commercial allocation;
- second action fails/reloads deterministic current state.

---

# 59. PAYMENT GIVEN / ACQUISITION — ADDITIONAL CASES

## PG-08 — correction below 20, no new buyer process

Approved acquisition falls from ≥20% Payment Given to 19%.

Expected:

- Plot becomes Not Available;
- remains so until Payment Given returns to ≥20% or acquisition is cancelled.

## PG-09 — correction below 20 with active new buyer process

Same correction, but a new Hold/Booking already exists.

Expected:

- do not auto-cancel/release;
- create `Management Action Required`;
- block further progression;
- management must complete acquisition or unwind buyer process.

## PG-10 — 100→80 after Buying Commission paid

Expected:

- `Payment Pending` visible again;
- Buying Commission → Accounts Adjustment Required;
- new-sale commission → On Hold — Payment Pending.

## PG-11 — maker/checker same account attempts correction

Expected: block.

## PG-12 — valid maker/checker correction

Maker = ST-ACC-01; checker = ST-ACC-02.

Expected: allowed with reason/history.

## PG-13 — revise unpaid Payment Given schedule

Mirror Payment Received revision rules.

---

# 60. ACQUISITION DUPLICATE / RESALE GROUP — ADDITIONAL CASES

## ACQ-05 — exact active duplicate

Same:

- property/project name,
- location,
- property number,
- seller,
- area,
- existing acquisition.

Expected: hard block.

## ACQ-06 — likely duplicate

Slight spelling variation but matching seller/location/area/property.

Expected: warning and review, not silent duplicate creation.

## ACQ-07 — second active acquisition on same property

Expected: block.

## ACQ-08 — cancel acquisition before new buyer process

Expected:

- `Not Available — Deal Cancelled`;
- not sellable;
- Payment Given history retained;
- Accounts adjustment work if payment occurred.

## ACQ-09 — try to cancel acquisition while new buyer Hold/Booking exists

Expected:

- simple cancellation blocked;
- buyer process must first be unwound or acquisition completed.

## ACQ-10 — External Resale Property Group

After valid external Purchase for Resale:

Expected:

- actual Property/Project Name retained;
- Source = External Acquisition;
- RESALE-only behavior;
- cannot be treated as a fake normal Project;
- cannot release unrelated inventory.

---

# 61. BUYING COMMISSION — ADDITIONAL CASES

## BUY-01 — exactly 5%

Expected: allowed after approval.

## BUY-02 — 5.01%

Expected: blocked by hard maximum.

## BUY-03 — second beneficiary attempt

One acquisition already has beneficiary M112.

Attempt add C304 as second beneficiary.

Expected: block.

## BUY-04 — Primary Customer of Buyback as beneficiary

Expected: block.

## BUY-05 — Additional Customer of Buyback as beneficiary

Expected: block.

## BUY-06 — percentage correction after approval

Change approved Buying % from 4.5% to 3.5%.

Expected:

- MD/Admin approval;
- reason compulsory;
- old/new history;
- no silent overwrite.

## BUY-07 — Paid Early Buying Commission

- below 100% Payment Given;
- MD approves Paid Early.

Expected:

- one payment only;
- normal 100% later does not create duplicate.

---

# 62. CHANGE PLOT — MISSING STAGES AND REJECTION PATHS

## CP-03 — Enquiry changes Project/Plot

Expected:

- allowed;
- old interest remains History;
- no Accounts approval.

## CP-04 — Hold moves to another Available Plot

Expected:

- same Customer;
- remaining Hold time continues, not reset;
- old Plot returns using restriction rule;
- no Accounts approval.

## CP-05 — Booking Change Plot rejected

AG-056:

Expected:

- original Booking/Plot fully restored;
- replacement Plot returns to previous state/restriction;
- rejection remark compulsory;
- temporary replacement PLC snapshot discarded.

## CP-06 — replacement already held by same Customer

AG-057:

Expected:

- use that Customer's Hold PLC snapshot, not latest PLC.

## CP-07 — replacement blocked during review

While Change Plot Pending:

- another Hold/Booking attempts replacement Plot.

Expected: blocked.

## CP-08 — old Plot stays allocated while review pending

Expected visible: `Change Plot Under Process`.

---

# 63. MAJOR PROCESS CONFLICT MATRIX

Corrected v3.1 permits only one major conflicting process active per Booking:

1. Refund Pending
2. Change Plot Pending
3. Buyback Pending
4. Primary Customer Change Under Review
5. Sold By Correction Under Review

Test **all 10 pair combinations**.

For every pair:

- start process A;
- attempt process B before A closes.

Expected:

- second major process blocked;
- no overlapping state corruption;
- after A is formally closed/withdrawn, B may be initiated if otherwise eligible.

Use AG-058 and cloned/synthetic Bookings.

---

# 64. OWNERSHIP SHARE CHANGE — MISSING CASES

## SHR-01 — pre-Delivered valid share change

C338:

- two buyers 60/40;
- change to 70/30 before Delivered.

Expected:

- CRM may prepare change;
- reason compulsory;
- crucial-action second confirmation;
- old/new History;
- no extra Admin approval solely for share change.

## SHR-02 — invalid new total

Change to 70/20.

Expected: block.

## SHR-03 — after Delivered normal change

Expected: blocked.

## SHR-04 — exceptional post-Delivered correction

Expected:

- only authorised exceptional correction;
- reason/audit;
- no silent historical rewrite.

---

# 65. MEMBER DEACTIVATION — OPEN-WORK COVERAGE

Use M203 or M113 with all types of open work.

Before deactivation create:

- Active Enquiry;
- Active Customer Hold;
- Pending Member Hold Request;
- Booking Request submitted while Active;
- unpaid commission;
- portal session.

On deactivation expected:

1. portal access immediately disabled;
2. no new Member Enquiry/Hold Request/Member-linked Booking Request;
3. unpaid commission On Hold — Member Deactivated;
4. existing network positions remain;
5. existing Enquiries become Company records assigned to CRM;
6. existing Customer Hold remains valid and CRM-managed;
7. pending Member Hold Request enters CRM review;
8. Booking Request submitted while Active may continue Accounts review;
9. any unpaid commission from it stays held;
10. reactivation rechecks same commission, no duplicate.

---

# 66. AADHAAR / PAN / BANK — MISSING DATA-CONTROL TESTS

## KYC-01 — Aadhaar masking

Normal staff sees last four digits only.

## KYC-02 — full Aadhaar access

Only specifically authorised MD/Admin may view full value.

Expected:

- every full-view access logged.

## KYC-03 — Booking Request without Aadhaar

Expected: allowed.

## KYC-04 — final buyer at 100%

Aadhaar/final-buyer requirement is completed in the final-buyer process at 100%.

## KYC-05 — Aadhaar duplicate

Attempt same normalised Aadhaar on C336 and another Person.

Expected: duplicate warning/block per identity logic.

## KYC-06 — PAN duplicate

Same for PAN.

## KYC-07 — PAN status consistency

- PAN Available + empty PAN → invalid.
- PAN Not Available + populated PAN → invalid.

## BANK-01 — replacement bank Pending while old bank Verified

C335 / Member beneficiary:

Expected:

- old Verified bank remains active;
- Ready commission not automatically held merely because replacement is Pending;
- Accounts may pay only to a currently Verified bank.

## BANK-02 — new bank approved

Expected:

- new bank becomes active;
- old bank moves to History.

## BANK-03 — no verified bank at all

Expected:

- payout held until verified bank exists.

---

# 67. PERSON MERGE — ADDITIONAL CASES

## MERGE-02 — two Active Members

Attempt ordinary merge of two Active Member profiles.

Expected: block.

One Member must first be deactivated; network migration requires MD approval.

## MERGE-03 — merge causes >3 open positions

Two duplicate Person profiles each have open Holds/Requests.

After merge total open positions >3.

Expected:

- existing positions may remain temporarily;
- no new Hold/Request allowed;
- only after count returns within limit or Admin/MD exception.

## MERGE-04 — conflicting Royalty history

Two duplicate Customer profiles show different provisional/historical Royalty information.

Expected:

- genuine first qualifying purchase across merged identity determines one current Royalty Link;
- duplicates do not create two Royalty opportunities.

---

# 68. PROJECT / PLOT MASTER — MISSING CASES

## PRJ-05 — Completed Project

PRJ-005:

- attempt new normal Hold/Booking → blocked;
- authorised historical correction → allowed with audit.

## PRJ-06 — Available (Resale) is derived

Return a RESALE Plot.

Expected:

- display `Available (Resale)` where allowed;
- do not create a permanent Project status named Available (Resale).

## PLOT-10 — uniqueness includes Plot Type

Test:
- same Project + same Plot Type + same Plot Number → blocked.
- same Plot Number in different Project → allowed.
- same number with genuinely different Plot Type follows the approved uniqueness key.

## PLOT-11 — Make Available & Hold combined action

Expected:

- combined action does not exist / cannot be used.
- user must first Make Available with reason/history, then Hold with Customer validation.

## BULK-01 — controlled grid

Prepare multiple Plots through the controlled Excel-style CRM grid.

Expected: validations apply.

## BULK-02 — routine user CSV upload

Expected: unavailable/blocked.

## BULK-03 — one controlled migration/import

Expected:

- pre-go-live validation;
- reconciliation;
- signed result.

---

# 69. ALLOTMENT / REGISTRY / DELIVERED — ADDITIONAL CASES

## DEL-03 — Allotment route conditional fields

LH-003:

- Allotment Given = Yes → date/number/recipient required.
- Patta Issued = Yes → Patta Date required.
- Patta Issued = Don't Know → no fake Patta Date required.

## DEL-04 — Registry route

LH-004:

- Advocate Name required.
- Registry Date cannot be future.

## DEL-05 — both routes attempted

Expected:

- do not create a third Allotment-then-Registry mandatory route.
- one selected completion route governs CRM Delivered.

## DEL-06 — shares not 100%

CV-033:

Expected: Delivered blocked.

## DEL-07 — reopen incorrect Delivered

CV-034:

Expected:

- MD/Admin only;
- compulsory reason;
- complete History;
- no hard deletion.

## DEL-08 — duplicate Delivered click

Expected: Delivered once only.

---

# 70. STAFF AUTHENTICATION / SECURITY / LIFECYCLE

These are system UAT cases rather than property mock records, but they must be in the same test plan.

## AUTH-01 — one ordinary MD

Attempt to create/retain two ordinary active MD accounts.

Expected: blocked under normal operation.

## AUTH-02 — Admin cannot alter/reset MD

Expected: blocked.

## AUTH-03 — MD unavailable recovery continuity

Use ST-SIG-01 + ST-SIG-02.

Expected:

- documented recovery/transfer procedure can be approved;
- does not create two normal MD accounts.

## AUTH-04 — MFA

MD/Admin without MFA completion cannot access protected session.

## AUTH-05 — password minimum

<10 characters → reject.

## AUTH-06 — password not visible

Password never appears in audit/log.

## AUTH-07 — staff self-password change

Expected: unavailable unless a future approved rule changes it.

## AUTH-08 — password reset

Expected: all old sessions invalidated.

## AUTH-09 — Member login identifier

Mobile alone is insufficient; Member ID required.

## AUTH-10 — invalid login message

Invalid Member ID and invalid password use same generic error.

## AUTH-11 — rate limit

Repeated failed attempts trigger configured rate limiting.

## AUTH-12 — planned staff deactivation

Show open work and require reassignment before normal disable.

## AUTH-13 — Emergency Disable

MD/Admin disables immediately with reason.

Expected:

- login blocked;
- open work → Unassigned Review;
- reassign later;
- historical actor identity unchanged.

---

# 71. FIELD-LEVEL ROLE / PERMISSION NEGATIVE TESTS

Attempt prohibited actions deliberately.

| Test | User | Attempt | Expected |
|---|---|---|---|
| PERM-01 | Member | approve Booking | blocked |
| PERM-02 | Member | confirm Payment Received | blocked |
| PERM-03 | Member | change commission | blocked |
| PERM-04 | CRM | mark commission Paid | blocked |
| PERM-05 | PC | approve financial correction | blocked |
| PERM-06 | MIS | edit Booking | blocked |
| PERM-07 | normal staff | full Aadhaar | blocked/masked |
| PERM-08 | unauthorised user | export sensitive report | blocked |
| PERM-09 | Accounts maker | approve own Payment Given correction | blocked where maker/checker applies |
| PERM-10 | Admin | reset/alter MD account | blocked |

Every denied attempt should be auditable where appropriate.

---

# 72. TASK ENGINE — MISSING CASES

## TASK-01 — duplicate task key

Same Record + same Purpose requested twice.

Expected: one Pending task only.

## TASK-02 — same record, different purpose

Expected: separate Pending tasks allowed.

## TASK-03 — rolling Payment Follow-up

Booking has multiple unpaid instalments.

Expected:

- one rolling task;
- due date moves to next unpaid instalment after completion/reschedule;
- no pile of duplicate payment tasks.

## TASK-04 — close condition

Task closes only when required percentage is fully received or process formally closes.

## TASK-05 — audit

Assignment, revision, escalation and automatic closure all logged.

---

# 73. SCHEDULED JOB EDGE DATES

Add:

1. 9th Invite success **before** anniversary-day job → upgrade on that anniversary.
2. 9th Invite success **after** anniversary-day job → wait until next anniversary.
3. same for Royalty.
4. 29-Feb Member M114 → 28-Feb anniversary in non-leap year.
5. Hold expires exactly at stored expiry.
6. Hold Request created just before cut-off.
7. Hold Request created just after cut-off.
8. overdue at midnight after due date.
9. reminder exactly 7 days before due date.
10. job server down across due time, then recovery.
11. retry same run → no duplicate task/cycle.
12. job failure visible in monitoring / last-success information.

---

# 74. EXTERNAL REFERENCE CORRECTION — EXPANDED CASES

The earlier test covered Payment Received/Given/commission. Add:

- refund reference correction;
- Buyback reference correction;
- acquisition correction reference;
- commission Paid Early reference;
- recovery external reference.

## REF-CHAIN

Create three generations:

`REF-A` → superseded by `REF-B` → superseded by `REF-C`.

Expected:

- complete chain preserved;
- only current active reference is treated as current;
- action date and system entry timestamp remain separate;
- no delete/overwrite.

Use CV-036.

---

# 75. COMMISSION RECORD LIFECYCLE

For one corrected commission, verify:

- Current Record Yes/No
- Effective From
- Effective To
- Closed Reason
- Superseded By
- External Processing Completed Yes/No

Expected:

- only one current record for same Booking + commission type + beneficiary role;
- old records remain immutable history.

---

# 76. COMMISSION RULE VERSIONING

Use AG-060.

Create:

- Booking A under Commission Rule Version 1.
- Change configuration/rules to Version 2 for new Bookings.
- Create Booking B under Version 2.

Expected:

- Booking A keeps Version 1 generated beneficiaries/rates/status logic unless an audited correction explicitly changes it.
- Booking B uses Version 2.
- future configuration does not silently re-rate historical Booking A.

This is essential for production safety.

---

# 77. SALE-LEVEL PENDING BLOCKS

A Pending major process should not silently release commission opportunities.

Test separately:

- Refund Pending
- Change Plot Pending
- Buyback Pending

Expected while Pending:

- affected commission remains appropriately held/reviewed;
- no second payout task;
- one-time opportunity is not released merely because a request is pending.

When process is withdrawn/rejected:

- original valid commission state resumes without duplication.

---

# 78. CONCURRENCY — EXPANDED

## CON-01 — Invite entitlement

Already in earlier plan: two sales by same invited Member qualify at same verified time.

Expected: one Invite only.

## CON-02 — Loyalty final lifetime slot

C339 has 2/3 Loyalty used.

Two qualifying events hit same timestamp.

Expected: one receives slot #3.

## CON-03 — Royalty one-time opportunity

C340 has one unused Royalty.

Two direct qualifying purchases reach milestone at same time.

Expected:

- lower permanent Booking Number wins;
- Royalty paid once.

## CON-04 — same Customer competing first purchases

Two first-purchase Bookings for same Customer become qualifying at same timestamp.

Expected:

- lower permanent Booking Number determines the valid first qualifying purchase/Royalty link.

## CON-05 — same Plot allocation

Two different users attempt Hold/Booking allocation at same time.

Expected: one active commercial allocation.

---

# 79. OWNER MICRO-DECISION — SAME-TIME COUNTER POSITION ASSIGNMENT

A second deterministic financial edge remains if two **different people** enter the same Member's counter at exactly the same timestamp and the positions cross a rate boundary, for example:

- Invite Position 3 vs 4; or
- Royalty Position 9 vs 10.

The approved documents define atomic allocation, but not the business tie-breaker for **which different person gets which position** when the timestamps are exactly equal.

Do not let the database's random commit order decide a 1% / 0.5% / 0% financial outcome.

### Recommended tie rules

**Invite position allocation**
1. earliest Member Activation timestamp;
2. if exact tie, lower permanent Member ID / activation sequence.

**Royalty position allocation**
1. earliest qualifying first-purchase timestamp;
2. if exact tie, lower permanent Booking Number.

This must be owner-approved before `CON-POS-01` and `CON-POS-02` receive final expected results.

---

# 80. BANK / RECOVERY INTERACTION

## REC-05 — recovery exists, future commission earned

Member has Recovery Outstanding.

New commission becomes eligible.

Expected:

- CRM keeps payout blocked.
- external Accounts may set off against recovery.
- no cash payout until recovery cleared.

## REC-06 — recovery cleared before day 15

Expected:

- status becomes Recovery Cleared;
- no automatic deactivation.

## REC-07 — exact day-15 boundary

Verify whether deactivation occurs only after the allowed 15-calendar-day period expires, not prematurely.

## REC-08 — Customer recovery blocks conversion

Customer with Recovery Outstanding applies for Membership.

Expected: activation blocked until recovery cleared.

---

# 81. PAYOUT TIMELINE / TRANSFER TESTS

## PAYOUT-01 — 7 working days

Create Ready commission with all holds clear.

Expected: payout target falls within 7 working days.

Use configured working calendar; weekends/holidays are not silently counted as working days.

## PAYOUT-02 — no minimum threshold

Create a valid very small percentage entitlement externally.

Expected: no CRM minimum threshold blocks it.

## PAYOUT-03 — separate transfers

Two commissions for same Member become payable same day.

Expected:

- two distinct payout references/transfers;
- no combined transfer.

## PAYOUT-04 — statutory deduction

CRM remains percentage-only.

Expected:

- any statutory deduction handled externally;
- no hardcoded tax percentage in CRM business engine.

---

# 82. REPORT / EXPORT / AUDIT — ADDITIONAL TESTS

## REP-01 — superseded records

Report must count only current commission.

## REP-02 — merged Person

No double-counting.

## REP-03 — Payment Received vs Payment Given

Separate columns/datasets.

## REP-04 — reversed Buyback acceleration

Must not appear as successful current benefit/cycle completion.

## REP-05 — masked export

No Aadhaar/PAN/bank/buyer private data beyond authorised mask.

## REP-06 — export log

Store:

- report
- filters
- timestamp
- user
- row count

## REP-07 — rule-version reporting

Historical Booking remains attributable to its original rule version.

## REP-08 — audit append-only

Attempt hard delete of protected:

- Booking
- Payment
- Commission
- Acquisition
- identity history
- audit entry

Expected: prohibited.

---

# 83. NEGATIVE TESTS FOR EXPLICITLY EXCLUDED FEATURES

The test team must also prove that unapproved features have **not** been silently added.

Do not add/test as required functionality:

1. Project-RERA operational block on Hold/Booking.
2. Member-RERA selling block beyond the approved commission-hold behavior.
3. Agreement-for-Sale checkpoint before Payment Received >10%.
4. Customer portal.
5. Customer service-request module.
6. Customer/Member document upload module.
7. Standalone calculator.
8. Automatic cancellation after a fixed number of Keep Booking extensions.
9. Separate `Partially Received` instalment status.
10. Excess Receipt percentage above 100%.
11. Automatic bank-change hold merely because replacement bank is Pending.
12. generic rename of `Payment Pending` to `Acquisition Payment Pending`.
13. family/relative automatic self-purchase classification.
14. special 50% ownership self-purchase test.
15. compulsory Allotment-then-Registry third completion route.

**Exception:** the earlier exclusion of mandatory approval for Paid Early is superseded by the newly approved change. Paid Early now **does require MD approval**.

---

# 84. MIGRATION / RECONCILIATION UAT

If any old test or real data exists:

1. identify old Enquiry-based Royalty links;
2. identify old annual counter records;
3. identify old Paid Early behavior;
4. identify Customer-to-Member conversions;
5. identify recoveries;
6. map old to new rule version;
7. run reconciliation;
8. preserve old/new/history/reason;
9. obtain signed migration result.

No silent bulk overwrite.

---

# 85. BACKUP / ROLLBACK / SECURITY GO-LIVE TESTS

These are not mock property records but they are required before go-live.

Test:

- backup successfully created;
- restore into safe environment;
- restored counts reconcile;
- critical Booking/Payment/Commission history intact;
- scheduled jobs recover after restore;
- rollback procedure documented;
- MD/Admin MFA works;
- field-level permissions pass;
- production credentials controlled by Company;
- vendor access can be revoked;
- UAT sign-off recorded.

---

# 86. UPDATED STANDING INTEGRITY CHECKS

Add these to the earlier standing checks. All must return zero violations.

28. A Booking with `Commission Conflict — Above 4%` has a Ready/Paid sale commission.
29. An incompatible commission combination exists merely because total percentage is ≤4%.
30. An invited Member personal purchase consumed Invite.
31. A rejected Booking Request consumed Invite.
32. A Buyback Pending record accelerated Invite/Royalty/Loyalty.
33. Buyback accelerated Direct.
34. A Customer with exhausted Loyalty received a fourth Loyalty.
35. A Customer recovery blocked a different Member's otherwise-valid Royalty without an independent sale-level reason.
36. A Payment Given correction below 20% failed to apply the correct buyer/no-buyer branch.
37. One property has two active acquisitions.
38. An acquisition has two Buying beneficiaries.
39. A Buyback Customer is their own Buying beneficiary.
40. A completed Project accepted a new normal Hold/Booking.
41. A combined Make Available & Hold action bypassed the two-step rule.
42. A bank replacement Pending disabled an existing verified bank.
43. A normal user viewed full Aadhaar.
44. Two Active Members were ordinarily merged.
45. A merge-created >3-open-position Person was allowed a new Hold without exception.
46. Two major conflicting processes are active on one Booking.
47. A protected record was hard-deleted.
48. Historical Booking changed commission rule version because configuration changed later.
49. One rolling Payment Follow-up spawned duplicate same-purpose tasks.
50. Paid Early exists without MD approval.
51. Recovery Outstanding Member received new cash payout.
52. Different commissions were combined into one payout reference.
53. Position allocation at a rate boundary is non-deterministic.

---

# 87. UPDATED END-STATE REQUIRED PROOF

In addition to Section 42, the completed UAT must show:

- one deliberate >4% conflict and successful correction;
- one incompatible commission combination blocked;
- one personal Member purchase that leaves Invite unused;
- one rejected Booking that leaves Invite unused;
- one Invite reopened after normal cancellation and later used once;
- one Royalty first-purchase link finalised through Approved Buyback;
- one Buyback Pending case with no acceleration;
- one Buyback at source payment below 25 proving Direct not accelerated;
- one 25→24 Direct correction;
- one 100→99 Invite correction;
- one 100→99 Royalty/Loyalty correction;
- one valid and one invalid Payment schedule revision;
- one Payment Given <20 correction with no buyer;
- one Payment Given <20 correction with active buyer process;
- one exact acquisition duplicate block;
- one likely acquisition duplicate warning;
- one second Buying beneficiary block;
- one 5% Buying Commission allowed;
- one 5.01% Buying Commission blocked;
- one Enquiry-stage Change Plot;
- one Hold-stage Change Plot;
- one rejected Booking Change Plot;
- all ten major-process conflict pairs blocked;
- one pre-Delivered share change;
- one post-Delivered share change blocked;
- one Member deactivation with full open-work redistribution;
- one bank replacement Pending while old bank remains usable;
- one Aadhaar duplicate;
- one PAN duplicate;
- one two-Active-Member merge rejection;
- one merge producing >3 open positions;
- one Completed Project block;
- one Allotment conditional-field case;
- one Registry future-date rejection;
- one commission rule-version retention test;
- one three-generation External Reference correction chain;
- one backup/restore reconciliation;
- one permission-denial matrix run.

---

# 88. FINAL EXECUTION RULE

> The test plan is complete only after the two micro-decisions in Sections 55 and 79 are explicitly approved and inserted into the business-change document. Until then, developers may implement all other scenarios, but they must not invent the financial behavior for those two exact edge cases.
