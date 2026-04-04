// dashboard.mjs — Pure scoring dashboard helpers reusable across store/web/CLI

import { BELT_DEFINITIONS } from './belt.mjs';
import { evaluateAutonomyLevel, describeAutonomyGap } from './autonomy.mjs';
import { recommendBiasTraining } from './biasTracker.mjs';
import { recommendDrill } from './drill.mjs';
import { generateVaccinationCard, formatShareableCard } from './vaccination.mjs';

const DASHBOARD_DIMENSIONS = [
  'outcomeLeverage',
  'batnaDiscipline',
  'emotionalRegulation',
  'biasResistance',
  'conversationalFlow',
];

function classifyScoreTrend(delta) {
  if (delta >= 8) return 'improving';
  if (delta <= -8) return 'declining';
  return 'stable';
}

function buildBeltProgress(belts = {}) {
  return BELT_DEFINITIONS.map((definition) => {
    const status = belts[definition.color] || {};
    const qualifyingSessions = Number(status.qualifyingSessions || 0);
    return {
      color: definition.color,
      name: definition.name,
      earned: Boolean(status.earned),
      qualifyingSessions,
      requiredSessions: definition.requiredSessions,
      remainingSessions: Math.max(0, definition.requiredSessions - qualifyingSessions),
      requiredDifficulty: definition.requiredDifficulty,
      requiresEvents: definition.requiresEvents,
      dimension: definition.dimension,
      threshold: definition.threshold,
    };
  });
}

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

  const progressionDelta = latest ? latestScore - earliestScore : 0;

  return {
    totalSessions: sessions.length,
    currentStreak: progression.currentStreak || 0,
    averageScore,
    latestScore,
    progressionDelta,
    scoreTrend: classifyScoreTrend(progressionDelta),
    belts: progression.belts || {},
    beltProgress: buildBeltProgress(progression.belts || {}),
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

export function buildPlayerDashboard(sessions = [], progression = {}, options = {}) {
  const stats = computeDashboardStats(sessions, progression);
  const card = generateVaccinationCard(progression, sessions);
  const earnedCount = Object.values(progression.belts || {}).filter((belt) => belt?.earned).length;
  const autonomy = evaluateAutonomyLevel({
    totalSessions: stats.totalSessions,
    avgScore: stats.averageScore,
    earnedBelts: earnedCount,
  });

  return {
    playerId: options.playerId || null,
    generatedAt: options.generatedAt || new Date().toISOString(),
    stats,
    card,
    shareable: formatShareableCard(card),
    autonomy: {
      level: autonomy.level,
      label: autonomy.label,
      key: autonomy.key,
      gap: describeAutonomyGap(autonomy),
      next: autonomy.next,
    },
    biasRecommendation: recommendBiasTraining(progression.biasProfile || {}),
    recommendedDrillId: recommendDrill(progression),
  };
}

const DIMENSION_LABELS = {
  outcomeLeverage: { label: 'clarte et resultat', max: 25 },
  batnaDiscipline: { label: 'tenue de ligne', max: 20 },
  emotionalRegulation: { label: 'calme', max: 25 },
  biasResistance: { label: 'lucidite', max: 15 },
  conversationalFlow: { label: 'fluidite', max: 15 },
};

const BIAS_LABELS = {
  anchoring: 'ancrage',
  loss_aversion: 'aversion a la perte',
  conflict_avoidance: 'evitement du conflit',
  framing: 'effet de cadrage',
  conversational_blocking: 'blocage conversationnel',
};

export function buildCognitiveInsights(sessions = [], progression = {}) {
  const total = sessions.filter((s) => (s.cohort || 'player') === 'player').length;
  const confidence = total >= 15 ? 'high' : total >= 5 ? 'medium' : 'low';
  const prefix = confidence === 'low' ? 'Signal faible — ' : '';
  const insights = [];

  // Top bias
  const biasProfile = progression.biasProfile || {};
  const biasEntries = Object.entries(biasProfile)
    .filter(([k]) => !k.startsWith('_'))
    .filter(([, v]) => v && typeof v.frequency === 'number')
    .sort((a, b) => b[1].frequency - a[1].frequency);

  if (biasEntries.length > 0 && biasEntries[0][1].frequency > 0.3) {
    const [biasType, data] = biasEntries[0];
    const label = BIAS_LABELS[biasType] || biasType;
    insights.push({
      type: 'bias',
      text: `${prefix}Tu montres une tendance à l'${label} (${Math.round(data.frequency * 100)}% des sessions).`,
      dimension: biasType,
    });
  }

  // Weakest dimension
  const stats = computeDashboardStats(sessions, progression);
  const dimAvgs = stats.dimensionAverages || [];
  if (dimAvgs.length > 0) {
    const weakest = dimAvgs.reduce((a, b) => {
      const aInfo = DIMENSION_LABELS[a.dimension] || { max: 100 };
      const bInfo = DIMENSION_LABELS[b.dimension] || { max: 100 };
      return (a.average / aInfo.max) < (b.average / bInfo.max) ? a : b;
    });
    const info = DIMENSION_LABELS[weakest.dimension] || { label: weakest.dimension, max: 100 };
    const pct = Math.round((weakest.average / info.max) * 100);
    if (pct < 60) {
      insights.push({
        type: 'weakness',
        text: `${prefix}Ta dimension la plus fragile : ${info.label} (${weakest.average}/${info.max}).`,
        dimension: weakest.dimension,
      });
    }
  }

  // Strongest dimension
  if (dimAvgs.length > 0) {
    const strongest = dimAvgs.reduce((a, b) => {
      const aInfo = DIMENSION_LABELS[a.dimension] || { max: 100 };
      const bInfo = DIMENSION_LABELS[b.dimension] || { max: 100 };
      return (a.average / aInfo.max) > (b.average / bInfo.max) ? a : b;
    });
    const info = DIMENSION_LABELS[strongest.dimension] || { label: strongest.dimension, max: 100 };
    const pct = Math.round((strongest.average / info.max) * 100);
    if (pct >= 70) {
      insights.push({
        type: 'strength',
        text: `${prefix}Ton point fort : ${info.label} (${strongest.average}/${info.max}).`,
        dimension: strongest.dimension,
      });
    }
  }

  // Training prescription
  const biasRec = recommendBiasTraining(biasProfile);
  const drillRec = recommendDrill(progression);
  const trainingPrescription = biasRec
    ? { reason: biasRec.reason, drillId: drillRec, biasType: biasRec.biasType }
    : drillRec
      ? { reason: 'Exercice recommandé pour progresser.', drillId: drillRec, biasType: null }
      : null;

  return {
    insights,
    confidence,
    totalSessions: total,
    trainingPrescription,
  };
}
