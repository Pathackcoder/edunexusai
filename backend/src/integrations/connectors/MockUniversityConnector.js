import { BaseConnector } from './BaseConnector.js';

/**
 * Connector for the Mock University API (the local stand-in for an institutional SIS).
 *
 * Speaks the registrar dialect: sis_student_id, subject_code, catalog_number,
 * credit_hours, meeting_pattern. Translation into the canonical model happens in
 * ../mappers/mockUniversityMapper.js.
 */
export class MockUniversityConnector extends BaseConnector {
  authHeaders() {
    return this.credential ? { 'x-api-key': this.credential } : {};
  }

  async testConnection() {
    const { payload, durationMs } = await this.request('/health');
    const counts = payload?.record_counts ?? {};
    const recordCount = Object.values(counts).reduce((sum, n) => sum + (Number(n) || 0), 0);
    return {
      healthy: payload?.status === 'ok',
      durationMs,
      recordCount,
      details: {
        providerStatus: payload?.status ?? 'unknown',
        apiVersion: payload?.api_version ?? null,
        recordCounts: counts,
      },
    };
  }

  async fetchTerms() {
    const { payload, durationMs } = await this.request('/terms');
    return { records: payload?.data ?? [], durationMs };
  }

  async fetchStudent(externalStudentId) {
    const { payload, durationMs } = await this.request(
      `/students/${encodeURIComponent(externalStudentId)}`,
      { allowNotFound: true },
    );
    return { record: payload?.data ?? null, durationMs };
  }

  async fetchCourses({ termCode } = {}) {
    const { payload, durationMs } = await this.request('/courses', { query: { term: termCode } });
    return { records: payload?.data ?? [], durationMs };
  }

  async fetchEnrollments({ externalStudentId, externalCourseId, termCode } = {}) {
    const { payload, durationMs } = await this.request('/enrollments', {
      query: { studentId: externalStudentId, courseId: externalCourseId, term: termCode },
    });
    return { records: payload?.data ?? [], durationMs };
  }

  async fetchSchedule({ externalStudentId }) {
    const { payload, durationMs } = await this.request('/schedule', {
      query: { studentId: externalStudentId },
    });
    return { records: payload?.data ?? [], durationMs };
  }

  async fetchAssignments({ externalStudentId, externalCourseId } = {}) {
    const { payload, durationMs } = await this.request('/assignments', {
      query: { studentId: externalStudentId, courseId: externalCourseId },
    });
    return { records: payload?.data ?? [], durationMs };
  }

  async fetchGrades({ externalStudentId }) {
    const { payload, durationMs } = await this.request('/grades', {
      query: { studentId: externalStudentId },
    });
    return { record: payload?.data ?? null, durationMs };
  }

  async fetchFinancialAid({ externalStudentId }) {
    // Not every student has an aid package; the provider answers 404 for those.
    const { payload, durationMs } = await this.request('/financial-aid', {
      query: { studentId: externalStudentId },
      allowNotFound: true,
    });
    return { record: payload?.data ?? null, durationMs };
  }
}
