import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWithTheory, FRAMEWORKS, getFrameworkInfo } from '../src/negotiation-theory.mjs';

describe('negotiation-theory', () => {
  it('FRAMEWORKS has 5 frameworks with principles', () => {
    assert.ok(FRAMEWORKS.harvard);
    assert.ok(FRAMEWORKS.voss);
    assert.ok(FRAMEWORKS.cialdini);
    assert.ok(FRAMEWORKS.kahneman);
    assert.ok(FRAMEWORKS.schelling);
    assert.ok(FRAMEWORKS.harvard.principles.length >= 4);
    assert.ok(FRAMEWORKS.voss.principles.length >= 4);
  });

  it('getFrameworkInfo returns framework or null', () => {
    assert.ok(getFrameworkInfo('harvard'));
    assert.equal(getFrameworkInfo('nonexistent'), null);
  });

  it('detects positional language (Harvard)', () => {
    const session = {
      transcript: [
        { role: 'user', content: 'Je veux 100k, c\'est mon prix final.' },
        { role: 'adversary', content: 'C\'est trop cher.' },
      ],
    };
    const feedback = { scores: {}, biasesDetected: [], tacticsUsed: [] };
    const result = analyzeWithTheory(session, feedback);
    assert.ok(result.insights.length > 0);
    const harvardInsight = result.insights.find((i) => i.framework === 'harvard');
    assert.ok(harvardInsight);
    assert.equal(harvardInsight.severity, 'high');
  });

  it('detects interest exploration (Harvard positive)', () => {
    const session = {
      transcript: [
        { role: 'user', content: 'Qu\'est-ce qui est important pour vous dans cet accord ?' },
        { role: 'adversary', content: 'La rapidite d\'execution.' },
      ],
    };
    const result = analyzeWithTheory(session, { scores: {}, biasesDetected: [], tacticsUsed: [] });
    const positive = result.insights.find((i) => i.severity === 'positive' && i.framework === 'harvard');
    assert.ok(positive);
  });

  it('detects missing labeling/mirroring (Voss)', () => {
    const session = {
      transcript: [
        { role: 'user', content: 'Mon offre est de 50k.' },
        { role: 'adversary', content: 'Non.' },
        { role: 'user', content: 'Alors 55k.' },
        { role: 'adversary', content: 'Non.' },
        { role: 'user', content: '60k final.' },
      ],
    };
    const result = analyzeWithTheory(session, { scores: {}, biasesDetected: [], tacticsUsed: [] });
    const vossInsight = result.insights.find((i) => i.framework === 'voss');
    assert.ok(vossInsight);
  });

  it('maps biases to Kahneman theory', () => {
    const session = { transcript: [] };
    const feedback = {
      scores: {},
      biasesDetected: [{ biasType: 'anchoring', turn: 2, explanation: 'Anchored too low' }],
      tacticsUsed: [],
    };
    const result = analyzeWithTheory(session, feedback);
    const kahnemanInsight = result.insights.find((i) => i.framework === 'kahneman');
    assert.ok(kahnemanInsight);
    assert.equal(kahnemanInsight.severity, 'high');
    assert.ok(kahnemanInsight.recommendation);
  });

  it('detects reciprocity imbalance (Cialdini)', () => {
    const session = {
      transcript: [
        { role: 'user', content: 'Ok, j\'accepte votre condition.' },
        { role: 'adversary', content: 'Bien. Autre chose.' },
        { role: 'user', content: 'D\'accord, je suis pret a baisser aussi.' },
        { role: 'adversary', content: 'Excellent.' },
        { role: 'user', content: 'Ok pour cette concession aussi.' },
        { role: 'adversary', content: 'Parfait.' },
      ],
    };
    const result = analyzeWithTheory(session, { scores: {}, biasesDetected: [], tacticsUsed: [] });
    const cialdini = result.insights.find((i) => i.framework === 'cialdini');
    assert.ok(cialdini);
    assert.ok(cialdini.observation.includes('concession'));
  });

  it('detects lack of questions (Schelling)', () => {
    const transcript = [];
    for (let i = 0; i < 8; i++) {
      transcript.push({ role: i % 2 === 0 ? 'user' : 'adversary', content: 'Je propose ceci.' });
    }
    const result = analyzeWithTheory({ transcript }, { scores: {}, biasesDetected: [], tacticsUsed: [] });
    const schelling = result.insights.find((i) => i.framework === 'schelling');
    assert.ok(schelling);
    assert.ok(schelling.observation.includes('question'));
  });

  it('returns a summary string', () => {
    const session = {
      transcript: [{ role: 'user', content: 'Je veux tout et maintenant.' }],
    };
    const result = analyzeWithTheory(session, { scores: {}, biasesDetected: [], tacticsUsed: [] });
    assert.ok(typeof result.summary === 'string');
    assert.ok(result.summary.length > 0);
  });

  it('sorts positives first', () => {
    const session = {
      transcript: [
        { role: 'user', content: 'Qu\'est-ce qui est important pour vous ?' },
        { role: 'adversary', content: 'La qualite.' },
        { role: 'user', content: 'Je veux 200k, c\'est non negociable.' },
        { role: 'adversary', content: 'Trop cher.' },
        { role: 'user', content: 'Ok d\'accord.' },
        { role: 'adversary', content: 'Bien.' },
      ],
    };
    const result = analyzeWithTheory(session, { scores: {}, biasesDetected: [], tacticsUsed: [] });
    if (result.insights.length >= 2) {
      const firstPositive = result.insights[0]?.severity === 'positive';
      assert.ok(firstPositive, 'First insight should be positive');
    }
  });
});
