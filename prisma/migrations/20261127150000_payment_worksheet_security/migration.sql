-- Retain legacy ciphertext for an owner-approved retention decision.
ALTER TABLE "CalculatorPriceBasis" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "CalculatorPriceBasis" FROM PUBLIC;

CREATE TABLE "PaymentCalculatorGate" (
  "staffAccountId" TEXT PRIMARY KEY REFERENCES "StaffAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sessionDigest" TEXT NOT NULL,
  "openedUntil" TIMESTAMP(3),
  "unlockedUntil" TIMESTAMP(3),
  "challenge" TEXT,
  "challengeUntil" TIMESTAMP(3),
  "attemptWindow" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "credentialId" TEXT UNIQUE,
  "publicKey" BYTEA,
  "counter" INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE "PaymentCalculatorGate" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PaymentCalculatorGate" FROM PUBLIC;

-- Prisma accesses these tables as the application database role. Supabase
-- browser roles do not need access to CRM data.
DO $$
DECLARE
  api_role text;
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'Person', 'CustomerProfile', 'CustomerTermsAcceptance', 'MemberTermsAcceptance', 'MemberProfile', 'PotentialInvestor',
    'City', 'RolePermission', 'StaffAccount', 'PaymentCalculatorGate', 'IdempotencyRecord', 'AuditEvent',
    'Project', 'ProjectCommissionVersion', 'TripInventoryRule', 'PlcRuleVersion', 'PlcComponent', 'PlcSnapshot',
    'Plot', 'PlotBoundary', 'PlotEvent', 'Enquiry', 'EnquiryFollowUp', 'Hold',
    'HoldParty', 'HoldExtensionRequest', 'HoldRequest', 'Task', 'TaskEvent', 'Booking',
    'CalculatorPriceBasis', 'BookingReviewVersion', 'BookingParty', 'PaymentScheduleVersion', 'PaymentInstalment', 'PaymentReceivedEntry',
    'PaymentVerificationRequest', 'ExternalReference', 'PrimaryCustomerChange', 'SoldByCorrection', 'BookingEvent', 'CommissionRecord',
    'Recovery', 'RoyaltyAward', 'RoyaltyAwardEvent', 'TokenLedgerEntry', 'TokenRedemption', 'TokenAllocation',
    'TripCredit', 'TripBucket', 'TripReward', 'TripEvent', 'CommissionEvent', 'BankDetail',
    'StaffRelative', 'StaffConflictReview', 'CircumventionReview', 'CancellationRequest', 'ChangePlotRequest', 'Acquisition',
    'PaymentApproval', 'PaymentGivenEntry', 'AcquisitionEvent', 'ScheduledJobRun', 'BookingCompletion', 'ExportLog',
    'PersonMergeRequest', 'LandInquiry', 'LandInquiryOwner', 'LandInquiryJamabandiEntry'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, api_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;
