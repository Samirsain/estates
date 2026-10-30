-- Public Project Portal (owner, 29 Oct 2026): every Project is shown unless its
-- own setting hides it, so the default is on and today's Projects are turned on.
ALTER TABLE "Project" ALTER COLUMN "publicPortal" SET DEFAULT true;
UPDATE "Project" SET "publicPortal" = true;
