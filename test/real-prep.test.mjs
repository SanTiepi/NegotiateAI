import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRealPrepQuestions, buildRealPrepBrief } from '../src/real-prep.mjs';

describe('real-prep', () => {
  it('getRealPrepQuestions returns 8 questions', () => {
    const q = getRealPrepQuestions();
    assert.equal(q.length, 8);
    assert.ok(q.every((q) => q.id && q.label));
    assert.ok(q.filter((q) => q.required).length >= 4);
  });

  it('buildRealPrepBrief creates valid brief from answers', () => {
    const answers = {
      when: 'mardi 14h',
      who: 'Jean Dupont, DRH',
      context: 'Entretien annuel, je veux une augmentation',
      objective: '15% d\'augmentation',
      minimum: '8% minimum',
      planB: 'Offre chez un concurrent',
      fear: 'Qu\'il refuse tout en bloc',
      history: 'On a déjà négocié l\'an dernier, il avait dit non',
    };
    const { brief, metadata } = buildRealPrepBrief(answers);
    assert.ok(brief.objective);
    assert.ok(brief.minimalThreshold);
    assert.ok(brief.batna);
    assert.ok(brief.situation.includes('augmentation'));
    assert.equal(metadata.isRealPrep, true);
    assert.equal(metadata.when, 'mardi 14h');
  });

  it('buildRealPrepBrief throws on missing context', () => {
    assert.throws(() => buildRealPrepBrief({ objective: 'x', minimum: 'y', planB: 'z' }), /contexte/i);
  });

  it('buildRealPrepBrief throws on missing objective', () => {
    assert.throws(() => buildRealPrepBrief({ context: 'x', minimum: 'y', planB: 'z' }), /objectif/i);
  });

  it('buildRealPrepBrief throws on missing BATNA', () => {
    assert.throws(() => buildRealPrepBrief({ context: 'x', objective: 'y', minimum: 'z' }), /plan B/i);
  });
});
