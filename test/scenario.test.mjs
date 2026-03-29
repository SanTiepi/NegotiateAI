import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildBrief, assertValidBrief } from '../src/scenario.mjs';

const VALID_INPUT = {
  situation: 'Annual salary review at a tech company',
  userRole: 'Senior developer with 3 years at the company',
  adversaryRole: 'Engineering manager',
  objective: 'Get a 15% raise',
  minimalThreshold: '8% raise minimum',
  batna: 'I have an offer from another company at +20%',
  constraints: ['Must keep good relationship', 'No ultimatums'],
  difficulty: 'neutral',
  relationalStakes: 'High — I want to stay long term',
};

describe('scenario', () => {
  describe('buildBrief', () => {
    it('returns a valid Brief from complete input', () => {
      const brief = buildBrief(VALID_INPUT);
      assert.equal(brief.objective, VALID_INPUT.objective);
      assert.equal(brief.batna, VALID_INPUT.batna);
      assert.equal(brief.minimalThreshold, VALID_INPUT.minimalThreshold);
      assert.equal(brief.difficulty, 'neutral');
    });

    it('throws when objective is missing', () => {
      const input = { ...VALID_INPUT, objective: '' };
      assert.throws(() => buildBrief(input), { message: /objective/i });
    });

    it('throws when objective is undefined', () => {
      const { objective, ...input } = VALID_INPUT;
      assert.throws(() => buildBrief(input), { message: /objective/i });
    });

    it('throws when batna is missing', () => {
      const input = { ...VALID_INPUT, batna: '' };
      assert.throws(() => buildBrief(input), { message: /batna/i });
    });

    it('throws when batna is undefined', () => {
      const { batna, ...input } = VALID_INPUT;
      assert.throws(() => buildBrief(input), { message: /batna/i });
    });

    it('throws when minimalThreshold is missing', () => {
      const input = { ...VALID_INPUT, minimalThreshold: '' };
      assert.throws(() => buildBrief(input), { message: /minimalThreshold|minimal.*threshold|seuil/i });
    });

    it('defaults difficulty to neutral when not provided', () => {
      const { difficulty, ...input } = VALID_INPUT;
      const brief = buildBrief(input);
      assert.equal(brief.difficulty, 'neutral');
    });

    it('accepts all four difficulty presets', () => {
      for (const d of ['cooperative', 'neutral', 'hostile', 'manipulative']) {
        const brief = buildBrief({ ...VALID_INPUT, difficulty: d });
        assert.equal(brief.difficulty, d);
      }
    });

    it('throws on invalid difficulty preset', () => {
      assert.throws(
        () => buildBrief({ ...VALID_INPUT, difficulty: 'easy' }),
        { message: /difficulty/i }
      );
    });

    it('normalizes constraints to an array', () => {
      const brief = buildBrief({ ...VALID_INPUT, constraints: 'single constraint' });
      assert.ok(Array.isArray(brief.constraints));
      assert.equal(brief.constraints.length, 1);
    });

    it('defaults constraints to empty array when missing', () => {
      const { constraints, ...input } = VALID_INPUT;
      const brief = buildBrief(input);
      assert.ok(Array.isArray(brief.constraints));
    });
  });

  describe('assertValidBrief', () => {
    it('does not throw for a valid brief', () => {
      const brief = buildBrief(VALID_INPUT);
      assert.doesNotThrow(() => assertValidBrief(brief));
    });

    it('throws for a brief missing required fields', () => {
      assert.throws(() => assertValidBrief({}));
    });
  });
});
