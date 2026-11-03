-- LMS-only providers (Moodle) must never serve SIS sync domains: SIS sync writes the
-- official course, enrolment, assignment and grade tables. Clear any domains that were
-- assigned through the admin form, then forbid them at the database level.
UPDATE "integrations" SET "supportedDomains" = '{}' WHERE "provider" = 'MOODLE' AND cardinality("supportedDomains") > 0;
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_lms_only_no_sis_domains"
  CHECK ("provider" <> 'MOODLE' OR cardinality("supportedDomains") = 0);

-- An operation made of several Moodle steps (account + enrolments) can partly succeed.
ALTER TABLE "integration_operations" DROP CONSTRAINT "integration_operations_status_check";
ALTER TABLE "integration_operations" ADD CONSTRAINT "integration_operations_status_check"
  CHECK ("status" IN ('PENDING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'NEEDS_RECONCILIATION', 'BLOCKED'));
