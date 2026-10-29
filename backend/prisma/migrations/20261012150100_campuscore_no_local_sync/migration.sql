ALTER TABLE "integrations" DROP CONSTRAINT "integrations_lms_only_no_sis_domains";
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_live_only_no_sync_domains"
  CHECK ("provider" NOT IN ('MOODLE', 'CAMPUSCORE') OR cardinality("supportedDomains") = 0);
