-- AlterTable
ALTER TABLE "assignment_submissions" ADD COLUMN     "draftScore" DECIMAL(7,2),
ADD COLUMN     "gradedAt" TIMESTAMP(3),
ADD COLUMN     "gradedByUserId" TEXT,
ADD COLUMN     "hasDraft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedByUserId" TEXT,
ALTER COLUMN "score" SET DATA TYPE DECIMAL(7,2);
-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "weight" DECIMAL(6,2);
-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "atRiskThreshold" INTEGER NOT NULL DEFAULT 70,
ADD COLUMN     "gradingMethod" TEXT NOT NULL DEFAULT 'POINTS',
ADD COLUMN     "missingWorkPolicy" TEXT NOT NULL DEFAULT 'EXCLUDE';
-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "appearanceFont" TEXT NOT NULL DEFAULT 'modern-campus',
ADD COLUMN     "appearanceTheme" TEXT NOT NULL DEFAULT 'navy-white',
ADD COLUMN     "appearanceUpdatedAt" TIMESTAMP(3);

-- Gradebook data integrity (enforced by the database as well as the API).
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_score_nonnegative" CHECK ("score" IS NULL OR "score" >= 0);
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_draft_nonnegative" CHECK ("draftScore" IS NULL OR "draftScore" >= 0);
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_weight_range" CHECK ("weight" IS NULL OR ("weight" >= 0 AND "weight" <= 100));
ALTER TABLE "courses" ADD CONSTRAINT "courses_grading_method_valid" CHECK ("gradingMethod" IN ('POINTS', 'WEIGHTED'));
ALTER TABLE "courses" ADD CONSTRAINT "courses_missing_policy_valid" CHECK ("missingWorkPolicy" IN ('EXCLUDE', 'ZERO'));
ALTER TABLE "courses" ADD CONSTRAINT "courses_at_risk_range" CHECK ("atRiskThreshold" BETWEEN 0 AND 100);

-- Faculty publish queries look up a course's pending drafts.
CREATE INDEX "assignment_submissions_assignmentId_hasDraft_idx" ON "assignment_submissions"("assignmentId", "hasDraft");

-- Backfill: numeric weights from existing labels such as "15% of final grade".
UPDATE "assignments"
SET "weight" = CAST(substring("weightLabel" FROM '([0-9]+(\.[0-9]+)?)\s*%') AS DECIMAL(6,2))
WHERE "weightLabel" ~ '[0-9]+(\.[0-9]+)?\s*%';

-- Existing scores were already visible to students, so they are the published grades.
UPDATE "assignment_submissions" SET "publishedAt" = COALESCE("submittedAt", "updatedAt") WHERE "score" IS NOT NULL;
