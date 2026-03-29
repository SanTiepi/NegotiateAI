import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFeedback, assertValidFeedbackReport } from '../src/analyzer.mjs';
import { createMockProvider } from '../src/provider.mjs';

// Fixture: a completed session with known patterns
const MOCK_SESSION = {
  turn: 5,
  transcript: [
    { role: 'user', content: 'I think I deserve a raise.' },
    { role: 'adversary', content: 'The budget is very tight this year. Most people are getting 3%.' },
    { role: 'user', content: 'Well, if 3% is what everyone gets, I guess that could work...' },
    { role: 'adversary', content: 'Great, so we agree on 3%?' },
    { role: 'user', content: 'Actually, no, I was hoping for more. Can we do 5%?' },
    { role: 'adversary', content: 'That is really pushing it. I will need to check.' },
    { role: 'user', content: 'OK I understand, let me know.' },
    { role: 'adversary', content: 'I can confirm 4%. Final offer.' },
    { role: 'user', content: 'I will take it.' },
    { role: 'adversary', content: 'Done. 4% it is.' },
  ],
  confidence: 75,
  frustration: 15,
  egoThreat: 5,
  pressure: 30,
  momentum: -20,
  activeAnchor: '3%',
  concessions: [
    { by: 'user', detail: 'Dropped from unstated goal to 5%' },
    { by: 'adversary', detail: 'Moved from 3% to 4%' },
    { by: 'user', detail: 'Accepted 4%' },
  ],
  status: 'accepted',
  brief: {
    objective: 'Get a 15% raise',
    minimalThreshold: '8% raise',
    batna: 'Competing offer at +20%',
    difficulty: 'neutral',
  },
  adversary: {
    identity: 'Manager',
    publicObjective: 'Keep raises under 5%',
  },
};

const MOCK_FEEDBACK = {
  globalScore: 28,
  scores: {
    outcomeLeverage: 5,
    batnaDiscipline: 3,
    emotionalRegulation: 10,
    biasResistance: 5,
    conversationalFlow: 5,
  },
  biasesDetected: [
    {
      biasType: 'anchoring',
      turn: 2,
      excerpt: 'Most people are getting 3%',
      explanation: 'User accepted the 3% anchor without challenging it',
    },
    {
      biasType: 'conflict_avoidance',
      turn: 3,
      excerpt: 'I guess that could work...',
      explanation: 'Premature concession driven by discomfort with confrontation',
    },
  ],
  tacticsUsed: ['Weak counter-anchor at 5%'],
  missedOpportunities: [
    'Never mentioned BATNA (competing offer)',
    'Never anchored high first',
    'Accepted without exploring non-monetary compensation',
  ],
  recommendations: [
    'Open with your target (15%) before they anchor',
    'Reference your competing offer to establish leverage',
    'Use silence after adversary proposals instead of immediately responding',
  ],
};

describe('analyzer', () => {
  it('produces a feedback report with all required fields', async () => {
    const provider = createMockProvider({ feedback: MOCK_FEEDBACK });
    const report = await analyzeFeedback(MOCK_SESSION, provider);
    assert.equal(typeof report.globalScore, 'number');
    assert.ok(report.globalScore >= 0 && report.globalScore <= 100);
    assert.equal(typeof report.scores, 'object');
    assert.ok(Array.isArray(report.biasesDetected));
    assert.ok(Array.isArray(report.tacticsUsed));
    assert.ok(Array.isArray(report.missedOpportunities));
    assert.ok(Array.isArray(report.recommendations));
  });

  it('detects anchoring bias from transcript fixtures', async () => {
    const provider = createMockProvider({ feedback: MOCK_FEEDBACK });
    const report = await analyzeFeedback(MOCK_SESSION, provider);
    const anchoring = report.biasesDetected.find((b) => b.biasType === 'anchoring');
    assert.ok(anchoring, 'Expected anchoring bias to be detected');
    assert.equal(typeof anchoring.turn, 'number');
    assert.equal(typeof anchoring.excerpt, 'string');
    assert.ok(anchoring.excerpt.length > 0);
  });

  it('detects premature concession / conflict avoidance', async () => {
    const provider = createMockProvider({ feedback: MOCK_FEEDBACK });
    const report = await analyzeFeedback(MOCK_SESSION, provider);
    const avoidance = report.biasesDetected.find((b) => b.biasType === 'conflict_avoidance');
    assert.ok(avoidance, 'Expected conflict_avoidance bias to be detected');
  });

  it('scores sum correctly to globalScore', async () => {
    const provider = createMockProvider({ feedback: MOCK_FEEDBACK });
    const report = await analyzeFeedback(MOCK_SESSION, provider);
    const sum =
      report.scores.outcomeLeverage +
      report.scores.batnaDiscipline +
      report.scores.emotionalRegulation +
      report.scores.biasResistance +
      report.scores.conversationalFlow;
    assert.equal(report.globalScore, sum);
  });

  it('every bias instance cites a turn and excerpt', async () => {
    const provider = createMockProvider({ feedback: MOCK_FEEDBACK });
    const report = await analyzeFeedback(MOCK_SESSION, provider);
    for (const bias of report.biasesDetected) {
      assert.equal(typeof bias.turn, 'number');
      assert.equal(typeof bias.excerpt, 'string');
      assert.ok(bias.excerpt.length > 0, 'Excerpt must not be empty');
    }
  });

  it('clamps out-of-range scores and recomputes globalScore', async () => {
    const outOfRange = {
      ...MOCK_FEEDBACK,
      globalScore: 999,
      scores: {
        outcomeLeverage: 50,
        batnaDiscipline: 40,
        emotionalRegulation: 99,
        biasResistance: -5,
        conversationalFlow: 30,
      },
    };
    const provider = createMockProvider({ feedback: outOfRange });
    const report = await analyzeFeedback(MOCK_SESSION, provider);
    assert.equal(report.scores.outcomeLeverage, 25, 'Clamped to max 25');
    assert.equal(report.scores.batnaDiscipline, 20, 'Clamped to max 20');
    assert.equal(report.scores.emotionalRegulation, 25, 'Clamped to max 25');
    assert.equal(report.scores.biasResistance, 0, 'Clamped to min 0');
    assert.equal(report.scores.conversationalFlow, 15, 'Clamped to max 15');
    assert.equal(report.globalScore, 85, 'globalScore recomputed from clamped sub-scores');
  });

  describe('assertValidFeedbackReport', () => {
    it('does not throw for a valid report', () => {
      assert.doesNotThrow(() => assertValidFeedbackReport(MOCK_FEEDBACK));
    });

    it('throws for a report missing scores', () => {
      const { scores, ...invalid } = MOCK_FEEDBACK;
      assert.throws(() => assertValidFeedbackReport(invalid));
    });

    it('throws for out-of-range scores', () => {
      const invalid = {
        ...MOCK_FEEDBACK,
        scores: { ...MOCK_FEEDBACK.scores, outcomeLeverage: 30 },
      };
      assert.throws(() => assertValidFeedbackReport(invalid), { message: /outcomeLeverage.*range/i });
    });
  });
});
