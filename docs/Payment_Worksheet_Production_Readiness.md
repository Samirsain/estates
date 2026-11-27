# Payment worksheet production readiness

The MD's private accounts ledger holds agreed amounts, receipt amounts and the bank-reference matching record. Open `tools/private-payment-workbook.html` directly from a trusted local copy. The workbook clears amount inputs after calculation. Transfer the verified percentage and the randomly generated receipt tracking ID into CRM. Use the same ID whenever that receipt is retried.

The CRM worksheet accepts the tracking ID, percentage and date. The live schedule provides the next instalment and the current balance in percentages. The worksheet no longer collects a safety factor or uses historical price-derived tokens. Existing encrypted basis rows are retained under restricted database grants pending an owner retention decision.

## Access

Use `MDXXX` in the header search from the MD account. The first registration requires an owner-held setup key and a user-verified passkey. Later unlocks require that passkey. Server challenges expire after two minutes and are consumed once. Retry counters and access expiry live in PostgreSQL, and audit events record outcomes. A 15-minute unlock applies to the current staff session. The worksheet closes at expiry. MD account recovery is restricted to the owner-controlled procedure.

Mock development runs on `http://localhost:3001`. Its randomly generated setup key is in the gitignored local development environment. The real-data development service on port 3002 is retired.

## Production release

1. Keep the feature flag disabled during the framework and database security release. Review a Supabase backup and verify restoration in staging. Use mock or sanitized staging data and independent staging keys.
2. Confirm the runtime role can read and write its application tables with the migration's RLS enabled, while `anon` and `authenticated` have no access. The current Prisma connection uses the table owner model. If the runtime moves to a dedicated restricted role, provision policies for that role in staging first. Disable Supabase's Data API if the project has no clients that need it.
3. Restrict Render, database, secrets and backup access to named operators. Rotate any live secrets that were duplicated into development as part of an owner-approved rollout. Follow the existing key-rotation tooling for sensitive identity data. Historical price-token ciphertext needs a separate retention and key disposal decision. Previously copied secrets and backups require their own review.
4. Set `PAYMENT_CALCULATOR_ORIGIN` to the exact canonical HTTPS origin. Generate `PAYMENT_CALCULATOR_ENROLLMENT_KEY` from at least 32 random bytes and share it only with the MD via the approved channel. Enable `PERCENTAGE_PAYMENT_TRIAL_ENABLED` after the migration and checks pass. Enroll the physical MD passkey and remove the bootstrap key from Render afterward. Keep the feature flag off when the MD cannot verify access.
5. With the deployed build, check HTTPS, a fresh CSP nonce on each login response, successful sign-in, an unlock on the canonical domain, unlocked data returning only on that session, expiry and non-MD denial. Check that expired unlocks, ordinary booking pages and reports cannot disclose raw historical receipt text. Reconcile pending legacy receipt approvals from the private ledger before closing them.
6. Record read-only grants verification, passkey smoke results, the backup restore evidence and audit-log access policy before entering live receipts. Keep a recovery procedure for losing the MD passkey. Only a designated owner with database administration access can clear that credential and authorize a new enrollment.

Someone who has a verified payment percentage and the corresponding bank amount can infer a price. Restrict access to the private accounts ledger and avoid correlatable bank references across the two systems.
