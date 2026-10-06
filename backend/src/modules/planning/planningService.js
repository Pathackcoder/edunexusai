import { prisma } from '../../db/prisma.js';
import { notFound } from '../../utils/errors.js';
import { toNumber } from '../../utils/format.js';
import { PROVIDER, rankCourses } from './recommendationProvider.js';

/**
 * Academic planning: degree progress, course recommendations, learning paths and the
 * performance insights page. Everything is derived from the student's own records
 * (transcript, enrollments, submissions) plus institution-owned reference data
 * (catalogue, degree requirements, learning paths). No grades are predicted.
 */

const PASSING = (grade) => grade && !['IP', 'F', 'W', 'I', 'NC'].includes(grade);
const GRADE_POINTS = { 'A+': 4, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, D: 1, F: 0 };

async function loadStudent(tenantId, studentProfileId) {
  const profile = await prisma.studentProfile.findFirst({
    where: { tenantId, id: studentProfileId },
    include: {
      user: { select: { id: true, firstName: true } },
      transcriptTerms: { include: { courses: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      enrollments: { include: { course: true } },
    },
  });
  if (!profile) throw notFound('Student profile not found.');
  const completed = [];
  const inProgress = [];
  for (const term of profile.transcriptTerms) {
    for (const course of term.courses) {
      const row = { code: course.code, title: course.title, credits: course.credits, grade: course.grade, term: term.termLabel };
      if (course.grade === 'IP' || term.isInProgress) inProgress.push(row);
      else if (PASSING(course.grade)) completed.push(row);
    }
  }
  // Current-term enrollments not yet on the transcript count as in progress.
  for (const enrollment of profile.enrollments) {
    if (!inProgress.some((row) => row.code === enrollment.course.code) && !completed.some((row) => row.code === enrollment.course.code)) {
      inProgress.push({ code: enrollment.course.code, title: enrollment.course.name, credits: enrollment.course.credits, grade: 'IP', term: profile.currentTerm });
    }
  }
  return { profile, completed, inProgress };
}

async function requirementsFor(tenantId, degree) {
  const all = await prisma.degreeRequirement.findMany({ where: { tenantId }, orderBy: { sortOrder: 'asc' } });
  const exact = all.filter((row) => row.program === degree);
  if (exact.length) return exact;
  const level = /ph\.?d/i.test(degree ?? '') ? 'DEFAULT_DOCTORAL' : /^b\.?s|bachelor/i.test(degree ?? '') ? 'DEFAULT_UNDERGRADUATE' : 'DEFAULT_GRADUATE';
  return all.filter((row) => row.program === level);
}

/** Allocate each course to the first requirement that accepts it and still has room. */
function allocate(requirements, completed, inProgress) {
  const buckets = requirements.map((req) => ({ req, completed: [], inProgress: [], completedCredits: 0, inProgressCredits: 0 }));
  const place = (course, kind) => {
    const specific = buckets.filter((bucket) => bucket.req.courseCodes.includes(course.code));
    const general = buckets.filter((bucket) => bucket.req.courseCodes.length === 0);
    for (const bucket of [...specific, ...general]) {
      const used = bucket.completedCredits + bucket.inProgressCredits;
      if (used >= bucket.req.creditsRequired) continue;
      bucket[kind].push(course);
      bucket[`${kind}Credits`] += course.credits;
      return true;
    }
    return false;
  };
  const unplaced = [];
  for (const course of completed) if (!place(course, 'completed')) unplaced.push(course);
  for (const course of inProgress) if (!place(course, 'inProgress')) unplaced.push(course);
  return { buckets, unplaced };
}

export async function getDegreeProgress(tenantId, studentProfileId) {
  const { profile, completed, inProgress } = await loadStudent(tenantId, studentProfileId);
  const requirements = await requirementsFor(tenantId, profile.degree);
  const catalog = await prisma.catalogCourse.findMany({ where: { tenantId } });
  const titles = new Map(catalog.map((course) => [course.code, course.title]));
  const hasHistory = completed.length + inProgress.length > 0;

  const totalRequired = profile.totalCreditsRequired || requirements.reduce((sum, req) => sum + req.creditsRequired, 0);
  const { buckets } = allocate(requirements, completed, inProgress);
  const taken = new Set([...completed, ...inProgress].map((course) => course.code));

  const categories = buckets.map(({ req, completed: done, inProgress: current, completedCredits, inProgressCredits }) => {
    const capped = Math.min(req.creditsRequired, completedCredits);
    const cappedIp = Math.min(req.creditsRequired - capped, inProgressCredits);
    return {
      id: req.id,
      category: req.category,
      title: req.title,
      description: req.description,
      creditsRequired: req.creditsRequired,
      creditsCompleted: capped,
      creditsInProgress: cappedIp,
      creditsRemaining: Math.max(0, req.creditsRequired - capped - cappedIp),
      status: capped >= req.creditsRequired ? 'COMPLETE' : capped + cappedIp >= req.creditsRequired ? 'IN_PROGRESS' : 'REMAINING',
      completedCourses: done,
      inProgressCourses: current,
      options: req.courseCodes.filter((code) => !taken.has(code)).map((code) => ({ code, title: titles.get(code) ?? code })),
    };
  });

  // Students provisioned without course-level history fall back to the SIS credit totals.
  const completedCredits = hasHistory ? categories.reduce((sum, cat) => sum + cat.creditsCompleted, 0) : profile.creditsCompleted;
  const inProgressCredits = hasHistory ? categories.reduce((sum, cat) => sum + cat.creditsInProgress, 0) : 0;
  return {
    program: profile.degree,
    department: profile.department,
    totalRequired,
    completedCredits,
    inProgressCredits,
    remainingCredits: Math.max(0, totalRequired - completedCredits - inProgressCredits),
    percentComplete: totalRequired ? Math.round((completedCredits / totalRequired) * 100) : 0,
    projectedPercent: totalRequired ? Math.round(((completedCredits + inProgressCredits) / totalRequired) * 100) : 0,
    hasCourseHistory: hasHistory,
    categories: hasHistory ? categories : categories.map((cat) => ({ ...cat, creditsCompleted: 0, creditsInProgress: 0, creditsRemaining: cat.creditsRequired, status: 'UNKNOWN' })),
    remainingRequirements: categories.filter((cat) => cat.creditsRemaining > 0).map((cat) => ({ title: cat.title, credits: cat.creditsRemaining, options: cat.options.slice(0, 4) })),
    cumulativeGpa: toNumber(profile.cumulativeGpa),
    academicStanding: profile.academicStanding,
    source: hasHistory ? 'Transcript + current enrollments' : 'SIS credit totals (course-level history not available)',
  };
}

export async function getRecommendations(tenantId, studentProfileId) {
  const { profile, completed, inProgress } = await loadStudent(tenantId, studentProfileId);
  const [catalog, progress] = await Promise.all([
    prisma.catalogCourse.findMany({ where: { tenantId } }),
    getDegreeProgress(tenantId, studentProfileId),
  ]);
  const catalogByCode = new Map(catalog.map((course) => [course.code, course]));

  const strongTopics = new Map();
  for (const course of completed) {
    if ((GRADE_POINTS[course.grade] ?? 0) >= 3.7) {
      for (const topic of catalogByCode.get(course.code)?.topics ?? []) strongTopics.set(topic.toLowerCase(), 1);
    }
  }
  const requirementCodes = new Map();
  for (const cat of progress.categories) {
    if (cat.creditsRemaining > 0) for (const option of cat.options) requirementCodes.set(option.code, cat.title);
  }

  const ranked = rankCourses({
    catalog,
    takenCodes: new Set([...completed, ...inProgress].map((course) => course.code)),
    strongTopics,
    interests: profile.interests ?? [],
    careerGoals: profile.careerGoals ?? [],
    requirementCodes,
  });

  const topicPool = [...new Set(catalog.flatMap((course) => course.topics))].sort();
  const careerPool = [...new Set(catalog.flatMap((course) => course.careerTags))].sort();
  return {
    provider: PROVIDER,
    profile: { interests: profile.interests ?? [], careerGoals: profile.careerGoals ?? [], program: profile.degree },
    options: { interests: topicPool, careerGoals: careerPool },
    recommendations: ranked.slice(0, 8).map(({ course, score, match, reasons, eligible }) => ({
      code: course.code,
      title: course.title,
      credits: course.credits,
      level: course.level,
      description: course.description,
      topics: course.topics,
      careerTags: course.careerTags,
      termsOffered: course.termsOffered,
      prerequisites: course.prerequisites,
      score,
      match,
      reasons,
      eligible,
    })),
    signals: {
      completedCourses: completed.length,
      strongTopics: [...strongTopics.keys()],
      remainingRequirements: progress.remainingRequirements.map((req) => req.title),
    },
  };
}

/* ----- learning paths ----- */

async function stepStatuses(userId, steps, takenCompleted, takenInProgress) {
  const progress = await prisma.learningStepProgress.findMany({ where: { userId, stepId: { in: steps.map((step) => step.id) } } });
  return steps.map((step) => {
    let status = progress.find((row) => row.stepId === step.id)?.status ?? 'NOT_STARTED';
    let auto = false;
    if (step.kind === 'COURSE' && step.courseCode) {
      if (takenCompleted.has(step.courseCode)) { status = 'COMPLETED'; auto = true; }
      else if (takenInProgress.has(step.courseCode)) { status = 'IN_PROGRESS'; auto = true; }
    }
    return { ...step, status, autoTracked: auto };
  });
}

export async function getLearningPaths(tenantId, studentProfileId) {
  const { profile, completed, inProgress } = await loadStudent(tenantId, studentProfileId);
  const userId = profile.user.id;
  const paths = await prisma.learningPath.findMany({
    where: { tenantId },
    include: { steps: { orderBy: { sortOrder: 'asc' } }, enrollments: { where: { userId } } },
    orderBy: { title: 'asc' },
  });
  const done = new Set(completed.map((course) => course.code));
  const current = new Set(inProgress.map((course) => course.code));
  const goals = (profile.careerGoals ?? []).map((goal) => goal.toLowerCase());

  const presented = [];
  for (const path of paths) {
    const steps = await stepStatuses(userId, path.steps, done, current);
    const completedSteps = steps.filter((step) => step.status === 'COMPLETED').length;
    const currentStep = steps.find((step) => step.status !== 'COMPLETED');
    presented.push({
      id: path.id,
      key: path.key,
      title: path.title,
      description: path.description,
      careerGoal: path.careerGoal,
      isActive: path.enrollments.some((row) => row.isActive),
      recommended: goals.some((goal) => (path.careerGoal ?? '').toLowerCase().includes(goal) || goal.includes((path.careerGoal ?? '').toLowerCase())),
      progress: steps.length ? Math.round((completedSteps / steps.length) * 100) : 0,
      completedSteps,
      totalSteps: steps.length,
      currentStage: currentStep?.stage ?? 'Complete',
      stages: [...new Set(steps.map((step) => step.stage))],
      steps: steps.map((step) => ({
        id: step.id,
        order: step.sortOrder,
        stage: step.stage,
        title: step.title,
        kind: step.kind,
        description: step.description,
        courseCode: step.courseCode,
        resourceUrl: step.resourceUrl,
        estimatedHours: step.estimatedHours,
        status: step.status,
        autoTracked: step.autoTracked,
      })),
    });
  }
  presented.sort((a, b) => Number(b.isActive) - Number(a.isActive) || Number(b.recommended) - Number(a.recommended) || b.progress - a.progress);
  return { paths: presented, activePathId: presented.find((path) => path.isActive)?.id ?? null };
}

export async function activateLearningPath(tenantId, studentProfileId, pathId) {
  const { profile } = await loadStudent(tenantId, studentProfileId);
  const path = await prisma.learningPath.findFirst({ where: { id: pathId, tenantId } });
  if (!path) throw notFound('Learning path not found.');
  await prisma.$transaction([
    prisma.userLearningPath.updateMany({ where: { userId: profile.user.id }, data: { isActive: false } }),
    prisma.userLearningPath.upsert({
      where: { userId_pathId: { userId: profile.user.id, pathId } },
      create: { userId: profile.user.id, pathId, isActive: true },
      update: { isActive: true },
    }),
  ]);
  return getLearningPaths(tenantId, studentProfileId);
}

export async function setStepStatus(tenantId, studentProfileId, stepId, status) {
  const { profile } = await loadStudent(tenantId, studentProfileId);
  const step = await prisma.learningPathStep.findFirst({ where: { id: stepId, path: { tenantId } } });
  if (!step) throw notFound('Step not found.');
  if (status === 'NOT_STARTED') {
    await prisma.learningStepProgress.deleteMany({ where: { userId: profile.user.id, stepId } });
  } else {
    await prisma.learningStepProgress.upsert({
      where: { userId_stepId: { userId: profile.user.id, stepId } },
      create: { userId: profile.user.id, stepId, status, completedAt: status === 'COMPLETED' ? new Date() : null },
      update: { status, completedAt: status === 'COMPLETED' ? new Date() : null },
    });
  }
  return getLearningPaths(tenantId, studentProfileId);
}

/* ----- performance insights ----- */

export async function getInsights(tenantId, studentProfileId) {
  const { profile, completed } = await loadStudent(tenantId, studentProfileId);
  const [terms, enrollments, submissions, assignmentCount, progress] = await Promise.all([
    prisma.transcriptTerm.findMany({ where: { tenantId, studentProfileId }, orderBy: { sortOrder: 'asc' } }),
    prisma.enrollment.findMany({ where: { tenantId, studentProfileId }, include: { course: true, gradeComponents: { orderBy: { sortOrder: 'asc' } } } }),
    prisma.assignmentSubmission.findMany({ where: { tenantId, studentProfileId } }),
    prisma.assignment.count({ where: { tenantId, course: { enrollments: { some: { studentProfileId } } } } }),
    getDegreeProgress(tenantId, studentProfileId),
  ]);

  const gradeOrder = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'];
  const distribution = gradeOrder
    .map((grade) => ({ grade, count: completed.filter((course) => course.grade === grade).length }))
    .filter((row) => row.count > 0 || ['A', 'A-', 'B+', 'B'].includes(row.grade));

  const submitted = submissions.filter((row) => ['Completed', 'Submitted'].includes(row.status)).length;
  return {
    gpaTrend: terms
      .filter((term) => !term.isInProgress && term.termGpa != null)
      .map((term) => ({ term: term.termLabel, termGpa: toNumber(term.termGpa), cumulativeGpa: toNumber(term.cumulativeGpa), credits: term.creditsEarned ?? term.creditsAttempted })),
    creditsByTerm: terms.map((term) => ({ term: term.termLabel.replace(' (Current Term)', ''), credits: term.creditsEarned ?? term.creditsAttempted, inProgress: term.isInProgress })),
    gradeDistribution: distribution,
    currentCourses: enrollments.map((row) => ({
      code: row.course.code,
      name: row.course.name,
      percentage: toNumber(row.percentage),
      letterGrade: row.letterGrade,
      components: row.gradeComponents.map((component) => ({ label: component.label, score: component.scoreLabel })),
    })),
    assignments: { total: assignmentCount, submitted, outstanding: Math.max(0, assignmentCount - submitted) },
    summary: {
      cumulativeGpa: toNumber(profile.cumulativeGpa),
      majorGpa: toNumber(profile.majorGpa),
      semesterGpa: toNumber(profile.semesterGpa),
      degreePercent: progress.percentComplete,
      completedCourses: completed.length,
    },
  };
}
