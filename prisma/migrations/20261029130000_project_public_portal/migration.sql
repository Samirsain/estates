-- Public Project Portal (owner, 29 Oct 2026): a Project is shown at /p/<name>
-- to anyone with the link only while this is on. Off for every Project today.
ALTER TABLE "Project" ADD COLUMN "publicPortal" BOOLEAN NOT NULL DEFAULT false;
