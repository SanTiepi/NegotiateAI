import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockProvider } from '../src/provider.mjs';
import { createTelegramBot, createTelegramPollingRuntime, parseScenarioSeed, formatTurnReply } from '../src/telegram-bot.mjs';
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
  offerSimulation: ({ prompt }) => ({
    sendVerdict: prompt.includes('vite') ? 'send' : 'revise',
    approvalScore: prompt.includes('vite') ? 84 : 67,
    predictedOutcome: prompt.includes('vite') ? 'Bonne ouverture.' : 'Trop timide.',
    riskLevel: prompt.includes('vite') ? 'low' : 'medium',
    likelyObjections: ['Prix'],
    strengths: ['Clarté'],
    vulnerabilities: ['Ancrage faible'],
    recommendedRewrite: 'Version revue plus ferme.',
  }),
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

  it('shows scenario help and friendly validation errors for preset commands', async () => {
    const sent = [];
    const bot = createTelegramBot({
      provider,
      token: 'token-123',
      fetchImpl: async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return { ok: true, async json() { return { ok: true }; } };
      },
    });

    await bot.handleMessage({ message: { chat: { id: 8 }, text: '/scenario' } });
    assert.match(sent.at(-1).text, /Commande: \/scenario <id>/);

    await bot.handleMessage({ message: { chat: { id: 8 }, text: '/scenario swiss-property-purchase nightmare' } });
    assert.match(sent.at(-1).text, /Tier invalide/);
    assert.equal(bot.sessions.size, 0);

    await bot.handleMessage({ message: { chat: { id: 8 }, text: '/scenario does-not-exist hostile' } });
    assert.match(sent.at(-1).text, /Scenario inconnu/);
    assert.equal(bot.sessions.size, 0);
  });

  it('creates a session, persists completed Telegram sessions, logs analytics, and updates progression', async () => {
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

    const analytics = await store.loadAnalytics();
    assert.equal(analytics.length, 1);
    assert.equal(analytics[0].mode, 'telegram');
    assert.equal(analytics[0].globalScore, 76);
    assert.equal(analytics[0].grade, 'B');
  });

  it('persists preset scenario ids for completed telegram scenario runs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'negotiate-tg-scenario-'));
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

    await bot.handleMessage({ message: { chat: { id: 77 }, text: '/scenario swiss-property-purchase hostile' } });
    await bot.handleMessage({ message: { chat: { id: 77 }, text: 'Je propose une signature rapide.' } });

    const sessions = await store.loadSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].scenarioId, 'swiss-property-purchase');
    assert.equal(sessions[0].mode, 'telegram');
    assert.equal(sessions[0].fightCard?.grade?.grade, 'B');
    assert.match(sent.at(-1).text, /Je peux discuter/);
  });

  it('returns academy summaries for profile, drills, weekly, leaderboard and hall of fame', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'negotiate-tg-profile-'));
    tempDirs.push(dir);
    const store = createStore({ dataDir: dir });
    await store.saveSession({
      id: 'weekly-1',
      date: '2026-04-02T10:00:00.000Z',
      brief: {
        situation: 'Achat discret d’un bien à 950000 CHF',
        userRole: 'Acheteur',
        adversaryRole: 'Vendeur',
        objective: 'Signer à 900000 CHF',
        minimalThreshold: '920000 CHF',
        batna: 'Un autre appartement',
        difficulty: 'neutral',
        relationalStakes: 'medium',
        constraints: [],
      },
      adversary: { identity: 'Mme Seller' },
      transcript: [
        { role: 'user', content: 'Je propose 900000 CHF.' },
        { role: 'assistant', content: 'Je vise plutôt 950000 CHF.' },
      ],
      status: 'accepted',
      turns: 4,
      scenarioId: 'freelance-rate',
      feedback: {
        globalScore: 88,
        scores: {
          outcomeLeverage: 20,
          batnaDiscipline: 18,
          emotionalRegulation: 18,
          biasResistance: 14,
          conversationalFlow: 18,
        },
        recommendations: ['Garde ce sang-froid.'],
      },
      mode: 'telegram',
    });
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
    assert.match(sent.at(-1).text, /Sessions: 2/);

    await bot.handleMessage({ message: { chat: { id: 42 }, text: '/drills' } });
    assert.match(sent.at(-1).text, /Drills NegotiateAI/);
    assert.match(sent.at(-1).text, /Drill recommandé:/);

    await bot.handleMessage({ message: { chat: { id: 42 }, text: '/weekly' } });
    assert.match(sent.at(-1).text, /Scenario de la semaine/);
    assert.match(sent.at(-1).text, /Commande: \/scenario /);

    await bot.handleMessage({ message: { chat: { id: 42 }, text: '/leaderboard' } });
    assert.match(sent.at(-1).text, /Leaderboard — /);
    assert.match(sent.at(-1).text, /#1 · /);

    await bot.handleMessage({ message: { chat: { id: 42 }, text: '/halloffame' } });
    assert.match(sent.at(-1).text, /Hall of Fame NegotiateAI/);
    assert.match(sent.at(-1).text, /#1 · /);
    assert.doesNotMatch(sent.at(-1).text, /950000 CHF/);
  });

  it('runs simulate-before-send batch over an active telegram session', async () => {
    const sent = [];
    const bot = createTelegramBot({
      provider,
      token: 'token-123',
      fetchImpl: async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return { ok: true, async json() { return { ok: true }; } };
      },
    });

    await bot.handleMessage({ message: { chat: { id: 55 }, text: '/new Obtenir 10% | 5% mini | autre offre' } });
    const result = await bot.handleMessage({ message: { chat: { id: 55 }, text: '/sim Je peux signer vite aujourd\'hui. | Pouvez-vous faire un geste ?' } });

    assert.equal(result.command, 'simulate-batch');
    assert.equal(result.bestIndex, 0);
    assert.match(sent.at(-1).text, /Simulate Before Send v2/);
    assert.match(sent.at(-1).text, /Meilleure option: #1/);
    assert.match(sent.at(-1).text, /Rewrite conseillé:/);
    assert.equal(bot.sessions.size, 1);
  });

  it('starts a daily challenge and persists it in daily mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'negotiate-tg-daily-'));
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

    await bot.handleMessage({ message: { chat: { id: 99 }, text: '/daily' } });
    assert.equal(bot.sessions.size, 1);
    assert.match(sent.at(-1).text, /Daily challenge prêt|Daily rejoué/);
    assert.match(sent.at(-1).text, /Cible:/);
    assert.match(sent.at(-1).text, /Tours max:/);

    await bot.handleMessage({ message: { chat: { id: 99 }, text: 'Voici ma proposition.' } });

    const sessions = await store.loadSessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].mode, 'daily');
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

  it('polling runtime removes webhook then dispatches fetched updates', async () => {
    const sent = [];
    const fetchCalls = [];
    const bot = createTelegramBot({
      provider,
      token: 'token-123',
      fetchImpl: async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return { ok: true, async json() { return { ok: true }; } };
      },
    });

    const runtime = createTelegramPollingRuntime({
      bot,
      token: 'token-123',
      fetchImpl: async (url, options) => {
        fetchCalls.push({ url, body: JSON.parse(options.body) });
        if (url.endsWith('/deleteWebhook')) {
          return { ok: true, async json() { return { ok: true, result: true }; } };
        }
        if (url.endsWith('/getUpdates')) {
          return {
            ok: true,
            async json() {
              return {
                ok: true,
                result: [{ update_id: 10, message: { chat: { id: 51 }, text: '/help' } }],
              };
            },
          };
        }
        throw new Error(`Unexpected url: ${url}`);
      },
    });

    await runtime.deleteWebhook();
    const result = await runtime.pollOnce();

    assert.equal(result.updates.length, 1);
    assert.equal(result.results[0].command, 'start');
    assert.equal(runtime.getOffset(), 11);
    assert.match(sent.at(-1).text, /Bienvenue sur NegotiateAI/);
    assert.match(sent.at(-1).text, /\/drills/);
    assert.match(sent.at(-1).text, /\/weekly/);
    assert.equal(fetchCalls[0].body.drop_pending_updates, false);
    assert.equal(fetchCalls[1].body.offset, 0);
    assert.equal(fetchCalls[1].body.timeout, 25);
  });
});
