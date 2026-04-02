import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { createSession, processTurn } from './engine.mjs';
import { analyzeFeedback } from './analyzer.mjs';
import { listScenarios, loadScenario } from '../scenarios/index.mjs';
import { formatShareableCard, generateVaccinationCard } from './vaccination.mjs';

function jsonHeaders() {
  return {
    'content-type': 'application/json; charset=utf-8',
  };
}

const MAX_TELEGRAM_MESSAGE_LENGTH = 1500;

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
    await store.saveSession({
      id: `telegram-${chatId}-${Date.now()}`,
      date: new Date().toISOString(),
      brief: session.brief,
      adversary: session.adversary,
      transcript: session.transcript,
      status: session.status,
      turns: session.turn,
      feedback,
      mode: 'telegram',
      eventPolicy: session.eventPolicy,
      eventsActive: session.eventPolicy !== 'none',
      worldState: session._world ? { emotions: session._world.emotions, pad: session._world.pad } : null,
    });

    const { refreshProgression } = await import('./progression.mjs');
    await refreshProgression(store, session);
  }

  async function startSession(chatId, brief, adversary) {
    const session = createSession(brief, adversary, provider, { eventPolicy: 'none' });
    sessions.set(getSessionKey(chatId), session);
    return sendMessage(
      chatId,
      `Session créée avec ${adversary.identity}. Objectif: ${brief.objective}\nBATNA: ${brief.batna}\nEnvoie ton premier message.`,
    );
  }

  async function startScenario(chatId, text) {
    const rawInput = parseScenarioSeed(text);
    const brief = buildBrief(rawInput);
    const adversary = await generatePersona(brief, provider);
    return startSession(chatId, brief, adversary);
  }

  async function startPresetScenario(chatId, scenarioId, tier = 'neutral') {
    const { brief, adversary } = await loadScenario(scenarioId, tier);
    return startSession(chatId, buildBrief(brief), adversary);
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

  async function handleMessage(update) {
    const message = update?.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();
    if (!chatId || !text) return { ignored: true };

    if (text === '/start' || text === '/help') {
      await sendMessage(chatId, 'Bienvenue sur NegotiateAI. Utilise /new objectif | seuil minimal | batna pour lancer une simulation, /scenarios pour voir les presets, /scenario <id> pour lancer un scénario packagé, /profile pour voir tes stats.');
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

    if (text.startsWith('/new ')) {
      await startScenario(chatId, text.slice(5));
      return { ok: true, command: 'new' };
    }

    if (text.startsWith('/scenario ')) {
      const [, scenarioId = '', tier = 'neutral'] = text.split(/\s+/);
      await startPresetScenario(chatId, scenarioId, tier);
      return { ok: true, command: 'scenario', scenarioId, tier };
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
