import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_CATALOG, selectEvent, applyEvent } from '../src/events.mjs';

const MOCK_BRIEF_NEUTRAL = { difficulty: 'neutral' };
const MOCK_BRIEF_HOSTILE = { difficulty: 'hostile' };

function makeState(overrides = {}) {
  return { confidence: 50, frustration: 30, egoThreat: 10, pressure: 20, momentum: 0, ...overrides };
}

describe('events', () => {
  it('EVENT_CATALOG is non-empty and every entry has required fields', () => {
    assert.ok(EVENT_CATALOG.length >= 8);
    for (const e of EVENT_CATALOG) {
      assert.equal(typeof e.id, 'string');
      assert.equal(typeof e.name, 'string');
      assert.equal(typeof e.narrative, 'string');
      assert.equal(typeof e.adversaryInstruction, 'string');
      assert.ok(typeof e.stateModifiers === 'object');
      assert.ok(Array.isArray(e.applicableDifficulties));
    }
  });

  it('selectEvent returns an event matching difficulty', () => {
    const event = selectEvent(makeState(), MOCK_BRIEF_NEUTRAL);
    if (event) {
      assert.ok(event.applicableDifficulties.includes('neutral'));
    }
  });

  it('selectEvent excludes events by id', () => {
    const allIds = EVENT_CATALOG.filter((e) => e.applicableDifficulties.includes('neutral')).map((e) => e.id);
    const event = selectEvent(makeState(), MOCK_BRIEF_NEUTRAL, { excludeIds: allIds });
    assert.equal(event, null);
  });

  it('selectEvent returns null when all applicable events are excluded', () => {
    const allIds = EVENT_CATALOG.map((e) => e.id);
    assert.equal(selectEvent(makeState(), MOCK_BRIEF_HOSTILE, { excludeIds: allIds }), null);
  });

  it('applyEvent modifies session state by deltas', () => {
    const state = makeState({ confidence: 50, frustration: 30 });
    const event = { stateModifiers: { confidence: -15, frustration: 10 } };
    applyEvent(state, event);
    assert.equal(state.confidence, 35);
    assert.equal(state.frustration, 40);
  });

  it('applyEvent clamps values to valid ranges', () => {
    const state = makeState({ confidence: 5, momentum: 90 });
    applyEvent(state, { stateModifiers: { confidence: -20, momentum: 20 } });
    assert.equal(state.confidence, 0);
    assert.equal(state.momentum, 100);
  });

  it('applyEvent does not modify fields not in stateModifiers', () => {
    const state = makeState({ egoThreat: 10 });
    applyEvent(state, { stateModifiers: { confidence: 5 } });
    assert.equal(state.egoThreat, 10);
  });
});
