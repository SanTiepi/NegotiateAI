import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboardStats } from '../src/dashboard.mjs';

describe('dashboard stats', () => {
  it('computes average score, streak and progression delta', () => {
    const stats = computeDashboardStats([
      {
        id: 's3',
        mode: 'web',
        date: '2026-04-03T10:00:00.000Z',
        brief: { difficulty: 'hostile' },
        feedback: {
          globalScore: 82,
          scores: {
            outcomeLeverage: 20,
            batnaDiscipline: 16,
            emotionalRegulation: 21,
            biasResistance: 13,
            conversationalFlow: 12,
          },
        },
      },
      {
        id: 's2',
        mode: 'telegram',
        date: '2026-04-02T10:00:00.000Z',
        brief: { difficulty: 'neutral' },
        feedback: {
          globalScore: 74,
          scores: {
            outcomeLeverage: 18,
            batnaDiscipline: 15,
            emotionalRegulation: 17,
            biasResistance: 11,
            conversationalFlow: 13,
          },
        },
      },
      {
        id: 's1',
        mode: 'web',
        date: '2026-04-01T10:00:00.000Z',
        brief: { difficulty: 'neutral' },
        feedback: {
          globalScore: 60,
          scores: {
            outcomeLeverage: 12,
            batnaDiscipline: 13,
            emotionalRegulation: 15,
            biasResistance: 9,
            conversationalFlow: 11,
          },
        },
      },
    ], {
      currentStreak: 4,
      belts: { white: { earned: true } },
      weakDimensions: ['biasResistance'],
    });

    assert.equal(stats.totalSessions, 3);
    assert.equal(stats.averageScore, 72);
    assert.equal(stats.currentStreak, 4);
    assert.equal(stats.progressionDelta, 22);
    assert.deepEqual(stats.recentSessionIds, ['s3', 's2', 's1']);
    assert.deepEqual(stats.scoreHistory.map((entry) => entry.id), ['s1', 's2', 's3']);
    assert.deepEqual(stats.modeBreakdown, [
      { mode: 'web', count: 2 },
      { mode: 'telegram', count: 1 },
    ]);
    assert.deepEqual(stats.difficultyBreakdown, [
      { difficulty: 'neutral', count: 2 },
      { difficulty: 'hostile', count: 1 },
    ]);
    assert.equal(stats.bestDimension.dimension, 'emotionalRegulation');
    assert.equal(stats.weakestDimension.dimension, 'biasResistance');
    assert.equal(stats.dimensionAverages.find((entry) => entry.dimension === 'outcomeLeverage')?.average, 17);
  });
});
