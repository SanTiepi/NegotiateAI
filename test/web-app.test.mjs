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
  offerSimulation: ({ prompt }) => {
    const match = prompt.match(/Candidate message:\n([\s\S]*?)\n\nRecent transcript:/);
    const message = match?.[1]?.trim() || '';
    const score = message.includes('vite') ? 84 : 67;
    return {
      sendVerdict: score >= 80 ? 'send' : 'revise',
      approvalScore: score,
      predictedOutcome: score >= 80 ? 'Bon levier' : 'Trop timide',
      riskLevel: score >= 80 ? 'low' : 'medium',
      likelyObjections: ['Prix'],
      strengths: ['Clarté'],
      vulnerabilities: ['Ancrage faible'],
      recommendedRewrite: `Version revue: ${message}`,
    };
  },
  versusJudgment: {
    winner: 'playerA',
    scoreA: { clarity: 84, leverage: 80, emotionalControl: 78, batnaDiscipline: 82, total: 81 },
    scoreB: { clarity: 71, leverage: 68, emotionalControl: 75, batnaDiscipline: 64, total: 70 },
    rationale: 'Player A framed a clearer ask with stronger BATNA discipline.',
    coachingA: ['Keep the same clarity while adding one discovery question.'],
    coachingB: ['State your BATNA sooner and tighten your ask.'],
    swingFactors: ['Clarity', 'BATNA discipline'],
  },
  guidedChoices: {
    choices: [
      { text: 'Option 1', technique: 'mirroring', concept: 'Reflete la preoccupation.', quality: 'strong' },
      { text: 'Option 2', technique: 'labeling', concept: 'Nomme l emotion.', quality: 'moderate' },
      { text: 'Option 3', technique: 'split', concept: 'Coupe la poire en deux.', quality: 'trap' },
    ],
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

  it('serves the web shell with academy and replay surfaces wired in', async () => {
    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /data-view="academy"/);
    assert.match(html, /id="view-academy"/);
    assert.match(html, /id="history-replay"/);
    assert.match(html, /id="btn-simulate-batch"/);
    assert.match(html, /id="sim-run-batch"/);
    assert.match(html, /id="versus-form"/);
    assert.match(html, /id="versus-run"/);

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

  it('exposes scenario-of-week, hall-of-fame, leaderboard, and profile endpoints', async () => {
    await store.saveSession({
      id: 'hof-1',
      date: new Date().toISOString(),
      brief: { objective: 'x', batna: 'y', minimalThreshold: 'z', userRole: 'Acheteur', situation: 'Achat appartement a 850000 CHF' },
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
    assert.match(hallOfFame.body.entries[0].title, /Operateur|Strategiste|Negociateur|Partenaire|Analyste|Joueur/);
    assert.doesNotMatch(hallOfFame.body.entries[0].title, /850000|Mme Dubois|Acheteur/);
    assert.match(hallOfFame.body.text, /Score 91\/100/);
    assert.doesNotMatch(hallOfFame.body.text, /850000|Mme Dubois|Acheteur/);

    const hallOfFameExport = await fetch(`${baseUrl}/api/hall-of-fame/export?limit=1`);
    const hallOfFameText = await hallOfFameExport.text();
    assert.equal(hallOfFameExport.status, 200);
    assert.match(hallOfFameText, /Score 91\/100/);
    assert.doesNotMatch(hallOfFameText, /850000|Mme Dubois|Acheteur/);

    const hallOfFameJsonExport = await request('/api/hall-of-fame/export?limit=1&format=json');
    assert.equal(hallOfFameJsonExport.response.status, 200);
    assert.equal(hallOfFameJsonExport.body.entries[0].sessionId, 'hof-1');
    assert.match(hallOfFameJsonExport.body.text, /Score 91\/100/);

    const leaderboard = await request('/api/leaderboard?scenarioId=salary-negotiation');
    assert.equal(leaderboard.response.status, 200);
    assert.equal(leaderboard.body.entries[0].sessionId, 'hof-1');

    await store.saveProgression({
      belts: { white: { earned: true } },
      biasProfile: {
        anchoring: {
          totalCount: 4,
          frequency: 0.5,
          lastSeen: '2026-04-01',
          nextDrillDate: '2026-04-02',
          _recentCounts: [1, 1, 1, 0],
        },
      },
      totalSessions: 1,
      currentStreak: 1,
      lastSessionDate: new Date().toISOString().slice(0, 10),
      weakDimensions: ['biasResistance'],
    });

    const profile = await request('/api/profile');
    assert.equal(profile.response.status, 200);
    assert.equal(profile.body.card.totalSessions, 1);
    assert.equal(profile.body.recommendedDrillId, 'reframe');
    assert.equal(profile.body.biasRecommendation.biasType, 'anchoring');
    assert.match(profile.body.shareable, /Vaccination|Ancrage|Autonomie/i);
    assert.equal(profile.body.uiLayer.key, 'discover');
    assert.ok(Array.isArray(profile.body.uiLayerDefinitions));

    const dashboard = await request('/api/dashboard');
    assert.equal(dashboard.response.status, 200);
    assert.equal(dashboard.body.totalSessions, 1);
    assert.equal(dashboard.body.averageScore, 91);
    assert.equal(dashboard.body.recommendedDrillId, 'reframe');
    assert.equal(dashboard.body.biasRecommendation.biasType, 'anchoring');
    assert.equal(dashboard.body.uiLayer.key, 'discover');
    assert.ok(Array.isArray(dashboard.body.uiLayerDefinitions));
    assert.ok(Array.isArray(dashboard.body.beltDefinitions));
    assert.equal(typeof dashboard.body.autonomy.label, 'string');
    assert.ok(dashboard.body.autonomy.label.length > 0);

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
    const swiss = body.filter((entry) => entry.category === 'swiss');
    assert.equal(swiss.length, 3);
    assert.deepEqual(
      swiss.map((entry) => entry.id).sort(),
      ['swiss-lease-renegotiation', 'swiss-property-purchase', 'swiss-regie-owner-conflict'],
    );
    assert.ok(swiss.every((entry) => entry.scenarioFile === entry.id));

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

  it('serves session detail endpoint with fight card analytics', async () => {
    await store.saveSession({
      id: 'test-session-detail',
      date: new Date().toISOString(),
      brief: {
        situation: 'Renegociation fournisseur',
        objective: 'Obtenir 12% de remise',
        batna: 'Signer avec un concurrent',
        minimalThreshold: '6% minimum',
        difficulty: 'hostile',
      },
      adversary: { identity: 'M. Keller', style: 'Sec mais rationnel' },
      transcript: [
        { role: 'user', content: 'Je peux m engager vite si le prix baisse.' },
        { role: 'assistant', content: 'Je peux etudier une concession limitee.' },
      ],
      status: 'accepted',
      turns: 2,
      feedback: {
        globalScore: 88,
        scores: {
          outcomeLeverage: 22,
          batnaDiscipline: 18,
          emotionalRegulation: 21,
          biasResistance: 13,
          conversationalFlow: 14,
        },
        biasesDetected: [{ biasType: 'anchoring', turn: 1, excerpt: '...', explanation: 'Ancrage initial trop rapide.' }],
        tacticsUsed: ['labeling'],
        missedOpportunities: [],
        recommendations: ['Creuser la marge de manoeuvre avant la prochaine concession.'],
      },
      fightCard: {
        grade: { grade: 'A', label: 'Excellent', description: 'Negociation maitrisee.', color: '#22c55e' },
        triangle: { transaction: 90, relation: 74, intelligence: 82, weightedScore: 84, weights: { transaction: 50, relation: 25, intelligence: 25 }, hintsDiscovered: 1, totalHints: 2 },
        rounds: { total: 2, won: 1, lost: 0, neutral: 1, detail: [{ turn: 1, points: 2, label: 'Round gagne', signals: ['momentum positif'], cumulativeScore: 2 }] },
        globalScore: 88,
        objectiveContract: { objective: 'Obtenir 12% de remise', threshold: '6% minimum', batna: 'Signer avec un concurrent', strategy: 'ancrage haut', relationalGoal: 'rester partenaire' },
      },
      objectiveContract: {
        objective: 'Obtenir 12% de remise',
        minimalThreshold: '6% minimum',
        batna: 'Signer avec un concurrent',
        strategy: 'ancrage haut',
        relationalGoal: 'rester partenaire',
      },
      roundScores: [{ turn: 1, points: 2, label: 'Round gagne', signals: ['momentum positif'], cumulativeScore: 2 }],
      worldState: { emotions: { egoThreat: 15 }, pad: { pleasure: 0.2, arousal: 0.1, dominance: 0.4 } },
      mode: 'web',
      scenarioId: 'vendor-negotiation',
    });

    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const { response, body } = await request('/api/sessions/test-session-detail');
    assert.equal(response.status, 200);
    assert.equal(body.id, 'test-session-detail');
    assert.equal(body.analytics.grade, 'A');
    assert.equal(body.analytics.score, 88);
    assert.deepEqual(body.analytics.biases, ['anchoring']);
    assert.equal(body.fightCard.triangle.transaction, 90);
    assert.equal(body.objectiveContract.strategy, 'ancrage haut');
    assert.equal(body.roundScores.length, 1);
    assert.equal(body.worldState.emotions.egoThreat, 15);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns progressive ui metadata, guided choices, and post-choice coaching when explicitly enabled', async () => {
    let turnCall = 0;
    let coachingCall = 0;
    let guidedCall = 0;
    const progressiveProvider = createMockProvider({
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
      turn: () => ([
        {
          adversaryResponse: 'Je peux bouger un peu, mais pas trop.',
          sessionOver: false,
          endReason: null,
          sessionStatus: 'active',
        },
        {
          adversaryResponse: 'Votre approche me semble plus constructive.',
          sessionOver: false,
          endReason: null,
          sessionStatus: 'active',
        },
      ][turnCall++]),
      coaching: () => ([
        { biasDetected: null, alternative: 'Clarifie les criteres.', momentum: 'stable', tip: 'Reste centre sur ta BATNA.' },
        { biasDetected: null, alternative: 'Continue.', momentum: 'gaining', tip: 'Bon cadrage.' },
      ][coachingCall++]),
      guidedChoices: () => ([
        {
          choices: [
            { text: 'Option 1', technique: 'mirroring', concept: 'Reflete la preoccupation.', quality: 'strong' },
            { text: 'Option 2', technique: 'labeling', concept: 'Nomme l emotion.', quality: 'moderate' },
            { text: 'Option 3', technique: 'split', concept: 'Coupe la poire en deux.', quality: 'trap' },
          ],
        },
        {
          choices: [
            { text: 'Option suivante 1', technique: 'labeling', concept: 'Creuse le besoin.', quality: 'strong' },
            { text: 'Option suivante 2', technique: 'anchor', concept: 'Teste un ancrage.', quality: 'moderate' },
            { text: 'Option suivante 3', technique: 'concede', concept: 'Concession trop rapide.', quality: 'trap' },
          ],
        },
      ][guidedCall++]),
    });

    app = createWebApp({ provider: progressiveProvider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const created = await request('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        uiProgressive: true,
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

    assert.equal(created.response.status, 201);
    assert.equal(created.body.uiProgressive, true);
    assert.equal(created.body.uiLayer.key, 'discover');

    app.activeSessions.get('sess-test').maxTurns = 12;

    const firstTurn = await request('/api/session/sess-test/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Je peux signer vite si le prix bouge.' }),
    });

    assert.equal(firstTurn.response.status, 200);
    assert.equal(firstTurn.body.uiLayer.key, 'discover');
    assert.equal('coaching' in firstTurn.body, false);
    assert.ok(Array.isArray(firstTurn.body.guidedChoices));
    assert.equal(firstTurn.body.guidedChoices.length, 3);
    assert.equal(firstTurn.body.guidedChoices[0].text, 'Option 1');
    assert.equal(firstTurn.body.guidedChoiceFeedback, undefined);

    const secondTurn = await request('/api/session/sess-test/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Option 3', guidedChoiceIndex: 2 }),
    });

    assert.equal(secondTurn.response.status, 200);
    assert.equal(secondTurn.body.guidedChoiceFeedback.wasTrap, true);
    assert.equal(secondTurn.body.guidedChoiceFeedback.wasStrong, false);
    assert.match(secondTurn.body.guidedChoiceFeedback.lesson, /piege|meilleure option/i);
    assert.ok(Array.isArray(secondTurn.body.guidedChoices));
    assert.equal(secondTurn.body.guidedChoices[0].text, 'Option suivante 1');

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('simulates a batch of offer variants for an active session', async () => {
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

    const { response, body } = await request('/api/session/sess-test/simulate-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: ['Je peux signer vite aujourd\'hui.', 'Pouvez-vous faire un geste ?'] }),
    });

    assert.equal(response.status, 200);
    assert.equal(body.bestIndex, 0);
    assert.equal(body.bestReport.approvalScore, 84);
    assert.equal(body.reports.length, 2);
    assert.equal(body.reports[1].approvalScore, 67);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('adjudicates a versus round over the web api', async () => {
    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const { response, body } = await request('/api/versus', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brief: {
          situation: 'Nego salariale',
          userRole: 'Candidate',
          adversaryRole: 'Hiring manager',
          objective: 'Signer avec 140k CHF',
          minimalThreshold: '130k CHF minimum',
          batna: 'Autre offre a 135k CHF',
        },
        playerA: { name: 'A', message: 'Je peux avancer vite et j’ai une autre option a 135k, donc 140k est coherent.' },
        playerB: { name: 'B', message: 'Je suis motive et ouvert a discuter.' },
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(body.winner, 'playerA');
    assert.equal(body.scoreA.total, 81);
    assert.equal(body.scoreB.total, 70);
    assert.match(body.rationale, /player a/i);

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('enriched dashboard includes autonomy, belt definitions, and scoring breakdowns', async () => {
    await store.saveSession({
      id: 'dash-web-1',
      date: new Date('2026-04-01T10:00:00.000Z').toISOString(),
      brief: {
        situation: 'Achat appartement',
        userRole: 'Acheteur',
        adversaryRole: 'Vendeuse',
        objective: 'Acheter à 500k',
        minimalThreshold: '520k max',
        batna: 'Continuer les visites',
        difficulty: 'hostile',
      },
      adversary: { identity: 'Mme Dubois' },
      transcript: [],
      status: 'accepted',
      turns: 2,
      feedback: {
        globalScore: 78,
        scores: {
          outcomeLeverage: 19,
          batnaDiscipline: 14,
          emotionalRegulation: 20,
          biasResistance: 10,
          conversationalFlow: 12,
        },
      },
      mode: 'web',
    });
    await store.saveSession({
      id: 'dash-telegram-1',
      date: new Date('2026-04-02T10:00:00.000Z').toISOString(),
      brief: {
        situation: 'Renegociation bail',
        userRole: 'Locataire',
        adversaryRole: 'Regie',
        objective: 'Baisser le loyer',
        minimalThreshold: 'Zero hausse',
        batna: 'Demenager',
        difficulty: 'neutral',
      },
      adversary: { identity: 'Regie SA' },
      transcript: [],
      status: 'ended',
      turns: 3,
      feedback: {
        globalScore: 84,
        scores: {
          outcomeLeverage: 21,
          batnaDiscipline: 17,
          emotionalRegulation: 22,
          biasResistance: 13,
          conversationalFlow: 14,
        },
      },
      mode: 'telegram',
    });

    app = createWebApp({ provider, sessionIdFactory: () => 'sess-test', store });
    const address = await app.listen(0);
    baseUrl = `http://127.0.0.1:${address.port}`;

    const { response, body } = await request('/api/dashboard');
    assert.equal(response.status, 200);
    assert.ok(body.autonomy);
    assert.equal(body.autonomy.level, 1);
    assert.ok(Array.isArray(body.beltDefinitions));
    assert.ok(body.beltDefinitions.length >= 5);
    assert.deepEqual(body.modeBreakdown, [
      { mode: 'telegram', count: 1 },
      { mode: 'web', count: 1 },
    ]);
    assert.deepEqual(body.difficultyBreakdown, [
      { difficulty: 'hostile', count: 1 },
      { difficulty: 'neutral', count: 1 },
    ]);
    assert.equal(body.bestDimension.dimension, 'emotionalRegulation');
    assert.equal(body.weakestDimension.dimension, 'biasResistance');
    assert.equal(body.scoreHistory.length, 2);
    assert.equal(body.scoreHistory[0].id, 'dash-web-1');
    assert.equal(body.scoreHistory[1].id, 'dash-telegram-1');

    await app.close();
    await rm(tmpDir, { recursive: true, force: true });
  });
});
