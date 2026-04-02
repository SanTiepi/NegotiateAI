import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateBriefing, buildObjectiveContract, assertValidObjectiveContract } from '../src/briefing.mjs';

const scenario = {
  id: 'test',
  brief: {
    situation: 'Test situation',
    userRole: 'Buyer',
    adversaryRole: 'Seller',
    objective: 'Buy at 100k',
    minimalThreshold: '120k max',
    batna: 'Walk away',
    difficulty: 'neutral',
    relationalStakes: 'Long term partnership at stake',
    constraints: ['Budget fixed', 'Deadline in 2 weeks'],
  },
  adversary: {
    identity: 'Test Seller',
    style: 'Aggressive',
    publicObjective: 'Sell high',
    hiddenObjective: 'Needs cash urgently because of a pending lawsuit. Will accept lower if paid within 30 days.',
    vulnerabilities: ['Cash flow issues'],
  },
};

describe('briefing', () => {
  it('generateBriefing produces complete briefing context', () => {
    const briefing = generateBriefing(scenario, null);
    assert.equal(briefing.situation, 'Test situation');
    assert.equal(briefing.playerRole, 'Buyer');
    assert.equal(briefing.adversaryRole, 'Seller');
    assert.equal(briefing.difficulty, 'neutral');
    assert.ok(briefing.adversaryPublic);
    assert.equal(briefing.adversaryPublic.identity, 'Test Seller');
    assert.ok(Array.isArray(briefing.questions));
    assert.equal(briefing.questions.length, 5);
    assert.equal(briefing.suggestions.objective, 'Buy at 100k');
    assert.ok(briefing.odds);
    assert.equal(briefing.odds.successRate, 50);
  });

  it('generateBriefing uses progression for odds when available', () => {
    const progression = { totalSessions: 10, recentAvgScore: 70, biasProfile: {} };
    const briefing = generateBriefing(scenario, progression);
    assert.ok(briefing.odds.successRate !== 50);
    assert.equal(briefing.odds.confidence, 'high');
  });

  it('generateBriefing works with bare brief (no scenario)', () => {
    const briefing = generateBriefing({ objective: 'Get a raise', minimalThreshold: '5%', batna: 'Quit' }, null);
    assert.ok(briefing.questions.length === 5);
    assert.equal(briefing.adversaryPublic, null);
  });

  it('buildObjectiveContract creates valid contract from answers', () => {
    const answers = {
      objective: 'I want to buy at 100k',
      threshold: 'No more than 120k',
      batna: 'I walk away and buy elsewhere',
      relationalGoal: 'Long term partnership',
      strategy: 'Listen first, then anchor low',
    };
    const contract = buildObjectiveContract(answers, scenario);
    assertValidObjectiveContract(contract);
    assert.equal(contract.objective, 'I want to buy at 100k');
    assert.equal(contract.minimalThreshold, 'No more than 120k');
    assert.equal(contract.batna, 'I walk away and buy elsewhere');
    assert.equal(contract.relationalGoal, 'Long term partnership');
    assert.equal(contract.strategy, 'Listen first, then anchor low');
    assert.ok(contract.hiddenObjectiveHints.length > 0);
    assert.ok(contract.triangleWeights.relation > contract.triangleWeights.intelligence);
  });

  it('buildObjectiveContract adjusts triangle weights for transactional goal', () => {
    const contract = buildObjectiveContract(
      { objective: 'Buy cheap', threshold: '120k', batna: 'Walk away', relationalGoal: 'Transaction pure' },
      scenario,
    );
    assert.ok(contract.triangleWeights.transaction > contract.triangleWeights.relation);
  });

  it('buildObjectiveContract throws on missing objective', () => {
    assert.throws(
      () => buildObjectiveContract({ objective: '', threshold: 'x', batna: 'y' }, scenario),
      /objective/,
    );
  });

  it('buildObjectiveContract throws on missing threshold', () => {
    assert.throws(
      () => buildObjectiveContract({ objective: 'x', threshold: '', batna: 'y' }, scenario),
      /threshold/,
    );
  });

  it('buildObjectiveContract throws on missing batna', () => {
    assert.throws(
      () => buildObjectiveContract({ objective: 'x', threshold: 'y', batna: '' }, scenario),
      /BATNA/,
    );
  });

  it('buildObjectiveContract works without scenario', () => {
    const contract = buildObjectiveContract(
      { objective: 'Get raise', threshold: '5% min', batna: 'Quit' },
      null,
    );
    assertValidObjectiveContract(contract);
    assert.equal(contract.hiddenObjectiveHints.length, 0);
  });
});
