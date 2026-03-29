import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief } from '../src/scenario.mjs';
import { generatePersona } from '../src/persona.mjs';
import { createSession, processTurn } from '../src/engine.mjs';
import { analyzeFeedback } from '../src/analyzer.mjs';
import { generatePlan } from '../src/planner.mjs';
import { createMockProvider } from '../src/provider.mjs';

// Full integration flow: setup → 3 turns → end → feedback → plan

const RAW_INPUT = {
  situation: 'Renegotiating a freelance contract rate',
  userRole: 'Freelance developer',
  adversaryRole: 'Startup CTO',
  objective: 'Increase daily rate from 500 to 700 EUR',
  minimalThreshold: '600 EUR/day',
  batna: 'I have two other clients willing to pay 650',
  constraints: ['Must maintain professional relationship', 'Contract starts in 2 weeks'],
  difficulty: 'hostile',
  relationalStakes: 'Medium — would like to continue but not essential',
};

const MOCK_ADVERSARY = {
  identity: 'Alex, CTO of a Series A startup',
  style: 'Direct, impatient, data-driven',
  publicObjective: 'Keep costs under 550/day',
  hiddenObjective: 'Desperate for continuity — last dev left mid-sprint',
  batna: 'Hire from an agency at 600/day but with 2 week onboarding delay',
  nonNegotiables: ['No more than 700/day', 'Must start within 2 weeks'],
  timePressure: 'High — sprint deadline in 3 weeks',
  emotionalProfile: { confidence: 60, frustration: 40, egoThreat: 30 },
  likelyTactics: ['Budget pressure', 'False urgency', 'Take it or leave it'],
  vulnerabilities: ['Knows replacing dev will cost more time', 'Pressure from investors'],
};

const MOCK_TURN_RESPONSES = [
  {
    adversaryResponse: 'We really cannot go above 550. The budget is locked.',
    detectedSignals: ['false_constraint'],
    stateUpdates: { confidence: 55, frustration: 45 },
    sessionOver: false,
    endReason: null,
  },
  {
    adversaryResponse: 'Look, I get it, but 650 is really pushing us. How about 580 with a bonus clause?',
    detectedSignals: ['adversary_concession', 'option_creation'],
    stateUpdates: { confidence: 45, frustration: 50 },
    sessionOver: false,
    endReason: null,
    concession: { by: 'adversary', detail: 'Moved from 550 to 580 + bonus' },
  },
  {
    adversaryResponse: 'Fine. 620 flat, no bonus. Final offer. Take it or I go to the agency.',
    detectedSignals: ['ultimatum', 'adversary_concession'],
    stateUpdates: { confidence: 40, frustration: 60 },
    sessionOver: false,
    endReason: null,
    concession: { by: 'adversary', detail: 'Moved from 580 to 620' },
  },
];

const MOCK_FEEDBACK = {
  globalScore: 55,
  scores: {
    outcomeLeverage: 12,
    batnaDiscipline: 14,
    emotionalRegulation: 15,
    biasResistance: 7,
    conversationalFlow: 7,
  },
  biasesDetected: [
    {
      biasType: 'anchoring',
      turn: 1,
      excerpt: 'cannot go above 550',
      explanation: 'Adversary anchored low; user did not immediately counter-anchor',
    },
  ],
  tacticsUsed: ['Counter-offer', 'BATNA reference'],
  missedOpportunities: ['Could have explored equity or longer contract as leverage'],
  recommendations: ['Anchor higher next time (750)', 'Use silence after ultimatums'],
};

const MOCK_PLAN = {
  recommendedOpening: 'Open at 750, citing market rates for senior freelancers.',
  labelsAndMirrors: ['It sounds like timeline is your biggest concern right now.'],
  discoveryQuestions: ['What would a 2-week delay cost the project?'],
  anchoringStrategy: 'Anchor at 750, concede to 700 only if they commit to 3-month minimum.',
  concessionSequence: [
    { condition: 'If they reject 750', concession: 'Drop to 700 with 3-month commitment' },
    { condition: 'If they reject 700', concession: 'Offer 650 + equity participation' },
  ],
  redLines: ['No less than 600/day', 'No start before contract is signed'],
  walkAwayRule: 'If below 600 or no written contract, walk away to other clients.',
};

describe('integration — full negotiation flow', () => {
  it('runs setup → 3 turns → /end → feedback → plan without errors', async () => {
    // Step 1: Build brief
    const brief = buildBrief(RAW_INPUT);
    assert.equal(brief.objective, RAW_INPUT.objective);

    // Step 2: Generate persona
    const personaProvider = createMockProvider({ adversary: MOCK_ADVERSARY });
    const adversary = await generatePersona(brief, personaProvider);
    assert.equal(typeof adversary.identity, 'string');

    // Step 3: Create session and play 3 turns
    let turnIndex = 0;
    const engineProvider = createMockProvider({
      turn: () => MOCK_TURN_RESPONSES[turnIndex++] || MOCK_TURN_RESPONSES[2],
    });
    const session = createSession(brief, adversary, engineProvider);

    const r1 = await processTurn(session, 'I am looking for 700/day based on the market and my experience.');
    assert.equal(r1.sessionOver, false);

    const r2 = await processTurn(session, 'I have two other clients at 650. I need at least that.');
    assert.equal(r2.sessionOver, false);

    const r3 = await processTurn(session, 'I appreciate the move to 620, but that is still below my minimum.');
    assert.equal(r3.sessionOver, false);

    // Step 4: End session
    const rEnd = await processTurn(session, '/end');
    assert.equal(rEnd.sessionOver, true);

    // Step 5: Analyze feedback
    const analyzerProvider = createMockProvider({ feedback: MOCK_FEEDBACK });
    const report = await analyzeFeedback(session, analyzerProvider);
    assert.equal(typeof report.globalScore, 'number');
    assert.ok(report.biasesDetected.length > 0);

    // Step 6: Generate plan
    const plannerProvider = createMockProvider({ plan: MOCK_PLAN });
    const plan = await generatePlan(brief, report, plannerProvider);
    assert.equal(typeof plan.recommendedOpening, 'string');
    assert.ok(plan.concessionSequence.length > 0);
    assert.equal(typeof plan.walkAwayRule, 'string');
  });

  it('retry flow — same brief, new session', async () => {
    const brief = buildBrief(RAW_INPUT);
    const personaProvider = createMockProvider({ adversary: MOCK_ADVERSARY });
    const adversary = await generatePersona(brief, personaProvider);

    // First session
    const provider1 = createMockProvider({ turn: () => MOCK_TURN_RESPONSES[0] });
    const session1 = createSession(brief, adversary, provider1);
    await processTurn(session1, 'Opening move.');
    await processTurn(session1, '/end');

    // Retry — new session, same brief and adversary
    const provider2 = createMockProvider({ turn: () => MOCK_TURN_RESPONSES[1] });
    const session2 = createSession(brief, adversary, provider2);
    assert.equal(session2.turn, 0);
    assert.equal(session2.status, 'active');
    assert.deepEqual(session2.transcript, []);
    assert.deepEqual(session2.concessions, []);
  });
});
