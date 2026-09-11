-- The 3D render or walkthrough of a Project, kept beside the map link and the
-- structure-and-layout link it sits with on screen. Nullable: a Project that
-- has no render simply shows no button for one.
ALTER TABLE "Project" ADD COLUMN "renderUrl" TEXT;
