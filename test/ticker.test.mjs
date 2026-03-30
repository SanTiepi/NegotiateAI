import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeTicker, formatTicker, formatTickerCompact, computePreSessionOdds } from '../src/ticker.mjs';

function mockSession(overrides = {}) {
  return {
    _world: {
      emotions: { confidence: 60, frustration: 30, fear: 20, openness: 55, egoThreat: 15, contempt: 10 },
      negotiation: {
        leverageBalance: 10,
        momentum: 15,
        momentumHistory: [5, 10, 15],
        userReservation: 40,
        adversaryReservation: 55,
        currentOffer: 50,
        userConcessions: [],
        adversaryConcessions: [],
        userConcessionRate: 0,
        adversaryConcessionRate: 0,
        userTarget: 85,
        adversaryTarget: 15,
      },
      turn: 5,
      pad: { pleasure: 20, arousal: 30, dominance: 10 },
    },
    ...overrides,
  };
}

describe('ticker', () => {
  it('computeTicker returns all required fields', () => {
    const t = computeTicker(mockSession());
    assert.equal(typeof t.dealQuality, 'number');
    assert.equal(typeof t.leverage, 'number');
    assert.equal(typeof t.biasRisk, 'number');
    assert.equal(typeof t.dealProbability, 'number');
    assert.equal(typeof t.tension, 'number');
    assert.equal(typeof t.momentum, 'number');
    assert.equal(typeof t.momentumTrend, 'string');
    assert.equal(typeof t.zopaExists, 'boolean');
  });

  it('all ticker values are within valid ranges', () => {
    const t = computeTicker(mockSession());
    assert.ok(t.dealQuality >= 0 && t.dealQuality <= 100);
    assert.ok(t.leverage >= -100 && t.leverage <= 100);
    assert.ok(t.biasRisk >= 0 && t.biasRisk <= 100);
    assert.ok(t.dealProbability >= 0 && t.dealProbability <= 100);
    assert.ok(t.tension >= 0 && t.tension <= 100);
  });

  it('returns default ticker when session has no world state', () => {
    const t = computeTicker({});
    assert.equal(t.dealQuality, 50);
    assert.equal(t.leverage, 0);
    assert.equal(t.momentum, 0);
  });

  it('formatTicker returns multi-line ANSI string', () => {
    const t = computeTicker(mockSession());
    const output = formatTicker(t);
    assert.ok(output.length > 100);
    assert.ok(output.includes('TICKER'));
    assert.ok(output.includes('Deal'));
    assert.ok(output.includes('Leverage'));
    assert.ok(output.includes('Risque'));
  });

  it('formatTickerCompact returns single-line string', () => {
    const t = computeTicker(mockSession());
    const output = formatTickerCompact(t);
    assert.ok(!output.includes('\n'));
    assert.ok(output.includes('Deal:'));
    assert.ok(output.includes('Lev:'));
  });

  it('computePreSessionOdds returns 50% default for few sessions', () => {
    const odds = computePreSessionOdds({ totalSessions: 1 }, 'neutral');
    assert.equal(odds.successRate, 50);
    assert.equal(odds.confidence, 'low');
  });

  it('computePreSessionOdds adjusts for difficulty', () => {
    const prog = { totalSessions: 10, recentAvgScore: 60, biasProfile: {} };
    const easy = computePreSessionOdds(prog, 'cooperative');
    const hard = computePreSessionOdds(prog, 'hostile');
    assert.ok(easy.successRate > hard.successRate, 'Cooperative should be easier');
  });

  it('computePreSessionOdds penalizes bias vulnerability', () => {
    const clean = { totalSessions: 10, recentAvgScore: 60, biasProfile: {} };
    const vulnerable = { totalSessions: 10, recentAvgScore: 60, biasProfile: { anchoring: { frequency: 0.8 }, framing: { frequency: 0.6 } } };
    const cleanOdds = computePreSessionOdds(clean, 'neutral');
    const vulnOdds = computePreSessionOdds(vulnerable, 'neutral');
    assert.ok(cleanOdds.successRate > vulnOdds.successRate, 'Vulnerable should have lower odds');
  });

  it('computePreSessionOdds clamps to 10-95 range', () => {
    const bad = { totalSessions: 20, recentAvgScore: 5, biasProfile: { a: { frequency: 0.9 }, b: { frequency: 0.9 }, c: { frequency: 0.9 } } };
    const odds = computePreSessionOdds(bad, 'manipulative');
    assert.ok(odds.successRate >= 10);
    assert.ok(odds.successRate <= 95);
  });
});
