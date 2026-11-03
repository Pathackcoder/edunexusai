-- AlterTable
ALTER TABLE "integration_sync_logs" ADD COLUMN     "outcome" TEXT;


-- Classify existing rows from what they recorded, so history reads correctly.
UPDATE "integration_sync_logs" SET "outcome" = CASE
  WHEN "status" = 'SUCCESS' AND "recordsProcessed" > 0 THEN 'RECORDS'
  WHEN "status" = 'SUCCESS' THEN 'EMPTY'
  WHEN "status" = 'PARTIAL' THEN 'PARTIAL'
  WHEN "errorMessage" LIKE '%does not implement%' THEN 'NOT_IMPLEMENTED'
  WHEN "status" = 'FAILED' THEN 'ERROR'
  ELSE NULL END
WHERE "outcome" IS NULL;
