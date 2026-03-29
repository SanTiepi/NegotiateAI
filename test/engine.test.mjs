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
      assert.equal(session.confidence, MOCK_ADVERSARY.emotionalProfile.confidence);
      assert.equal(session.frustration, MOCK_ADVERSARY.emotionalProfile.frustration);
      assert.equal(session.momentum, 0);
      assert.equal(session.activeAnchor, null);
      assert.deepEqual(session.concessions, []);
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
      await processTurn(session, 'My work speaks for itself.');
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

    it('tracks concessions in the registry', async () => {
      const provider = createMockProvider({
        turn: () => ({
          adversaryResponse: 'I can do 10%.',
          detectedSignals: ['adversary_concession'],
          stateUpdates: { confidence: 60, frustration: 25 },
          sessionOver: false,
          endReason: null,
          concession: { by: 'adversary', detail: 'Moved from 5% to 10%' },
        }),
      });
      const session = createSession(MOCK_BRIEF, MOCK_ADVERSARY, provider);
      const result = await processTurn(session, 'I really need at least 12%.');
      assert.ok(result.state.concessions.length > 0);
    });
  });
});
