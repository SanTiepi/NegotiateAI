import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeUILayer, filterTurnResponse, shouldGuideRound } from '../src/progressive-ui.mjs';

describe('progressive-ui', () => {
  it('computes discover, learn, and master layers from total sessions', () => {
    assert.equal(computeUILayer(0).key, 'discover');
    assert.equal(computeUILayer(3).key, 'learn');
    assert.equal(computeUILayer(8).key, 'master');
  });

  it('supports explicit layer overrides', () => {
    assert.equal(computeUILayer(0, 3).key, 'master');
    assert.equal(computeUILayer(99, 1).key, 'discover');
  });

  it('guides only early rounds for lower layers', () => {
    assert.equal(shouldGuideRound(computeUILayer(0), 1), true);
    assert.equal(shouldGuideRound(computeUILayer(0), 4), false);
    assert.equal(shouldGuideRound(computeUILayer(3), 1), true);
    assert.equal(shouldGuideRound(computeUILayer(3), 2), false);
    assert.equal(shouldGuideRound(computeUILayer(8), 1), false);
  });

  it('filters advanced turn payloads until the player unlocks them', () => {
    const response = {
      adversaryResponse: 'Je peux bouger un peu.',
      sessionOver: false,
      endReason: null,
      state: { turn: 1, status: 'active' },
      coaching: { tip: 'Reste calme.' },
      ticker: {
        dealQuality: 62,
        momentum: 55,
        momentumTrend: 'stable',
        leverage: 48,
        biasRisk: 22,
        dealProbability: 58,
        tension: 35,
      },
      detectedSignals: ['anchor'],
      roundScore: { points: 2 },
      actTransition: { act: 1 },
      fightCard: { grade: { grade: 'B' } },
      feedback: { globalScore: 80 },
      guidedChoices: [{ text: 'Option A' }],
      uiLayer: computeUILayer(0),
    };

    const discover = filterTurnResponse(response, computeUILayer(0));
    assert.equal('coaching' in discover, false);
    assert.equal('ticker' in discover, false);
    assert.equal(discover.guidedChoices[0].text, 'Option A');
    assert.equal(discover.uiLayer.key, 'discover');

    const master = filterTurnResponse(response, computeUILayer(8));
    assert.equal(master.coaching.tip, 'Reste calme.');
    assert.equal(master.ticker.leverage, 48);
    assert.deepEqual(master.detectedSignals, ['anchor']);
    assert.equal(master.roundScore.points, 2);
  });
});
