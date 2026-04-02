// dashboard.mjs — Pure scoring dashboard helpers reusable across store/web/CLI

const DASHBOARD_DIMENSIONS = [
  'outcomeLeverage',
  'batnaDiscipline',
  'emotionalRegulation',
  'biasResistance',
  'conversationalFlow',
];

export function computeDashboardStats(sessions = [], progression = {}) {
  const recentSessions = sessions.slice(0, 10);
  const averageScore = recentSessions.length > 0
    ? Math.round(recentSessions.reduce((sum, session) => sum + (session.feedback?.globalScore || 0), 0) / recentSessions.length)
    : 0;

  const latest = sessions[0] || null;
  const earliest = sessions[sessions.length - 1] || null;
  const latestScore = latest?.feedback?.globalScore || 0;
  const earliestScore = earliest?.feedback?.globalScore || latestScore || 0;

  const scoreHistory = recentSessions
    .slice()
    .reverse()
    .map((session) => ({
      id: session.id,
      score: session.feedback?.globalScore || 0,
      mode: session.mode || 'cli',
      difficulty: session.brief?.difficulty || 'neutral',
      date: session.date,
    }));

  const modeBreakdownMap = new Map();
  const difficultyBreakdownMap = new Map();
  const dimensionTotals = Object.fromEntries(DASHBOARD_DIMENSIONS.map((dimension) => [dimension, 0]));
  let dimensionCount = 0;

  for (const session of sessions) {
    const mode = session.mode || 'cli';
    modeBreakdownMap.set(mode, (modeBreakdownMap.get(mode) || 0) + 1);

    const difficulty = session.brief?.difficulty || 'neutral';
    difficultyBreakdownMap.set(difficulty, (difficultyBreakdownMap.get(difficulty) || 0) + 1);

    const scores = session.feedback?.scores;
    if (scores && typeof scores === 'object') {
      dimensionCount += 1;
      for (const dimension of DASHBOARD_DIMENSIONS) {
        dimensionTotals[dimension] += Number(scores[dimension] || 0);
      }
    }
  }

  const dimensionAverages = DASHBOARD_DIMENSIONS.map((dimension) => ({
    dimension,
    average: dimensionCount > 0 ? Math.round(dimensionTotals[dimension] / dimensionCount) : 0,
  }));

  const bestDimension = dimensionAverages.reduce(
    (best, current) => (current.average > best.average ? current : best),
    { dimension: null, average: -1 },
  );
  const weakestDimension = dimensionAverages.reduce(
    (worst, current) => (worst.dimension === null || current.average < worst.average ? current : worst),
    { dimension: null, average: Infinity },
  );

  const modeBreakdown = [...modeBreakdownMap.entries()]
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count || a.mode.localeCompare(b.mode));

  const difficultyBreakdown = [...difficultyBreakdownMap.entries()]
    .map(([difficulty, count]) => ({ difficulty, count }))
    .sort((a, b) => b.count - a.count || a.difficulty.localeCompare(b.difficulty));

  return {
    totalSessions: sessions.length,
    currentStreak: progression.currentStreak || 0,
    averageScore,
    latestScore,
    progressionDelta: latest ? latestScore - earliestScore : 0,
    belts: progression.belts || {},
    weakDimensions: progression.weakDimensions || [],
    recentSessionIds: recentSessions.map((session) => session.id),
    scoreHistory,
    modeBreakdown,
    difficultyBreakdown,
    dimensionAverages,
    bestDimension,
    weakestDimension,
  };
}
