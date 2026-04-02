import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { createSession, processTurn } from './engine.mjs';
import { analyzeFeedback } from './analyzer.mjs';
import { createAnthropicProvider } from './provider.mjs';
import { createStore, randomUUID } from './store.mjs';
import { computeDashboardStats, buildPlayerDashboard } from './dashboard.mjs';
import { refreshProgression } from './progression.mjs';
import { evaluateAutonomyLevel, describeAutonomyGap } from './autonomy.mjs';
import { BELT_DEFINITIONS } from './belt.mjs';
import { simulateBeforeSend, simulateBeforeSendBatch } from './simulate.mjs';
import { generateDaily } from './daily.mjs';
import { DRILL_CATALOG, recommendDrill } from './drill.mjs';
import { generateReplay } from './replay.mjs';
import { selectScenarioOfWeek } from './leaderboard.mjs';
import { recommendBiasTraining } from './biasTracker.mjs';
import { listScenarios, loadScenario } from '../scenarios/index.mjs';
import { generateBriefing, buildObjectiveContract, buildContractFromSliders } from './briefing.mjs';
import { scoreRound, buildFightCard } from './fight-card.mjs';
import { computeUILayer, filterTurnResponse, getLayerDefinitions, shouldGuideRound } from './progressive-ui.mjs';
import { generateGuidedChoices, buildChoiceFeedback } from './guided-rounds.mjs';
import { analyzeWithTheory } from './negotiation-theory.mjs';
import { adjudicateVersusRound } from './versus.mjs';
import { getRealPrepQuestions, buildRealPrepBrief, generatePrepSheet } from './real-prep.mjs';
import { getJournalQuestions, buildJournalEntry, compareWithSimulation, computeRealWorldStats } from './journal.mjs';

const SCENARIO_PRESETS = [
  {
    id: 'salary',
    name: 'Négociation salariale',
    emoji: '💼',
    description: 'Vous demandez une augmentation à votre manager.',
    brief: {
      situation: 'Entretien annuel - vous êtes performant depuis 2 ans, pas d\'augmentation',
      userRole: 'Employé senior',
      adversaryRole: 'Manager direct',
      objective: 'Obtenir +15% de salaire',
      minimalThreshold: '+8% minimum acceptable',
      batna: 'Offre concurrente à +20% dans une autre entreprise',
      difficulty: 'neutral',
    },
  },
  {
    id: 'realestate',
    name: 'Achat immobilier',
    emoji: '🏠',
    description: 'Vous négociez le prix d\'un appartement.',
    brief: {
      situation: 'Achat d\'un 4 pièces à Lausanne, affiché à 850\'000 CHF',
      userRole: 'Acheteur',
      adversaryRole: 'Propriétaire vendeur',
      objective: 'Acheter à 780\'000 CHF',
      minimalThreshold: '820\'000 CHF maximum',
      batna: 'Deux autres biens similaires en visite cette semaine',
      difficulty: 'neutral',
    },
  },
  {
    id: 'freelance',
    name: 'Contrat freelance',
    emoji: '💻',
    description: 'Vous négociez un tarif journalier avec un client.',
    brief: {
      situation: 'Mission de 6 mois, client veut un TJM bas, vous êtes expert',
      userRole: 'Freelance développeur senior',
      adversaryRole: 'Directeur technique client',
      objective: 'TJM de 1\'200 CHF/jour',
      minimalThreshold: '950 CHF/jour minimum',
      batna: 'Pipeline de 3 autres missions potentielles',
      difficulty: 'hostile',
    },
  },
  {
    id: 'partnership',
    name: 'Partenariat startup',
    emoji: '🚀',
    description: 'Vous négociez un partenariat stratégique.',
    brief: {
      situation: 'Votre startup veut un partenariat de distribution avec un grand groupe',
      userRole: 'CEO de la startup',
      adversaryRole: 'VP Business Development du groupe',
      objective: 'Partenariat exclusif avec 30% de commission',
      minimalThreshold: 'Non-exclusif à 20% minimum',
      batna: 'Lancement en direct-to-consumer avec levée de fonds',
      difficulty: 'manipulative',
    },
  },
  {
    id: 'lease',
    name: 'Renégociation de bail',
    emoji: '🏢',
    description: 'Vous renégociez le loyer de vos bureaux.',
    brief: {
      situation: 'Fin de bail dans 3 mois, marché baissier, vous voulez rester',
      userRole: 'Directeur administratif',
      adversaryRole: 'Gérant de la régie immobilière',
      objective: 'Réduction de 15% du loyer + travaux offerts',
      minimalThreshold: 'Réduction de 8% du loyer sans travaux',
      batna: 'Trois offres de locaux équivalents à -20%',
      difficulty: 'cooperative',
    },
  },
  // --- Personnalités célèbres ---
  {
    id: 'vs-steve-jobs', category: 'celebrity',
    name: 'vs Steve Jobs', emoji: '🍎',
    description: 'Résistez au champ de distorsion de la réalité. Manipulateur de génie.',
    difficulty: 'manipulative',
    scenarioFile: 'vs-steve-jobs',
  },
  {
    id: 'vs-donald-trump', category: 'celebrity',
    name: 'vs Donald Trump', emoji: '🏗️',
    description: 'Ancrage extrême, bluff, attaques personnelles. Gardez votre calme.',
    difficulty: 'hostile',
    scenarioFile: 'vs-donald-trump',
  },
  {
    id: 'vs-christine-lagarde', category: 'celebrity',
    name: 'vs Christine Lagarde', emoji: '🏦',
    description: 'Diplomatie institutionnelle, droit, précédents. Patience stratégique.',
    difficulty: 'neutral',
    scenarioFile: 'vs-christine-lagarde',
  },
  {
    id: 'vs-warren-buffett', category: 'celebrity',
    name: 'vs Warren Buffett', emoji: '🎩',
    description: 'Patience infinie, offre unique, charme désarmant. Discipline BATNA.',
    difficulty: 'cooperative',
    scenarioFile: 'vs-warren-buffett',
  },
  {
    id: 'vs-elon-musk', category: 'celebrity',
    name: 'vs Elon Musk', emoji: '🚀',
    description: 'Chaos, objectifs impossibles, goalposts mobiles. Régulation émotionnelle.',
    difficulty: 'hostile',
    scenarioFile: 'vs-elon-musk',
  },
  // --- Scénarios extrêmes ---
  {
    id: 'vs-anna-wintour', category: 'extreme',
    name: 'vs Anna Wintour', emoji: '👗',
    description: 'Silence glacial, mépris poli, pouvoir de statut. Ne vous soumettez pas.',
    difficulty: 'hostile',
    scenarioFile: 'vs-anna-wintour',
  },
  {
    id: 'vs-poutine-diplomat', category: 'extreme',
    name: 'Négociateur Kremlin', emoji: '🕵️',
    description: 'Guerre psychologique, désinformation, menaces voilées. Tous les biais.',
    difficulty: 'manipulative',
    scenarioFile: 'vs-poutine-diplomat',
  },
  {
    id: 'vs-cartel-hostage', category: 'extreme',
    name: 'Libération d\'otage', emoji: '🚨',
    description: 'Négociation de crise. Enjeu vital, zéro marge d\'erreur.',
    difficulty: 'manipulative',
    scenarioFile: 'vs-cartel-hostage',
  },
  {
    id: 'vs-pharma-ceo', category: 'extreme',
    name: 'CEO Pharma cynique', emoji: '💊',
    description: 'Médicament vital, monopole, cynisme corporatif. Trouvez du leverage.',
    difficulty: 'hostile',
    scenarioFile: 'vs-pharma-ceo',
  },
  // --- Tutoriels (shown first for new users) ---
  {
    id: 'tutorial-01-cafe', category: 'tutorial',
    name: 'Le cafe du matin', emoji: '☕',
    description: 'Votre premier deal. Simple, fun, zero pression. 5 min.',
    difficulty: 'cooperative',
    scenarioFile: 'tutorial-01-cafe',
    tutorialLevel: 1,
  },
  {
    id: 'tutorial-02-raise', category: 'tutorial',
    name: 'Demander une augmentation', emoji: '💰',
    description: 'Le classique. Decouvrez le coaching temps reel.',
    difficulty: 'neutral',
    scenarioFile: 'tutorial-02-raise',
    tutorialLevel: 2,
  },
  {
    id: 'tutorial-03-investor', category: 'tutorial',
    name: 'Pitcher un investisseur', emoji: '📈',
    description: 'Les enjeux montent. Full cockpit deverrouille.',
    difficulty: 'hostile',
    scenarioFile: 'tutorial-03-investor',
    tutorialLevel: 3,
  },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, '..', 'web');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const SWISS_SCENARIO_PRESET_META = {
  'swiss-lease-renegotiation': { emoji: '🇨🇭', difficulty: 'cooperative' },
  'swiss-property-purchase': { emoji: '🏔️', difficulty: 'neutral' },
  'swiss-regie-owner-conflict': { emoji: '🏢', difficulty: 'hostile' },
};

async function buildScenarioPresets() {
  const packaged = await listScenarios();
  const swissPresets = packaged
    .filter((scenario) => scenario.id.startsWith('swiss-'))
    .map((scenario) => ({
      id: scenario.id,
      category: 'swiss',
      emoji: SWISS_SCENARIO_PRESET_META[scenario.id]?.emoji || '🇨🇭',
      name: scenario.name,
      description: scenario.description,
      difficulty: SWISS_SCENARIO_PRESET_META[scenario.id]?.difficulty || 'neutral',
      scenarioFile: scenario.id,
      tier: 'neutral',
      metadata: {
        ...(scenario.metadata || {}),
        category: 'swiss',
        scenarioFile: scenario.id,
        tier: 'neutral',
      },
    }));

  return [...SCENARIO_PRESETS, ...swissPresets].map((preset) => ({
    ...preset,
    tier: preset.tier || 'neutral',
    metadata: {
      id: preset.id,
      name: preset.name,
      category: preset.category || 'core',
      scenarioFile: preset.scenarioFile || preset.id,
      version: preset.metadata?.version,
      tier: preset.tier || 'neutral',
      ...(preset.metadata || {}),
    },
  }));
}

async function findScenarioPresetById(scenarioId) {
  const presets = await buildScenarioPresets();
  return presets.find((preset) => preset.id === scenarioId) || null;
}

async function buildScenarioDetailById(scenarioId, tier = 'neutral') {
  const preset = await findScenarioPresetById(scenarioId);
  if (!preset) return null;

  if (!preset.scenarioFile) return preset;

  const scenario = await loadScenario(preset.scenarioFile, tier);
  return {
    ...preset,
    tier,
    metadata: scenario.metadata,
    brief: buildBrief(scenario.brief),
    adversary: scenario.adversary,
  };
}

function filterDashboardSessions(sessions, filters) {
  return sessions.filter((session) => {
    if (filters.playerId && (session.playerId || null) !== filters.playerId) return false;
    if (filters.mode && (session.mode || 'cli') !== filters.mode) return false;
    if (filters.difficulty && (session.brief?.difficulty || 'neutral') !== filters.difficulty) return false;
    if (filters.scenarioId) {
      const sessionScenarioId = session.scenario?.id || session.scenarioId || null;
      if (sessionScenarioId !== filters.scenarioId) return false;
    }
    return true;
  });
}

function filterAnalyticsEvents(events, filters) {
  return events.filter((event) => {
    if (filters.playerId && (event.playerId || null) !== filters.playerId) return false;
    if (filters.mode && (event.mode || 'cli') !== filters.mode) return false;
    if (filters.difficulty && (event.difficulty || 'neutral') !== filters.difficulty) return false;
    if (filters.scenarioId && (event.scenarioId || null) !== filters.scenarioId) return false;
    if (filters.type && (event.type || null) !== filters.type) return false;
    return true;
  });
}

function summarizeAnalyticsEvents(events) {
  const summary = {
    totalEvents: events.length,
    totalCompletedSessions: 0,
    averageScore: 0,
    averageTurns: 0,
    grades: {},
    eventTypes: {},
    scenarios: {},
  };

  if (events.length === 0) {
    return summary;
  }

  let scoreSum = 0;
  let turnsSum = 0;

  for (const event of events) {
    const type = event.type || 'unknown';
    summary.eventTypes[type] = (summary.eventTypes[type] || 0) + 1;

    if (event.scenarioId) {
      summary.scenarios[event.scenarioId] = (summary.scenarios[event.scenarioId] || 0) + 1;
    }

    if (type === 'session_complete') {
      summary.totalCompletedSessions += 1;
      scoreSum += Number(event.globalScore || 0);
      turnsSum += Number(event.turns || 0);
      if (event.grade) {
        summary.grades[event.grade] = (summary.grades[event.grade] || 0) + 1;
      }
    }
  }

  if (summary.totalCompletedSessions > 0) {
    summary.averageScore = Math.round(scoreSum / summary.totalCompletedSessions);
    summary.averageTurns = Number((turnsSum / summary.totalCompletedSessions).toFixed(1));
  }

  return summary;
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

async function serveStatic(res, filePath) {
  const content = await readFile(filePath);
  const type = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  res.end(content);
}

// ── Rate limiter (in-memory, per-IP, no deps) ──────────────────────────────
function createRateLimiter({ windowMs = 60_000, maxRequests = 20 } = {}) {
  const hits = new Map();
  // Cleanup every 2 minutes
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, timestamps] of hits) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) hits.delete(ip);
      else hits.set(ip, valid);
    }
  }, 120_000);
  if (cleanup.unref) cleanup.unref();

  return {
    check(ip) {
      const now = Date.now();
      const cutoff = now - windowMs;
      const timestamps = (hits.get(ip) || []).filter((t) => t > cutoff);
      timestamps.push(now);
      hits.set(ip, timestamps);
      return timestamps.length <= maxRequests;
    },
  };
}

// ── Session cleanup (TTL + max) ─────────────────────────────────────────────
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ACTIVE_SESSIONS = 50;

function cleanupSessions(activeSessions) {
  const now = Date.now();
  for (const [id, session] of activeSessions) {
    if (session._createdAt && (now - session._createdAt) > SESSION_TTL_MS) {
      activeSessions.delete(id);
    }
  }
  // If still too many, remove oldest
  if (activeSessions.size > MAX_ACTIVE_SESSIONS) {
    const sorted = [...activeSessions.entries()].sort((a, b) => (a[1]._createdAt || 0) - (b[1]._createdAt || 0));
    const toRemove = sorted.slice(0, activeSessions.size - MAX_ACTIVE_SESSIONS);
    for (const [id] of toRemove) activeSessions.delete(id);
  }
}

export function createWebApp({ provider, sessionIdFactory, store: injectedStore } = {}) {
  const activeSessions = new Map();
  const llmProvider = provider || createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY });
  const nextSessionId = sessionIdFactory || (() => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const store = injectedStore || createStore();
  const rateLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 30 });

  // Cleanup expired sessions every 5 minutes
  const sessionCleanup = setInterval(() => cleanupSessions(activeSessions), 5 * 60 * 1000);
  if (sessionCleanup.unref) sessionCleanup.unref();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');

      // Rate limit POST endpoints (LLM calls)
      if (req.method === 'POST') {
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
        if (!rateLimiter.check(ip)) {
          json(res, 429, { error: 'Too many requests. Please wait a moment.' });
          return;
        }
      }

      if (req.method === 'GET' && url.pathname === '/') {
        await serveStatic(res, join(WEB_DIR, 'index.html'));
        return;
      }

      if (req.method === 'GET' && /^\/(app\.js|styles\.css|favicon\.svg)$/.test(url.pathname)) {
        await serveStatic(res, join(WEB_DIR, url.pathname.slice(1)));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/health') {
        json(res, 200, { ok: true, sessions: activeSessions.size });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/dashboard/player') {
        const requestedPlayerId = url.searchParams.get('playerId') || 'local-player';
        const filters = {
          playerId: requestedPlayerId,
          mode: url.searchParams.get('mode') || null,
          difficulty: url.searchParams.get('difficulty') || null,
          scenarioId: url.searchParams.get('scenarioId') || null,
        };
        const hasFilters = Object.values(filters).some(Boolean);
        const [sessions, progression, analytics] = await Promise.all([
          store.loadSessions(),
          store.loadProgression(),
          store.loadAnalytics(500),
        ]);
        const scopedSessions = hasFilters ? filterDashboardSessions(sessions, filters) : sessions;
        const scopedAnalytics = hasFilters ? filterAnalyticsEvents(analytics, { ...filters, type: 'journal' }) : analytics.filter((event) => event.type === 'journal');
        const realWorldStats = computeRealWorldStats(scopedAnalytics);
        const playerDashboard = buildPlayerDashboard(scopedSessions, progression, {
          playerId: requestedPlayerId,
        });
        json(res, 200, {
          ...playerDashboard,
          ...playerDashboard.stats,
          belts: progression.belts || {},
          filters,
          realWorldStats,
          uiLayer: computeUILayer(scopedSessions.length || progression.totalSessions || 0),
          uiLayerDefinitions: getLayerDefinitions(),
          beltDefinitions: BELT_DEFINITIONS.map((d) => ({ color: d.color, name: d.name, dimension: d.dimension, description: d.description })),
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/dashboard') {
        const filters = {
          mode: url.searchParams.get('mode') || null,
          difficulty: url.searchParams.get('difficulty') || null,
          scenarioId: url.searchParams.get('scenarioId') || null,
        };
        const hasFilters = Object.values(filters).some(Boolean);
        const [sessions, progression, analytics] = await Promise.all([
          store.loadSessions(),
          store.loadProgression(),
          store.loadAnalytics(500),
        ]);
        const scopedSessions = hasFilters ? filterDashboardSessions(sessions, filters) : sessions;
        const stats = computeDashboardStats(scopedSessions, progression);
        const realWorldStats = computeRealWorldStats(analytics.filter((event) => event.type === 'journal'));
        const belts = progression.belts || {};
        const earnedCount = Object.values(belts).filter((b) => b.earned).length;
        const autonomy = evaluateAutonomyLevel({
          totalSessions: stats.totalSessions,
          avgScore: stats.averageScore,
          earnedBelts: earnedCount,
        });
        const uiLayer = computeUILayer(stats.totalSessions || progression.totalSessions || 0);
        json(res, 200, {
          ...stats,
          filters: hasFilters ? filters : null,
          realWorldStats,
          autonomy: { level: autonomy.level, label: autonomy.label, key: autonomy.key, gap: describeAutonomyGap(autonomy), next: autonomy.next },
          biasRecommendation: recommendBiasTraining(progression.biasProfile || {}),
          recommendedDrillId: recommendDrill(progression),
          uiLayer,
          uiLayerDefinitions: getLayerDefinitions(),
          beltDefinitions: BELT_DEFINITIONS.map((d) => ({ color: d.color, name: d.name, dimension: d.dimension, description: d.description })),
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/progression') {
        const progression = await store.loadProgression();
        json(res, 200, progression);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/profile') {
        const requestedPlayerId = url.searchParams.get('playerId') || 'local-player';
        const filters = {
          playerId: url.searchParams.get('playerId') || null,
          mode: url.searchParams.get('mode') || null,
          difficulty: url.searchParams.get('difficulty') || null,
          scenarioId: url.searchParams.get('scenarioId') || null,
        };
        const hasFilters = Object.values(filters).some(Boolean);
        const [sessions, progression] = await Promise.all([
          store.loadSessions(),
          store.loadProgression(),
        ]);
        const scopedSessions = hasFilters ? filterDashboardSessions(sessions, filters) : sessions;
        const playerDashboard = buildPlayerDashboard(scopedSessions, progression, {
          playerId: requestedPlayerId,
        });
        const uiLayer = computeUILayer(scopedSessions.length || progression.totalSessions || 0);
        json(res, 200, {
          card: playerDashboard.card,
          shareable: playerDashboard.shareable,
          autonomy: playerDashboard.autonomy,
          biasRecommendation: playerDashboard.biasRecommendation,
          recommendedDrillId: playerDashboard.recommendedDrillId,
          uiLayer,
          uiLayerDefinitions: getLayerDefinitions(),
          filters,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/scenarios') {
        json(res, 200, await buildScenarioPresets());
        return;
      }

      const scenarioDetailMatch = req.method === 'GET' && url.pathname.match(/^\/api\/scenarios\/([^/]+)$/);
      if (scenarioDetailMatch) {
        const scenarioId = decodeURIComponent(scenarioDetailMatch[1]);
        const tier = url.searchParams.get('tier') || 'neutral';
        const detail = await buildScenarioDetailById(scenarioId, tier);
        if (!detail) {
          json(res, 404, { error: 'Scenario not found' });
          return;
        }
        json(res, 200, detail);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/daily') {
        json(res, 200, await generateDaily(store, llmProvider));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/drills') {
        const progression = await store.loadProgression();
        const recommendedDrillId = recommendDrill(progression);
        const biasRecommendation = recommendBiasTraining(progression.biasProfile || {});
        json(res, 200, {
          recommendedDrillId,
          biasRecommendation,
          dueBiasDrills: (biasRecommendation && progression.biasProfile?.[biasRecommendation.biasType])
            ? [{
                biasType: biasRecommendation.biasType,
                recommendedDrillId,
                nextDrillDate: progression.biasProfile[biasRecommendation.biasType].nextDrillDate || null,
                frequency: progression.biasProfile[biasRecommendation.biasType].frequency || 0,
                reason: biasRecommendation.reason,
                urgency: biasRecommendation.urgency,
              }]
            : [],
          drills: DRILL_CATALOG.map((drill) => ({
            id: drill.id,
            name: drill.name,
            description: drill.description,
            skill: drill.skill,
            maxTurns: drill.maxTurns,
            recommended: drill.id === recommendedDrillId,
          })),
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/scenario-of-week') {
        json(res, 200, selectScenarioOfWeek(await listScenarios()));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/hall-of-fame/export') {
        const hall = await store.getHallOfFameStories({ limit: Number(url.searchParams.get('limit')) || 5 });
        const format = (url.searchParams.get('format') || 'text').toLowerCase();
        if (format === 'json') {
          json(res, 200, hall);
          return;
        }
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(hall.text);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/hall-of-fame') {
        json(res, 200, await store.getHallOfFameStories({ limit: Number(url.searchParams.get('limit')) || 5 }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
        json(res, 200, await store.getScenarioLeaderboard(url.searchParams.get('scenarioId'), {
          limit: Number(url.searchParams.get('limit')) || 10,
        }));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/analytics') {
        const filters = {
          playerId: url.searchParams.get('playerId') || null,
          mode: url.searchParams.get('mode') || null,
          difficulty: url.searchParams.get('difficulty') || null,
          scenarioId: url.searchParams.get('scenarioId') || null,
          type: url.searchParams.get('type') || null,
        };
        const hasFilters = Object.values(filters).some(Boolean);
        const events = await store.loadAnalytics(Number(url.searchParams.get('limit')) || 100);
        json(res, 200, hasFilters ? filterAnalyticsEvents(events, filters) : events);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/analytics/summary') {
        const filters = {
          playerId: url.searchParams.get('playerId') || null,
          mode: url.searchParams.get('mode') || null,
          difficulty: url.searchParams.get('difficulty') || null,
          scenarioId: url.searchParams.get('scenarioId') || null,
          type: url.searchParams.get('type') || null,
        };
        const hasFilters = Object.values(filters).some(Boolean);
        const events = await store.loadAnalytics(Number(url.searchParams.get('limit')) || 100);
        const scopedEvents = hasFilters ? filterAnalyticsEvents(events, filters) : events;
        json(res, 200, {
          ...summarizeAnalyticsEvents(scopedEvents),
          filters: hasFilters ? filters : null,
        });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/sessions') {
        const sessions = await store.loadSessions();
        const summaries = sessions.slice(0, 20).map((s) => ({
          id: s.id,
          date: s.date,
          situation: s.brief?.situation || '-',
          difficulty: s.brief?.difficulty || 'neutral',
          status: s.status,
          turns: s.turns || s.transcript?.length || 0,
          score: s.feedback?.globalScore || 0,
          scores: s.feedback?.scores || {},
          biases: (s.feedback?.biasesDetected || []).map((b) => b.biasType),
          mode: s.mode || 'cli',
          grade: s.fightCard?.grade?.grade || null,
          scenarioId: s.scenarioId || s.scenario?.id || null,
        }));
        json(res, 200, summaries);
        return;
      }

      const sessionDetailMatch = req.method === 'GET' && url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionDetailMatch) {
        const sessionId = decodeURIComponent(sessionDetailMatch[1]);
        const sessions = await store.loadSessions();
        const session = sessions.find((entry) => entry.id === sessionId);
        if (!session) {
          json(res, 404, { error: 'Session not found' });
          return;
        }

        json(res, 200, {
          id: session.id,
          date: session.date,
          status: session.status,
          mode: session.mode || 'cli',
          scenarioId: session.scenarioId || session.scenario?.id || null,
          brief: session.brief,
          adversary: session.adversary,
          turns: session.turns || session.transcript?.length || 0,
          transcript: session.transcript,
          feedback: session.feedback,
          fightCard: session.fightCard || null,
          objectiveContract: session.objectiveContract || null,
          roundScores: session.roundScores || session.fightCard?.rounds?.detail || [],
          worldState: session.worldState || null,
          analytics: {
            score: session.feedback?.globalScore || 0,
            grade: session.fightCard?.grade?.grade || null,
            biases: (session.feedback?.biasesDetected || []).map((bias) => bias.biasType),
            tactics: session.feedback?.tacticsUsed || [],
          },
        });
        return;
      }

      const replayMatch = req.method === 'GET' && url.pathname.match(/^\/api\/sessions\/([^/]+)\/replay$/);
      if (replayMatch) {
        const sessionId = decodeURIComponent(replayMatch[1]);
        const sessions = await store.loadSessions();
        const session = sessions.find((entry) => entry.id === sessionId);
        if (!session) {
          json(res, 404, { error: 'Session not found' });
          return;
        }

        json(res, 200, await generateReplay(session, llmProvider));
        return;
      }

      // ── Real Prep Mode ─────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/api/real-prep/questions') {
        json(res, 200, getRealPrepQuestions());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/real-prep/start') {
        const body = await readBody(req);
        const { brief, metadata } = buildRealPrepBrief(body);
        const adversary = await generatePersona(brief, llmProvider);
        const session = createSession(brief, adversary, llmProvider, { eventPolicy: 'none' });
        session._isRealPrep = true;
        session._realPrepMeta = metadata;
        session._playerId = typeof body.playerId === 'string' && body.playerId.trim() ? body.playerId.trim() : 'local-player';
        session._roundScores = [];
        session._createdAt = Date.now();
        session._prevConfidence = adversary?.emotionalProfile?.confidence ?? 50;
        session._prevFrustration = adversary?.emotionalProfile?.frustration ?? 30;

        const sessionId = nextSessionId();
        cleanupSessions(activeSessions);
        activeSessions.set(sessionId, session);

        json(res, 201, {
          sessionId,
          adversary: { identity: adversary.identity, style: adversary.style },
          state: { turn: session.turn, status: session.status, maxTurns: session.maxTurns },
          isRealPrep: true,
        });
        return;
      }

      const prepSheetMatch = req.method === 'GET' && url.pathname.match(/^\/api\/sessions\/([^/]+)\/prep-sheet$/);
      if (prepSheetMatch) {
        const sessionId = decodeURIComponent(prepSheetMatch[1]);
        const sessions = await store.loadSessions();
        const session = sessions.find((s) => s.id === sessionId);
        if (!session) { json(res, 404, { error: 'Session introuvable' }); return; }
        const prepSheet = await generatePrepSheet(session, session.feedback, llmProvider);
        json(res, 200, prepSheet);
        return;
      }

      // ── Journal ─────────────────────────────────────────────────
      if (req.method === 'GET' && url.pathname === '/api/journal/questions') {
        json(res, 200, getJournalQuestions());
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/journal') {
        const body = await readBody(req);
        const entry = buildJournalEntry(body, body.simulationSessionId);
        const playerId = typeof body.playerId === 'string' && body.playerId.trim() ? body.playerId.trim() : 'local-player';

        // Compare with simulation if linked
        let comparison = null;
        if (entry.simulationSessionId) {
          const sessions = await store.loadSessions();
          const simSession = sessions.find((s) => s.id === entry.simulationSessionId);
          if (simSession) comparison = compareWithSimulation(entry, simSession);
        }

        // Store journal entry
        await store.appendAnalytics({ type: 'journal', ...entry, comparison, playerId });

        json(res, 201, { entry, comparison, playerId });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/journal') {
        const filters = {
          playerId: url.searchParams.get('playerId') || null,
          type: 'journal',
        };
        const analytics = await store.loadAnalytics(500);
        const journalEntries = filterAnalyticsEvents(analytics, filters);
        const stats = computeRealWorldStats(journalEntries);
        json(res, 200, { entries: journalEntries.slice(0, 20), stats, filters });
        return;
      }

      // UI layer
      if (req.method === 'GET' && url.pathname === '/api/ui-layer') {
        const progression = await store.loadProgression();
        const override = url.searchParams.get('override') ? Number(url.searchParams.get('override')) : null;
        json(res, 200, computeUILayer(progression.totalSessions || 0, override));
        return;
      }

      // Briefing: get scenario context + questions before committing
      if (req.method === 'POST' && url.pathname === '/api/briefing') {
        const body = await readBody(req);
        let scenario;
        if (body.scenarioFile) {
          scenario = await loadScenario(body.scenarioFile);
        } else {
          scenario = { brief: body.brief || {} };
        }
        const progression = await store.loadProgression();
        const uiLayer = computeUILayer(progression.totalSessions || 0);
        const briefing = generateBriefing(scenario, progression);
        briefing.uiLayer = uiLayer;
        json(res, 200, briefing);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/versus') {
        const body = await readBody(req);
        const judgment = await adjudicateVersusRound({
          brief: body.brief,
          playerA: body.playerA,
          playerB: body.playerB,
          transcript: body.transcript,
        }, llmProvider);
        json(res, 200, judgment);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/session') {
        const body = await readBody(req);
        let brief, adversary, scenario;

        if (body.scenarioFile) {
          scenario = await loadScenario(body.scenarioFile);
          brief = buildBrief(scenario.brief);
          adversary = scenario.adversary;
        } else {
          scenario = null;
          brief = buildBrief(body.brief);
          adversary = body.adversary || await generatePersona(brief, llmProvider);
        }

        // Build objective contract: from sliders (quick) or text answers (expert)
        let objectiveContract = null;
        if (body.sliders) {
          objectiveContract = buildContractFromSliders(body.sliders, scenario || { brief, adversary });
        } else if (body.objectiveContract) {
          objectiveContract = buildObjectiveContract(body.objectiveContract, scenario || { brief, adversary });
        }

        const session = createSession(brief, adversary, llmProvider, { eventPolicy: body.eventPolicy || 'none' });
        const completedSessions = await store.loadSessions();
        session._objectiveContract = objectiveContract;
        session._roundScores = [];
        session._prevConfidence = adversary?.emotionalProfile?.confidence ?? 50;
        session._prevFrustration = adversary?.emotionalProfile?.frustration ?? 30;
        session._scenarioId = scenario?.metadata?.id || body.scenarioFile || null;
        session._playerId = typeof body.playerId === 'string' && body.playerId.trim() ? body.playerId.trim() : 'local-player';
        session._uiProgressive = body.uiProgressive === true;
        session._uiLayer = computeUILayer(completedSessions.length, body.uiLayerOverride);

        session._createdAt = Date.now();
        const sessionId = nextSessionId();
        cleanupSessions(activeSessions);
        activeSessions.set(sessionId, session);

        json(res, 201, {
          sessionId,
          adversary: { identity: adversary.identity, style: adversary.style },
          state: { turn: session.turn, status: session.status, maxTurns: session.maxTurns },
          objectiveContract: objectiveContract ? { objective: objectiveContract.objective, threshold: objectiveContract.minimalThreshold, batna: objectiveContract.batna } : null,
          uiLayer: session._uiLayer,
          uiProgressive: session._uiProgressive,
        });
        return;
      }

      const turnMatch = req.method === 'POST' && url.pathname.match(/^\/api\/session\/([^/]+)\/turn$/);
      if (turnMatch) {
        const sessionId = decodeURIComponent(turnMatch[1]);
        const session = activeSessions.get(sessionId);
        if (!session) {
          json(res, 404, { error: 'Session not found' });
          return;
        }

        const body = await readBody(req);
        if (!body.message || !body.message.trim()) {
          json(res, 400, { error: 'message is required' });
          return;
        }

        const guidedChoiceFeedback = Number.isInteger(body.guidedChoiceIndex)
          && Array.isArray(session._lastGuidedChoices)
          && session._lastGuidedChoices[body.guidedChoiceIndex]
          ? buildChoiceFeedback(session._lastGuidedChoices[body.guidedChoiceIndex], session._lastGuidedChoices)
          : null;

        const result = await processTurn(session, body.message);

        // Round scoring
        const roundScore = scoreRound(result, session);
        session._roundScores = session._roundScores || [];
        session._roundScores.push(roundScore);
        session._prevConfidence = result.state?.confidence ?? session._prevConfidence;
        session._prevFrustration = result.state?.frustration ?? session._prevFrustration;

        let fightCard = null;

        if (result.sessionOver) {
          const feedback = await analyzeFeedback(session, llmProvider);
          result.feedback = feedback;
          fightCard = buildFightCard(feedback, session, session._objectiveContract);

          // Theory analysis (Layer 3 or always for learning)
          const theoryAnalysis = analyzeWithTheory(session, feedback);
          fightCard.theory = theoryAnalysis;

          const sessionEntry = {
            id: randomUUID(),
            date: new Date().toISOString(),
            brief: session.brief,
            adversary: session.adversary,
            transcript: session.transcript,
            status: session.status,
            turns: session.turn,
            feedback,
            fightCard,
            objectiveContract: session._objectiveContract || null,
            scenarioId: session._scenarioId || null,
            roundScores: session._roundScores,
            theoryInsights: theoryAnalysis.insights?.length || 0,
            uiLayer: session._uiLayer?.level || 1,
            isRealPrep: session._isRealPrep || false,
            realPrepMeta: session._realPrepMeta || null,
            playerId: session._playerId || 'local-player',
            mode: 'web',
            eventPolicy: session.eventPolicy,
            eventsActive: session.eventPolicy !== 'none',
            worldState: session._world ? { emotions: session._world.emotions, pad: session._world.pad } : null,
          };

          await store.saveSession(sessionEntry);
          await refreshProgression(store, session);

          // Analytics log - every session logged for learning
          await store.appendAnalytics({
            type: 'session_complete',
            timestamp: sessionEntry.date,
            scenarioId: session._scenarioId,
            difficulty: session.brief?.difficulty,
            turns: session.turn,
            status: session.status,
            globalScore: feedback.globalScore,
            grade: fightCard.grade.grade,
            triangle: fightCard.triangle,
            biasesDetected: (feedback.biasesDetected || []).map((b) => b.biasType),
            roundScores: session._roundScores.map((r) => r.points),
            objectiveSet: !!session._objectiveContract,
            strategy: session._objectiveContract?.strategy || null,
            playerId: sessionEntry.playerId,
          });

          activeSessions.delete(sessionId);
        }

        let guidedChoices = null;
        if (!result.sessionOver && session._uiProgressive && shouldGuideRound(session._uiLayer, result.state.turn + 1)) {
          guidedChoices = await generateGuidedChoices(session, result.adversaryResponse, llmProvider);
          session._lastGuidedChoices = guidedChoices;
        } else {
          session._lastGuidedChoices = null;
        }

        const payload = {
          adversaryResponse: result.adversaryResponse,
          sessionOver: result.sessionOver,
          endReason: result.endReason,
          state: {
            turn: result.state.turn,
            status: result.state.status,
            confidence: result.state.confidence,
            frustration: result.state.frustration,
            egoThreat: result.state.egoThreat,
          },
          coaching: result.coaching,
          ticker: result.ticker,
          actTransition: result.actTransition,
          detectedSignals: result.detectedSignals,
          roundScore,
          fightCard,
          feedback: result.feedback,
          guidedChoices,
          guidedChoiceFeedback,
          uiLayer: session._uiLayer,
        };

        json(res, 200, session._uiProgressive ? filterTurnResponse(payload, session._uiLayer) : payload);
        return;
      }

      const simBatchMatch = req.method === 'POST' && url.pathname.match(/^\/api\/session\/([^/]+)\/simulate-batch$/);
      if (simBatchMatch) {
        const sessionId = decodeURIComponent(simBatchMatch[1]);
        const session = activeSessions.get(sessionId);
        if (!session) { json(res, 404, { error: 'Session not found' }); return; }
        const body = await readBody(req);
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          json(res, 400, { error: 'messages array is required' });
          return;
        }
        if (body.messages.length > 5) {
          json(res, 400, { error: 'simulate-batch supports up to 5 messages per request' });
          return;
        }
        const batch = await simulateBeforeSendBatch({
          brief: session.brief,
          adversary: session.adversary,
          offerMessages: body.messages,
          provider: llmProvider,
          transcript: session.transcript,
        });
        json(res, 200, batch);
        return;
      }

      const simMatch = req.method === 'POST' && url.pathname.match(/^\/api\/session\/([^/]+)\/simulate$/);
      if (simMatch) {
        const sessionId = decodeURIComponent(simMatch[1]);
        const session = activeSessions.get(sessionId);
        if (!session) { json(res, 404, { error: 'Session not found' }); return; }
        const body = await readBody(req);
        if (!body.message || !body.message.trim()) { json(res, 400, { error: 'message is required' }); return; }
        const report = await simulateBeforeSend({
          brief: session.brief, adversary: session.adversary,
          offerMessage: body.message, provider: llmProvider, transcript: session.transcript,
        });
        json(res, 200, report);
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (error) {
      const status = /Missing required field|Invalid JSON body/.test(error.message) ? 400 : 500;
      json(res, status, { error: error.message });
    }
  });

  return {
    server,
    activeSessions,
    async listen(port = Number(process.env.PORT) || 3000, host = '127.0.0.1') {
      await new Promise((resolve) => server.listen(port, host, resolve));
      return server.address();
    },
    async close() {
      await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}

export async function startWebServer(options = {}) {
  const app = createWebApp(options);
  const address = await app.listen(options.port, options.host);
  return { ...app, address };
}
