import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  presetToProfile,
  computeDifficulty,
  assessZPD,
  profileToPromptInstructions,
} from '../src/difficulty.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(scores, globalScore, difficulty) {
  return {
    feedback: { scores, globalScore },
    brief: { difficulty: difficulty ?? 'neutral' },
  };
}

// High scores — user is strong everywhere
const HIGH_SCORES = {
  outcomeLeverage: 22,    // 88% of 25
  batnaDiscipline: 17,    // 85% of 20
  emotionalRegulation: 22, // 88% of 25
  biasResistance: 13,     // 87% of 15
  conversationalFlow: 13, // 87% of 15
};

// Low scores — user is struggling everywhere
const LOW_SCORES = {
  outcomeLeverage: 5,      // 20% of 25
  batnaDiscipline: 4,      // 20% of 20
  emotionalRegulation: 5,  // 20% of 25
  biasResistance: 3,       // 20% of 15
  conversationalFlow: 3,   // 20% of 15
};

// Mid scores — right in the sweet spot
const MID_SCORES = {
  outcomeLeverage: 13,
  batnaDiscipline: 10,
  emotionalRegulation: 13,
  biasResistance: 8,
  conversationalFlow: 8,
};

// ---------------------------------------------------------------------------
// presetToProfile
// ---------------------------------------------------------------------------

describe('presetToProfile', () => {
  it('returns correct values for cooperative preset', () => {
    const p = presetToProfile('cooperative');
    assert.equal(p.adversaryPushback, 20);
    assert.equal(p.tacticalComplexity, 15);
    assert.equal(p.emotionalVolatility, 10);
    assert.equal(p.hiddenInformation, 10);
    assert.equal(p.timePressure, 15);
    assert.equal(typeof p.overall, 'number');
  });

  it('returns correct values for neutral preset', () => {
    const p = presetToProfile('neutral');
    assert.equal(p.adversaryPushback, 45);
    assert.equal(p.tacticalComplexity, 40);
    assert.equal(p.emotionalVolatility, 35);
    assert.equal(p.hiddenInformation, 35);
    assert.equal(p.timePressure, 40);
  });

  it('returns correct values for hostile preset', () => {
    const p = presetToProfile('hostile');
    assert.equal(p.adversaryPushback, 70);
    assert.equal(p.tacticalComplexity, 60);
    assert.equal(p.emotionalVolatility, 65);
    assert.equal(p.hiddenInformation, 50);
    assert.equal(p.timePressure, 60);
  });

  it('returns correct values for manipulative preset', () => {
    const p = presetToProfile('manipulative');
    assert.equal(p.adversaryPushback, 60);
    assert.equal(p.tacticalComplexity, 85);
    assert.equal(p.emotionalVolatility, 55);
    assert.equal(p.hiddenInformation, 90);
    assert.equal(p.timePressure, 50);
  });

  it('clamps axes below minimum to 10', () => {
    // cooperative has emotionalVolatility=10, hiddenInformation=10
    const p = presetToProfile('cooperative');
    assert.ok(p.emotionalVolatility >= 10);
    assert.ok(p.hiddenInformation >= 10);
  });

  it('throws on unknown preset', () => {
    assert.throws(() => presetToProfile('extreme'), /Unknown preset/);
  });
});

// ---------------------------------------------------------------------------
// computeDifficulty
// ---------------------------------------------------------------------------

describe('computeDifficulty', () => {
  it('returns neutral profile for empty sessions', () => {
    const p = computeDifficulty([]);
    const neutral = presetToProfile('neutral');
    for (const axis of ['adversaryPushback', 'tacticalComplexity', 'emotionalVolatility', 'hiddenInformation', 'timePressure']) {
      assert.equal(p[axis], neutral[axis]);
    }
  });

  it('returns neutral profile for null sessions', () => {
    const p = computeDifficulty(null);
    assert.equal(p.adversaryPushback, 45);
  });

  it('increases axes where user scores high', () => {
    const neutral = presetToProfile('neutral');
    const session = makeSession(HIGH_SCORES, 87);
    const p = computeDifficulty([session]);

    // Each axis should be higher than neutral since user scored high on all dimensions
    assert.ok(p.adversaryPushback > neutral.adversaryPushback,
      `pushback ${p.adversaryPushback} should be > neutral ${neutral.adversaryPushback}`);
    assert.ok(p.tacticalComplexity > neutral.tacticalComplexity,
      `complexity ${p.tacticalComplexity} should be > neutral ${neutral.tacticalComplexity}`);
    assert.ok(p.emotionalVolatility > neutral.emotionalVolatility,
      `volatility ${p.emotionalVolatility} should be > neutral ${neutral.emotionalVolatility}`);
    assert.ok(p.hiddenInformation > neutral.hiddenInformation,
      `hidden ${p.hiddenInformation} should be > neutral ${neutral.hiddenInformation}`);
    assert.ok(p.timePressure > neutral.timePressure,
      `pressure ${p.timePressure} should be > neutral ${neutral.timePressure}`);
  });

  it('decreases axes where user scores low', () => {
    const neutral = presetToProfile('neutral');
    const session = makeSession(LOW_SCORES, 20);
    const p = computeDifficulty([session]);

    assert.ok(p.adversaryPushback < neutral.adversaryPushback,
      `pushback ${p.adversaryPushback} should be < neutral ${neutral.adversaryPushback}`);
    assert.ok(p.tacticalComplexity < neutral.tacticalComplexity,
      `complexity ${p.tacticalComplexity} should be < neutral ${neutral.tacticalComplexity}`);
    assert.ok(p.emotionalVolatility < neutral.emotionalVolatility,
      `volatility ${p.emotionalVolatility} should be < neutral ${neutral.emotionalVolatility}`);
    assert.ok(p.hiddenInformation < neutral.hiddenInformation,
      `hidden ${p.hiddenInformation} should be < neutral ${neutral.hiddenInformation}`);
    assert.ok(p.timePressure < neutral.timePressure,
      `pressure ${p.timePressure} should be < neutral ${neutral.timePressure}`);
  });

  it('keeps axes stable when user scores are mid-range', () => {
    const neutral = presetToProfile('neutral');
    const session = makeSession(MID_SCORES, 52);
    const p = computeDifficulty([session]);

    // Mid-range scores should produce no adjustment — stays equal to neutral
    for (const axis of ['adversaryPushback', 'tacticalComplexity', 'emotionalVolatility', 'hiddenInformation', 'timePressure']) {
      assert.equal(p[axis], neutral[axis], `${axis} should remain at neutral`);
    }
  });

  it('respects 10-95 bounds even with extreme adjustments', () => {
    // Start from manipulative (high values) and push higher with high scores
    const session = {
      feedback: { scores: HIGH_SCORES, globalScore: 90 },
      difficulty: {
        adversaryPushback: 92,
        tacticalComplexity: 93,
        emotionalVolatility: 91,
        hiddenInformation: 94,
        timePressure: 92,
      },
    };
    const p = computeDifficulty([session]);

    for (const axis of ['adversaryPushback', 'tacticalComplexity', 'emotionalVolatility', 'hiddenInformation', 'timePressure']) {
      assert.ok(p[axis] >= 10, `${axis} (${p[axis]}) must be >= 10`);
      assert.ok(p[axis] <= 95, `${axis} (${p[axis]}) must be <= 95`);
    }
  });

  it('limits adjustment step size to max 10 per session', () => {
    const neutral = presetToProfile('neutral');
    const session = makeSession(HIGH_SCORES, 87);
    const p = computeDifficulty([session]);

    for (const axis of ['adversaryPushback', 'tacticalComplexity', 'emotionalVolatility', 'hiddenInformation', 'timePressure']) {
      const diff = Math.abs(p[axis] - neutral[axis]);
      assert.ok(diff <= 10, `${axis} adjustment (${diff}) should be <= 10`);
    }
  });

  it('uses existing 5-axis difficulty as base when available', () => {
    const customBase = {
      adversaryPushback: 70,
      tacticalComplexity: 30,
      emotionalVolatility: 50,
      hiddenInformation: 60,
      timePressure: 40,
    };
    const session = {
      feedback: { scores: MID_SCORES, globalScore: 52 },
      difficulty: customBase,
    };
    const p = computeDifficulty([session]);

    // Mid scores produce no adjustment, so should stay at custom base
    assert.equal(p.adversaryPushback, 70);
    assert.equal(p.tacticalComplexity, 30);
  });
});

// ---------------------------------------------------------------------------
// assessZPD
// ---------------------------------------------------------------------------

describe('assessZPD', () => {
  it('detects too_easy when average score > 65', () => {
    const sessions = [
      makeSession(HIGH_SCORES, 80),
      makeSession(HIGH_SCORES, 78),
      makeSession(HIGH_SCORES, 75),
    ];
    const zpd = assessZPD(sessions);
    assert.equal(zpd.zone, 'too_easy');
    assert.ok(zpd.avgScore > 65);
  });

  it('detects too_hard when average score < 40', () => {
    const sessions = [
      makeSession(LOW_SCORES, 20),
      makeSession(LOW_SCORES, 25),
      makeSession(LOW_SCORES, 30),
    ];
    const zpd = assessZPD(sessions);
    assert.equal(zpd.zone, 'too_hard');
    assert.ok(zpd.avgScore < 40);
  });

  it('detects optimal zone when average score is 40-65', () => {
    const sessions = [
      makeSession(MID_SCORES, 50),
      makeSession(MID_SCORES, 55),
      makeSession(MID_SCORES, 48),
    ];
    const zpd = assessZPD(sessions);
    assert.equal(zpd.zone, 'optimal');
    assert.ok(zpd.avgScore >= 40 && zpd.avgScore <= 65);
  });

  it('returns optimal for empty sessions', () => {
    const zpd = assessZPD([]);
    assert.equal(zpd.zone, 'optimal');
  });

  it('uses only last 5 sessions', () => {
    // 5 recent hard sessions, then old easy ones
    const sessions = [
      makeSession(LOW_SCORES, 25),
      makeSession(LOW_SCORES, 28),
      makeSession(LOW_SCORES, 22),
      makeSession(LOW_SCORES, 30),
      makeSession(LOW_SCORES, 27),
      makeSession(HIGH_SCORES, 90), // session 6 — should be ignored
      makeSession(HIGH_SCORES, 85), // session 7 — should be ignored
    ];
    const zpd = assessZPD(sessions);
    assert.equal(zpd.zone, 'too_hard');
  });
});

// ---------------------------------------------------------------------------
// profileToPromptInstructions
// ---------------------------------------------------------------------------

describe('profileToPromptInstructions', () => {
  it('returns non-empty string mentioning all 5 axes', () => {
    const profile = presetToProfile('neutral');
    const text = profileToPromptInstructions(profile);

    assert.equal(typeof text, 'string');
    assert.ok(text.length > 100, 'instructions should be substantial');

    // Must mention all 5 axes
    assert.ok(text.includes('Resistance level'), 'should mention adversary pushback');
    assert.ok(text.includes('Tactical complexity'), 'should mention tactical complexity');
    assert.ok(text.includes('Emotional volatility'), 'should mention emotional volatility');
    assert.ok(text.includes('Hidden information'), 'should mention hidden information');
    assert.ok(text.includes('Time pressure'), 'should mention time pressure');
  });

  it('includes numeric values in output', () => {
    const profile = presetToProfile('hostile');
    const text = profileToPromptInstructions(profile);

    assert.ok(text.includes('70/100'), 'should include pushback value');
    assert.ok(text.includes('60/100'), 'should include complexity or pressure value');
  });

  it('uses appropriate labels for extreme values', () => {
    const profile = presetToProfile('cooperative');
    const text = profileToPromptInstructions(profile);
    assert.ok(text.includes('VERY LOW') || text.includes('LOW'), 'cooperative should have low labels');

    const hard = presetToProfile('manipulative');
    const hardText = profileToPromptInstructions(hard);
    assert.ok(hardText.includes('HIGH') || hardText.includes('VERY HIGH'), 'manipulative should have high labels');
  });
});
