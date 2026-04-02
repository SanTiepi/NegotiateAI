import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { simulateBeforeSend, simulateBeforeSendBatch, assertValidOfferSimulationReport } from '../src/simulate.mjs';
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

const MOCK_REPORT = {
  sendVerdict: 'revise',
  approvalScore: 72,
  predictedOutcome: 'Constructive pushback with room to improve the framing.',
  riskLevel: 'medium',
  likelyObjections: ['Budget cap', 'Internal fairness'],
  strengths: ['Clear ask', 'Anchors above the minimum threshold'],
  vulnerabilities: ['Does not mention BATNA', 'Could sound positional'],
  recommendedRewrite: 'Given my impact and the external market, I would like to discuss a 15% adjustment. How can we structure that while keeping internal fairness in mind?',
};

describe('simulateBeforeSend', () => {
  it('returns a valid pre-send simulation report', async () => {
    const provider = createMockProvider({
      turn: {
        adversaryResponse: '15% is above budget. Help me understand the business case.',
        sessionOver: false,
        endReason: null,
      },
      coaching: { biasDetected: null, alternative: null, momentum: 'stable', tip: 'Stay concrete.' },
      offerSimulation: MOCK_REPORT,
    });

    const report = await simulateBeforeSend({
      brief: MOCK_BRIEF,
      adversary: MOCK_ADVERSARY,
      offerMessage: 'I want a 15% raise effective next month.',
      provider,
    });

    assert.equal(report.sendVerdict, 'revise');
    assert.equal(report.approvalScore, 72);
    assert.equal(report.simulatedResponse, '15% is above budget. Help me understand the business case.');
    assert.ok(Array.isArray(report.detectedSignals));
    assert.ok(Array.isArray(report.userTechniques));
    assert.ok(Array.isArray(report.biasIndicators));
  });

  it('supports an existing transcript context', async () => {
    const provider = createMockProvider({
      turn: {
        adversaryResponse: 'I can maybe explore that if you show impact.',
        sessionOver: false,
        endReason: null,
      },
      coaching: { biasDetected: null, alternative: null, momentum: 'gaining', tip: 'Good framing.' },
      offerSimulation: { ...MOCK_REPORT, sendVerdict: 'send', riskLevel: 'low' },
    });

    const report = await simulateBeforeSend({
      brief: MOCK_BRIEF,
      adversary: MOCK_ADVERSARY,
      offerMessage: 'It sounds like fairness matters here. Based on my results, I would like to discuss 15%.',
      provider,
      transcript: [
        { role: 'adversary', content: 'Most people are getting 3% this year.' },
      ],
    });

    assert.equal(report.sendVerdict, 'send');
    assert.equal(report.riskLevel, 'low');
    assert.ok(report.userTechniques.some((t) => t.technique === 'labeling'));
  });

  it('clamps approvalScore to 0-100 before validation', async () => {
    const provider = createMockProvider({
      turn: {
        adversaryResponse: 'No.',
        sessionOver: true,
        endReason: 'Rejected',
      },
      coaching: { biasDetected: null, alternative: null, momentum: 'losing', tip: 'Reframe.' },
      offerSimulation: { ...MOCK_REPORT, approvalScore: 999, sendVerdict: 'do_not_send', riskLevel: 'high' },
    });

    const report = await simulateBeforeSend({
      brief: MOCK_BRIEF,
      adversary: MOCK_ADVERSARY,
      offerMessage: 'Take it or leave it: 15% now.',
      provider,
    });

    assert.equal(report.approvalScore, 100);
    assert.equal(report.sendVerdict, 'do_not_send');
  });

  it('throws on empty offerMessage', async () => {
    const provider = createMockProvider({});
    await assert.rejects(() => simulateBeforeSend({
      brief: MOCK_BRIEF,
      adversary: MOCK_ADVERSARY,
      offerMessage: '   ',
      provider,
    }), { message: /offerMessage/i });
  });

  it('ranks a batch of offer variants and returns the best one', async () => {
    const provider = createMockProvider({
      turn: {
        adversaryResponse: 'Montre-moi plus de valeur.',
        sessionOver: false,
        endReason: null,
      },
      coaching: { biasDetected: null, alternative: null, momentum: 'stable', tip: 'Reste spécifique.' },
      offerSimulation: ({ prompt }) => {
        if (prompt.includes('Version A')) return { ...MOCK_REPORT, approvalScore: 61, sendVerdict: 'revise', riskLevel: 'medium' };
        if (prompt.includes('Version B')) return { ...MOCK_REPORT, approvalScore: 84, sendVerdict: 'send', riskLevel: 'low' };
        return { ...MOCK_REPORT, approvalScore: 79, sendVerdict: 'send', riskLevel: 'medium' };
      },
    });

    const batch = await simulateBeforeSendBatch({
      brief: MOCK_BRIEF,
      adversary: MOCK_ADVERSARY,
      provider,
      offerMessages: ['Version A', 'Version B', 'Version C'],
    });

    assert.equal(batch.reports.length, 3);
    assert.equal(batch.bestIndex, 1);
    assert.equal(batch.bestReport.approvalScore, 84);
  });
});

describe('assertValidOfferSimulationReport', () => {
  it('accepts a valid report', () => {
    assert.doesNotThrow(() => assertValidOfferSimulationReport({
      ...MOCK_REPORT,
      simulatedResponse: 'Need more justification.',
      biasIndicators: [],
      detectedSignals: [],
      userTechniques: [],
      sessionOver: false,
      endReason: null,
    }));
  });

  it('rejects an invalid verdict', () => {
    assert.throws(() => assertValidOfferSimulationReport({
      ...MOCK_REPORT,
      sendVerdict: 'maybe',
      simulatedResponse: 'Need more justification.',
      biasIndicators: [],
      detectedSignals: [],
      userTechniques: [],
      sessionOver: false,
      endReason: null,
    }), /sendVerdict/i);
  });
});
