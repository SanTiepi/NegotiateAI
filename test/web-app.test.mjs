import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createMockProvider } from '../src/provider.mjs';
import { createWebApp } from '../src/web-app.mjs';

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
    sessionOver: false,
    endReason: null,
    sessionStatus: null,
  },
  coaching: {
    biasDetected: null,
    alternative: 'Clarifie les critères avant de céder.',
    momentum: 'stable',
    tip: 'Reste centré sur ta BATNA.',
  },
});

let app;
let baseUrl;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => null);
  return { response, body };
}

describe('web-app', () => {
  before(async () => {
    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test' });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app.close();
  });

  it('serves health endpoint', async () => {
    const { response, body } = await request('/api/health');
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
  });

  it('creates a session from a valid brief', async () => {
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
  });

  it('rejects invalid briefs', async () => {
    const { response, body } = await request('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ brief: { situation: 'x' } }),
    });

    assert.equal(response.status, 400);
    assert.match(body.error, /objective/i);
  });

  it('plays a turn on an existing session', async () => {
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
    assert.equal(body.state.turn, 1);
    assert.equal(body.coaching.tip, 'Reste centré sur ta BATNA.');
  });
});
