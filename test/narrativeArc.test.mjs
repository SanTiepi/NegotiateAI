import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTS, getCurrentAct, selectNarrativeEvent, getEventProbability, formatActTransition, getNarrativePrompt } from '../src/narrativeArc.mjs';

describe('narrativeArc', () => {
  it('ACTS has 4 acts in order', () => {
    assert.equal(ACTS.length, 4);
    assert.equal(ACTS[0].id, 'opening');
    assert.equal(ACTS[1].id, 'tension');
    assert.equal(ACTS[2].id, 'crisis');
    assert.equal(ACTS[3].id, 'resolution');
  });

  it('getCurrentAct returns opening for early turns', () => {
    assert.equal(getCurrentAct(1, 12).id, 'opening');
    assert.equal(getCurrentAct(3, 12).id, 'opening');
  });

  it('getCurrentAct returns tension for mid-early turns', () => {
    assert.equal(getCurrentAct(4, 12).id, 'tension');
    assert.equal(getCurrentAct(6, 12).id, 'tension');
  });

  it('getCurrentAct returns crisis for mid-late turns', () => {
    assert.equal(getCurrentAct(7, 12).id, 'crisis');
    assert.equal(getCurrentAct(9, 12).id, 'crisis');
  });

  it('getCurrentAct returns resolution for late turns', () => {
    assert.equal(getCurrentAct(10, 12).id, 'resolution');
    assert.equal(getCurrentAct(12, 12).id, 'resolution');
  });

  it('getCurrentAct scales to different maxTurns', () => {
    assert.equal(getCurrentAct(1, 8).id, 'opening');
    assert.equal(getCurrentAct(3, 8).id, 'tension');
    assert.equal(getCurrentAct(5, 8).id, 'crisis');
    assert.equal(getCurrentAct(7, 8).id, 'resolution');
  });

  it('selectNarrativeEvent returns null during opening', () => {
    const session = { brief: { difficulty: 'neutral' }, _usedEventIds: [] };
    const event = selectNarrativeEvent(2, 12, session);
    assert.equal(event, null);
  });

  it('selectNarrativeEvent can return event during tension', () => {
    const session = { brief: { difficulty: 'neutral' }, _usedEventIds: [] };
    // Run multiple times to account for randomness
    let found = false;
    for (let i = 0; i < 20; i++) {
      const event = selectNarrativeEvent(5, 12, session);
      if (event) { found = true; break; }
    }
    assert.ok(found, 'Should eventually return an event in tension act');
  });

  it('selectNarrativeEvent excludes already-used events', () => {
    const allIds = ['budget_freeze', 'competing_offer', 'deadline_moved', 'concession_opportunity'];
    const session = { brief: { difficulty: 'neutral' }, _usedEventIds: allIds };
    const event = selectNarrativeEvent(5, 12, session);
    if (event) {
      assert.ok(!allIds.includes(event.id));
    }
  });

  it('getEventProbability is 0 during opening', () => {
    const session = { _usedEventIds: [], _world: { emotions: { arousal: 30 } } };
    assert.equal(getEventProbability(2, 12, session), 0);
  });

  it('getEventProbability is highest during crisis', () => {
    const session = { _usedEventIds: [], _world: { emotions: { arousal: 30 } } };
    const tension = getEventProbability(5, 12, session);
    const crisis = getEventProbability(8, 12, session);
    assert.ok(crisis > tension, 'Crisis should have higher event probability');
  });

  it('getEventProbability decreases with more fired events', () => {
    const few = { _usedEventIds: [], _world: { emotions: { arousal: 30 } } };
    const many = { _usedEventIds: ['a', 'b', 'c'], _world: { emotions: { arousal: 30 } } };
    const probFew = getEventProbability(8, 12, few);
    const probMany = getEventProbability(8, 12, many);
    assert.ok(probFew > probMany, 'More events fired = lower probability');
  });

  it('formatActTransition returns null when act has not changed', () => {
    assert.equal(formatActTransition(2, 12), null); // still in opening
  });

  it('formatActTransition returns message when act changes', () => {
    const msg = formatActTransition(4, 12); // opening → tension
    assert.ok(msg !== null);
    assert.ok(msg.includes('Montée de tension'));
  });

  it('getNarrativePrompt returns non-empty string for each act', () => {
    for (const turn of [1, 5, 8, 11]) {
      const prompt = getNarrativePrompt(turn, 12);
      assert.ok(prompt.length > 20, `Prompt for turn ${turn} should be non-empty`);
    }
  });
});
