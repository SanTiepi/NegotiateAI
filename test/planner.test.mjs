import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, assertValidPlan } from '../src/planner.mjs';
import { createMockProvider } from '../src/provider.mjs';

const MOCK_BRIEF = {
  situation: 'Salary negotiation',
  userRole: 'Senior developer',
  adversaryRole: 'Engineering manager',
  objective: 'Get a 15% raise',
  minimalThreshold: '8% raise',
  batna: 'Competing offer at +20%',
  constraints: ['Maintain good relationship'],
  difficulty: 'neutral',
  relationalStakes: 'High',
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
    { biasType: 'anchoring', turn: 2, excerpt: '3%', explanation: 'Accepted low anchor' },
  ],
  tacticsUsed: ['Weak counter-anchor'],
  missedOpportunities: ['Never mentioned BATNA', 'Never anchored high first'],
  recommendations: ['Open with target', 'Reference BATNA'],
};

const MOCK_PLAN = {
  recommendedOpening:
    'Start by acknowledging the budget constraints, then anchor at 18% to leave room for the 15% target.',
  labelsAndMirrors: [
    'It sounds like the budget situation is creating real pressure for you.',
    'So what you are saying is that 3% is the standard this cycle...',
  ],
  discoveryQuestions: [
    'What would make a raise above standard easier to justify to your leadership?',
    'Are there non-salary elements we could explore?',
  ],
  anchoringStrategy:
    'Anchor at 18% citing market data and the competing offer. Let them negotiate down to 15%.',
  concessionSequence: [
    { condition: 'If they reject 18%', concession: 'Drop to 16% and add equity ask' },
    { condition: 'If they reject 16%', concession: 'Accept 15% with title bump' },
    { condition: 'If they reject 15%', concession: 'Invoke BATNA — mention the competing offer directly' },
  ],
  redLines: ['No less than 8%', 'No extension of commitment beyond 1 year'],
  walkAwayRule:
    'If the final offer is below 8% or requires more than 1 year commitment, invoke BATNA and decline.',
};

describe('planner', () => {
  it('generates a complete negotiation plan', async () => {
    const provider = createMockProvider({ plan: MOCK_PLAN });
    const plan = await generatePlan(MOCK_BRIEF, MOCK_FEEDBACK, provider);
    assert.equal(typeof plan.recommendedOpening, 'string');
    assert.ok(plan.recommendedOpening.length > 0);
    assert.ok(Array.isArray(plan.labelsAndMirrors));
    assert.ok(Array.isArray(plan.discoveryQuestions));
    assert.equal(typeof plan.anchoringStrategy, 'string');
    assert.ok(Array.isArray(plan.concessionSequence));
    assert.ok(Array.isArray(plan.redLines));
    assert.equal(typeof plan.walkAwayRule, 'string');
  });

  it('concession sequence has condition and concession fields', async () => {
    const provider = createMockProvider({ plan: MOCK_PLAN });
    const plan = await generatePlan(MOCK_BRIEF, MOCK_FEEDBACK, provider);
    for (const step of plan.concessionSequence) {
      assert.equal(typeof step.condition, 'string');
      assert.equal(typeof step.concession, 'string');
    }
  });

  it('plan does not contradict BATNA (walkAwayRule references threshold)', async () => {
    const provider = createMockProvider({ plan: MOCK_PLAN });
    const plan = await generatePlan(MOCK_BRIEF, MOCK_FEEDBACK, provider);
    assert.ok(
      plan.walkAwayRule.toLowerCase().includes('8%') ||
        plan.walkAwayRule.toLowerCase().includes('batna') ||
        plan.walkAwayRule.toLowerCase().includes('minimum'),
      'Walk-away rule should reference the minimal threshold or BATNA'
    );
  });

  it('uses feedback to inform the plan', async () => {
    let capturedReq;
    const provider = createMockProvider({
      plan: (req) => {
        capturedReq = req;
        return MOCK_PLAN;
      },
    });
    await generatePlan(MOCK_BRIEF, MOCK_FEEDBACK, provider);
    assert.ok(capturedReq.prompt.includes('anchoring') || capturedReq.prompt.includes('BATNA'));
  });

  describe('assertValidPlan', () => {
    it('does not throw for a valid plan', () => {
      assert.doesNotThrow(() => assertValidPlan(MOCK_PLAN));
    });

    it('throws for a plan missing recommendedOpening', () => {
      const { recommendedOpening, ...invalid } = MOCK_PLAN;
      assert.throws(() => assertValidPlan(invalid));
    });

    it('throws for a plan missing walkAwayRule', () => {
      const { walkAwayRule, ...invalid } = MOCK_PLAN;
      assert.throws(() => assertValidPlan(invalid));
    });
  });
});
