# Payment worksheet production readiness

Buyer receipts are recorded in the MD worksheet. Choose a project and select a plot. Each row shows the plot number and type above the project code and name. If a plot needs setup, enter its agreed total and save the plot points. The total is cleared after setup. An approved plot replacement clears the old points basis.

Enter the amount and receipt date for each row. Tick S.F. and enter one formula in the field beside it to apply it to all draft amounts and any new plot total. For example, `/25` converts ₹25,000 to 1,000 Pts. A plain number acts as a divisor. With S.F. off, the amount itself is the points value. For a plot with saved points, use the same conversion that produced those points so the receipt credits the intended percentage.

Check Pts and the receipt date before clicking Record. Use Add row for the next receipt and × to remove a row. Recorded payments stay in history. A batch stops at its first failed receipt and keeps successful rows marked Recorded. Receipt details contains the staff claim selector and tracking ID.

Tab and Shift+Tab move through the controls. Enter advances from an input to the next editable cell. The worksheet sends the calculated percentage to the ledger. Amounts and the shared S.F. stay in the browser for the worksheet session. Use the same tracking ID when retrying a receipt. Formulas accept AMOUNT, parentheses, percentages, integer powers and the functions SUM, AVERAGE, MIN, MAX, ABS and ROUND.

## Access

Use `MDXXX` in the header search from the MD account. The first registration requires an owner-held setup key and a user-verified passkey. Later unlocks require that passkey. Server challenges expire after two minutes and are consumed once. Retry counters and access expiry live in PostgreSQL, and audit events record outcomes. A 15-minute unlock applies to the current staff session. The worksheet closes at expiry. MD account recovery is restricted to the owner-controlled procedure.

Run `npm run trial:dev` and open `http://localhost:3002` for the fictional Project A bookings. The launcher uses the local `threepct_payment_trial` database on port 5433 and sets the matching localhost origin for the passkey. The first-time setup key is in the gitignored `.env.development.local`.

## Production release

1. Keep the feature flag disabled during the framework and database security release. Review a Supabase backup and verify restoration in staging. Use mock or sanitized staging data and independent staging keys.
2. Confirm the runtime role can read and write its application tables with the migration's RLS enabled, while `anon` and `authenticated` have no access. The current Prisma connection uses the table owner model. If the runtime moves to a dedicated restricted role, provision policies for that role in staging first. Disable Supabase's Data API if the project has no clients that need it.
3. Restrict Render, database, secrets and backup access to named operators. Rotate any live secrets that were duplicated into development as part of an owner-approved rollout. Follow the existing key-rotation tooling for sensitive identity data. Historical price-token ciphertext needs a separate retention and key disposal decision. Previously copied secrets and backups require their own review.
4. Set `PAYMENT_CALCULATOR_ORIGIN` to the exact canonical HTTPS origin. Generate `PAYMENT_CALCULATOR_ENROLLMENT_KEY` from at least 32 random bytes and share it only with the MD via the approved channel. Enable `PERCENTAGE_PAYMENT_TRIAL_ENABLED` after the migration and checks pass. Enroll the physical MD passkey and remove the bootstrap key from Render afterward. Keep the feature flag off when the MD cannot verify access.
5. With the deployed build, check HTTPS, a fresh CSP nonce on each login response, successful sign-in, an unlock on the canonical domain, unlocked data returning only on that session, expiry and non-MD denial. Check that expired unlocks, ordinary booking pages and reports cannot disclose raw historical receipt text. Reconcile pending legacy receipt approvals from the private ledger before closing them.
6. Record read-only grants verification, passkey smoke results, the backup restore evidence and audit-log access policy before entering live receipts. Keep a recovery procedure for losing the MD passkey. Only a designated owner with database administration access can clear that credential and authorize a new enrollment.

Someone who has a verified payment percentage and the corresponding bank amount can infer a price. Restrict access to the private accounts ledger and avoid correlatable bank references across the two systems.
