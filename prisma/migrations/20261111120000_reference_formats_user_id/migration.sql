-- Owner, 11 Nov 2026 — two renames, everywhere at once:
--   1. Staff sign in with a User ID of their own (MD, CRM-RAHUL), not STF-0001.
--      The account key IS the User ID, so every actorRef, history line and
--      maker-checker comparison moves with it and stays consistent.
--   2. The IDs people read aloud lose the dash and take a short number:
--      MEM-000011 -> MM0011, CUS-000046 -> CUS046, ENQ-000005 -> ENQ005,
--      BKG-000023 -> BKG0023. The number is kept, only the shape changes.
-- Every text column is rewritten — the profile columns themselves, the copies
-- (a Task's record name, an approval label) and typed text alike. jsonb
-- snapshots and audit payloads are history and are left as they were.
-- One DO block: it applies whole or not at all.
DO $$
DECLARE
  col record;
  staff_expr text := '%I';
  ref_expr text := '%I';
  has_ledger_trigger boolean :=
    EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'token_ledger_append_only');
BEGIN
  -- Only the accounts the owner named, matched on ID, role and name, and
  -- only where the new User ID is free — anywhere else nothing changes.
  CREATE TEMP TABLE staff_rename ON COMMIT DROP AS
  SELECT s."staffAccountId" AS old_id, m.uid AS new_id
    FROM (VALUES
      ('STF-0001', 'MD',       'Managing Director', 'MD'),
      ('STF-0003', 'ACCOUNTS', 'Priya Nair',        'ACCOUNTS-PRIYA'),
      ('STF-0004', 'ACCOUNTS', 'Suresh Iyer',       'ACCOUNTS-SURESH'),
      ('STF-0005', 'CRM',      'Rahul Mehta',       'CRM-RAHUL'),
      ('STF-0006', 'CRM',      'Anita Rao',         'CRM-ANITA'),
      ('STF-0007', 'MIS',      'Meera Pillai',      'MIS'),
      ('STF-0008', 'PC',       'Arjun Bose',        'PC')
    ) AS m(sid, role, name, uid)
    JOIN "StaffAccount" s ON s."staffAccountId" = m.sid AND s."role"::text = m.role
    JOIN "Person" p ON p."id" = s."personId" AND p."fullName" = m.name
   WHERE NOT EXISTS (SELECT 1 FROM "StaffAccount" o WHERE o."staffAccountId" = m.uid);

  -- replace(replace(%I, 'STF-0001', 'MD'), ...) — every STF id here is four
  -- digits, so no old id is a prefix of another.
  FOR col IN SELECT old_id, new_id FROM staff_rename LOOP
    staff_expr := format('replace(%s, %L, %L)', staff_expr, col.old_id, col.new_id);
  END LOOP;

  -- Two passes per series: the zero-padded number that fits the new width
  -- (MEM-000011 -> MM0011), then a longer one keeps its digits (CUS-3390 ->
  -- CUS3390). \M is end of word, so BKG-000023 never eats a following digit.
  ref_expr := $r$regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(%I,
      'MEM-0*([0-9]{4})\M', 'MM\1', 'g'), 'MEM-0*([1-9][0-9]{4,})\M', 'MM\1', 'g'),
      'BKG-0*([0-9]{4})\M', 'BKG\1', 'g'), 'BKG-0*([1-9][0-9]{4,})\M', 'BKG\1', 'g'),
      'CUS-0*([0-9]{3})\M', 'CUS\1', 'g'), 'CUS-0*([1-9][0-9]{3,})\M', 'CUS\1', 'g'),
      'ENQ-0*([0-9]{3})\M', 'ENQ\1', 'g'), 'ENQ-0*([1-9][0-9]{3,})\M', 'ENQ\1', 'g')$r$;

  -- The token ledger refuses every UPDATE; this rename is not an edit.
  IF has_ledger_trigger THEN
    ALTER TABLE "TokenLedgerEntry" DISABLE TRIGGER token_ledger_append_only;
  END IF;

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
    IF EXISTS (SELECT 1 FROM staff_rename) THEN
      EXECUTE format(
        'UPDATE %I SET %I = ' || format(staff_expr, col.column_name) || ' WHERE %I ~ ''STF-[0-9]''',
        col.table_name, col.column_name, col.column_name
      );
    END IF;
    EXECUTE format(
      'UPDATE %I SET %I = ' || format(ref_expr, col.column_name) || ' WHERE %I ~ ''(MEM|CUS|ENQ|BKG)-[0-9]''',
      col.table_name, col.column_name, col.column_name
    );
  END LOOP;

  IF has_ledger_trigger THEN
    ALTER TABLE "TokenLedgerEntry" ENABLE TRIGGER token_ledger_append_only;
  END IF;
END $$;
