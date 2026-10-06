/**
 * Course recommendation provider.
 *
 * The prototype ships a transparent rule-based ranker. It is deliberately isolated
 * behind `rankCourses(context)` so an AI/ML provider can replace it later without the
 * service, routes or UI changing: same input context, same output shape (score +
 * human-readable reasons). Nothing here is presented to students as "AI-calculated
 * truth"; every recommendation carries the reasons that produced it.
 *
 * context = {
 *   catalog:       CatalogCourse[]            (offered courses)
 *   takenCodes:    Set<string>                (completed or in progress)
 *   strongTopics:  Map<topic, weight>         (topics of courses with A-range grades)
 *   interests:     string[]                   (student-declared)
 *   careerGoals:   string[]                   (student-declared)
 *   requirementCodes: Map<code, requirementTitle> (codes that satisfy an unmet requirement)
 * }
 */
export const PROVIDER = { key: 'rules-v1', label: 'Rule-based ranking (prototype)', aiReady: true };

const norm = (value) => String(value ?? '').toLowerCase().trim();
const overlaps = (list, wanted) => {
  const targets = wanted.map(norm).filter(Boolean);
  return list.filter((item) => targets.some((target) => norm(item).includes(target) || target.includes(norm(item))));
};

export function rankCourses({ catalog, takenCodes, strongTopics, interests, careerGoals, requirementCodes }) {
  const ranked = [];
  for (const course of catalog) {
    if (takenCodes.has(course.code)) continue;
    let score = 0;
    const reasons = [];

    const requirement = requirementCodes.get(course.code);
    if (requirement) {
      score += 4;
      reasons.push({ kind: 'degree', text: `Counts toward your remaining “${requirement}” requirement` });
    }

    const interestHits = overlaps(course.topics, interests);
    if (interestHits.length) {
      score += 2 * interestHits.length;
      reasons.push({ kind: 'interest', text: `Matches your interest in ${interestHits.slice(0, 2).join(' and ')}` });
    }

    const careerHits = overlaps(course.careerTags, careerGoals);
    if (careerHits.length) {
      score += 2.5 * careerHits.length;
      reasons.push({ kind: 'career', text: `Builds toward ${careerHits.slice(0, 2).join(' / ')}` });
    }

    const strengths = course.topics.filter((topic) => strongTopics.has(norm(topic)));
    if (strengths.length) {
      score += 1.5;
      reasons.push({ kind: 'history', text: `You earned strong grades in related ${strengths[0]} coursework` });
    }

    const missingPrereqs = course.prerequisites.filter((code) => !takenCodes.has(code));
    if (missingPrereqs.length) {
      score -= 3;
      reasons.push({ kind: 'prerequisite', text: `Requires ${missingPrereqs.join(', ')} first` });
    }

    if (score <= 0) continue;
    ranked.push({
      course,
      score: Math.round(score * 10) / 10,
      match: Math.min(98, Math.round(45 + score * 6)),
      reasons,
      eligible: missingPrereqs.length === 0,
    });
  }
  return ranked.sort((a, b) => b.score - a.score);
}
