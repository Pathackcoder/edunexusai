import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Career-services boundary. Today it reads a mock postings feed shaped like a
 * Handshake/Symplicity export; a live adapter only has to return the same canonical
 * shape from `fetchPostings()`. careerService upserts the result into PostgreSQL, so
 * saves/applications reference stable rows whatever the source.
 */
const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'career-opportunities.json');

export const careerServicesAdapter = {
  key: 'CAREER_SERVICES_MOCK',
  label: 'Career Services (mock feed)',
  async fetchPostings(now = new Date()) {
    const feed = JSON.parse(await readFile(FIXTURE, 'utf8'));
    return feed.postings.map((posting) => ({
      externalKey: posting.id,
      type: posting.type,
      title: posting.title,
      company: posting.company,
      location: posting.location,
      workMode: posting.workMode,
      field: posting.field,
      skills: posting.skills,
      description: posting.description,
      compensation: posting.compensation ?? null,
      deadline: posting.deadline ? new Date(`${posting.deadline}T00:00:00Z`) : null,
      applyUrl: posting.applyUrl ?? null,
      postedAt: new Date(now.getTime() - (posting.postedDaysAgo ?? 0) * 86_400_000),
    }));
  },
};
