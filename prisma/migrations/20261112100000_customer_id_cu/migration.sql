-- Owner, 12 Nov 2026 — the Customer ID reads CU0046, not CUS046: two letters
-- and four digits, like the Member's MM0011. The number is kept, only the
-- shape changes (CUS046 -> CU0046, CUS3390 -> CU3390).
-- Every text column is rewritten, as in 20261111120000_reference_formats_user_id:
-- the profile column itself and every copy (a Task's record name, an approval
-- label, typed text). jsonb snapshots, audit payloads and legacy arrays are
-- history and are left as they were. One DO block: it applies whole or not at all.
DO $$
DECLARE
  col record;
  has_ledger_trigger boolean :=
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'token_ledger_append_only');
BEGIN
  -- The token ledger refuses every UPDATE; this rename is not an edit.
  IF has_ledger_trigger THEN
    ALTER TABLE "TokenLedgerEntry" DISABLE TRIGGER token_ledger_append_only;
  END IF;

  -- \m / \M are start / end of word: FOCUS123 or CUS0461x are never touched.
  FOR col IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'
       AND c.data_type IN ('text', 'character varying')
       AND c.table_name <> '_prisma_migrations'
  LOOP
    EXECUTE format(
      $q$UPDATE %I SET %I = regexp_replace(regexp_replace(%I,
           '\mCUS([0-9]{3})\M', 'CU0\1', 'g'),
           '\mCUS([0-9]{4,})\M', 'CU\1', 'g')
         WHERE %I ~ '\mCUS[0-9]{3,}\M'$q$,
      col.table_name, col.column_name, col.column_name, col.column_name
    );
  END LOOP;

  IF has_ledger_trigger THEN
    ALTER TABLE "TokenLedgerEntry" ENABLE TRIGGER token_ledger_append_only;
  END IF;
END $$;
