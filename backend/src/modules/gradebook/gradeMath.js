/**
 * Gradebook calculations: the single source of truth for course totals. Both the faculty
 * gradebook and the student grade views call these functions; the browser never computes
 * grades itself.
 *
 * Rules
 *   POINTS    percentage = Σ earned / Σ possible over counted assignments.
 *   WEIGHTED  percentage = Σ(weight × earned/possible) / Σ(weight) over counted assignments
 *             (weights renormalise over what has been graded so far).
 *   Missing work (no score): EXCLUDE leaves it out of the totals; ZERO counts it as 0, but
 *   only once it is past due. Nothing is ever counted as zero silently.
 *   At risk: percentage below the course threshold with at least MIN_GRADED_FOR_RISK
 *   graded assignments; with fewer, the result is "insufficient data", never "at risk".
 */
export const MIN_GRADED_FOR_RISK = 2;

const LETTERS = [
  [93, 'A'], [90, 'A-'], [87, 'B+'], [83, 'B'], [80, 'B-'],
  [77, 'C+'], [73, 'C'], [70, 'C-'], [67, 'D+'], [60, 'D'], [0, 'F'],
];
export const letterFor = (percentage) => (percentage == null ? null : LETTERS.find(([min]) => percentage >= min)[1]);

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * @param {object} args
 * @param {Array<{id, maxPoints, weight, dueDate}>} args.assignments
 * @param {(assignmentId) => number|null} args.scoreOf
 * @param {'POINTS'|'WEIGHTED'} args.method
 * @param {'EXCLUDE'|'ZERO'} args.missingPolicy
 * @param {number} [args.threshold]
 */
export function courseResult({ assignments, scoreOf, method = 'POINTS', missingPolicy = 'EXCLUDE', threshold = 70, now = new Date() }) {
  let earned = 0;
  let possible = 0;
  let weightSum = 0;
  let weighted = 0;
  let graded = 0;
  let missing = 0;
  let counted = 0;

  for (const assignment of assignments) {
    if (!(assignment.maxPoints > 0)) continue; // ungraded items carry no points
    let score = scoreOf(assignment.id);
    if (score == null) {
      const pastDue = assignment.dueDate && new Date(assignment.dueDate) < now;
      if (pastDue) missing += 1;
      if (!(missingPolicy === 'ZERO' && pastDue)) continue;
      score = 0;
    } else {
      graded += 1;
    }
    counted += 1;
    earned += score;
    possible += assignment.maxPoints;
    const weight = Number(assignment.weight ?? 0);
    if (method === 'WEIGHTED' && weight > 0) {
      weightSum += weight;
      weighted += weight * (score / assignment.maxPoints);
    }
  }

  const raw = method === 'WEIGHTED' ? (weightSum > 0 ? (weighted / weightSum) * 100 : null) : possible > 0 ? (earned / possible) * 100 : null;
  const percentage = raw == null ? null : round1(raw);
  const risk = percentage == null || graded < MIN_GRADED_FOR_RISK ? 'INSUFFICIENT_DATA' : percentage < threshold ? 'AT_RISK' : 'OK';
  return { earned: round1(earned), possible, percentage, letter: letterFor(percentage), graded, missing, counted, risk };
}

/** Mean of the non-null values, or null when there are none. */
export const average = (values) => {
  const present = values.filter((value) => value != null);
  return present.length ? round1(present.reduce((sum, value) => sum + value, 0) / present.length) : null;
};
