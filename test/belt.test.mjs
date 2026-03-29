import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BELT_DEFINITIONS, evaluateBelts, computeBiasProfile, identifyWeaknesses, formatBeltDisplay } from '../src/belt.mjs';

function makeSession({ difficulty = 'neutral', scores = {}, biases = [], eventsActive = false, id = 'test' } = {}) {
  return {
    id,
    date: '2026-03-30T12:00:00Z',
    brief: { difficulty },
    feedback: {
      globalScore: Object.values(scores).reduce((a, b) => a + b, 0),
      scores: {
        outcomeLeverage: 10,
        batnaDiscipline: 10,
        emotionalRegulation: 10,
        biasResistance: 5,
        conversationalFlow: 5,
        ...scores,
      },
      biasesDetected: biases,
    },
    eventsActive,
    transcript: [],
    status: 'ended',
  };
}

describe('belt', () => {
  it('evaluateBelts returns all 5 colors with earned:false for empty sessions', () => {
    const belts = evaluateBelts([]);
    assert.equal(Object.keys(belts).length, 5);
    for (const def of BELT_DEFINITIONS) {
      assert.equal(belts[def.color].earned, false);
    }
  });

  it('white belt earned after 3 cooperative sessions with batnaDiscipline >= 14', () => {
    const sessions = [
      makeSession({ difficulty: 'cooperative', scores: { batnaDiscipline: 16 }, id: '1' }),
      makeSession({ difficulty: 'cooperative', scores: { batnaDiscipline: 14 }, id: '2' }),
      makeSession({ difficulty: 'cooperative', scores: { batnaDiscipline: 15 }, id: '3' }),
    ];
    const belts = evaluateBelts(sessions);
    assert.equal(belts.white.earned, true);
    assert.equal(belts.white.qualifyingSessions, 3);
  });

  it('yellow belt requires neutral or higher', () => {
    const sessions = [
      makeSession({ difficulty: 'cooperative', scores: { outcomeLeverage: 20 }, id: '1' }),
      makeSession({ difficulty: 'cooperative', scores: { outcomeLeverage: 20 }, id: '2' }),
      makeSession({ difficulty: 'cooperative', scores: { outcomeLeverage: 20 }, id: '3' }),
    ];
    const belts = evaluateBelts(sessions);
    assert.equal(belts.yellow.earned, false, 'Cooperative does not qualify for yellow');
  });

  it('hostile session counts toward a neutral-required belt', () => {
    const sessions = [
      makeSession({ difficulty: 'hostile', scores: { outcomeLeverage: 20 }, id: '1' }),
      makeSession({ difficulty: 'hostile', scores: { outcomeLeverage: 19 }, id: '2' }),
      makeSession({ difficulty: 'neutral', scores: { outcomeLeverage: 18 }, id: '3' }),
    ];
    const belts = evaluateBelts(sessions);
    assert.equal(belts.yellow.earned, true);
  });

  it('green belt requires events active', () => {
    const sessions = [
      makeSession({ difficulty: 'neutral', scores: { conversationalFlow: 13 }, id: '1' }),
      makeSession({ difficulty: 'neutral', scores: { conversationalFlow: 12 }, id: '2' }),
      makeSession({ difficulty: 'neutral', scores: { conversationalFlow: 14 }, id: '3' }),
    ];
    const belts = evaluateBelts(sessions);
    assert.equal(belts.green.earned, false, 'No events active');

    const withEvents = sessions.map((s) => ({ ...s, eventsActive: true }));
    const belts2 = evaluateBelts(withEvents);
    assert.equal(belts2.green.earned, true);
  });

  it('cooperative does NOT count toward hostile-required belt', () => {
    const sessions = [
      makeSession({ difficulty: 'cooperative', scores: { emotionalRegulation: 22 }, id: '1' }),
      makeSession({ difficulty: 'cooperative', scores: { emotionalRegulation: 20 }, id: '2' }),
      makeSession({ difficulty: 'cooperative', scores: { emotionalRegulation: 21 }, id: '3' }),
    ];
    const belts = evaluateBelts(sessions);
    assert.equal(belts.blue.earned, false);
  });

  it('computeBiasProfile aggregates bias counts', () => {
    const sessions = [
      makeSession({ biases: [{ biasType: 'anchoring' }, { biasType: 'anchoring' }] }),
      makeSession({ biases: [{ biasType: 'anchoring' }, { biasType: 'framing' }] }),
    ];
    const profile = computeBiasProfile(sessions);
    const anchoring = profile.find((p) => p.biasType === 'anchoring');
    assert.ok(anchoring);
    assert.equal(anchoring.count, 3);
  });

  it('computeBiasProfile computes frequency as count / min(total, 10)', () => {
    const sessions = [
      makeSession({ biases: [{ biasType: 'anchoring' }] }),
      makeSession({ biases: [] }),
    ];
    const profile = computeBiasProfile(sessions);
    const anchoring = profile.find((p) => p.biasType === 'anchoring');
    assert.equal(anchoring.frequency, 1 / 2);
  });

  it('identifyWeaknesses returns 2 lowest-average dimensions', () => {
    const sessions = [
      makeSession({ scores: { outcomeLeverage: 5, batnaDiscipline: 20, emotionalRegulation: 20, biasResistance: 3, conversationalFlow: 10 } }),
    ];
    const weak = identifyWeaknesses(sessions);
    assert.equal(weak.length, 2);
    assert.ok(weak.includes('biasResistance'));
    assert.ok(weak.includes('outcomeLeverage'));
  });

  it('formatBeltDisplay returns non-empty string', () => {
    const belts = evaluateBelts([]);
    const display = formatBeltDisplay(belts);
    assert.ok(display.length > 0);
    assert.ok(display.includes('Blanche'));
  });
});
