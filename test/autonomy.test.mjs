import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAutonomyLevel, describeAutonomyGap, getAutonomyDefinitions } from '../src/autonomy.mjs';

describe('autonomy', () => {
  it('defines 5 ladder levels', () => {
    const defs = getAutonomyDefinitions();
    assert.equal(defs.length, 5);
    assert.equal(defs[0].label, 'Guidé');
    assert.equal(defs[4].label, 'Autonome');
  });

  it('starts at level 1 for a cold profile', () => {
    const autonomy = evaluateAutonomyLevel({ totalSessions: 0, avgScore: 0, earnedBelts: 0 });
    assert.equal(autonomy.level, 1);
    assert.equal(autonomy.label, 'Guidé');
    assert.equal(autonomy.next.label, 'Assisté');
  });

  it('unlocks higher levels when thresholds are met', () => {
    const autonomy = evaluateAutonomyLevel({ totalSessions: 18, avgScore: 68, earnedBelts: 2 });
    assert.equal(autonomy.level, 4);
    assert.equal(autonomy.label, 'Délégué');
    assert.equal(autonomy.next.label, 'Autonome');
  });

  it('describes the gap to the next level', () => {
    const autonomy = evaluateAutonomyLevel({ totalSessions: 10, avgScore: 56, earnedBelts: 1 });
    assert.match(describeAutonomyGap(autonomy), /sessions/i);
  });

  it('max level reports no remaining gap', () => {
    const autonomy = evaluateAutonomyLevel({ totalSessions: 40, avgScore: 82, earnedBelts: 5 });
    assert.equal(autonomy.level, 5);
    assert.equal(describeAutonomyGap(autonomy), 'Autonomy ladder maxed');
  });
});
