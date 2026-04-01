// war-room.mjs — Overnight batch drills orchestrator
// Contract: runWarRoom(store, provider, options?) → WarRoomReport

import { randomUUID } from './store.mjs';
import { createDrill, DRILL_CATALOG, recommendDrill, scoreDrill } from './drill.mjs';
import { calibrateDifficulty } from './daily.mjs';
import { analyzeSessionBiases, recommendBiasTraining, updateBiasProfile } from './biasTracker.mjs';
import { evaluateBelts, identifyWeaknesses } from './belt.mjs';
import { processTurn } from './engine.mjs';

const DEFAULT_DRILL_COUNT = 50;

const DIMENSION_TO_DRILL = {
  conversationalFlow: 'mirror',
  outcomeLeverage: 'anchor',
  emotionalRegulation: 'pressure',
  batnaDiscipline: 'batna',
  biasResistance: 'reframe',
};

const BIAS_TO_DRILLS = {
  anchoring: ['anchor'],
  loss_aversion: ['batna'],
  conflict_avoidance: ['pressure'],
  framing: ['reframe'],
  conversational_blocking: ['mirror'],
};

const AUTO_MESSAGE_FALLBACKS = {
  mirror: [
    'On dirait que le vrai sujet est le risque de dérapage sur le délai.',
    'Il semble que vous vouliez surtout de la visibilité avant de bouger.',
    'Si je vous comprends bien, votre priorité est de réduire l\'incertitude.',
  ],
  anchor: [
    'Je pose une base à 780 euros par jour compte tenu de l\'impact attendu.',
    'Mon point de départ reste 15% avec un engagement clair sur le périmètre.',
    'Je peux ajuster les modalités, mais mon ancre reste 780.',
    'Si nous voulons avancer vite, partons sur 750 et discutons des contreparties.',
  ],
  pressure: [
    'Je comprends l\'urgence. Restons factuels et regardons ce qui est soutenable.',
    'Je ne vais pas répondre à la pression, mais je peux clarifier mes conditions.',
    'Si vous voulez une décision rapide, cadrons le minimum acceptable de part et d\'autre.',
    'Je reste calme, et je préfère qu\'on traite les contraintes une par une.',
    'Je peux avancer aujourd\'hui si l\'accord respecte mes lignes rouges.',
  ],
  batna: [
    'Je ne peux pas descendre sous mon seuil minimal, mais je peux ajuster le rythme.',
    'Je garde des alternatives ouvertes, donc je dois protéger ce minimum.',
    'Si nous restons sous ce niveau, je préfère activer mon autre option.',
    'Je ne détaille pas mon plan B, mais il me permet de rester discipliné.',
  ],
  reframe: [
    'Je n\'accepte pas ce cadrage. Le vrai sujet est la valeur créée, pas l\'usage habituel.',
    'Dire que c\'est standard ne suffit pas. Regardons ce que coûte réellement l\'alternative.',
    'Je préfère reframer: on parle ici de résultat livré et de risque évité.',
  ],
};

const WAR_ROOM_BRIEF_TEMPLATES = {
  mirror: {
    situation: 'Rattraper une relation client tendue après un retard de livraison.',
    userRole: 'Chef de projet',
    adversaryRole: 'Client frustré',
    objective: 'Obtenir 2 semaines de délai sans casser la relation',
    minimalThreshold: '1 semaine supplémentaire',
    batna: 'Livrer une version réduite dans le délai initial',
    constraints: ['Préserver la confiance'],
    relationalStakes: 'Élevé',
  },
  anchor: {
    situation: 'Renégociation d\'un contrat de consulting stratégique.',
    userRole: 'Consultant senior',
    adversaryRole: 'Directeur achats',
    objective: 'Maintenir le tarif à 1200 euros par jour',
    minimalThreshold: '1050 euros par jour',
    batna: 'Un autre client prêt à signer à 1100 euros',
    constraints: ['Signature avant fin de semaine'],
    relationalStakes: 'Moyen',
  },
  pressure: {
    situation: 'Négociation de sortie avec un fournisseur agressif.',
    userRole: 'Responsable opérations',
    adversaryRole: 'Fournisseur en position de force',
    objective: 'Réduire la pénalité de rupture de 50%',
    minimalThreshold: 'Limiter la pénalité à 75%',
    batna: 'Migrer vers un prestataire alternatif en 30 jours',
    constraints: ['Pas d\'interruption de service'],
    relationalStakes: 'Faible',
  },
  batna: {
    situation: 'Discussion salariale face à un manager qui teste votre seuil.',
    userRole: 'Lead developer',
    adversaryRole: 'Manager',
    objective: 'Obtenir 12% d\'augmentation',
    minimalThreshold: '8% d\'augmentation',
    batna: 'Process avancé chez un concurrent',
    constraints: ['Rester professionnel'],
    relationalStakes: 'Élevé',
  },
  reframe: {
    situation: 'Renégociation d\'un contrat logiciel présenté comme non négociable.',
    userRole: 'Acheteur entreprise',
    adversaryRole: 'Commercial enterprise',
    objective: 'Obtenir une remise de 15% ou davantage de services inclus',
    minimalThreshold: '10% de remise ou onboarding inclus',
    batna: 'Conserver l\'outil actuel pendant 6 mois',
    constraints: ['Budget verrouillé ce trimestre'],
    relationalStakes: 'Moyen',
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeBiasProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return {};
  }
  return structuredClone(profile);
}

function countValues(values) {
  return values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function buildProgressionSnapshot(progression = {}) {
  return {
    totalSessions: progression.totalSessions || 0,
    currentStreak: progression.currentStreak || 0,
    recentAvgScore: progression.recentAvgScore || 0,
    currentDifficulty: progression.currentDifficulty || 'cooperative',
    weakDimensions: Array.isArray(progression.weakDimensions) ? [...progression.weakDimensions] : [],
  };
}

function buildDrillPlan({ drillCount, biasRecommendation, weakDimensions, coldStart }) {
  if (coldStart) {
    const roundRobin = DRILL_CATALOG.map((drill) => drill.id);
    return {
      primaryDrillId: null,
      plan: Array.from({ length: drillCount }, (_, index) => roundRobin[index % roundRobin.length]),
    };
  }

  const focusDrills = biasRecommendation ? (BIAS_TO_DRILLS[biasRecommendation.biasType] || []) : [];
  const weaknessDrills = weakDimensions
    .map((dimension) => DIMENSION_TO_DRILL[dimension])
    .filter(Boolean);

  const weightedPool = [
    ...focusDrills,
    ...focusDrills,
    ...focusDrills,
    ...weaknessDrills,
    recommendDrill({ weakDimensions }),
  ].filter(Boolean);

  const dedupedPool = weightedPool.length > 0 ? weightedPool : ['mirror'];
  return {
    primaryDrillId: focusDrills[0] || dedupedPool[0] || null,
    plan: Array.from({ length: drillCount }, (_, index) => dedupedPool[index % dedupedPool.length]),
  };
}

function buildBriefForDrill(drillId, difficulty) {
  return {
    ...(WAR_ROOM_BRIEF_TEMPLATES[drillId] || WAR_ROOM_BRIEF_TEMPLATES.mirror),
    difficulty,
  };
}

function buildFallbackAutoMessage(drillId, turnIndex) {
  const candidates = AUTO_MESSAGE_FALLBACKS[drillId] || AUTO_MESSAGE_FALLBACKS.mirror;
  return candidates[turnIndex % candidates.length];
}

async function generateAutoMessage({ session, drill, provider, runIndex, turnIndex, totalRuns }) {
  const fallback = buildFallbackAutoMessage(drill.id, turnIndex);

  try {
    const result = await provider.generateJson({
      system: `You are auto-playing the user side of a negotiation drill inside NegotiateAI's Overnight War Room.
Return JSON with exactly one field: { "message": "string" }.
Write a realistic, concise negotiation move aligned with the target skill.
Drill focus: ${drill.name}
Coaching focus: ${drill.coachingFocus}`,
      prompt: `War Room run ${runIndex + 1}/${totalRuns}
Drill id: ${drill.id}
Difficulty: ${session.brief.difficulty}
Objective: ${session.brief.objective}
Minimum threshold: ${session.brief.minimalThreshold}
BATNA: ${session.brief.batna}
Turn: ${turnIndex + 1}/${session.maxTurns}
Adversary: ${session.adversary.identity}
Transcript so far:
${session.transcript.map((entry) => `${entry.role}: ${entry.content}`).join('\n') || '(opening move)'}

Generate the next user message in the same language as the brief.`,
      schemaName: 'autoMessage',
      temperature: 0.4,
    });
    if (typeof result.message === 'string' && result.message.trim().length > 0) {
      return result.message.trim();
    }
  } catch {
    // Fallback to a deterministic message so one missed helper call does not kill the batch.
  }

  return fallback;
}

function toStoredBiases(biasReport) {
  return (biasReport.biases || []).map((bias) => ({
    biasType: bias.biasType,
    turn: bias.turn,
    excerpt: bias.evidence,
    explanation: `Auto-detected in War Room (severity ${Math.round((bias.severity || 0) * 100)}%)`,
  }));
}

async function runSingleDrill({ store, provider, drillId, difficulty, batchId, runIndex, totalRuns, targetBias }) {
  const rawBrief = buildBriefForDrill(drillId, difficulty);
  const { session, drill } = await createDrill(drillId, provider, { brief: rawBrief });

  while (session.status === 'active' && session.turn < session.maxTurns) {
    const autoMessage = await generateAutoMessage({
      session,
      drill,
      provider,
      runIndex,
      turnIndex: session.turn,
      totalRuns,
    });
    const result = await processTurn(session, autoMessage);
    if (result.sessionOver) break;
  }

  const drillResult = await scoreDrill(session, drill, provider);
  const biasReport = analyzeSessionBiases(
    session.transcript,
    {
      activeAnchor: session.activeAnchor,
      confidence: session.confidence,
      frustration: session.frustration,
      pressure: session.pressure || 0,
      concessions: session.concessions,
    },
    session.brief,
  );

  await store.saveSession({
    id: randomUUID(),
    date: new Date().toISOString(),
    brief: session.brief,
    adversary: session.adversary,
    transcript: session.transcript,
    status: session.status === 'active' ? 'ended' : session.status,
    turns: session.turn,
    feedback: {
      globalScore: drillResult.skillScore,
      scores: { [drill.skill]: drillResult.skillScore },
      biasesDetected: toStoredBiases(biasReport),
      recommendations: drillResult.tips,
      tacticalScore: { score: drillResult.skillScore, breakdown: { [drill.skill]: drillResult.skillScore } },
    },
    mode: 'war-room',
    drillId: drill.id,
    warRoomBatchId: batchId,
    warRoomIndex: runIndex + 1,
    warRoomTargetBias: targetBias,
    autoPlayed: true,
  });

  return {
    drillId: drill.id,
    skill: drill.skill,
    skillScore: drillResult.skillScore,
    turns: session.turn,
    passed: drillResult.passed,
    biasReport,
  };
}

async function generateStrategy({ provider, difficulty, targetedBias, weakDimensions, avgScore, drillCounts, nextBiasRecommendation }) {
  try {
    const result = await provider.generateJson({
      system: `You are a negotiation coach synthesizing an overnight training batch.
Return JSON with exactly one field:
{
  "strategy": "string"
}
The strategy must be concrete, concise, and actionable for the next real negotiation.`,
      prompt: `Overnight War Room summary:
Difficulty trained: ${difficulty}
Average score: ${avgScore}/100
Targeted bias: ${targetedBias || 'none'}
Next persistent bias: ${nextBiasRecommendation?.biasType || 'none'}
Weak dimensions: ${weakDimensions.join(', ') || 'none'}
Drill mix: ${JSON.stringify(drillCounts)}

Write one strategy paragraph in the same language as the underlying data.`,
      schemaName: 'warRoomStrategy',
      temperature: 0.3,
    });
    if (typeof result.strategy === 'string' && result.strategy.trim().length > 0) {
      return result.strategy.trim();
    }
  } catch {
    // Fall through to algorithmic fallback.
  }

  const priority = nextBiasRecommendation?.biasType || targetedBias || weakDimensions[0] || 'discipline';
  return `Priorité du jour: consolide ${priority}. Ouvre plus haut, protège ton seuil minimal, et cherche une reformulation active avant toute concession importante.`;
}

function computeNextProgression({ previous, sessions, biasProfile, difficulty, now }) {
  const today = now.slice(0, 10);
  const yesterday = new Date(Date.parse(now) - 86_400_000).toISOString().slice(0, 10);
  const streak = previous.lastSessionDate === yesterday
    ? (previous.currentStreak || 0) + 1
    : previous.lastSessionDate === today
      ? (previous.currentStreak || 0)
      : 1;

  const recentScores = sessions
    .slice(0, 3)
    .map((session) => session.feedback?.globalScore || 0);
  const recentAvgScore = recentScores.length > 0
    ? Math.round(recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length)
    : 0;

  return {
    ...previous,
    belts: evaluateBelts(sessions),
    biasProfile,
    totalSessions: sessions.length,
    currentStreak: streak,
    lastSessionDate: today,
    weakDimensions: identifyWeaknesses(sessions),
    recentAvgScore,
    currentDifficulty: difficulty,
  };
}

export async function runWarRoom(store, provider, options = {}) {
  if (!store || typeof store.loadProgression !== 'function' || typeof store.saveSession !== 'function') {
    throw new Error('runWarRoom requires a valid store');
  }
  if (!provider || typeof provider.generateJson !== 'function') {
    throw new Error('runWarRoom requires a valid provider');
  }

  const drillCount = clamp(Math.floor(options.drillCount ?? DEFAULT_DRILL_COUNT), 1, 500);
  const startedAt = new Date().toISOString();
  const batchId = options.batchId || `war-room-${startedAt.slice(0, 10)}-${randomUUID().slice(0, 8)}`;

  const previousProgression = await store.loadProgression();
  const sessionsBefore = await store.loadSessions();
  const beforeSnapshot = buildProgressionSnapshot(previousProgression);
  let biasProfile = normalizeBiasProfile(previousProgression.biasProfile);

  const biasRecommendation = recommendBiasTraining(biasProfile);
  const weakDimensions = sessionsBefore.length > 0
    ? identifyWeaknesses(sessionsBefore)
    : ['biasResistance', 'batnaDiscipline'];
  const difficulty = options.difficulty || calibrateDifficulty(previousProgression);

  const { plan: drillPlan, primaryDrillId } = buildDrillPlan({
    drillCount,
    biasRecommendation,
    weakDimensions,
    coldStart: sessionsBefore.length === 0,
  });

  let drillsCompleted = 0;
  let drillsFailed = 0;
  let totalScore = 0;
  let totalTurns = 0;
  const failedDrills = [];

  for (let index = 0; index < drillPlan.length; index++) {
    const drillId = drillPlan[index];
    try {
      const result = await runSingleDrill({
        store,
        provider,
        drillId,
        difficulty,
        batchId,
        runIndex: index,
        totalRuns: drillPlan.length,
        targetBias: biasRecommendation?.biasType || null,
      });

      biasProfile = updateBiasProfile(biasProfile, result.biasReport, new Date().toISOString());
      drillsCompleted += 1;
      totalScore += result.skillScore;
      totalTurns += result.turns;
    } catch (error) {
      drillsFailed += 1;
      failedDrills.push({ drillId, error: error.message });
    }
  }

  const sessionsAfter = await store.loadSessions();
  const nextProgression = computeNextProgression({
    previous: previousProgression,
    sessions: sessionsAfter,
    biasProfile,
    difficulty,
    now: new Date().toISOString(),
  });
  await store.saveProgression(nextProgression);

  const nextBiasRecommendation = recommendBiasTraining(biasProfile);
  const avgScore = drillsCompleted > 0 ? Math.round(totalScore / drillsCompleted) : 0;
  const avgTurns = drillsCompleted > 0 ? parseFloat((totalTurns / drillsCompleted).toFixed(1)) : 0;
  const drillCounts = countValues(drillPlan);
  const strategy = await generateStrategy({
    provider,
    difficulty,
    targetedBias: biasRecommendation?.biasType || null,
    weakDimensions: nextProgression.weakDimensions || weakDimensions,
    avgScore,
    drillCounts,
    nextBiasRecommendation,
  });

  const report = {
    batchId,
    startedAt,
    completedAt: new Date().toISOString(),
    drillCountRequested: drillCount,
    drillsCompleted,
    drillsFailed,
    avgScore,
    avgTurns,
    difficulty,
    targetedBias: biasRecommendation?.biasType || null,
    targetedDrillId: primaryDrillId,
    drillPlan,
    drillCounts,
    failedDrills,
    biasProfile,
    nextBiasRecommendation,
    weakDimensions: nextProgression.weakDimensions || weakDimensions,
    progression: {
      before: beforeSnapshot,
      after: buildProgressionSnapshot(nextProgression),
    },
    strategy,
  };

  assertValidWarRoomReport(report);
  return report;
}

export async function generateMorningReport(result, _provider) {
  assertValidWarRoomReport(result);

  const biasLine = result.nextBiasRecommendation
    ? `${result.nextBiasRecommendation.biasType} (${Math.round(result.nextBiasRecommendation.urgency * 100)}%)`
    : 'aucun biais persistant prioritaire';
  const mix = Object.entries(result.drillCounts)
    .map(([drillId, count]) => `${drillId} x${count}`)
    .join(', ');
  const failureLine = result.drillsFailed > 0
    ? `Échecs: ${result.drillsFailed} (${result.failedDrills.map((entry) => `${entry.drillId}: ${entry.error}`).join('; ')})`
    : 'Échecs: 0';

  return [
    `=== Overnight War Room — ${result.completedAt.slice(0, 10)} ===`,
    `Batch: ${result.batchId}`,
    `Drills complétés: ${result.drillsCompleted}/${result.drillCountRequested}`,
    `Score moyen: ${result.avgScore}/100 | Tours moyens: ${result.avgTurns}`,
    `Difficulté: ${result.difficulty}`,
    `Biais ciblé: ${result.targetedBias || 'cold start'} | Drill principal: ${result.targetedDrillId || 'rotation'}`,
    `Mix: ${mix || 'n/a'}`,
    `Biais persistant: ${biasLine}`,
    `Faiblesses actuelles: ${result.weakDimensions.join(', ') || 'n/a'}`,
    failureLine,
    '',
    `Stratégie du jour: ${result.strategy}`,
  ].join('\n');
}

export function assertValidWarRoomReport(report) {
  if (!report || typeof report !== 'object') throw new Error('WarRoomReport must be an object');
  if (typeof report.batchId !== 'string' || report.batchId.length === 0) throw new Error('WarRoomReport missing batchId');
  if (typeof report.startedAt !== 'string' || typeof report.completedAt !== 'string') throw new Error('WarRoomReport missing timestamps');
  if (typeof report.drillCountRequested !== 'number' || report.drillCountRequested < 1) throw new Error('WarRoomReport invalid drillCountRequested');
  if (typeof report.drillsCompleted !== 'number' || report.drillsCompleted < 0) throw new Error('WarRoomReport invalid drillsCompleted');
  if (typeof report.drillsFailed !== 'number' || report.drillsFailed < 0) throw new Error('WarRoomReport invalid drillsFailed');
  if (typeof report.avgScore !== 'number' || report.avgScore < 0 || report.avgScore > 100) throw new Error('WarRoomReport invalid avgScore');
  if (typeof report.avgTurns !== 'number' || report.avgTurns < 0) throw new Error('WarRoomReport invalid avgTurns');
  if (typeof report.difficulty !== 'string' || report.difficulty.length === 0) throw new Error('WarRoomReport missing difficulty');
  if (!Array.isArray(report.drillPlan)) throw new Error('WarRoomReport missing drillPlan');
  if (!report.drillCounts || typeof report.drillCounts !== 'object' || Array.isArray(report.drillCounts)) throw new Error('WarRoomReport missing drillCounts');
  if (!Array.isArray(report.failedDrills)) throw new Error('WarRoomReport missing failedDrills');
  if (!report.biasProfile || typeof report.biasProfile !== 'object' || Array.isArray(report.biasProfile)) throw new Error('WarRoomReport missing biasProfile');
  if (!Array.isArray(report.weakDimensions)) throw new Error('WarRoomReport missing weakDimensions');
  if (!report.progression || typeof report.progression !== 'object') throw new Error('WarRoomReport missing progression');
  if (!report.progression.before || !report.progression.after) throw new Error('WarRoomReport missing progression snapshots');
  if (typeof report.strategy !== 'string' || report.strategy.trim().length === 0) throw new Error('WarRoomReport missing strategy');
}
