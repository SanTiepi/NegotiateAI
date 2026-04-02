import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockProvider } from '../src/provider.mjs';
import { createTelegramBot, parseScenarioSeed, formatTurnReply } from '../src/telegram-bot.mjs';
import { createStore } from '../src/store.mjs';

const provider = createMockProvider({
  adversary: {
    identity: 'Mme Test',
    style: 'Ferme',
    publicObjective: 'Signer',
    hiddenObjective: 'Maximiser la marge',
    batna: 'Autre offre',
    nonNegotiables: ['Pas sous 100'],
    timePressure: 'Cette semaine',
    emotionalProfile: { confidence: 70, frustration: 20, egoThreat: 10 },
    likelyTactics: ['scarcity'],
    vulnerabilities: ['Fin de mois'],
  },
  turn: {
    adversaryResponse: 'Je peux discuter, mais pas trop.',
    sessionOver: true,
    endReason: 'Done',
    sessionStatus: 'accepted',
  },
  coaching: {
    biasDetected: null,
    alternative: null,
    momentum: 'stable',
    tip: 'Reste concret.',
  },
  feedback: {
    globalScore: 76,
    scores: {
      outcomeLeverage: 18,
      batnaDiscipline: 15,
      emotionalRegulation: 18,
      biasResistance: 11,
      conversationalFlow: 14,
    },
    biasesDetected: [],
    tacticsUsed: ['labeling'],
    missedOpportunities: [],
    recommendations: ['Continue.'],
  },
});

const tempDirs = [];
afterEach(async () => {
  while (tempDirs.length) {
    await rm(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('telegram-bot', () => {
  it('parseScenarioSeed builds a valid quick-start brief seed', () => {
    const brief = parseScenarioSeed('Gagner 10% | 5% mini | autre offre');
    assert.equal(brief.objective, 'Gagner 10%');
    assert.equal(brief.minimalThreshold, '5% mini');
    assert.equal(brief.batna, 'autre offre');
  });

  it('lists packaged scenarios and can start a swiss scenario preset', async () => {
    const sent = [];
    const bot = createTelegramBot({
      provider,
      token: 'token-123',
      fetchImpl: async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return { ok: true, async json() { return { ok: true }; } };
      },
    });

    await bot.handleMessage({ message: { chat: { id: 7 }, text: '/scenarios' } });
    assert.match(sent[0].text, /swiss-lease-renegotiation/);

    await bot.handleMessage({ message: { chat: { id: 7 }, text: '/scenario swiss-property-purchase hostile' } });
    assert.equal(bot.sessions.size, 1);
    assert.match(sent[1].text, /Session créée avec/);
    const activeSession = bot.sessions.get('telegram:7');
    assert.equal(activeSession.brief.difficulty, 'hostile');
  });

  it('creates a session, persists completed Telegram sessions, and updates progression', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'negotiate-tg-'));
    tempDirs.push(dir);
    const store = createStore({ dataDir: dir });
    const sent = [];
    const bot = createTelegramBot({
      provider,
      store,
      token: 'token-123',
      fetchImpl: async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return { ok: true, async json() { return { ok: true }; } };
      },
    });

    await bot.handleMessage({ message: { chat: { id: 42 }, text: '/new Obtenir 10% | 5% mini | autre offre' } });
    assert.equal(bot.sessions.size, 1);
    await bot.handleMessage({ message: { chat: { id: 42 }, text: 'Je veux avancer vite.' } });

    assert.equal(bot.sessions.size, 0);
    assert.equal(sent.length, 2);
    assert.match(sent[1].text, /Je peux discuter/);
    assert.match(sent[1].text, /Reste concret/);

    const stats = await store.getDashboardStats();
    assert.equal(stats.totalSessions, 1);
    assert.equal(stats.averageScore, 76);
    assert.equal(stats.currentStreak, 1);
  });

  it('returns a Telegram profile summary when a store is configured', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'negotiate-tg-profile-'));
    tempDirs.push(dir);
    const store = createStore({ dataDir: dir });
    const sent = [];
    const bot = createTelegramBot({
      provider,
      store,
      token: 'token-123',
      fetchImpl: async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return { ok: true, async json() { return { ok: true }; } };
      },
    });

    await bot.handleMessage({ message: { chat: { id: 42 }, text: '/new Obtenir 10% | 5% mini | autre offre' } });
    await bot.handleMessage({ message: { chat: { id: 42 }, text: 'Je veux avancer vite.' } });
    await bot.handleMessage({ message: { chat: { id: 42 }, text: '/profile' } });

    assert.match(sent.at(-1).text, /Profil NegotiateAI Telegram/);
    assert.match(sent.at(-1).text, /Sessions: 1/);
  });

  it('formatTurnReply includes coaching and ending when present', () => {
    const text = formatTurnReply({
      adversaryResponse: 'Réponse.',
      coaching: { tip: 'Tip.' },
      sessionOver: true,
      endReason: 'Done',
    });
    assert.match(text, /Réponse/);
    assert.match(text, /Tip/);
    assert.match(text, /Done/);
  });
});
