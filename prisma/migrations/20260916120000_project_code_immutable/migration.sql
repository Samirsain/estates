-- A Project Code is typed once, when the Project is created, and never changes:
-- it is what ties an issued report or export back to its Project. The edit
-- form and the service already leave it out; this refuses the change for any
-- other writer too.
CREATE FUNCTION "project_code_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."projectCode" IS DISTINCT FROM OLD."projectCode" THEN
    RAISE EXCEPTION 'The Project Code cannot be changed.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Project_projectCode_immutable"
  BEFORE UPDATE OF "projectCode" ON "Project"
  FOR EACH ROW EXECUTE FUNCTION "project_code_immutable"();
