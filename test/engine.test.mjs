import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, processTurn } from '../src/engine.mjs';
import { createMockProvider } from '../src/provider.mjs';

const MOCK_BRIEF = {
  situation: 'Salary negotiation',
  userRole: 'Employee',
  adversaryRole: 'Manager',
  objective: 'Get a 15% raise',
  minimalThreshold: '8% raise',
  batna: 'Accept competing offer',
  constraints: [],
  difficulty: 'neutral',
  relationalStakes: 'High',
};

const MOCK_ADVERSARY = {
  identity: 'Sarah, Engineering Manager',
  style: 'Professional but firm',
  publicObjective: 'Retain talent within budget',
  hiddenObjective: 'Has budget for 12% but wants to save',
  batna: 'Hire a replacement at market rate',
  nonNegotiables: ['No more than 15%', 'Must commit to 1 year'],
  timePressure: 'Moderate — needs to close before Q2',
  emotionalProfile: { confidence: 70, frustration: 10, egoThreat: 5 },
  likelyTactics: ['Appeal to team fairness', 'Delay tactic'],
  vulnerabilities: ['Fear of losing a top performer', 'Quarterly deadline pressure'],
};

function makeTurnProvider(responses) {
  let i = 0;
  return createMockProvider({
    turn: () => ({
      adversaryResponse: responses[i] || responses[responses.length - 1],
      detectedSignals: [],
      stateUpdates: { confidence: 65, frustration: 15 + (i++) * 5 },
      sessionOver: false,
      endReason: null,
    }),
  });
}

describe('engine', () => {
  describe('createSession', () => {
    it('creates a session with initial state', () => {
      const provider = createMockProvider({});
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      assert.equal(session.turn, 0);
      assert.deepEqual(session.transcript, []);
      assert.equal(session.status, 'active');
      assert.equal(typeof session.confidence, 'number');
      assert.ok(session.confidence >= 0 && session.confidence <= 100);
      assert.equal(typeof session.frustration, 'number');
      assert.equal(session.momentum, 0);
      assert.equal(session.activeAnchor, null);
      assert.deepEqual(session.concessions, []);
      assert.ok(session._world, 'Session should have WorldEngine state');
    });
  });

  describe('processTurn', () => {
    it('increments turn number after processing', async () => {
      const provider = makeTurnProvider(['I appreciate your interest.']);
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, 'I deserve a raise based on my contributions.');
      assert.equal(result.state.turn, 1);
    });

    it('adds both user and adversary messages to transcript', async () => {
      const provider = makeTurnProvider(['Noted.']);
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, 'My work speaks for itself.');
      assert.equal(result.state.transcript.length, 2);
      assert.equal(result.state.transcript[0].role, 'user');
      assert.equal(result.state.transcript[1].role, 'adversary');
    });

    it('returns adversary response text', async () => {
      const provider = makeTurnProvider(['Let me think about it.']);
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, 'I want 15%.');
      assert.equal(typeof result.adversaryResponse, 'string');
      assert.ok(result.adversaryResponse.length > 0);
    });

    it('updates emotional state (confidence, frustration)', async () => {
      const provider = makeTurnProvider(['That seems high.']);
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, 'I have another offer at +20%.');
      assert.equal(typeof result.state.confidence, 'number');
      assert.equal(typeof result.state.frustration, 'number');
    });

    it('handles /end command — ends session', async () => {
      const provider = makeTurnProvider([]);
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, '/end');
      assert.equal(result.sessionOver, true);
      assert.equal(result.state.status, 'ended');
    });

    it('handles /quit command — ends session', async () => {
      const provider = makeTurnProvider([]);
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, '/quit');
      assert.equal(result.sessionOver, true);
      assert.equal(result.state.status, 'quit');
    });

    it('ends session at turn 12 (max turns)', async () => {
      const provider = makeTurnProvider(['Response.']);
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      // Simulate reaching turn 11
      session.turn = 11;
      const result = await processTurn(session, 'Final offer.');
      assert.equal(result.sessionOver, true);
      assert.ok(result.endReason);
    });

    it('returns tactics and bias indicators in V2', async () => {
      const provider = createMockProvider({
        turn: () => ({
          adversaryResponse: 'C\'est la norme dans le marché, tout le monde accepte 3%.',
          sessionOver: false,
          endReason: null,
        }),
      });
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, 'On dirait que le budget est serré pour vous.');
      assert.ok('tactics' in result, 'V2 should return tactics');
      assert.ok('biasIndicators' in result, 'V2 should return biasIndicators');
      assert.ok(Array.isArray(result.detectedSignals));
    });

    it('does not corrupt session state when provider throws', async () => {
      const provider = createMockProvider({
        turn: () => { throw new Error('API rate limit'); },
      });
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const turnBefore = session.turn;
      const transcriptLenBefore = session.transcript.length;
      await assert.rejects(() => processTurn(session, 'Hello'), { message: /rate limit/i });
      assert.equal(session.turn, turnBefore, 'Turn should not advance on error');
      assert.equal(session.transcript.length, transcriptLenBefore, 'Transcript should not change on error');
      assert.equal(session.status, 'active', 'Session should remain active on error');
    });

    it('WorldEngine V2 computes state deterministically from stimuli', async () => {
      const provider = createMockProvider({
        turn: () => ({
          adversaryResponse: 'Hmm.',
          sessionOver: false,
          endReason: null,
        }),
      });
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const initialConfidence = session.confidence;
      // User threat should decrease adversary confidence via WorldEngine
      // (but text-based detection may not fire for generic text)
      await processTurn(session, 'Test WorldEngine.');
      assert.equal(typeof session.confidence, 'number');
      assert.ok(session.confidence >= 0 && session.confidence <= 100);
      assert.ok(session._world, 'WorldEngine state should exist');
      assert.ok(session._world.pad, 'PAD state should exist');
    });

    it('uses explicit sessionStatus field instead of string matching', async () => {
      const provider = createMockProvider({
        turn: () => ({
          adversaryResponse: 'Deal!',
          detectedSignals: [],
          stateUpdates: { confidence: 50 },
          sessionOver: true,
          endReason: 'Deal reached at 15%',
          sessionStatus: 'accepted',
        }),
      });
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, 'I accept.');
      assert.equal(result.state.status, 'accepted');
    });

    it('returns coaching field (can be null)', async () => {
      const provider = createMockProvider({
        turn: () => ({ adversaryResponse: 'OK.', detectedSignals: [], stateUpdates: {}, sessionOver: false, endReason: null }),
        coaching: { biasDetected: null, alternative: null, momentum: 'stable', tip: 'Stay calm.' },
      });
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, 'Test coaching.');
      assert.ok('coaching' in result);
      assert.equal(result.coaching.momentum, 'stable');
    });

    it('coaching is null when coaching LLM call fails', async () => {
      const provider = createMockProvider({
        turn: () => ({ adversaryResponse: 'OK.', detectedSignals: [], stateUpdates: {}, sessionOver: false, endReason: null }),
        coaching: () => { throw new Error('coaching fail'); },
      });
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, 'Test.');
      assert.equal(result.coaching, null);
    });

    it('with eventPolicy random, events can be injected after turn 3', async () => {
      const provider = createMockProvider({
        turn: () => ({ adversaryResponse: 'Response.', detectedSignals: [], stateUpdates: { confidence: 50 }, sessionOver: false, endReason: null }),
        coaching: { biasDetected: null, alternative: null, momentum: 'stable', tip: 'ok' },
      });
      // Force event by setting eventChance to 1
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider, { eventPolicy: 'random', eventChance: 1.0 });
      // Play 3 turns (no events)
      for (let i = 0; i < 3; i++) {
        const r = await processTurn(session, `Turn ${i + 1}`);
        assert.equal(r.event, null, `No event before turn 4`);
      }
      // Turn 4 — event should fire
      const r4 = await processTurn(session, 'Turn 4');
      assert.ok(r4.event !== null, 'Event should fire after turn 3');
      assert.equal(typeof r4.event.id, 'string');
      assert.equal(typeof r4.event.narrative, 'string');
    });

    it('with eventPolicy none, no events injected (backward compat)', async () => {
      const provider = makeTurnProvider(['R1', 'R2', 'R3', 'R4', 'R5']);
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      for (let i = 0; i < 5; i++) {
        const r = await processTurn(session, `Turn ${i + 1}`);
        assert.equal(r.event, null);
      }
    });

    it('same event not injected twice', async () => {
      const provider = createMockProvider({
        turn: () => ({ adversaryResponse: 'R.', detectedSignals: [], stateUpdates: { confidence: 50 }, sessionOver: false, endReason: null }),
        coaching: { biasDetected: null, alternative: null, momentum: 'stable', tip: 'ok' },
      });
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider, { eventPolicy: 'random', eventChance: 1.0 });
      // Play through turn 3
      for (let i = 0; i < 3; i++) await processTurn(session, `T${i + 1}`);
      const firedIds = new Set();
      // Play several more turns
      for (let i = 0; i < 5; i++) {
        const r = await processTurn(session, `T${i + 4}`);
        if (r.event) {
          assert.ok(!firedIds.has(r.event.id), `Event ${r.event.id} should not repeat`);
          firedIds.add(r.event.id);
        }
      }
    });

    it('supports custom maxTurns', async () => {
      const provider = makeTurnProvider(['Response.']);
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider, { maxTurns: 5 });
      session.turn = 4;
      const result = await processTurn(session, 'Last turn.');
      assert.equal(result.sessionOver, true);
      assert.ok(result.endReason.includes('5'));
    });
  });
});
