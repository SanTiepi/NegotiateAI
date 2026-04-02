import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { createSession, processTurn } from './engine.mjs';
import { analyzeFeedback } from './analyzer.mjs';
import { generateDaily, dailyAlreadyPlayed } from './daily.mjs';
import { recommendDrill } from './drill.mjs';
import { listScenarios, loadScenario } from '../scenarios/index.mjs';
import { formatShareableCard, generateVaccinationCard } from './vaccination.mjs';
import { selectScenarioOfWeek } from './leaderboard.mjs';
import { formatHallOfFameStories } from './hall-of-fame.mjs';
import { recommendBiasTraining } from './biasTracker.mjs';
import { simulateBeforeSendBatch } from './simulate.mjs';
import { buildFightCard } from './fight-card.mjs';
import { computeDashboardStats } from './dashboard.mjs';

const DEFAULT_POLL_TIMEOUT_SECONDS = 25;
const DEFAULT_POLL_IDLE_DELAY_MS = 1_000;

function jsonHeaders() {
  return {
    'content-type': 'application/json; charset=utf-8',
  };
}

const MAX_TELEGRAM_MESSAGE_LENGTH = 1500;
const VALID_SCENARIO_TIERS = new Set(['cooperative', 'neutral', 'hostile', 'manipulative']);

export function createTelegramBot({ provider, token = process.env.TELEGRAM_BOT_TOKEN, apiBaseUrl = 'https://api.telegram.org', fetchImpl = globalThis.fetch, sessionStore, store } = {}) {
  if (!provider || typeof provider.generateJson !== 'function') {
    throw new Error('createTelegramBot requires a provider');
  }
  if (!token) throw new Error('createTelegramBot requires a Telegram token');
  if (typeof fetchImpl !== 'function') throw new Error('createTelegramBot requires fetch');

  const sessions = sessionStore || new Map();

  async function sendMessage(chatId, text) {
    const response = await fetchImpl(`${apiBaseUrl}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).slice(0, MAX_TELEGRAM_MESSAGE_LENGTH),
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram sendMessage failed with ${response.status}`);
    }
    return response.json();
  }

  function getSessionKey(chatId) {
    return `telegram:${chatId}`;
  }

  async function persistCompletedSession(chatId, session) {
    if (!store) return;

    const feedback = await analyzeFeedback(session, provider);
    const fightCard = buildFightCard(feedback, session, session._objectiveContract || null);
    const sessionDate = new Date().toISOString();

    await store.saveSession({
      id: `telegram-${chatId}-${Date.now()}`,
      date: sessionDate,
      brief: session.brief,
      adversary: session.adversary,
      transcript: session.transcript,
      status: session.status,
      turns: session.turn,
      feedback,
      fightCard,
      scenarioId: session._scenarioId || null,
      mode: session._mode || 'telegram',
      eventPolicy: session.eventPolicy,
      eventsActive: session.eventPolicy !== 'none',
      worldState: session._world ? { emotions: session._world.emotions, pad: session._world.pad } : null,
      dailyMeta: session._dailyMeta || null,
    });

    await store.appendAnalytics({
      type: 'session_complete',
      timestamp: sessionDate,
      scenarioId: session._scenarioId || null,
      difficulty: session.brief?.difficulty,
      turns: session.turn,
      status: session.status,
      globalScore: feedback.globalScore,
      grade: fightCard.grade.grade,
      triangle: fightCard.triangle,
      biasesDetected: (feedback.biasesDetected || []).map((bias) => bias.biasType),
      roundScores: (session._roundScores || []).map((round) => round.points),
      objectiveSet: Boolean(session._objectiveContract),
      strategy: session._objectiveContract?.strategy || null,
      mode: session._mode || 'telegram',
    });

    const { refreshProgression } = await import('./progression.mjs');
    await refreshProgression(store, session);
  }

  async function startSession(chatId, brief, adversary, options = {}) {
    const session = createSession(brief, adversary, provider, {
      eventPolicy: options.eventPolicy || 'none',
      maxTurns: options.maxTurns,
    });
    session._mode = options.mode || 'telegram';
    session._dailyMeta = options.dailyMeta || null;
    session._scenarioId = options.scenarioId || null;
    sessions.set(getSessionKey(chatId), session);
    const intro = [
      options.label ? `${options.label}` : `Session créée avec ${adversary.identity}.`,
      `Objectif: ${brief.objective}`,
      `BATNA: ${brief.batna}`,
      options.maxTurns ? `Tours max: ${options.maxTurns}` : null,
      'Envoie ton premier message.',
    ].filter(Boolean).join('\n');
    return sendMessage(chatId, intro);
  }

  async function startScenario(chatId, text) {
    const rawInput = parseScenarioSeed(text);
    const brief = buildBrief(rawInput);
    const adversary = await generatePersona(brief, provider);
    return startSession(chatId, brief, adversary);
  }

  async function startPresetScenario(chatId, scenarioId, tier = 'neutral') {
    const normalizedTier = String(tier || 'neutral').trim().toLowerCase();
    if (!scenarioId) {
      await sendScenarioCatalog(chatId);
      return { ok: true, command: 'scenario-help' };
    }
    if (!VALID_SCENARIO_TIERS.has(normalizedTier)) {
      await sendMessage(chatId, `Tier invalide: ${tier}. Utilise cooperative, neutral, hostile ou manipulative.`);
      return { ok: true, command: 'scenario-invalid-tier', scenarioId, tier: normalizedTier };
    }

    try {
      const { brief, adversary } = await loadScenario(scenarioId, normalizedTier);
      await startSession(chatId, buildBrief(brief), adversary, { scenarioId });
      return { ok: true, command: 'scenario', scenarioId, tier: normalizedTier };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Scenario not found:')) {
        await sendMessage(chatId, `Scenario inconnu: ${scenarioId}. Utilise /scenarios pour voir la liste.`);
        return { ok: true, command: 'scenario-missing', scenarioId, tier: normalizedTier };
      }
      throw error;
    }
  }

  async function startDaily(chatId) {
    if (!store) {
      return sendMessage(chatId, 'Daily indisponible: aucun store persistant n’est configuré.');
    }

    const alreadyPlayed = await dailyAlreadyPlayed(store);
    const daily = await generateDaily(store, provider);
    return startSession(chatId, daily.brief, daily.adversary, {
      mode: 'daily',
      eventPolicy: daily.eventPolicy,
      maxTurns: daily.maxTurns,
      dailyMeta: { date: daily.date, targetSkill: daily.targetSkill, difficulty: daily.difficulty },
      label: [
        alreadyPlayed ? 'Daily rejoué.' : 'Daily challenge prêt.',
        `Cible: ${daily.targetSkill}`,
        `Difficulté: ${daily.difficulty}`,
      ].join('\n'),
    });
  }

  async function sendScenarioCatalog(chatId) {
    const scenarios = await listScenarios();
    const featured = scenarios.slice(0, 8).map((scenario) => `• ${scenario.id} — ${scenario.name}`);
    const swiss = scenarios
      .filter((scenario) => scenario.id.startsWith('swiss-'))
      .map((scenario) => `• ${scenario.id} — ${scenario.name}`);
    return sendMessage(
      chatId,
      [
        'Scénarios disponibles:',
        ...featured,
        swiss.length ? '' : null,
        swiss.length ? 'Immobilier suisse:' : null,
        ...swiss,
        '',
        'Commande: /scenario <id> [cooperative|neutral|hostile|manipulative]',
      ].filter(Boolean).join('\n'),
    );
  }

  async function sendProfile(chatId) {
    if (!store) {
      return sendMessage(chatId, 'Profil indisponible: aucun store persistant n’est configuré.');
    }
    const [sessions, progression] = await Promise.all([store.loadSessions(), store.loadProgression()]);
    const card = generateVaccinationCard(progression, sessions.filter((session) => session.mode === 'telegram'));
    const lines = [
      'Profil NegotiateAI Telegram',
      `Sessions: ${card.totalSessions}`,
      `Niveau: ${card.negotiatorLevel}`,
      `Ceinture: ${card.belt}`,
      `Autonomie: ${card.autonomy.label}`,
      `Forces: ${card.strengths.join(', ')}`,
      `Faiblesses: ${card.weaknesses.join(', ')}`,
      '',
      formatShareableCard(card),
    ];
    return sendMessage(chatId, lines.join('\n').slice(0, MAX_TELEGRAM_MESSAGE_LENGTH));
  }

  async function sendDashboard(chatId) {
    if (!store) {
      return sendMessage(chatId, 'Dashboard indisponible: aucun store persistant n’est configuré.');
    }

    const [sessions, progression] = await Promise.all([store.loadSessions(), store.loadProgression()]);
    const telegramSessions = sessions.filter((session) => (session.mode || 'cli') === 'telegram');
    const stats = computeDashboardStats(telegramSessions, progression);
    const bestDimensionLabel = stats.bestDimension?.dimension
      ? stats.bestDimension.dimension
      : '—';
    const weakDimensionLabel = stats.weakestDimension?.dimension
      ? stats.weakestDimension.dimension
      : '—';
    const topMode = stats.modeBreakdown[0]?.mode || 'telegram';
    const topDifficulty = stats.difficultyBreakdown[0]?.difficulty || 'neutral';

    const lines = [
      'Dashboard NegotiateAI Telegram',
      `Sessions: ${stats.totalSessions} · Score moyen: ${stats.averageScore}/100`,
      `Dernier score: ${stats.latestScore}/100 · Streak: ${stats.currentStreak}`,
      `Tendance: ${stats.scoreTrend} (${stats.progressionDelta >= 0 ? '+' : ''}${stats.progressionDelta})`,
      `Point fort: ${bestDimensionLabel}`,
      `À muscler: ${weakDimensionLabel}`,
      `Mode dominant: ${topMode} · Difficulté dominante: ${topDifficulty}`,
      stats.weakDimensions?.length ? `Focus action: ${stats.weakDimensions.join(', ')}` : null,
    ].filter(Boolean);

    return sendMessage(chatId, lines.join('\n').slice(0, MAX_TELEGRAM_MESSAGE_LENGTH));
  }

  async function sendDrills(chatId) {
    if (!store) {
      return sendMessage(chatId, 'Drills indisponibles: aucun store persistant n’est configuré.');
    }

    const progression = await store.loadProgression();
    const recommendedDrillId = recommendDrill(progression);
    const biasRecommendation = recommendBiasTraining(progression.biasProfile || {});
    const dueDate = biasRecommendation ? progression.biasProfile?.[biasRecommendation.biasType]?.nextDrillDate : null;

    const lines = [
      'Drills NegotiateAI',
      `Drill recommandé: ${recommendedDrillId}`,
      biasRecommendation
        ? `Biais prioritaire: ${biasRecommendation.biasType}${dueDate ? ` · revue ${dueDate}` : ''}`
        : 'Biais prioritaire: aucun',
      biasRecommendation ? `Pourquoi: ${biasRecommendation.reason}` : null,
      '',
      'Catalogue: /daily pour un challenge auto, sinon mirror | anchor | pressure | batna | reframe',
    ].filter(Boolean);

    return sendMessage(chatId, lines.join('\n').slice(0, MAX_TELEGRAM_MESSAGE_LENGTH));
  }

  async function sendWeekly(chatId) {
    const scenarios = await listScenarios();
    const { weekKey, scenario } = selectScenarioOfWeek(scenarios);
    return sendMessage(chatId, [
      `Scenario de la semaine — ${weekKey}`,
      `${scenario.name}`,
      `ID: ${scenario.id}`,
      `Commande: /scenario ${scenario.id} neutral`,
    ].join('\n'));
  }

  async function sendLeaderboard(chatId) {
    if (!store) {
      return sendMessage(chatId, 'Leaderboard indisponible: aucun store persistant n’est configuré.');
    }

    const scenarios = await listScenarios();
    const { weekKey, scenario } = selectScenarioOfWeek(scenarios);
    let label = `${scenario.name}`;
    let leaderboard = await store.getScenarioLeaderboard(scenario.id, { limit: 5 });

    if (!leaderboard.entries.length) {
      const sessions = await store.loadSessions();
      const fallbackScenarioId = sessions.find((session) => session.scenario?.id || session.scenarioId)?.scenario?.id
        || sessions.find((session) => session.scenarioId)?.scenarioId;
      if (fallbackScenarioId) {
        leaderboard = await store.getScenarioLeaderboard(fallbackScenarioId, { limit: 5 });
        label = `${fallbackScenarioId} (fallback)`;
      }
    }

    if (!leaderboard.entries.length) {
      return sendMessage(chatId, [
        `Leaderboard — ${scenario.name}`,
        `Semaine: ${weekKey}`,
        'Aucun run persisté pour ce scenario pour le moment.',
      ].join('\n'));
    }

    return sendMessage(chatId, [
      `Leaderboard — ${label}`,
      `Semaine: ${weekKey}`,
      ...leaderboard.entries.map((entry) => `#${entry.rank} · ${entry.score}/100 · ${entry.turns} tours · ${entry.mode}`),
    ].join('\n'));
  }

  async function sendHallOfFame(chatId) {
    if (!store) {
      return sendMessage(chatId, 'Hall of fame indisponible: aucun store persistant n’est configuré.');
    }

    const stories = await store.getHallOfFameStories({ limit: 3, maxChars: 180 });
    return sendMessage(chatId, [
      'Hall of Fame NegotiateAI',
      formatHallOfFameStories(stories.entries),
    ].join('\n\n').slice(0, MAX_TELEGRAM_MESSAGE_LENGTH));
  }

  async function runBatchSimulation(chatId, text) {
    const session = sessions.get(getSessionKey(chatId));
    if (!session) {
      await sendMessage(chatId, 'Aucune session active. Lance d’abord /new ou /scenario avant /sim.');
      return { ok: true, command: 'simulate-missing-session' };
    }

    const variants = String(text)
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 5);

    if (variants.length === 0) {
      await sendMessage(chatId, 'Commande: /sim variante 1 | variante 2 | variante 3');
      return { ok: true, command: 'simulate-help' };
    }

    const batch = await simulateBeforeSendBatch({
      brief: session.brief,
      adversary: session.adversary,
      offerMessages: variants,
      provider,
      transcript: session.transcript,
    });

    const lines = [
      `Simulate Before Send v2 — ${variants.length} variantes`,
      `Meilleure option: #${batch.bestIndex + 1} (${batch.bestReport.approvalScore}/100, ${batch.bestReport.sendVerdict})`,
      batch.summary ? `Confiance: ${batch.summary.confidence} · Écart: ${batch.summary.scoreGap}` : null,
      '',
      ...batch.reports.map((report, index) => `#${index + 1} · ${report.approvalScore}/100 · ${report.sendVerdict} · ${report.predictedOutcome}`),
      '',
      `Rewrite conseillé: ${batch.bestReport.recommendedRewrite}`,
    ];

    await sendMessage(chatId, lines.join('\n').slice(0, MAX_TELEGRAM_MESSAGE_LENGTH));
    return { ok: true, command: 'simulate-batch', bestIndex: batch.bestIndex };
  }

  async function handleMessage(update) {
    const message = update?.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();
    if (!chatId || !text) return { ignored: true };

    if (text === '/start' || text === '/help') {
      await sendMessage(chatId, 'Bienvenue sur NegotiateAI. Utilise /new objectif | seuil minimal | batna pour lancer une simulation, /daily pour le challenge du jour, /scenarios pour voir les presets, /scenario <id> pour lancer un scénario packagé, /sim variante 1 | variante 2 pour tester plusieurs formulations, /profile pour voir ton profil, /dashboard pour le résumé scoring, /drills pour les exercices ciblés, /weekly pour le scénario de la semaine, /leaderboard pour le top runs et /halloffame pour les meilleures sessions.');
      return { ok: true, command: 'start' };
    }

    if (text === '/scenarios') {
      await sendScenarioCatalog(chatId);
      return { ok: true, command: 'scenarios' };
    }

    if (text === '/profile') {
      await sendProfile(chatId);
      return { ok: true, command: 'profile' };
    }

    if (text === '/dashboard') {
      await sendDashboard(chatId);
      return { ok: true, command: 'dashboard' };
    }

    if (text === '/drills') {
      await sendDrills(chatId);
      return { ok: true, command: 'drills' };
    }

    if (text === '/weekly') {
      await sendWeekly(chatId);
      return { ok: true, command: 'weekly' };
    }

    if (text === '/leaderboard') {
      await sendLeaderboard(chatId);
      return { ok: true, command: 'leaderboard' };
    }

    if (text === '/halloffame') {
      await sendHallOfFame(chatId);
      return { ok: true, command: 'halloffame' };
    }

    if (text === '/daily') {
      await startDaily(chatId);
      return { ok: true, command: 'daily' };
    }

    if (text === '/sim') {
      await sendMessage(chatId, 'Commande: /sim variante 1 | variante 2 | variante 3');
      return { ok: true, command: 'simulate-help' };
    }

    if (text.startsWith('/sim ')) {
      return runBatchSimulation(chatId, text.slice(5));
    }

    if (text.startsWith('/new ')) {
      await startScenario(chatId, text.slice(5));
      return { ok: true, command: 'new' };
    }

    if (text === '/scenario') {
      await sendScenarioCatalog(chatId);
      return { ok: true, command: 'scenario-help' };
    }

    if (text.startsWith('/scenario ')) {
      const [, scenarioId = '', tier = 'neutral'] = text.split(/\s+/);
      return startPresetScenario(chatId, scenarioId, tier);
    }

    if (text === '/end') {
      sessions.delete(getSessionKey(chatId));
      await sendMessage(chatId, 'Session terminée.');
      return { ok: true, command: 'end' };
    }

    const session = sessions.get(getSessionKey(chatId));
    if (!session) {
      await sendMessage(chatId, 'Aucune session active. Utilise /new objectif | seuil minimal | batna, ou /scenarios puis /scenario <id>.');
      return { ok: true, command: 'missing-session' };
    }

    const result = await processTurn(session, text);
    if (result.sessionOver) {
      await persistCompletedSession(chatId, session);
      sessions.delete(getSessionKey(chatId));
    }

    await sendMessage(chatId, formatTurnReply(result));
    return { ok: true, command: 'turn', sessionOver: result.sessionOver };
  }

  return {
    sessions,
    sendMessage,
    handleMessage,
  };
}

export function parseScenarioSeed(text) {
  const [objective, minimalThreshold, batna] = String(text).split('|').map((part) => part?.trim() || '');
  return {
    situation: 'Telegram quick-start negotiation',
    userRole: 'Negotiator',
    adversaryRole: 'Counterparty',
    objective,
    minimalThreshold,
    batna,
    difficulty: 'neutral',
    relationalStakes: 'Moderate',
    constraints: [],
  };
}

export function formatTurnReply(result) {
  const lines = [result.adversaryResponse];
  if (result.coaching?.tip) lines.push(`Tip: ${result.coaching.tip}`);
  if (result.sessionOver) lines.push(`Fin: ${result.endReason || 'session terminée'}`);
  return lines.filter(Boolean).join('\n');
}

export function createTelegramPollingRuntime({
  bot,
  token,
  apiBaseUrl = 'https://api.telegram.org',
  fetchImpl = globalThis.fetch,
  pollTimeoutSeconds = DEFAULT_POLL_TIMEOUT_SECONDS,
  idleDelayMs = DEFAULT_POLL_IDLE_DELAY_MS,
  onError = () => {},
} = {}) {
  if (!bot || typeof bot.handleMessage !== 'function') {
    throw new Error('createTelegramPollingRuntime requires a bot with handleMessage(update)');
  }
  if (!token) throw new Error('createTelegramPollingRuntime requires a Telegram token');
  if (typeof fetchImpl !== 'function') throw new Error('createTelegramPollingRuntime requires fetch');

  let offset = 0;
  let stopped = false;

  async function call(method, payload = {}) {
    const response = await fetchImpl(`${apiBaseUrl}/bot${token}/${method}`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Telegram ${method} failed with ${response.status}`);
    }

    return response.json();
  }

  async function deleteWebhook({ dropPendingUpdates = false } = {}) {
    return call('deleteWebhook', { drop_pending_updates: dropPendingUpdates });
  }

  async function fetchUpdates() {
    const body = await call('getUpdates', {
      offset,
      timeout: pollTimeoutSeconds,
      allowed_updates: ['message'],
    });
    const updates = Array.isArray(body?.result) ? body.result : [];
    if (updates.length) {
      offset = updates.at(-1).update_id + 1;
    }
    return updates;
  }

  async function pollOnce() {
    const updates = await fetchUpdates();
    const results = [];
    for (const update of updates) {
      results.push(await bot.handleMessage(update));
    }
    return { updates, results };
  }

  async function start() {
    stopped = false;
    await deleteWebhook({ dropPendingUpdates: false });
    while (!stopped) {
      try {
        const { updates } = await pollOnce();
        if (updates.length === 0 && idleDelayMs > 0) {
          await delay(idleDelayMs);
        }
      } catch (error) {
        onError(error);
        if (!stopped && idleDelayMs > 0) {
          await delay(idleDelayMs);
        }
      }
    }
  }

  function stop() {
    stopped = true;
  }

  return {
    deleteWebhook,
    fetchUpdates,
    pollOnce,
    start,
    stop,
    getOffset() {
      return offset;
    },
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
