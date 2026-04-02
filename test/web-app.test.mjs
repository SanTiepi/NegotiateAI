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

  it('exposes scenario-of-week, hall-of-fame, and leaderboard endpoints', async () => {
    await store.saveSession({
      id: 'hof-1',
      date: new Date().toISOString(),
      brief: { objective: 'x', batna: 'y', minimalThreshold: 'z', userRole: 'Acheteur' },
      adversary: { identity: 'Mme Dubois' },
      transcript: [],
      status: 'accepted',
      turns: 3,
      feedback: { globalScore: 91, scores: {} },
      scenario: { id: 'salary-negotiation' },
      mode: 'web',
    });

    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const scenarioOfWeek = await request('/api/scenario-of-week');
    assert.equal(scenarioOfWeek.response.status, 200);
    assert.ok(scenarioOfWeek.body.weekKey);
    assert.ok(scenarioOfWeek.body.scenario.id);

    const hallOfFame = await request('/api/hall-of-fame');
    assert.equal(hallOfFame.response.status, 200);
    assert.equal(hallOfFame.body.entries[0].sessionId, 'hof-1');

    const leaderboard = await request('/api/leaderboard?scenarioId=salary-negotiation');
    assert.equal(leaderboard.response.status, 200);
    assert.equal(leaderboard.body.entries[0].sessionId, 'hof-1');

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
    assert.equal(body.coaching.tip, 'Reste centré sur ta BATNA.');
    assert.equal(body.ticker.turn, 1);
    assert.ok('actTransition' in body);

    const stats = await store.getDashboardStats();
    assert.equal(stats.totalSessions, 1);
    assert.equal(stats.averageScore, 82);
    assert.equal(stats.currentStreak, 1);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('serves scenarios presets', async () => {
    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const { response, body } = await request('/api/scenarios');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body));
    assert.ok(body.length >= 3);
    assert.ok(body[0].id);
    assert.ok(body[0].name);
    assert.ok(body[0].brief);
    assert.ok(body[0].brief.objective);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('serves progression endpoint', async () => {
    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const { response, body } = await request('/api/progression');
    assert.equal(response.status, 200);
    assert.ok('belts' in body || 'totalSessions' in body);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('serves sessions list endpoint', async () => {
    await store.saveSession({
      id: 'test-session-1',
      date: new Date().toISOString(),
      brief: { objective: 'Test', batna: 'B', minimalThreshold: 'T', userRole: 'U' },
      adversary: { identity: 'Adv' },
      transcript: [],
      status: 'accepted',
      turns: 3,
      feedback: { globalScore: 70, scores: {} },
      mode: 'web',
    });

    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const { response, body } = await request('/api/sessions');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    assert.equal(body[0].id, 'test-session-1');
    assert.equal(body[0].score, 70);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('enriched dashboard includes autonomy and belt definitions', async () => {
    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const { response, body } = await request('/api/dashboard');
    assert.equal(response.status, 200);
    assert.ok(body.autonomy);
    assert.equal(body.autonomy.level, 1);
    assert.ok(Array.isArray(body.beltDefinitions));
    assert.ok(body.beltDefinitions.length >= 5);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });
});
