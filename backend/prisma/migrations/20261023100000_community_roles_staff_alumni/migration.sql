-- Community roles for staff and alumni (multi-role). Additive: existing enum values and rows are unchanged.
-- Kept apart from the next migration because a new enum value must be committed before it is used.
-- Rollback: PostgreSQL cannot drop enum values; unused values are harmless.
ALTER TYPE "RoleKey" ADD VALUE IF NOT EXISTS 'STAFF';
ALTER TYPE "RoleKey" ADD VALUE IF NOT EXISTS 'ALUMNI';
