import { describe, it, before, after, beforeEach } from 'node:test';
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
  turn: {
    adversaryResponse: 'Je peux bouger un peu, mais pas trop.',
    sessionOver: true,
    endReason: 'Accord trouvé',
    sessionStatus: 'accepted',
  },
  coaching: {
    biasDetected: null,
    alternative: 'Clarifie les critères avant de céder.',
    momentum: 'stable',
    tip: 'Reste centré sur ta BATNA.',
  },
  feedback: {
    globalScore: 82,
    scores: {
      outcomeLeverage: 20,
      batnaDiscipline: 16,
      emotionalRegulation: 20,
      biasResistance: 12,
      conversationalFlow: 14,
    },
    biasesDetected: [],
    tacticsUsed: ['anchoring'],
    missedOpportunities: [],
    recommendations: ['Continue à cadrer la BATNA.'],
  },
});

let app;
let baseUrl;
let store;
let tmpDir;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

describe('web-app', () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'negotiate-web-'));
    store = createStore({ dataDir: tmpDir });
  });

  before(async () => {
    // placeholder, app is created per test below
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it('serves health endpoint', async () => {
    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const { response, body } = await request('/api/health');
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a session from a valid brief', async () => {
    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const { response, body } = await request('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brief: {
          situation: 'Achat appartement',
          userRole: 'Acheteur',
          adversaryRole: 'Vendeuse',
          objective: 'Acheter a 480k',
          minimalThreshold: '500k max',
          batna: 'Continuer les visites',
          difficulty: 'neutral',
        },
      }),
    });

    assert.equal(response.status, 201);
    assert.equal(body.sessionId, 'sess-test');
    assert.equal(body.adversary.identity, 'Mme Dubois');

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects invalid briefs', async () => {
    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const { response, body } = await request('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: { situation: 'x' } }),
    });

    assert.equal(response.status, 400);
    assert.match(body.error, /objective/i);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('plays a turn, persists completed web sessions, and updates dashboard stats', async () => {
    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    await request('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brief: {
          situation: 'Achat appartement',
          userRole: 'Acheteur',
          adversaryRole: 'Vendeuse',
          objective: 'Acheter a 480k',
          minimalThreshold: '500k max',
          batna: 'Continuer les visites',
        },
      }),
    });

    const { response, body } = await request('/api/session/sess-test/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Je peux signer vite si le prix bouge.' }),
    });

    assert.equal(response.status, 200);
    assert.equal(body.adversaryResponse, 'Je peux bouger un peu, mais pas trop.');
    assert.equal(body.sessionOver, true);
    assert.equal(app.activeSessions.size, 0);

    const stats = await store.getDashboardStats();
    assert.equal(stats.totalSessions, 1);
    assert.equal(stats.averageScore, 82);
    assert.equal(stats.currentStreak, 1);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });
});
