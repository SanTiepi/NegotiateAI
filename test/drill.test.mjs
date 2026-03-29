import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DRILL_CATALOG, createDrill, recommendDrill, scoreDrill } from '../src/drill.mjs';
import { createMockProvider } from '../src/provider.mjs';

const MOCK_ADVERSARY = {
  identity: 'Test Manager',
  style: 'Firm',
  publicObjective: 'Keep costs low',
  hiddenObjective: 'Retain talent',
  batna: 'Hire replacement',
  nonNegotiables: ['No more than 15%'],
  timePressure: 'Moderate',
  emotionalProfile: { confidence: 60, frustration: 20, egoThreat: 10 },
  likelyTactics: ['Budget pressure'],
  vulnerabilities: ['Fear of vacancy'],
};

const MOCK_DRILL_SCORE = {
  skillScore: 75,
  feedback: 'Good mirroring technique. Could label emotions more explicitly.',
  passed: true,
  tips: ['Try labeling before mirroring', 'Use silence after mirror'],
};

describe('drill', () => {
  it('DRILL_CATALOG has 5 entries with required fields', () => {
    assert.equal(DRILL_CATALOG.length, 5);
    for (const d of DRILL_CATALOG) {
      assert.equal(typeof d.id, 'string');
      assert.equal(typeof d.name, 'string');
      assert.equal(typeof d.skill, 'string');
      assert.equal(typeof d.maxTurns, 'number');
      assert.ok(d.maxTurns >= 3 && d.maxTurns <= 5);
    }
  });

  it('createDrill returns session with correct maxTurns', async () => {
    const provider = createMockProvider({ adversary: MOCK_ADVERSARY });
    const { session, drill } = await createDrill('mirror', provider);
    assert.equal(drill.id, 'mirror');
    assert.equal(session.maxTurns, 3);
    assert.equal(session.status, 'active');
  });

  it('createDrill with custom brief uses it', async () => {
    const customBrief = {
      situation: 'Custom',
      userRole: 'A',
      adversaryRole: 'B',
      objective: 'Win',
      minimalThreshold: 'Survive',
      batna: 'Walk away',
      difficulty: 'hostile',
    };
    const provider = createMockProvider({ adversary: MOCK_ADVERSARY });
    const { session } = await createDrill('anchor', provider, { brief: customBrief });
    assert.equal(session.brief.difficulty, 'hostile');
  });

  it('createDrill with unknown drillId throws', async () => {
    const provider = createMockProvider({});
    await assert.rejects(() => createDrill('unknown', provider), { message: /unknown/i });
  });

  it('recommendDrill returns drill targeting weakest dimension', () => {
    const progression = { weakDimensions: ['emotionalRegulation', 'batnaDiscipline'] };
    assert.equal(recommendDrill(progression), 'pressure');
  });

  it('recommendDrill defaults to mirror when no weaknesses', () => {
    assert.equal(recommendDrill({ weakDimensions: [] }), 'mirror');
    assert.equal(recommendDrill({}), 'mirror');
  });

  it('scoreDrill returns DrillResult with skillScore 0-100', async () => {
    const provider = createMockProvider({
      adversary: MOCK_ADVERSARY,
      drillScore: MOCK_DRILL_SCORE,
    });
    const { session, drill } = await createDrill('mirror', provider);
    session.transcript = [{ role: 'user', content: 'Hi' }, { role: 'adversary', content: 'Hello' }];
    const result = await scoreDrill(session, drill, provider);
    assert.equal(typeof result.skillScore, 'number');
    assert.ok(result.skillScore >= 0 && result.skillScore <= 100);
    assert.equal(typeof result.feedback, 'string');
    assert.equal(typeof result.passed, 'boolean');
  });

  it('scoreDrill passes when score >= 70', async () => {
    const provider = createMockProvider({
      adversary: MOCK_ADVERSARY,
      drillScore: { ...MOCK_DRILL_SCORE, skillScore: 80 },
    });
    const { session, drill } = await createDrill('mirror', provider);
    session.transcript = [{ role: 'user', content: 'X' }];
    const result = await scoreDrill(session, drill, provider);
    assert.equal(result.passed, true);
  });
});
