-- Additive: which Moodle course (if any) delivers each CampusCore section. Many sections may
-- share one Moodle course; a section has at most one. No CampusCore or Moodle data is copied:
-- only the two systems' stable ids, plus who linked them.
CREATE TABLE "sis_section_moodle_courses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sisSectionId" TEXT NOT NULL,
    "sisTermId" TEXT NOT NULL,
    "moodleCourseId" INTEGER NOT NULL,
    "linkedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sis_section_moodle_courses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sis_section_moodle_courses_tenantId_sisSectionId_key" ON "sis_section_moodle_courses"("tenantId", "sisSectionId");
CREATE INDEX "sis_section_moodle_courses_tenantId_moodleCourseId_idx" ON "sis_section_moodle_courses"("tenantId", "moodleCourseId");
CREATE INDEX "sis_section_moodle_courses_tenantId_sisTermId_idx" ON "sis_section_moodle_courses"("tenantId", "sisTermId");
ALTER TABLE "sis_section_moodle_courses" ADD CONSTRAINT "sis_section_moodle_courses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
