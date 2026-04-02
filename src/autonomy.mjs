// autonomy.mjs — 5-level autonomy ladder for NegotiateAI

const LADDER = [
  { level: 1, key: 'guided', label: 'Guidé', minSessions: 0, minAvgScore: 0, minBelts: 0 },
  { level: 2, key: 'assisted', label: 'Assisté', minSessions: 3, minAvgScore: 45, minBelts: 0 },
  { level: 3, key: 'shadow', label: 'Shadow', minSessions: 8, minAvgScore: 55, minBelts: 1 },
  { level: 4, key: 'delegated', label: 'Délégué', minSessions: 15, minAvgScore: 65, minBelts: 2 },
  { level: 5, key: 'autonomous', label: 'Autonome', minSessions: 30, minAvgScore: 75, minBelts: 4 },
];

export function getAutonomyDefinitions() {
  return LADDER.map((entry) => ({ ...entry }));
}

export function evaluateAutonomyLevel({ totalSessions = 0, avgScore = 0, earnedBelts = 0 } = {}) {
  let current = LADDER[0];
  for (const step of LADDER) {
    if (totalSessions >= step.minSessions && avgScore >= step.minAvgScore && earnedBelts >= step.minBelts) {
      current = step;
    }
  }

  const next = LADDER.find((step) => step.level === current.level + 1) || null;
  return {
    ...current,
    totalSessions,
    avgScore,
    earnedBelts,
    next,
  };
}

export function describeAutonomyGap(summary) {
  if (!summary?.next) return 'Autonomy ladder maxed';
  const gaps = [];
  if ((summary.totalSessions || 0) < summary.next.minSessions) gaps.push(`${summary.next.minSessions - (summary.totalSessions || 0)} sessions`);
  if ((summary.avgScore || 0) < summary.next.minAvgScore) gaps.push(`${Math.ceil(summary.next.minAvgScore - (summary.avgScore || 0))} pts de score moyen`);
  if ((summary.earnedBelts || 0) < summary.next.minBelts) gaps.push(`${summary.next.minBelts - (summary.earnedBelts || 0)} ceinture(s)`);
  return gaps.length > 0 ? gaps.join(' + ') : 'Ready to unlock next level';
}
