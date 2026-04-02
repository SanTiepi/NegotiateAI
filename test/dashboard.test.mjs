import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboardStats } from '../src/store.mjs';

describe('dashboard stats', () => {
  it('computes average score, streak and progression delta', () => {
    const stats = computeDashboardStats([
      { id: 's3', feedback: { globalScore: 82 } },
      { id: 's2', feedback: { globalScore: 74 } },
      { id: 's1', feedback: { globalScore: 60 } },
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
  });
});
