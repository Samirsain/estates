# Full audit tracker — 7 Nov 2026
Status: [ ] open · [x] fixed · [-] skipped/not a bug (reason) · [=] duplicate of
Rules: never run prisma migrate dev / reset; migrations are written, not applied. Local only, no push.

## Patterns (fix once at the root)
- [x] P1 error shown behind open modal (Members, Plots, Acquisitions, Enquiries, Rewards, Admin, Dashboard, Projects)
- [x] P2 run() without try/finally → busy stuck (bookings, plots, projects, dashboard, …)
- [x] P3 can(actor.role, …) without extraPermissions in pages
- [x] P4 raw Prisma errors pass through toResult (members/actions etc.)

## S — Security / platform
- [x] S01 auth.ts:77 recovery phrase hardcoded fallback, unlimited guesses; health lacks RECOVERY_KEY
- [x] S02 administration/actions.ts:565 STAFF_MANAGE extra can reset MD password
- [x] S03 login/actions.ts:147 forgot-password no audit, clears lockout
- [x] S04 login/actions.ts:83 failed-login counter race
- [x] S05 current-actor.ts:61 PERMISSION_DENIED reason ' attempted '
- [x] S06 members/page.tsx:63 full mobile in Members list
- [x] S07 potential-investors/actions.ts no permission action
- [x] S08 command.ts:95 idempotency outside tx, upsert update:{}
- [x] S09 command.ts:145 expired key not refreshed
- [x] S10 command.ts:125 runCommand audit not redacted
- [x] S11 customers/[id]/page.tsx:387, members/[id]/page.tsx:895 editor gets full mobile
- [x] S12 p/[slug]/page.tsx:74 public portal 2s refresh, pool exhaustion
- [x] S13 auth.ts:117 rate-limit Map unbounded
- [x] S14 migration/backfill-classification.ts:105 tx 5s timeout
- [x] S15 api/health/route.ts:33 leaks DB error text
- [x] S16 members/trip-actions.ts:74 lookup before requireStaff
- [x] S17 jobs.ts:333 isJobName uses `in`
- [x] S18 login/actions.ts:170 sign out keeps token valid
- [x] S19 public-portal.ts slug empty/duplicate (=D10)

## B1 — Booking/Payment/Hold services
- [x] B1-01 payment-service:593 revision approval drops payments confirmed meanwhile
- [x] B1-02 payment-service:428 correction reverses by seq on current schedule
- [x] B1-03 payment-service:482 correction no status/activeProcess check
- [x] B1-04 payment-service:412 correction check before lock
- [x] B1-05 booking-service:656 maker-checker vs reviser
- [x] B1-06 booking-service:459 revise changes Primary w/o hold owner / limit check
- [x] B1-07 change-plot-service:76 same-customer Hold stays ACTIVE
- [x] B1-08 hold-service:310 requiresAdmin stale; decisions no plot lock
- [x] B1-09 hold-service:534 expired mark rolled back by blocked()
- [x] B1-10 payment-service:191 + cancellation-service:166 duplicate active reference race
- [x] B1-12 command.ts:254 max+1 reference unique conflict raw error
- [x] B1-13 cancellation-service:245 approval leaves completion tasks/revision; revise on CANCELLED
- [x] B1-14 change-plot-service:364 completion tasks not synced
- [x] B1-15 completion-service:48 Complete Customer Details recreated when complete
- [x] B1-16 completion-service:449 reopenDelivered ignores activeProcess
- [x] B1-17 payment-service:139 follow-up previous+current never combined
- [x] B1-18 payment-service:294 non-numeric % DecimalError; change-plot appliedPercent
- [x] B1-19 enquiry-service:24 linkOrCreatePerson mobile not normalised (also B2-11)
- [x] B1-20 enquiry-service:280 closeEnquiry no status check, any task
- [x] B1-x1 recovery-service setOffRecordId overwritten
- [x] B1-x2 booking review snapshot PLC 3dp
- [x] B1-x3 cancelHold stale status check
- [-] B1-x4 (not a bug: the conflict task is raised only when previewCommission really conflicts) approve catch raises Commission Conflict after any CommandError

## B2 — Commission/Rewards/Network services
- [x] B2-01 commission-service:990 markCommissionPaid no lock
- [x] B2-02 trip-service:513 markTripTravelled NON_FAMILY stamp
- [x] B2-03 trip-service:203 sold-by correction keeps old reference credit
- [x] B2-04 commission-service:786 + domain commission.ts:697 paid early bypasses holds (D02)
- [x] B2-05 commission-service:654 Verify task not closed when leaving READY
- [x] B2-06 bank-service:155 bank verified doesn't reassess
- [x] B2-07 commission-service:1265 cancel leaves T20/T23 open
- [x] B2-08 bank-service:149 superseded pending record task open
- [x] B2-09 (P2002 retry in runCommand) trip-service:265 openBucketIfNone race
- [x] B2-10 (P2002 retry in runCommand) task-service:32 ensureTask race
- [x] B2-12 control-review-service:71 no assertIndependent
- [x] B2-13 trip-service:614 wind-down only current version
- [x] B2-14 commission-service:648 T23 closed with false note
- [x] B2-15 commission-settings-service:212 idempotency payload missing inventory

## B3 — Buyback/Land/Project/Report/Merge/Admin services
- [x] B3-01 acquisition-service:728/1244 reject/cancel no reassessCommission
- [x] B3-02 acquisition-service:478 correctPaymentGiven check before lock
- [x] B3-03 refreshBuyingCommission ignores acquisition status
- [x] B3-04 merge-service:252 applyMerge no mergeStatus recheck
- [x] B3-05 merge-service:199 decide no lock
- [x] B3-06 acquisition-service:1313 recordBuyingCommission no guards
- [x] B3-07 acquisition-service:485 correction no status guard
- [x] B3-08 acquisition-service:569 back to 100% no refresh
- [x] B3-09 acquisition-service:553 / domain acquisition.ts:247 Plot not restored ≥20% (D03)
- [x] B3-10 acquisition-service:283 resaleGroupId unchecked
- [x] B3-11 land-inquiry-service:355 version race
- [x] B3-12 project-service:325 activation releases buyback-held plots
- [x] B3-13 land-inquiry-service:212 parseAmount comma+3dp throws
- [x] B3-14 report-service filters ignored (=U9-01)
- [-] B3-15 (survivor without a Customer profile has no list to hold it; the merged-away Person keeps its CUS id and points to the survivor) merge-service:258 legacy IDs dropped
- [x] B3-16 admin-service:11 openWork ignores Land Inquiries
- [x] B3-17 land-inquiry-service:164 assignedToId unchecked
- [x] B3-18 land-inquiry-service:363 owners/jamabandi not audited
- [x] B3-19 project-service:107 type→COMMERCIAL with residential plots
- [x] B3-20 inventory-service:55 road width NaN (=U7-15)

## D — Domain
- [x] D01 schedule-edit addDays blank date crash
- [x] D04 inventory.ts:40 calculateAreas NaN/Infinity/abc
- [x] D05 booking.ts:189 progressAfter 2dp message
- [x] D06 acquisition.ts:38 toFixed(2) messages
- [x] D07 inventory.ts:697 Corner for opposite roads
- [x] D08 rate-calculator.ts:239 rupeesInWords ≥100 crore
- [x] D09 commission.ts:155 experienceSince short months
- [x] D10 public-portal.ts slug
- [-] D11 (no hold reason exists for it in the approved model; a paid old beneficiary after a Sold By Correction is already recovered through T23 / Recovery) commission.ts:581 Sold By / Primary change under review no hold
- [x] D12 completion.ts:393 validateFinalBuyers bounds + 2dp
- [x] D13 land-inquiry.ts:199 normaliseMobile leading 0
- [x] D14 trip.ts:32 disabled branch ignores fields
- [x] D15 booking.ts:443 canonicalSnapshot Decimal
- [x] D16 completion.ts:443 SENSITIVE regex too broad

## DB — Schema/migrations
- [x] DB01 (10 Nov) migrate deploy can't build from scratch — README: new DB = db push + db:constraints + migrate resolve --applied for each; applied migrations not rewritten (checksums on the live DB)
- [x] DB02 (10 Nov) migration history ≠ schema — same README path
- [-] DB03 (historical: live DB has all 38 migrations applied, so it ran; only a fresh build meets it, and that now goes through db push) enum rewrite on populated DB
- [x] DB04 acquisition_approval_threshold CHECK vs correction
- [-] DB05 (historical, same reason as DB03) plc migration DRAFT→SUPERSEDED vs CHECK
- [x] DB06 (10 Nov) constraints.sql vs migrations drift — unbanded PlcComponent unique + projectCode trigger added to constraints.sql. Open for the user: Render build runs migrate deploy only, not db:constraints
- [x] DB07 (10 Nov) BookingParty current unique — one_current_party_per_person + one_current_primary_party (constraints.sql)
- [x] DB08 (10 Nov) Hold.frozenRemainingMs Int overflow — Float / DOUBLE PRECISION (migration 20261110120000)
- [-] DB09 (historical, same reason as DB03) royalty tokens migration drops data
- [x] DB10 (10 Nov) index soldByPersonId, BookingParty.personId (migration 20261110120000)
- [x] DB11 (10 Nov) index Acquisition.sourceBookingId, MemberProfile.invitedByMemberId (migration 20261110120000)
- [x] DB12 (10 Nov) PlcComponent places/bounds — validatePlcComponents: ≤100%, ≤4dp; band ≤2dp, <10,00,000; domain.check asserts
- [x] DB13 (10 Nov) one_active_hold_per_plot excludes FROZEN — now ACTIVE+FROZEN (drop + create)
- [x] DB14 (10 Nov) Hold sourcedBy CHECK — sourced_by_person_matches_type
- [-] DB15 (no app path deletes a profile or schedule version; only reset/check tooling does, and it relies on the cascade) cascade deletes on history
- [x] DB16 (10 Nov) Enquiry source CHECK — enquiry_source_person_matches (mirrors validateSource)
- Read-only pre-check 10 Nov: 0 existing rows break DB07/DB13/DB14/DB16 or the PlcComponent unique, so db:constraints applies cleanly.
- NOT applied to the DB: migration 20261110120000 and constraints.sql — waiting for the user.

## U6 — Bookings UI
- [x] U6-01 schedule step 0.01 (fixed 7 Nov)
- [x] U6-02 load.ts:172 paymentReceivedPercent 2dp
- [x] U6-03 SharesDialog includes FINAL_REGISTRATION
- [x] U6-04 detail panel onAction keeps old notice
- [x] U6-06 actions.ts:973 paymentEntries.percent 2dp
- [x] U6-07 Correct payment date defaults today
- [x] U6-08 Revise request opens blank
- [x] U6-09 More menu ignores activeProcess
- [x] U6-11 MD Paid Early button missing
- [x] U6-12 FinalBuyersDialog no Aadhaar/PAN, seeds commercial
- [x] U6-13 hasPayment 2dp
- [x] U6-14 new booking schedule minDate today
- [x] U6-15 Deliver two commands
- [x] U6-16 MD Sold By Correction two commands
- [x] U6-17 openDialog stale response

## U7 — Plots/Projects/Calculator UI
- [x] U7-01 Prepare Inventory no area reason field
- [x] U7-04 Hold form keeps last Requested By
- [x] U7-07 calculator includes BUYBACK_COMPLETED
- [x] U7-08 calculator first split vs total
- [x] U7-09 calculator today's PLC for sold plot
- [x] U7-10 calculator caps
- [x] U7-11 commission settings form prefilled from Active
- [x] U7-12 plot page Start Booking without bookable
- [x] U7-13 decideHoldExtensionAction always HOLD_EXTEND_FURTHER
- [x] U7-14 exactAreaReason sent after clear
- [x] U7-16 parseDimension inches ≥12
- [x] U7-17 (data no longer loaded; the unreachable dialog code is left as a cleanup) dead pending/booked dialogs
- [x] U7-18 plot page dead actions list

## U8 — Members/Customers/Enquiries UI
- [x] U8-03 InviterDialog defaults to 3% Club
- [x] U8-04 add-task closes before result
- [x] U8-09 bank save closes Edit details
- [x] U8-10 investor alt mobile can't clear
- [x] U8-11 enquiries Follow-up column misses first date
- [x] U8-12 follow-up date past allowed
- [x] U8-13 Mark Delivered stale error
- [x] U8-14 fixFor AADHAAR_PENDING
- [x] U8-16 PAN reveal gated on AADHAAR_FULL
- [x] U8-17 Customer for counts wrong
- [x] U8-18 members page 300 cap
- [-] U8-19 (dead code, no user-facing effect; removing ~400 lines is a separate cleanup) dead MemberDetailPanel
- [x] U8-20 Add Member toggle loses typed fields

## U9 — Buyback/Land/Admin/Dashboard/Reports UI + components
- [x] U9-02 admin open work counts finished work
- [x] U9-03 reports Bookings full mobile
- [x] U9-04 archived land inquiry visible
- [x] U9-05 (10 Nov) completeTaskAction approval tasks/ownership — Done refuses decision tasks and tasks outside the actor's Task List scope; Revise too
- [x] U9-07 (10 Nov) Add Task shown to PC — button needs TASK_CREATE (with extras); safely() already returns the throw
- [x] U9-08 (10 Nov) Papers back UTC date — istDay
- [x] U9-09 (10 Nov) self row reset/disable shown — also hidden on MD rows for non-MD
- [x] U9-10 (10 Nov) person-picker Escape closes dialog
- [x] U9-11 (10 Nov) arranged-by picker any person — list filtered by type; createAcquisition refuses a non-Member/Customer arranger
- [x] U9-12 (10 Nov) acquisitions people cap 500 — cap removed on both pages (ponytail note: server search if thousands)
- [x] U9-13 (10 Nov) Raise Merge options replaced — picks kept across searches
- [x] U9-14 reports heading follows selection
- [x] U9-15 (10 Nov) app-shell first tap swallowed — rail intercept only ≥768px
- [x] U9-16 land inquiries list full dealer mobile
- [x] U9-17 (10 Nov) rewards-overview UTC date — istDay; DOB max too
- [x] U9-18 (10 Nov) replace first underscore — replaceAll
- [x] U9-19 (10 Nov) task list hides personal tasks — non-MD shows everything the server scoped
- [x] U9-20 (10 Nov) bell link needs STAFF_MANAGE — link and StaffAccount hrefs only with STAFF_MANAGE
- [x] U9-x1 (10 Nov) header search no handler — exact Customer ID / Member ID / Booking No / Request No / Plot No opens it (src/lib/find-record.ts)
- [x] U9-x2 (10 Nov) show password not keyboard reachable
