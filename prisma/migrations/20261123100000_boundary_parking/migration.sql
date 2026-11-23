-- A side can be Parking (owner, 23 Nov 2026). Adding a value rewrites no row,
-- and the Road-width check does not mention it, so nothing else moves.
ALTER TYPE "BoundaryKind" ADD VALUE IF NOT EXISTS 'PARKING' AFTER 'PLAYGROUND';
