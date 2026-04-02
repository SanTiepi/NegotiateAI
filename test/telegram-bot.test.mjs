import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockProvider } from '../src/provider.mjs';
import { createTelegramBot, parseScenarioSeed, formatTurnReply } from '../src/telegram-bot.mjs';

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
    sessionOver: false,
    endReason: null,
    sessionStatus: null,
  },
  coaching: {
    biasDetected: null,
    alternative: null,
    momentum: 'stable',
    tip: 'Reste concret.',
  },
});

describe('telegram-bot', () => {
  it('parseScenarioSeed builds a valid quick-start brief seed', () => {
    const brief = parseScenarioSeed('Gagner 10% | 5% mini | autre offre');
    assert.equal(brief.objective, 'Gagner 10%');
    assert.equal(brief.minimalThreshold, '5% mini');
    assert.equal(brief.batna, 'autre offre');
  });

  it('creates a session on /new and responds to turns', async () => {
    const sent = [];
    const bot = createTelegramBot({
      provider,
      token: 'token-123',
      fetchImpl: async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return { ok: true, async json() { return { ok: true }; } };
      },
    });

    await bot.handleMessage({ message: { chat: { id: 42 }, text: '/new Obtenir 10% | 5% mini | autre offre' } });
    assert.equal(bot.sessions.size, 1);
    await bot.handleMessage({ message: { chat: { id: 42 }, text: 'Je veux avancer vite.' } });

    assert.equal(sent.length, 2);
    assert.match(sent[1].text, /Je peux discuter/);
    assert.match(sent[1].text, /Reste concret/);
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
