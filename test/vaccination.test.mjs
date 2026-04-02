import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateVaccinationCard, formatVaccinationCard, formatShareableCard } from '../src/vaccination.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession({ globalScore = 50, scores = {}, biases = [], id = 'test', date = '2026-03-20T12:00:00Z' } = {}) {
  return {
    id,
    date,
    brief: { difficulty: 'neutral' },
    feedback: {
      globalScore,
      scores: {
        outcomeLeverage: 12,
        batnaDiscipline: 10,
        emotionalRegulation: 12,
        biasResistance: 8,
        conversationalFlow: 8,
        ...scores,
      },
      biasesDetected: biases,
    },
    transcript: [],
    status: 'ended',
  };
}

function makeProgression({ belts = {}, biasProfile = {}, totalSessions = 0 } = {}) {
  return { belts, biasProfile, totalSessions, currentStreak: 0, lastSessionDate: null, weakDimensions: [] };
}

function makeBiasEntry({ totalCount = 0, frequency = 0, recentCounts = [], lastSeen = null } = {}) {
  return { totalCount, recentCount: recentCounts.filter((c) => c > 0).length, frequency, lastSeen, nextDrillDate: null, _recentCounts: recentCounts, _interval: 3 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('vaccination', () => {
  it('generateVaccinationCard with empty sessions returns Débutant', () => {
    const card = generateVaccinationCard(makeProgression(), []);
    assert.equal(card.totalSessions, 0);
    assert.equal(card.negotiatorLevel, 'Débutant');
    assert.equal(card.belt, 'Aucune');
    assert.equal(card.biases.length, 5);
    assert.equal(card.autonomy.level, 1);
  });

  it('bias status: immunized when frequency < 0.15 and exposures >= 5', () => {
    const prog = makeProgression({
      biasProfile: {
        anchoring: makeBiasEntry({ totalCount: 6, frequency: 0.10, recentCounts: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
      },
    });
    const card = generateVaccinationCard(prog, []);
    const anchoring = card.biases.find((b) => b.biasType === 'anchoring');
    assert.equal(anchoring.status, 'immunized');
    assert.equal(anchoring.icon, '\u{1F6E1}\uFE0F');
  });

  it('bias status: partially_resistant when frequency 0.15-0.40 and exposures >= 3', () => {
    const prog = makeProgression({
      biasProfile: {
        loss_aversion: makeBiasEntry({ totalCount: 4, frequency: 0.30, recentCounts: [1, 0, 1, 1] }),
      },
    });
    const card = generateVaccinationCard(prog, []);
    const la = card.biases.find((b) => b.biasType === 'loss_aversion');
    assert.equal(la.status, 'partially_resistant');
    assert.equal(la.icon, '\u26A1');
  });

  it('bias status: vulnerable when frequency > 0.40', () => {
    const prog = makeProgression({
      biasProfile: {
        conflict_avoidance: makeBiasEntry({ totalCount: 5, frequency: 0.60, recentCounts: [1, 1, 1, 0, 1, 1] }),
      },
    });
    const card = generateVaccinationCard(prog, []);
    const ca = card.biases.find((b) => b.biasType === 'conflict_avoidance');
    assert.equal(ca.status, 'vulnerable');
    assert.equal(ca.icon, '\u26A0\uFE0F');
  });

  it('bias status: untested when exposures < 3', () => {
    const prog = makeProgression({
      biasProfile: {
        framing: makeBiasEntry({ totalCount: 2, frequency: 0.20, recentCounts: [1, 1] }),
      },
    });
    const card = generateVaccinationCard(prog, []);
    const fr = card.biases.find((b) => b.biasType === 'framing');
    assert.equal(fr.status, 'untested');
    assert.equal(fr.icon, '\u2753');
  });

  it('negotiatorLevel: Intermédiaire with 5-15 sessions and avgScore > 40', () => {
    const sessions = Array.from({ length: 8 }, (_, i) => makeSession({ globalScore: 55, id: `s${i}` }));
    const card = generateVaccinationCard(makeProgression(), sessions);
    assert.equal(card.negotiatorLevel, 'Intermédiaire');
  });

  it('negotiatorLevel: Avancé with 15-30 sessions, avgScore > 55, >= 2 belts', () => {
    const sessions = Array.from({ length: 20 }, (_, i) => makeSession({ globalScore: 60, id: `s${i}` }));
    const prog = makeProgression({
      belts: {
        white: { earned: true },
        yellow: { earned: true },
        green: { earned: false },
        blue: { earned: false },
        black: { earned: false },
      },
    });
    const card = generateVaccinationCard(prog, sessions);
    assert.equal(card.negotiatorLevel, 'Avancé');
  });

  it('negotiatorLevel: Expert with 30-50 sessions, avgScore > 65, >= 4 belts', () => {
    const sessions = Array.from({ length: 35 }, (_, i) => makeSession({ globalScore: 70, id: `s${i}` }));
    const prog = makeProgression({
      belts: {
        white: { earned: true },
        yellow: { earned: true },
        green: { earned: true },
        blue: { earned: true },
        black: { earned: false },
      },
    });
    const card = generateVaccinationCard(prog, sessions);
    assert.equal(card.negotiatorLevel, 'Expert');
  });

  it('negotiatorLevel: Maître with 50+ sessions, avgScore > 75, all belts', () => {
    const sessions = Array.from({ length: 55 }, (_, i) => makeSession({ globalScore: 80, id: `s${i}` }));
    const prog = makeProgression({
      belts: {
        white: { earned: true },
        yellow: { earned: true },
        green: { earned: true },
        blue: { earned: true },
        black: { earned: true },
      },
    });
    const card = generateVaccinationCard(prog, sessions);
    assert.equal(card.negotiatorLevel, 'Maître');
  });

  it('formatVaccinationCard returns non-empty string with box drawing', () => {
    const card = generateVaccinationCard(makeProgression(), []);
    const output = formatVaccinationCard(card);
    assert.ok(output.length > 0);
    assert.ok(output.includes('\u2554'), 'Should contain top-left corner');
    assert.ok(output.includes('CARNET DE VACCINATION COGNITIVE'));
    assert.ok(output.includes('Débutant'));
  });

  it('formatShareableCard returns plain text without ANSI codes', () => {
    const sessions = Array.from({ length: 5 }, (_, i) => makeSession({ globalScore: 55, id: `s${i}` }));
    const prog = makeProgression({
      biasProfile: {
        anchoring: makeBiasEntry({ totalCount: 6, frequency: 0.10, recentCounts: [1, 0, 0, 0, 0, 0] }),
      },
    });
    const card = generateVaccinationCard(prog, sessions);
    const output = formatShareableCard(card);
    assert.ok(output.length > 0);
    assert.ok(!output.includes('\x1b['), 'Should not contain ANSI escape codes');
    assert.ok(output.includes('Mon profil NegotiateAI'));
    assert.ok(output.includes('Autonomie: L'));
    assert.ok(output.includes('negotiateai.app'));
  });

  it('strengths and weaknesses pick top 2 and bottom 2 dimensions', () => {
    const sessions = [
      makeSession({
        scores: {
          outcomeLeverage: 25,
          batnaDiscipline: 20,
          emotionalRegulation: 5,
          biasResistance: 3,
          conversationalFlow: 10,
        },
      }),
    ];
    const card = generateVaccinationCard(makeProgression(), sessions);
    assert.equal(card.strengths.length, 2);
    assert.equal(card.weaknesses.length, 2);
    // Top 2 by score: outcomeLeverage (25), batnaDiscipline (20)
    assert.ok(card.strengths.includes('Leverage'));
    assert.ok(card.strengths.includes('Discipline BATNA'));
    // Bottom 2 by score: biasResistance (3), emotionalRegulation (5)
    assert.ok(card.weaknesses.includes('Résistance aux biais'));
    assert.ok(card.weaknesses.includes('Régulation émotionnelle'));
  });

  it('nextMilestone is relevant to current level', () => {
    // Débutant
    const card1 = generateVaccinationCard(makeProgression(), []);
    assert.ok(card1.nextMilestone.includes('5 sessions'));

    // Intermédiaire — needs belts
    const sessions8 = Array.from({ length: 8 }, (_, i) => makeSession({ globalScore: 55, id: `s${i}` }));
    const card2 = generateVaccinationCard(makeProgression(), sessions8);
    assert.ok(card2.nextMilestone.length > 0);

    // Expert — needs black belt
    const sessions35 = Array.from({ length: 35 }, (_, i) => makeSession({ globalScore: 70, id: `s${i}` }));
    const prog35 = makeProgression({
      belts: { white: { earned: true }, yellow: { earned: true }, green: { earned: true }, blue: { earned: true }, black: { earned: false } },
    });
    const card3 = generateVaccinationCard(prog35, sessions35);
    assert.ok(card3.nextMilestone.includes('Noire'));
  });

  it('resistanceRate is computed correctly', () => {
    const prog = makeProgression({
      biasProfile: {
        anchoring: makeBiasEntry({ totalCount: 6, frequency: 0.30, recentCounts: [1, 0, 1, 0, 1] }),
      },
    });
    const card = generateVaccinationCard(prog, []);
    const anchoring = card.biases.find((b) => b.biasType === 'anchoring');
    // resistanceRate = (1 - 0.30) * 100 = 70
    assert.equal(anchoring.resistanceRate, 70);
  });
});
