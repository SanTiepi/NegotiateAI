import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getJournalQuestions, buildJournalEntry, compareWithSimulation, computeRealWorldStats } from '../src/journal.mjs';

describe('journal', () => {
  it('getJournalQuestions returns 7 questions', () => {
    const q = getJournalQuestions();
    assert.equal(q.length, 7);
    assert.ok(q.every((q) => q.id && q.label));
  });

  it('buildJournalEntry creates valid entry', () => {
    const entry = buildJournalEntry({
      outcome: 'On a trouvé un accord à 12%',
      obtained: '12% augmentation + titre Tech Lead',
      surprise: 'Il était plus ouvert que prévu',
      usedFromPrep: 'L\'argument marché a bien fonctionné',
      regret: 'J\'aurais dû insister sur le bonus',
      emotion: 'Fier',
      score: 8,
    }, 'sim-123');

    assert.ok(entry.id.startsWith('journal-'));
    assert.equal(entry.simulationSessionId, 'sim-123');
    assert.equal(entry.selfScore, 8);
    assert.equal(entry.outcome, 'On a trouvé un accord à 12%');
    assert.equal(entry.type, 'journal');
  });

  it('buildJournalEntry clamps score', () => {
    const entry = buildJournalEntry({ outcome: 'OK', obtained: 'Rien', score: 15 });
    assert.equal(entry.selfScore, 10);
    const entry2 = buildJournalEntry({ outcome: 'OK', obtained: 'Rien', score: -5 });
    assert.equal(entry2.selfScore, 1);
  });

  it('buildJournalEntry throws on missing outcome', () => {
    assert.throws(() => buildJournalEntry({ obtained: 'x' }), /résultat/i);
  });

  it('compareWithSimulation returns insights when simulation exists', () => {
    const journal = {
      selfScore: 8,
      surprise: 'Il a accepté rapidement',
      usedFromPrep: 'L\'ancrage a marché',
      regret: 'J\'aurais pu demander plus',
      emotion: 'Fier',
    };
    const simulation = {
      feedback: { globalScore: 72, biasesDetected: [{ biasType: 'anchoring' }] },
    };
    const result = compareWithSimulation(journal, simulation);
    assert.equal(result.hasSimulation, true);
    assert.ok(result.insights.length >= 3);
    assert.ok(result.summary.length > 0);
  });

  it('compareWithSimulation handles no simulation', () => {
    const result = compareWithSimulation({ selfScore: 5 }, null);
    assert.equal(result.hasSimulation, false);
  });

  it('compareWithSimulation detects negative emotions', () => {
    const result = compareWithSimulation(
      { selfScore: 3, emotion: 'Frustré et déçu', outcome: 'x', obtained: 'y' },
      { feedback: { globalScore: 70, biasesDetected: [] } },
    );
    const supportInsight = result.insights.find((i) => i.type === 'support');
    assert.ok(supportInsight);
  });

  it('computeRealWorldStats computes from entries', () => {
    const entries = [
      { selfScore: 8, usedFromPrep: 'oui', surprise: 'rapide', regret: null },
      { selfScore: 6, usedFromPrep: null, surprise: null, regret: 'trop lent' },
      { selfScore: 9, usedFromPrep: 'ancrage', surprise: 'cool', regret: null },
    ];
    const stats = computeRealWorldStats(entries);
    assert.equal(stats.totalReal, 3);
    assert.ok(stats.avgSelfScore > 0);
    assert.equal(stats.withPrep, 2);
    assert.equal(stats.transferRate, 67);
    assert.ok(stats.topLearning);
  });

  it('computeRealWorldStats handles empty', () => {
    const stats = computeRealWorldStats([]);
    assert.equal(stats.totalReal, 0);
    assert.equal(stats.transferRate, 0);
  });
});
