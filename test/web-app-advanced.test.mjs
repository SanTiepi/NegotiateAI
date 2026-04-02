import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createMockProvider } from '../src/provider.mjs';
import { createWebApp } from '../src/web-app.mjs';
import { createStore } from '../src/store.mjs';

const provider = createMockProvider({
  adversary: {
    identity: 'Mme Dubois',
    style: 'Ferme mais pro',
    publicObjective: 'Signer vite',
    hiddenObjective: 'Maximiser sa marge',
    batna: 'Un autre acheteur',
    nonNegotiables: ['Pas sous 500k'],
    timePressure: 'Fin de semaine',
    emotionalProfile: { confidence: 70, frustration: 25, egoThreat: 20 },
    likelyTactics: ['scarcity'],
    vulnerabilities: ['Fin de mois'],
  },
  replay: {
    turns: [
      {
        turnNumber: 1,
        biasDetected: null,
        alternativeSuggestion: 'Clarifie tes critères avant de céder.',
        momentumLabel: 'gaining',
        annotation: 'Bon cadrage initial.',
      },
    ],
    summary: 'Session courte mais bien cadrée.',
  },
});

async function createHarness() {
  const dataDir = await mkdtemp(join(tmpdir(), 'negotiate-web-advanced-'));
  const store = createStore({ dataDir });
  const app = createWebApp({ provider, sessionIdFactory: () => 'sess-advanced', store });
  const address = await app.listen(0);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const body = await response.json().catch(() => null);
    return { response, body };
  }

  return { app, store, dataDir, request };
}

async function cleanupHarness(harness) {
  if (!harness) return;
  await harness.app.close();
  await rm(harness.dataDir, { recursive: true, force: true });
}

describe('web-app advanced api', () => {
  let harness;

  afterEach(async () => {
    await cleanupHarness(harness);
    harness = null;
  });

  it('serves a generated daily challenge', async () => {
    harness = await createHarness();

    const { response, body } = await harness.request('/api/daily');

    assert.equal(response.status, 200);
    assert.equal(body.date, new Date().toISOString().slice(0, 10));
    assert.equal(body.brief.objective.length > 0, true);
    assert.equal(body.adversary.identity, 'Mme Dubois');
    assert.ok(['cooperative', 'neutral', 'hostile', 'manipulative'].includes(body.difficulty));
    assert.ok(body.maxTurns >= 5);
  });

  it('serves drill catalog with recommendation from progression', async () => {
    harness = await createHarness();
    await harness.store.saveProgression({
      belts: {},
      biasProfile: {
        anchoring: {
          totalCount: 3,
          recentCount: 2,
          frequency: 0.5,
          lastSeen: '2026-03-20T10:00:00.000Z',
          nextDrillDate: '2026-03-25',
        },
      },
      totalSessions: 4,
      currentStreak: 1,
      lastSessionDate: new Date().toISOString().slice(0, 10),
      weakDimensions: ['emotionalRegulation'],
    });

    const { response, body } = await harness.request('/api/drills');

    assert.equal(response.status, 200);
    assert.equal(body.recommendedDrillId, 'pressure');
    assert.equal(body.biasRecommendation.biasType, 'anchoring');
    assert.equal(body.dueBiasDrills[0].nextDrillDate, '2026-03-25');
    assert.ok(Array.isArray(body.drills));
    assert.ok(body.drills.length >= 5);
    assert.equal(body.drills.find((drill) => drill.id === 'pressure')?.recommended, true);
  });

  it('serves persisted session replay by id', async () => {
    harness = await createHarness();
    await harness.store.saveSession({
      id: 'session-replay-1',
      date: new Date().toISOString(),
      brief: {
        situation: 'Achat appartement',
        userRole: 'Acheteur',
        adversaryRole: 'Vendeuse',
        objective: 'Acheter à 500k',
        minimalThreshold: '520k max',
        batna: 'Continuer les visites',
      },
      adversary: { identity: 'Mme Dubois' },
      transcript: [
        { role: 'user', content: 'Je peux signer vite si on ajuste le prix.' },
        { role: 'assistant', content: 'Je peux faire un effort minime.' },
      ],
      status: 'ended',
      turns: 1,
      feedback: {
        globalScore: 74,
        scores: {
          outcomeLeverage: 16,
          batnaDiscipline: 15,
          emotionalRegulation: 16,
          biasResistance: 13,
          conversationalFlow: 14,
        },
        biasesDetected: [],
        tacticsUsed: [],
        missedOpportunities: [],
        recommendations: [],
      },
      mode: 'web',
    });

    const { response, body } = await harness.request('/api/sessions/session-replay-1/replay');

    assert.equal(response.status, 200);
    assert.equal(body.sessionId, 'session-replay-1');
    assert.equal(body.turns.length, 1);
    assert.equal(body.turns[0].momentumLabel, 'gaining');
    assert.equal(body.summary, 'Session courte mais bien cadrée.');
  });

  it('returns 404 for unknown replay id', async () => {
    harness = await createHarness();

    const { response, body } = await harness.request('/api/sessions/unknown/replay');

    assert.equal(response.status, 404);
    assert.match(body.error, /session not found/i);
  });
});
