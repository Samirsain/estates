-- Role permissions (owner, 18 Nov 2026): the ticks each job starts with, as MD
-- sets them under Administration → Roles. Empty until MD saves a role, and a
-- missing row means the built-in set, so no account changes here.
CREATE TABLE "RolePermission" (
    "role" "StaffRole" NOT NULL,
    "permissions" TEXT[],
    "updatedByRef" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role")
);
