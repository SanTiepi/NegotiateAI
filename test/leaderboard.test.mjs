import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeHallOfFame, computeScenarioLeaderboard, selectScenarioOfWeek } from '../src/leaderboard.mjs';

function makeSession(overrides = {}) {
  return {
    id: overrides.id || 'sess',
    date: overrides.date || '2026-04-02T06:00:00.000Z',
    turns: overrides.turns ?? 4,
    mode: overrides.mode || 'web',
    playerId: overrides.playerId || null,
    brief: { userRole: 'Acheteur', ...(overrides.brief || {}) },
    adversary: { identity: 'Mme Dubois', ...(overrides.adversary || {}) },
    feedback: { globalScore: overrides.score ?? 80, scores: {} },
    fightCard: overrides.fightCard || null,
    scenario: overrides.scenario || null,
  };
}

describe('leaderboard', () => {
  it('computeScenarioLeaderboard ranks by score then by fewer turns', () => {
    const result = computeScenarioLeaderboard([
      makeSession({ id: 'a', score: 90, turns: 5, scenario: { id: 'salary-negotiation' } }),
      makeSession({ id: 'b', score: 90, turns: 3, scenario: { id: 'salary-negotiation' } }),
      makeSession({ id: 'c', score: 70, turns: 2, scenario: { id: 'salary-negotiation' } }),
      makeSession({ id: 'd', score: 99, turns: 2, scenario: { id: 'lease-renewal' } }),
    ], { scenarioId: 'salary-negotiation' });

    assert.equal(result.entries.length, 3);
    assert.equal(result.entries[0].sessionId, 'b');
    assert.equal(result.entries[1].sessionId, 'a');
    assert.equal(result.entries[2].sessionId, 'c');
    assert.equal(result.entries[0].playerId, null);
    assert.equal(result.entries[0].grade, null);
    assert.match(result.entries[0].title, /Acheteur vs Mme Dubois/);
  });

  it('computeScenarioLeaderboard keeps stable presentation metadata for rich clients', () => {
    const result = computeScenarioLeaderboard([
      makeSession({
        id: 'rich',
        score: 94,
        turns: 3,
        mode: 'telegram',
        playerId: 'telegram:42',
        fightCard: { grade: { grade: 'A' } },
        scenario: { id: 'salary-negotiation' },
      }),
    ], { scenarioId: 'salary-negotiation' });

    assert.deepEqual(result.entries[0], {
      rank: 1,
      sessionId: 'rich',
      scenarioId: 'salary-negotiation',
      score: 94,
      turns: 3,
      mode: 'telegram',
      playerId: 'telegram:42',
      grade: 'A',
      title: 'Acheteur vs Mme Dubois',
      date: '2026-04-02T06:00:00.000Z',
    });
  });

  it('computeHallOfFame returns the best sessions across all modes', () => {
    const result = computeHallOfFame([
      makeSession({ id: 'gold', score: 96, mode: 'telegram' }),
      makeSession({ id: 'silver', score: 91, mode: 'web' }),
      makeSession({ id: 'bronze', score: 84, mode: 'cli' }),
    ], { limit: 2 });

    assert.equal(result.totalEntries, 2);
    assert.equal(result.entries[0].sessionId, 'gold');
    assert.equal(result.entries[1].sessionId, 'silver');
    assert.match(result.entries[0].title, /Acheteur/);
  });

  it('selectScenarioOfWeek is deterministic for the same week', () => {
    const scenarios = [
      { id: 'salary-negotiation', name: 'Salary' },
      { id: 'lease-renewal', name: 'Lease' },
      { id: 'vendor-contract', name: 'Vendor' },
    ];

    const a = selectScenarioOfWeek(scenarios, { date: new Date('2026-04-02T06:00:00.000Z') });
    const b = selectScenarioOfWeek(scenarios, { date: new Date('2026-04-04T21:00:00.000Z') });

    assert.equal(a.weekKey, b.weekKey);
    assert.equal(a.scenario.id, b.scenario.id);
  });
});
