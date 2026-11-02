-- People Search: an entry lists every community role of its person (a lecturer who also studies appears once).
-- Additive. Existing entries get their single type as their roles. Rollback: ALTER TABLE "directory_profiles" DROP COLUMN "roles";
ALTER TABLE "directory_profiles" ADD COLUMN "roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "directory_profiles" SET "roles" = ARRAY["type"] WHERE cardinality("roles") = 0;
