import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateReplay, formatReplay } from '../src/replay.mjs';
import { createMockProvider } from '../src/provider.mjs';

const MOCK_SESSION = {
  id: 'session-123',
  brief: { objective: 'Get a raise', batna: 'Other offer' },
  transcript: [
    { role: 'user', content: 'I want 15%' },
    { role: 'adversary', content: 'Budget is tight, 3% is standard' },
    { role: 'user', content: 'I have another offer' },
    { role: 'adversary', content: 'Let me check what I can do' },
  ],
  status: 'ended',
  feedback: { globalScore: 55 },
};

const MOCK_REPLAY_DATA = {
  turns: [
    { turnNumber: 1, biasDetected: null, alternativeSuggestion: 'Anchor higher at 20%', momentumLabel: 'stable', annotation: 'Direct opening but no anchor set.' },
    { turnNumber: 2, biasDetected: 'anchoring', alternativeSuggestion: 'Challenge the 3% frame', momentumLabel: 'losing', annotation: 'Adversary anchored at 3%. User did not challenge.' },
  ],
  summary: 'User started strong but lost momentum when anchored by adversary.',
};

describe('replay', () => {
  it('generates an AnnotatedReplay with correct number of turns', async () => {
    const provider = createMockProvider({ replay: MOCK_REPLAY_DATA });
    const replay = await generateReplay(MOCK_SESSION, provider);
    assert.equal(replay.turns.length, 2);
    assert.equal(replay.sessionId, 'session-123');
  });

  it('each turn has userMessage, adversaryMessage, annotation', async () => {
    const provider = createMockProvider({ replay: MOCK_REPLAY_DATA });
    const replay = await generateReplay(MOCK_SESSION, provider);
    for (const t of replay.turns) {
      assert.equal(typeof t.userMessage, 'string');
      assert.equal(typeof t.adversaryMessage, 'string');
      assert.equal(typeof t.annotation, 'string');
    }
  });

  it('formatReplay returns non-empty string', async () => {
    const provider = createMockProvider({ replay: MOCK_REPLAY_DATA });
    const replay = await generateReplay(MOCK_SESSION, provider);
    const output = formatReplay(replay);
    assert.ok(output.length > 0);
    assert.ok(output.includes('Tour 1'));
  });

  it('handles a session with 1 turn', async () => {
    const session1 = { ...MOCK_SESSION, transcript: [{ role: 'user', content: 'Hello' }, { role: 'adversary', content: 'Hi' }] };
    const provider = createMockProvider({ replay: { turns: [{ turnNumber: 1, biasDetected: null, alternativeSuggestion: null, momentumLabel: 'stable', annotation: 'Opening.' }], summary: 'Short.' } });
    const replay = await generateReplay(session1, provider);
    assert.equal(replay.turns.length, 1);
  });

  it('handles a session with 12 turns', async () => {
    const transcript = [];
    const mockTurns = [];
    for (let i = 0; i < 12; i++) {
      transcript.push({ role: 'user', content: `U${i}` }, { role: 'adversary', content: `A${i}` });
      mockTurns.push({ turnNumber: i + 1, biasDetected: null, alternativeSuggestion: null, momentumLabel: 'stable', annotation: `Turn ${i + 1}` });
    }
    const session12 = { ...MOCK_SESSION, transcript };
    const provider = createMockProvider({ replay: { turns: mockTurns, summary: 'Long session.' } });
    const replay = await generateReplay(session12, provider);
    assert.equal(replay.turns.length, 12);
  });

  it('provider error returns degraded replay', async () => {
    const provider = createMockProvider({ replay: () => { throw new Error('fail'); } });
    const replay = await generateReplay(MOCK_SESSION, provider);
    assert.equal(replay.turns.length, 2);
    assert.equal(replay.summary, 'Replay annotation unavailable.');
  });
});
