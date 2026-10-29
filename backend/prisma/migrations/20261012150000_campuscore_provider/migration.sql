-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'CAMPUSCORE';


-- CampusCore is read live; like Moodle it may never be assigned local sync domains.
-- (The enum value is added above; the constraint is created in the next migration, since
-- PostgreSQL cannot use a new enum value in the same transaction that adds it.)
