-- The three review tasks are work tasks now, so Accounts closes them with Done
-- on the Dashboard; flip the ones already waiting.
UPDATE "Task" SET "decision" = false
WHERE "status" = 'PENDING'
  AND "purpose" IN ('BUYBACK_COMMISSION_REVIEW', 'BUYBACK_UNWIND_REVIEW', 'SOLD_BY_COMMISSION_IMPACT');

-- Project settings are approved by the MD who creates them, so the settings
-- approval and economics review tasks are retired; close any still waiting.
UPDATE "Task"
SET "status" = 'COMPLETED', "completedAt" = now(), "updatedAt" = now(),
    "latestResult" = 'Retired — MD approves settings when creating them.'
WHERE "status" = 'PENDING'
  AND "purpose" IN ('COMMISSION_VERSION_APPROVAL', 'PROJECT_ECONOMICS_REVIEW');
