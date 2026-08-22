-- Database controls Prisma's schema language cannot express.
-- Run after every `prisma db push`:  npm run db:constraints

-- PRD §3.1 — exactly one active MD account exists in normal operation.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_md"
  ON "StaffAccount" ("role")
  WHERE "role" = 'MD' AND "status" = 'ACTIVE';

-- PRD §14.2 — PAN Not Available requires the PAN Number to be empty.
ALTER TABLE "Person" DROP CONSTRAINT IF EXISTS "pan_status_matches_value";
ALTER TABLE "Person" ADD CONSTRAINT "pan_status_matches_value"
  CHECK (("panStatus" = 'NOT_AVAILABLE' AND "panCipher" IS NULL)
      OR ("panStatus" <> 'NOT_AVAILABLE' AND "panCipher" IS NOT NULL));

-- PRD §14.1 — Aadhaar Pending means no valid number is recorded.
ALTER TABLE "Person" DROP CONSTRAINT IF EXISTS "aadhaar_status_matches_value";
ALTER TABLE "Person" ADD CONSTRAINT "aadhaar_status_matches_value"
  CHECK (("aadhaarStatus" = 'PENDING' AND "aadhaarCipher" IS NULL)
      OR ("aadhaarStatus" <> 'PENDING' AND "aadhaarCipher" IS NOT NULL));

-- PRD §6.5 — combined lifetime maximum of three Loyalty Bonuses.
ALTER TABLE "CustomerProfile" DROP CONSTRAINT IF EXISTS "loyalty_slots_max_three";
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "loyalty_slots_max_three"
  CHECK ("loyaltySlotsConsumed" BETWEEN 0 AND 3);

-- ---------------------------------------------------------------- Phase 2

-- ARCHITECTURE §7.1 — one active commercial allocation per Plot.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_hold_per_plot"
  ON "Hold" ("plotId")
  WHERE "status" = 'ACTIVE';

-- PRD §7.1 / ARCHITECTURE §5.2 — one Active Enquiry per Person + Project + Plot,
-- and one Active general Enquiry per Person + Project. COALESCE is required
-- because Postgres treats NULL plotIds as distinct, which would let two
-- concurrent general Enquiries through.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_enquiry_per_person_project_plot"
  ON "Enquiry" ("personId", "projectId", (COALESCE("plotId", '')))
  WHERE "status" = 'ACTIVE';

-- PRD §8.3 — only one Pending Hold Request for the same Customer and Plot.
-- Different Customers may still request the same Plot.
CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_request_per_person_plot"
  ON "HoldRequest" ("personId", "plotId")
  WHERE "status" = 'PENDING';

-- PRD §20 — one Pending task per Record + Purpose.
CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_task_per_record_purpose"
  ON "Task" ("recordKind", "recordId", "purpose")
  WHERE "status" = 'PENDING';

-- PRD §16.2 — an irregular Plot's exact-area override carries a compulsory reason.
ALTER TABLE "Plot" DROP CONSTRAINT IF EXISTS "exact_area_needs_reason";
ALTER TABLE "Plot" ADD CONSTRAINT "exact_area_needs_reason"
  CHECK ("exactAreaSqFt" IS NULL OR ("exactAreaReason" IS NOT NULL AND length(btrim("exactAreaReason")) > 0));

ALTER TABLE "Plot" DROP CONSTRAINT IF EXISTS "area_is_positive";
ALTER TABLE "Plot" ADD CONSTRAINT "area_is_positive"
  CHECK ("areaSqFt" > 0 AND "areaSqYd" > 0 AND "areaSqM" > 0);

-- DESIGN §7.4 / PRD §15 — a sale-blocking restriction always states its reason.
ALTER TABLE "Plot" DROP CONSTRAINT IF EXISTS "restriction_needs_reason";
ALTER TABLE "Plot" ADD CONSTRAINT "restriction_needs_reason"
  CHECK ("restriction" NOT IN ('NOT_FOR_SALE', 'PLEDGE')
      OR ("restrictionReason" IS NOT NULL AND length(btrim("restrictionReason")) > 0));

-- PRD §16.2 — Road boundary carries a road width; Plot boundary carries the adjacent number.
ALTER TABLE "PlotBoundary" DROP CONSTRAINT IF EXISTS "boundary_details_match_kind";
ALTER TABLE "PlotBoundary" ADD CONSTRAINT "boundary_details_match_kind"
  CHECK (("kind" <> 'ROAD' OR "roadWidthFt" IS NOT NULL)
     AND ("kind" <> 'PLOT' OR "adjacentPlotNumber" IS NOT NULL));

-- PRD §16.3 — PLC is a percentage and is never negative.
ALTER TABLE "PlcComponent" DROP CONSTRAINT IF EXISTS "plc_percent_non_negative";
ALTER TABLE "PlcComponent" ADD CONSTRAINT "plc_percent_non_negative"
  CHECK ("percent" >= 0);

-- A Hold must expire after it starts.
ALTER TABLE "Hold" DROP CONSTRAINT IF EXISTS "hold_expiry_after_start";
ALTER TABLE "Hold" ADD CONSTRAINT "hold_expiry_after_start"
  CHECK ("expiresAt" > "startsAt");

-- A Person may not be merged into itself.
ALTER TABLE "Person" DROP CONSTRAINT IF EXISTS "merge_not_self";
ALTER TABLE "Person" ADD CONSTRAINT "merge_not_self"
  CHECK ("survivingPersonId" IS NULL OR "survivingPersonId" <> "id");

-- ---------------------------------------------------------------- Phase 3

-- ARCHITECTURE §7.1 — one active commercial allocation per Plot. The request
-- stage counts: a Plot Waiting for Booking Approval is already committed.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_booking_per_plot"
  ON "Booking" ("plotId")
  WHERE "status" IN ('REQUEST_PENDING', 'BOOKED', 'PAYMENT_COMPLETED', 'REFUND_PENDING', 'DELIVERED');

-- PRD §5.2 — the permanent Booking Number exists only after Accounts approval.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "booking_number_after_approval";
ALTER TABLE "Booking" ADD CONSTRAINT "booking_number_after_approval"
  CHECK (("status" IN ('REQUEST_PENDING', 'REQUEST_REJECTED', 'REQUEST_CANCELLED') AND "bookingNumber" IS NULL)
      OR ("status" NOT IN ('REQUEST_PENDING', 'REQUEST_REJECTED', 'REQUEST_CANCELLED') AND "bookingNumber" IS NOT NULL));

-- PRD §10.4 — Payment Received progress can never exceed 100%.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "payment_progress_within_bounds";
ALTER TABLE "Booking" ADD CONSTRAINT "payment_progress_within_bounds"
  CHECK ("paymentReceivedPercent" >= 0 AND "paymentReceivedPercent" <= 100);

-- PRD §11.3 — Sold By Member/Customer names the closer; 3% Club direct does not.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "sold_by_person_matches_type";
ALTER TABLE "Booking" ADD CONSTRAINT "sold_by_person_matches_type"
  CHECK (("soldByType" = 'THREE_PERCENT_CLUB' AND "soldByPersonId" IS NULL)
      OR ("soldByType" <> 'THREE_PERCENT_CLUB' AND "soldByPersonId" IS NOT NULL));

-- PRD §9.1 — one pending review version per Booking. Changing a frozen field
-- cancels this version before the next one is created.
CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_review_version_per_booking"
  ON "BookingReviewVersion" ("bookingId")
  WHERE "status" = 'PENDING';

-- A rejection always carries its reason (PRD §11.5).
ALTER TABLE "BookingReviewVersion" DROP CONSTRAINT IF EXISTS "rejection_needs_reason";
ALTER TABLE "BookingReviewVersion" ADD CONSTRAINT "rejection_needs_reason"
  CHECK ("status" <> 'REJECTED' OR "rejectReason" IS NOT NULL);

-- PRD §10.2 — exactly one live schedule, and at most one revision under review.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_schedule_per_booking"
  ON "PaymentScheduleVersion" ("bookingId")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_schedule_per_booking"
  ON "PaymentScheduleVersion" ("bookingId")
  WHERE "status" = 'PENDING';

-- PRD §10.1 — an instalment carries a positive percentage and can never be
-- credited beyond what it scheduled; the surplus flows to the next instalment.
ALTER TABLE "PaymentInstalment" DROP CONSTRAINT IF EXISTS "instalment_percent_bounds";
ALTER TABLE "PaymentInstalment" ADD CONSTRAINT "instalment_percent_bounds"
  CHECK ("scheduledPercent" > 0 AND "receivedPercent" >= 0 AND "receivedPercent" <= "scheduledPercent");

-- PRD §12.2 — Payment Received This Time is incremental and always positive.
ALTER TABLE "PaymentReceivedEntry" DROP CONSTRAINT IF EXISTS "payment_entry_percent_positive";
ALTER TABLE "PaymentReceivedEntry" ADD CONSTRAINT "payment_entry_percent_positive"
  CHECK ("percent" > 0 AND "percent" <= 100);

-- PRD §10.3 / §24 — one ACTIVE Payment Reference No. globally, across Payment
-- Received and Payment Given, after normalisation. Superseded values remain.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_external_reference"
  ON "ExternalReference" ("normalisedKey")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "ExternalReference" DROP CONSTRAINT IF EXISTS "reference_not_self_replacing";
ALTER TABLE "ExternalReference" ADD CONSTRAINT "reference_not_self_replacing"
  CHECK ("replacesId" IS NULL OR "replacesId" <> "id");

-- PRD §12.3 — one Primary Customer change under review at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_customer_change_per_booking"
  ON "PrimaryCustomerChange" ("bookingId")
  WHERE "status" = 'PENDING';

ALTER TABLE "PrimaryCustomerChange" DROP CONSTRAINT IF EXISTS "customer_change_not_self";
ALTER TABLE "PrimaryCustomerChange" ADD CONSTRAINT "customer_change_not_self"
  CHECK ("fromPersonId" <> "toPersonId");

ALTER TABLE "BookingParty" DROP CONSTRAINT IF EXISTS "share_percent_bounds";
ALTER TABLE "BookingParty" ADD CONSTRAINT "share_percent_bounds"
  CHECK ("sharePercent" IS NULL OR ("sharePercent" > 0 AND "sharePercent" <= 100));

-- PRD §12.1 — a single final buyer may omit the share and is treated as 100%;
-- with two or more buyers every share is compulsory and the total is exactly
-- 100%. Deferred to commit time so a multi-row rewrite is judged as a whole.
CREATE OR REPLACE FUNCTION assert_booking_shares(b_id text, k "PartyKind") RETURNS void AS $$
DECLARE
  n int;
  missing int;
  total numeric;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE "sharePercent" IS NULL), COALESCE(sum("sharePercent"), 0)
    INTO n, missing, total
    FROM "BookingParty"
   WHERE "bookingId" = b_id AND "kind" = k AND "effectiveTo" IS NULL;

  IF n = 0 THEN
    RETURN;
  END IF;

  IF n = 1 THEN
    IF missing = 1 OR total = 100 THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'A single buyer must omit the ownership share or hold exactly 100%%, found %.', total;
  END IF;

  IF missing > 0 THEN
    RAISE EXCEPTION 'Every buyer needs an ownership share when two or more buyers exist.';
  END IF;

  IF total <> 100 THEN
    RAISE EXCEPTION 'Ownership shares must total exactly 100%%, found %.', total;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_booking_shares() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM assert_booking_shares(OLD."bookingId", OLD."kind");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM assert_booking_shares(NEW."bookingId", NEW."kind");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "booking_shares_total_100" ON "BookingParty";
CREATE CONSTRAINT TRIGGER "booking_shares_total_100"
  AFTER INSERT OR UPDATE OR DELETE ON "BookingParty"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_booking_shares();

-- PRD §10.2 / §11.4 — a live payment schedule totals exactly 100%. Superseded
-- and rejected versions are historical and are not re-judged.
CREATE OR REPLACE FUNCTION assert_schedule_total(v_id text) RETURNS void AS $$
DECLARE
  st "ScheduleStatus";
  total numeric;
BEGIN
  SELECT "status" INTO st FROM "PaymentScheduleVersion" WHERE "id" = v_id;
  IF st IS NULL OR st IN ('SUPERSEDED', 'REJECTED') THEN
    RETURN;
  END IF;

  SELECT COALESCE(sum("scheduledPercent"), 0) INTO total
    FROM "PaymentInstalment" WHERE "scheduleVersionId" = v_id;

  IF total <> 100 THEN
    RAISE EXCEPTION 'A payment schedule must total exactly 100%%, found %.', total;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_schedule_instalment() RETURNS trigger AS $$
BEGIN
  PERFORM assert_schedule_total(COALESCE(NEW."scheduleVersionId", OLD."scheduleVersionId"));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_schedule_version() RETURNS trigger AS $$
BEGIN
  PERFORM assert_schedule_total(NEW."id");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "schedule_instalments_total_100" ON "PaymentInstalment";
CREATE CONSTRAINT TRIGGER "schedule_instalments_total_100"
  AFTER INSERT OR UPDATE OR DELETE ON "PaymentInstalment"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_schedule_instalment();

DROP TRIGGER IF EXISTS "schedule_version_total_100" ON "PaymentScheduleVersion";
CREATE CONSTRAINT TRIGGER "schedule_version_total_100"
  AFTER INSERT OR UPDATE ON "PaymentScheduleVersion"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_schedule_version();

-- ---------------------------------------------------------------- Phase 4

-- PRD §6.9 — only one current record per Booking, commission type and
-- beneficiary role. Superseded records stay, and stay visible.
CREATE UNIQUE INDEX IF NOT EXISTS "one_current_commission_per_key"
  ON "CommissionRecord" ("bookingId", "type", "beneficiaryRole")
  WHERE "isCurrent" = true;

-- PRD §6.8 — the entitlement limits are database controls, not a count taken at
-- read time: more than one consumed Invite opportunity per invited Member, more
-- than one consumed Royalty per introduced Customer, and more than three
-- consumed Loyalty slots per Customer must all be impossible.
CREATE UNIQUE INDEX IF NOT EXISTS "one_consumed_opportunity_per_slot"
  ON "CommissionOpportunity" ("kind", "subjectPersonId", "slotIndex")
  WHERE "status" = 'CONSUMED';

ALTER TABLE "CommissionOpportunity" DROP CONSTRAINT IF EXISTS "opportunity_slot_bounds";
ALTER TABLE "CommissionOpportunity" ADD CONSTRAINT "opportunity_slot_bounds"
  CHECK (("kind" = 'LOYALTY' AND "slotIndex" BETWEEN 1 AND 3)
      OR ("kind" <> 'LOYALTY' AND "slotIndex" = 1));

ALTER TABLE "CommissionOpportunity" DROP CONSTRAINT IF EXISTS "consumed_opportunity_names_its_booking";
ALTER TABLE "CommissionOpportunity" ADD CONSTRAINT "consumed_opportunity_names_its_booking"
  CHECK ("status" <> 'CONSUMED' OR ("consumedByBookingId" IS NOT NULL AND "consumedAt" IS NOT NULL));

-- A commission percentage is never negative, and no single sale component can
-- exceed the 4% ceiling on its own (RD-03). Buying Commission sits outside that
-- cap and is bounded only by 100%.
ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "commission_percent_bounds";
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "commission_percent_bounds"
  CHECK ("percent" >= 0 AND (("type" = 'BUYING' AND "percent" <= 100) OR ("type" <> 'BUYING' AND "percent" <= 4)));

-- PRD §14.8 — On Hold always names its reason, and no other state carries one.
ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "hold_names_its_reason";
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "hold_names_its_reason"
  CHECK (("eligibility" = 'ON_HOLD' AND "holdReason" IS NOT NULL)
      OR ("eligibility" <> 'ON_HOLD' AND "holdReason" IS NULL));

-- PRD §6.11 — Paid Early carries compulsory remarks; both paid states carry a
-- reference and a date.
ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "paid_early_needs_remarks";
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "paid_early_needs_remarks"
  CHECK ("payment" <> 'PAID_EARLY'
      OR ("paymentRemarks" IS NOT NULL AND length(btrim("paymentRemarks")) > 0));

ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "paid_states_carry_evidence";
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "paid_states_carry_evidence"
  CHECK ("payment" NOT IN ('PAID', 'PAID_EARLY')
      OR ("paidOn" IS NOT NULL AND "externalReferenceId" IS NOT NULL));

-- A superseded record is no longer the current one (PRD §6.9).
ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "superseded_is_not_current";
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "superseded_is_not_current"
  CHECK ("supersededById" IS NULL OR "isCurrent" = false);

ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "commission_not_self_superseding";
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "commission_not_self_superseding"
  CHECK ("supersededById" IS NULL OR "supersededById" <> "id");

-- PRD §19.5 — Not Applicable always states why.
ALTER TABLE "MemberProfile" DROP CONSTRAINT IF EXISTS "rera_not_applicable_needs_reason";
ALTER TABLE "MemberProfile" ADD CONSTRAINT "rera_not_applicable_needs_reason"
  CHECK ("reraStatus" <> 'NOT_APPLICABLE'
      OR ("reraNotApplicableReason" IS NOT NULL AND length(btrim("reraNotApplicableReason")) > 0));

ALTER TABLE "MemberProfile" DROP CONSTRAINT IF EXISTS "rera_registered_needs_number";
ALTER TABLE "MemberProfile" ADD CONSTRAINT "rera_registered_needs_number"
  CHECK ("reraStatus" <> 'REGISTERED' OR "reraNumber" IS NOT NULL);

-- PRD §14.4 — one active verified bank and at most one pending replacement per
-- Person. The verified one stays active while the replacement is reviewed.
CREATE UNIQUE INDEX IF NOT EXISTS "one_verified_bank_per_person"
  ON "BankDetail" ("personId")
  WHERE "status" = 'VERIFIED';

CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_bank_per_person"
  ON "BankDetail" ("personId")
  WHERE "status" = 'PENDING';

ALTER TABLE "BankDetail" DROP CONSTRAINT IF EXISTS "verified_bank_names_its_checker";
ALTER TABLE "BankDetail" ADD CONSTRAINT "verified_bank_names_its_checker"
  CHECK ("status" <> 'VERIFIED' OR ("verifiedByRef" IS NOT NULL AND "verifiedAt" IS NOT NULL));

-- PRD §3.3 — bank entry and bank verification are different staff accounts.
ALTER TABLE "BankDetail" DROP CONSTRAINT IF EXISTS "bank_maker_checker_differ";
ALTER TABLE "BankDetail" ADD CONSTRAINT "bank_maker_checker_differ"
  CHECK ("verifiedByRef" IS NULL OR "verifiedByRef" <> "enteredByRef");

-- RD-03 — combined sale commission for one Booking never exceeds 4%. Buying
-- Commission is outside the cap. Deferred so a supersede-and-replace rewrite is
-- judged as a whole rather than mid-flight.
CREATE OR REPLACE FUNCTION assert_sale_commission_cap(b_id text) RETURNS void AS $$
DECLARE
  total numeric;
BEGIN
  SELECT COALESCE(sum("percent"), 0) INTO total
    FROM "CommissionRecord"
   WHERE "bookingId" = b_id
     AND "isCurrent" = true
     AND "type" <> 'BUYING'
     AND "payment" <> 'CANCELLED';

  IF total > 4 THEN
    RAISE EXCEPTION 'Combined sale commission cannot exceed 4%%, found %.', total;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_sale_commission_cap() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM assert_sale_commission_cap(OLD."bookingId");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM assert_sale_commission_cap(NEW."bookingId");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "sale_commission_within_4_percent" ON "CommissionRecord";
CREATE CONSTRAINT TRIGGER "sale_commission_within_4_percent"
  AFTER INSERT OR UPDATE OR DELETE ON "CommissionRecord"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_sale_commission_cap();

-- PRD §6.10 — one Sold By correction under review at a time, and it must
-- actually change the attribution.
CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_sold_by_correction_per_booking"
  ON "SoldByCorrection" ("bookingId")
  WHERE "status" = 'PENDING';

ALTER TABLE "SoldByCorrection" DROP CONSTRAINT IF EXISTS "sold_by_correction_changes_something";
ALTER TABLE "SoldByCorrection" ADD CONSTRAINT "sold_by_correction_changes_something"
  CHECK ("fromSoldByType" <> "toSoldByType"
      OR "fromSoldByPersonId" IS DISTINCT FROM "toSoldByPersonId");

-- PRD §11.3 — the same rule the Booking itself carries: Member and Customer
-- name the closer, a 3% Club direct close does not.
ALTER TABLE "SoldByCorrection" DROP CONSTRAINT IF EXISTS "sold_by_correction_person_matches_type";
ALTER TABLE "SoldByCorrection" ADD CONSTRAINT "sold_by_correction_person_matches_type"
  CHECK (("toSoldByType" = 'THREE_PERCENT_CLUB' AND "toSoldByPersonId" IS NULL)
      OR ("toSoldByType" <> 'THREE_PERCENT_CLUB' AND "toSoldByPersonId" IS NOT NULL));

-- ---------------------------------------------------------------- Phase 5

-- A schedule belongs to exactly one side: a Booking's Payment Received, or an
-- Acquisition's Payment Given. It is never both and never neither (PRD §1.2).
ALTER TABLE "PaymentScheduleVersion" DROP CONSTRAINT IF EXISTS "schedule_has_one_owner";
ALTER TABLE "PaymentScheduleVersion" ADD CONSTRAINT "schedule_has_one_owner"
  CHECK (("bookingId" IS NOT NULL AND "acquisitionId" IS NULL)
      OR ("bookingId" IS NULL AND "acquisitionId" IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS "one_active_schedule_per_acquisition"
  ON "PaymentScheduleVersion" ("acquisitionId")
  WHERE "status" = 'ACTIVE' AND "acquisitionId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_schedule_per_acquisition"
  ON "PaymentScheduleVersion" ("acquisitionId")
  WHERE "status" = 'PENDING' AND "acquisitionId" IS NOT NULL;

-- Sale commission hangs off a Booking, Buying Commission off an Acquisition.
ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "commission_has_one_owner";
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "commission_has_one_owner"
  CHECK (("bookingId" IS NOT NULL AND "acquisitionId" IS NULL)
      OR ("bookingId" IS NULL AND "acquisitionId" IS NOT NULL));

-- PRD §11.7 — Buying Commission is the acquisition side and nothing else is.
ALTER TABLE "CommissionRecord" DROP CONSTRAINT IF EXISTS "buying_commission_is_acquisition_side";
ALTER TABLE "CommissionRecord" ADD CONSTRAINT "buying_commission_is_acquisition_side"
  CHECK (("type" = 'BUYING' AND "acquisitionId" IS NOT NULL)
      OR ("type" <> 'BUYING' AND "bookingId" IS NOT NULL));

-- PRD §6.9 — one current record per Acquisition, type and beneficiary role.
CREATE UNIQUE INDEX IF NOT EXISTS "one_current_commission_per_acquisition_key"
  ON "CommissionRecord" ("acquisitionId", "type", "beneficiaryRole")
  WHERE "isCurrent" = true AND "acquisitionId" IS NOT NULL;

-- main-PRD §15 — one cancellation under review at a time.
CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_cancellation_per_booking"
  ON "CancellationRequest" ("bookingId")
  WHERE "status" = 'PENDING';

-- PRD §15.4 — a decision either records No Payment Received, or carries the
-- reference for the payment that existed. Never both, never neither.
ALTER TABLE "CancellationRequest" DROP CONSTRAINT IF EXISTS "refund_decision_evidence";
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "refund_decision_evidence"
  CHECK ("status" <> 'APPROVED'
      OR ("noPaymentReceived" = true AND "externalReferenceId" IS NULL)
      OR ("noPaymentReceived" = false AND "externalReferenceId" IS NOT NULL));

-- PRD §5.3 — one Change Plot under review, and it must actually move the Plot.
CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_change_plot_per_booking"
  ON "ChangePlotRequest" ("bookingId")
  WHERE "status" = 'PENDING';

-- The replacement Plot is transactionally blocked while under review, so no two
-- requests may target the same one.
CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_change_plot_per_target"
  ON "ChangePlotRequest" ("toPlotId")
  WHERE "status" = 'PENDING';

ALTER TABLE "ChangePlotRequest" DROP CONSTRAINT IF EXISTS "change_plot_moves_somewhere";
ALTER TABLE "ChangePlotRequest" ADD CONSTRAINT "change_plot_moves_somewhere"
  CHECK ("fromPlotId" <> "toPlotId");

ALTER TABLE "ChangePlotRequest" DROP CONSTRAINT IF EXISTS "change_plot_percent_bounds";
ALTER TABLE "ChangePlotRequest" ADD CONSTRAINT "change_plot_percent_bounds"
  CHECK ("appliedPercent" IS NULL OR ("appliedPercent" >= 0 AND "appliedPercent" <= 100));

-- PRD §11.5 — a Plot or property may have only one active acquisition.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_acquisition_per_plot"
  ON "Acquisition" ("plotId")
  WHERE "status" IN ('PENDING_APPROVAL', 'APPROVED') AND "plotId" IS NOT NULL;

-- Exact active duplicates of an external property are hard-blocked; likely
-- duplicates are warned about in the service (PRD §11.5).
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_acquisition_per_property"
  ON "Acquisition" ("duplicateKey")
  WHERE "status" IN ('PENDING_APPROVAL', 'APPROVED') AND "duplicateKey" IS NOT NULL;

ALTER TABLE "Acquisition" DROP CONSTRAINT IF EXISTS "payment_given_within_bounds";
ALTER TABLE "Acquisition" ADD CONSTRAINT "payment_given_within_bounds"
  CHECK ("paymentGivenPercent" >= 0 AND "paymentGivenPercent" <= 100);

-- main-PRD §17.3 — a Buyback names the Booking it takes back; a Purchase for
-- Resale names the outside property instead.
ALTER TABLE "Acquisition" DROP CONSTRAINT IF EXISTS "acquisition_shape_matches_type";
ALTER TABLE "Acquisition" ADD CONSTRAINT "acquisition_shape_matches_type"
  CHECK (("type" = 'BUYBACK' AND "sourceBookingId" IS NOT NULL AND "plotId" IS NOT NULL)
      OR ("type" = 'PURCHASE_FOR_RESALE' AND "propertyName" IS NOT NULL AND "propertyNumber" IS NOT NULL));

-- PRD §11.3 — approval requires at least 20% Payment Given confirmed.
ALTER TABLE "Acquisition" DROP CONSTRAINT IF EXISTS "acquisition_approval_threshold";
ALTER TABLE "Acquisition" ADD CONSTRAINT "acquisition_approval_threshold"
  CHECK ("status" <> 'APPROVED' OR "paymentGivenPercent" >= 20);

ALTER TABLE "Acquisition" DROP CONSTRAINT IF EXISTS "acquisition_arranger_matches_type";
ALTER TABLE "Acquisition" ADD CONSTRAINT "acquisition_arranger_matches_type"
  CHECK (("arrangedByType" = 'THREE_PERCENT_CLUB' AND "arrangedByPersonId" IS NULL)
      OR ("arrangedByType" <> 'THREE_PERCENT_CLUB' AND "arrangedByPersonId" IS NOT NULL));

-- PRD §11.7 — the seller can never earn Buying Commission for arranging the
-- return of their own property.
ALTER TABLE "Acquisition" DROP CONSTRAINT IF EXISTS "seller_is_not_the_arranger";
ALTER TABLE "Acquisition" ADD CONSTRAINT "seller_is_not_the_arranger"
  CHECK ("arrangedByPersonId" IS NULL OR "arrangedByPersonId" <> "sellerPersonId");

ALTER TABLE "PaymentGivenEntry" DROP CONSTRAINT IF EXISTS "given_entry_percent_positive";
ALTER TABLE "PaymentGivenEntry" ADD CONSTRAINT "given_entry_percent_positive"
  CHECK ("percent" > 0 AND "percent" <= 100);

-- The sale-cap trigger only ever judged the Booking side; with a nullable
-- bookingId it must skip acquisition rows outright.
CREATE OR REPLACE FUNCTION trg_sale_commission_cap() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."bookingId" IS NOT NULL THEN
    PERFORM assert_sale_commission_cap(OLD."bookingId");
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."bookingId" IS NOT NULL THEN
    PERFORM assert_sale_commission_cap(NEW."bookingId");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------- Phase 6

-- PRD §4.1 — one live completion per Booking. A reopened row stays as history.
CREATE UNIQUE INDEX IF NOT EXISTS "one_active_completion_per_booking"
  ON "BookingCompletion" ("bookingId")
  WHERE "reopenedAt" IS NULL;

-- main-PRD §18.4, §18.5 — each route carries its own fields and only its own.
ALTER TABLE "BookingCompletion" DROP CONSTRAINT IF EXISTS "completion_shape_matches_route";
ALTER TABLE "BookingCompletion" ADD CONSTRAINT "completion_shape_matches_route"
  CHECK (("route" = 'ALLOTMENT'
            AND "allotmentDate" IS NOT NULL AND "allotmentNumber" IS NOT NULL
            AND "allotmentGivenTo" IS NOT NULL AND "pattaStatus" IS NOT NULL
            AND "advocateName" IS NULL AND "registryDate" IS NULL)
      OR  ("route" = 'REGISTRY'
            AND "advocateName" IS NOT NULL AND "registryDate" IS NOT NULL
            AND "allotmentDate" IS NULL AND "allotmentNumber" IS NULL
            AND "allotmentGivenTo" IS NULL AND "pattaStatus" IS NULL
            AND "pattaDate" IS NULL));

-- main-PRD §18.4 — a Patta Date exists only where the Patta was issued.
ALTER TABLE "BookingCompletion" DROP CONSTRAINT IF EXISTS "patta_date_matches_status";
ALTER TABLE "BookingCompletion" ADD CONSTRAINT "patta_date_matches_status"
  CHECK ("pattaDate" IS NULL OR "pattaStatus" = 'YES');

-- PRD §4.4 — Delivered is the completed route, never a status set by itself.
CREATE OR REPLACE FUNCTION assert_delivered_has_completion(booking_id text) RETURNS void AS $$
DECLARE
  live int;
BEGIN
  SELECT COUNT(*) INTO live
    FROM "BookingCompletion"
   WHERE "bookingId" = booking_id AND "reopenedAt" IS NULL;
  IF live = 0 THEN
    RAISE EXCEPTION 'Delivered requires a completed Allotment or Registry route (PRD 4.4).';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_delivered_has_completion() RETURNS trigger AS $$
BEGIN
  IF NEW."status" = 'DELIVERED' THEN
    PERFORM assert_delivered_has_completion(NEW."id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "booking_delivered_has_completion" ON "Booking";
CREATE CONSTRAINT TRIGGER "booking_delivered_has_completion"
  AFTER INSERT OR UPDATE OF "status" ON "Booking"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_delivered_has_completion();

-- PRD §22 — a Person is merged away into exactly one survivor, never into itself.
ALTER TABLE "PersonMergeRequest" DROP CONSTRAINT IF EXISTS "merge_two_distinct_persons";
ALTER TABLE "PersonMergeRequest" ADD CONSTRAINT "merge_two_distinct_persons"
  CHECK ("survivingPersonId" <> "mergedPersonId");

CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_merge_per_person"
  ON "PersonMergeRequest" ("mergedPersonId")
  WHERE "status" = 'PENDING';

-- The task number comes from a sequence, not from MAX(taskNo) + 1: two
-- unrelated Bookings crossing a milestone at the same instant create tasks in
-- separate transactions, so neither sees the other's row. Re-running this file
-- only ever moves the sequence forward.
CREATE SEQUENCE IF NOT EXISTS "task_no_seq";
SELECT setval(
  'task_no_seq',
  GREATEST(
    (SELECT last_value + 1 FROM "task_no_seq"),
    (SELECT COALESCE(MAX(CAST(substring("taskNo" FROM '[0-9]+$') AS INTEGER)), 0) + 1 FROM "Task")
  ),
  false
);

-- ------------------------------------------------------------------ PLC

-- PLC spec §3.5 — exactly one current published PLC version per Project. This
-- is what makes two simultaneous publishes safe: the second one is refused by
-- the database, not by a read-then-write check that can interleave.
CREATE UNIQUE INDEX IF NOT EXISTS "one_published_plc_version_per_project"
  ON "PlcRuleVersion" ("projectId")
  WHERE "status" = 'PUBLISHED';

-- PLC spec §3.4 — a superseded version is no longer published, a published one
-- carries its publish stamp, and no version supersedes itself.
ALTER TABLE "PlcRuleVersion" DROP CONSTRAINT IF EXISTS "plc_superseded_is_not_published";
ALTER TABLE "PlcRuleVersion" ADD CONSTRAINT "plc_superseded_is_not_published"
  CHECK ("supersededById" IS NULL OR "status" = 'SUPERSEDED');

ALTER TABLE "PlcRuleVersion" DROP CONSTRAINT IF EXISTS "plc_published_carries_its_stamp";
ALTER TABLE "PlcRuleVersion" ADD CONSTRAINT "plc_published_carries_its_stamp"
  CHECK ("status" = 'DRAFT'
      OR ("publishedAt" IS NOT NULL AND "effectiveFrom" IS NOT NULL));

ALTER TABLE "PlcRuleVersion" DROP CONSTRAINT IF EXISTS "plc_version_not_self_superseding";
ALTER TABLE "PlcRuleVersion" ADD CONSTRAINT "plc_version_not_self_superseding"
  CHECK ("supersededById" IS NULL OR "supersededById" <> "id");

-- PLC spec §7.2 / §11.1 — a superseded snapshot is not current, a correction
-- always names its reason and actor, and no snapshot supersedes itself.
ALTER TABLE "PlcSnapshot" DROP CONSTRAINT IF EXISTS "plc_snapshot_superseded_is_not_current";
ALTER TABLE "PlcSnapshot" ADD CONSTRAINT "plc_snapshot_superseded_is_not_current"
  CHECK ("supersededById" IS NULL OR "isCurrent" = false);

ALTER TABLE "PlcSnapshot" DROP CONSTRAINT IF EXISTS "plc_correction_names_reason_and_actor";
ALTER TABLE "PlcSnapshot" ADD CONSTRAINT "plc_correction_names_reason_and_actor"
  CHECK (("correctionReason" IS NULL AND "correctedBy" IS NULL)
      OR (length(btrim(COALESCE("correctionReason", ''))) > 0 AND "correctedBy" IS NOT NULL));

ALTER TABLE "PlcSnapshot" DROP CONSTRAINT IF EXISTS "plc_snapshot_not_self_superseding";
ALTER TABLE "PlcSnapshot" ADD CONSTRAINT "plc_snapshot_not_self_superseding"
  CHECK ("supersededById" IS NULL OR "supersededById" <> "id");
