import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { createSession, processTurn } from './engine.mjs';
import { analyzeFeedback } from './analyzer.mjs';

function jsonHeaders() {
  return {
    'content-type': 'application/json; charset=utf-8',
  };
}

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
        text: String(text).slice(0, 1500),
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

  async function startScenario(chatId, text) {
    const rawInput = parseScenarioSeed(text);
    const brief = buildBrief(rawInput);
    const adversary = await generatePersona(brief, provider);
    const session = createSession(brief, adversary, provider, { eventPolicy: 'none' });
    sessions.set(getSessionKey(chatId), session);
    return sendMessage(
      chatId,
      `Session créée avec ${adversary.identity}. Objectif: ${brief.objective}\nBATNA: ${brief.batna}\nEnvoie ton premier message.`,
    );
  }

  async function handleMessage(update) {
    const message = update?.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();
    if (!chatId || !text) return { ignored: true };

    if (text === '/start') {
      await sendMessage(chatId, 'Bienvenue sur NegotiateAI. Utilise /new objectif | seuil minimal | batna pour lancer une simulation.');
      return { ok: true, command: 'start' };
    }

    if (text.startsWith('/new ')) {
      await startScenario(chatId, text.slice(5));
      return { ok: true, command: 'new' };
    }

    if (text === '/end') {
      sessions.delete(getSessionKey(chatId));
      await sendMessage(chatId, 'Session terminée.');
      return { ok: true, command: 'end' };
    }

    const session = sessions.get(getSessionKey(chatId));
    if (!session) {
      await sendMessage(chatId, 'Aucune session active. Utilise /new objectif | seuil minimal | batna');
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
