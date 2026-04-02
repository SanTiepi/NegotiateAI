import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRound, computeSessionGrade, computeTriangleScore, buildFightCard } from '../src/fight-card.mjs';

describe('fight-card — scoreRound', () => {
  it('scores a positive round (momentum + technique)', () => {
    const result = {
      state: { turn: 1, confidence: 40, frustration: 30, momentum: 20 },
      coaching: { biasDetected: null },
      detectedSignals: ['user:anchoringFirst'],
    };
    const session = { _prevConfidence: 50, _prevFrustration: 30, _roundScores: [] };
    const round = scoreRound(result, session);
    assert.ok(round.points > 0);
    assert.equal(round.label, 'Round gagne');
    assert.ok(round.signals.length > 0);
  });

  it('scores a negative round (bias + tension)', () => {
    const result = {
      state: { turn: 2, confidence: 70, frustration: 60, momentum: -20 },
      coaching: { biasDetected: 'anchoring' },
      detectedSignals: [],
    };
    const session = { _prevConfidence: 50, _prevFrustration: 30, _roundScores: [] };
    const round = scoreRound(result, session);
    assert.ok(round.points < 0);
    assert.equal(round.label, 'Round perdu');
  });

  it('scores a neutral round', () => {
    const result = {
      state: { turn: 1, confidence: 50, frustration: 30, momentum: 5 },
      coaching: {},
      detectedSignals: [],
    };
    const session = { _prevConfidence: 50, _prevFrustration: 30, _roundScores: [] };
    const round = scoreRound(result, session);
    assert.equal(round.points, 0);
    assert.equal(round.label, 'Round neutre');
  });

  it('accumulates cumulative score', () => {
    const result = {
      state: { turn: 3, confidence: 40, frustration: 30, momentum: 20 },
      coaching: {},
      detectedSignals: ['user:mirror'],
    };
    const session = { _prevConfidence: 55, _prevFrustration: 30, _roundScores: [{ points: 2 }, { points: -1 }] };
    const round = scoreRound(result, session);
    assert.equal(round.cumulativeScore, 2 + (-1) + round.points);
  });

  it('clamps points to -3..+3', () => {
    const result = {
      state: { turn: 1, confidence: 10, frustration: 90, momentum: -50 },
      coaching: { biasDetected: 'loss_aversion' },
      detectedSignals: [],
    };
    const session = { _prevConfidence: 50, _prevFrustration: 20, _roundScores: [] };
    const round = scoreRound(result, session);
    assert.ok(round.points >= -3 && round.points <= 3);
  });
});

describe('fight-card — computeSessionGrade', () => {
  it('assigns A+ for score >= 90', () => {
    const grade = computeSessionGrade({ globalScore: 92 }, { status: 'accepted', frustration: 20, egoThreat: 10 });
    assert.equal(grade.grade, 'A+');
    assert.equal(grade.label, 'Masterclass');
  });

  it('assigns B for score 65-79', () => {
    const grade = computeSessionGrade({ globalScore: 70 }, { status: 'accepted', frustration: 30 });
    assert.equal(grade.grade, 'B');
  });

  it('assigns F for score < 35', () => {
    const grade = computeSessionGrade({ globalScore: 20 }, { status: 'accepted', frustration: 40 });
    assert.equal(grade.grade, 'F');
    assert.equal(grade.label, 'Capitulation');
  });

  it('assigns X (Rupture) for destroyed relationship', () => {
    const grade = computeSessionGrade({ globalScore: 80 }, { status: 'accepted', frustration: 90, _world: { emotions: { egoThreat: 80 } } });
    assert.equal(grade.grade, 'X');
    assert.equal(grade.label, 'Rupture');
  });

  it('assigns D+ for correct early walk-away', () => {
    const grade = computeSessionGrade({ globalScore: 30 }, {
      status: 'quit',
      frustration: 50,
      _roundScores: [{ points: -1 }, { points: -2 }, { points: 0 }],
      concessions: [],
    });
    assert.equal(grade.grade, 'D+');
    assert.match(grade.label, /walk-away correct/i);
  });

  it('assigns E for late walk-away with too many concessions', () => {
    const grade = computeSessionGrade({ globalScore: 30 }, {
      status: 'quit',
      frustration: 50,
      _roundScores: [{ points: -1 }, { points: -2 }, { points: 0 }, { points: -1 }, { points: 1 }, { points: -1 }],
      concessions: ['a', 'b', 'c'],
    });
    assert.equal(grade.grade, 'E');
  });
});

describe('fight-card — computeTriangleScore', () => {
  it('computes all three axes', () => {
    const feedback = {
      scores: { outcomeLeverage: 20, batnaDiscipline: 16, emotionalRegulation: 20, biasResistance: 12, conversationalFlow: 12 },
      biasesDetected: [],
      tacticsUsed: ['anchoring'],
    };
    const session = { frustration: 30, egoThreat: 20, transcript: [{ role: 'adversary', content: 'test' }] };
    const contract = {
      hiddenObjectiveHints: ['needs cash urgently'],
      triangleWeights: { transaction: 50, relation: 25, intelligence: 25 },
    };

    const triangle = computeTriangleScore(feedback, session, contract);
    assert.ok(triangle.transaction >= 0 && triangle.transaction <= 100);
    assert.ok(triangle.relation >= 0 && triangle.relation <= 100);
    assert.ok(triangle.intelligence >= 0 && triangle.intelligence <= 100);
    assert.ok(triangle.weightedScore >= 0 && triangle.weightedScore <= 100);
    assert.equal(triangle.totalHints, 1);
  });

  it('works without objective contract', () => {
    const triangle = computeTriangleScore(
      { scores: { outcomeLeverage: 15, batnaDiscipline: 10, biasResistance: 8, conversationalFlow: 10 } },
      { frustration: 40, transcript: [] },
      null,
    );
    assert.ok(triangle.transaction >= 0);
    assert.equal(triangle.totalHints, 0);
  });
});

describe('fight-card — buildFightCard', () => {
  it('builds complete fight card', () => {
    const feedback = {
      globalScore: 75,
      scores: { outcomeLeverage: 20, batnaDiscipline: 16, emotionalRegulation: 20, biasResistance: 12, conversationalFlow: 12 },
      biasesDetected: [],
    };
    const session = {
      status: 'accepted',
      frustration: 25,
      egoThreat: 15,
      transcript: [{ role: 'user', content: 'hi' }, { role: 'adversary', content: 'hello' }],
      _roundScores: [{ turn: 1, points: 2, label: 'Round gagne', signals: ['momentum'] }],
    };
    const contract = {
      objective: 'Buy at 100k',
      minimalThreshold: '120k max',
      batna: 'Walk away',
      strategy: 'Anchor low',
      relationalGoal: 'Partnership',
      hiddenObjectiveHints: [],
      triangleWeights: { transaction: 50, relation: 25, intelligence: 25 },
    };

    const card = buildFightCard(feedback, session, contract);
    assert.ok(card.grade);
    assert.equal(card.grade.grade, 'B');
    assert.ok(card.triangle);
    assert.ok(card.rounds);
    assert.equal(card.rounds.total, 1);
    assert.equal(card.rounds.won, 1);
    assert.equal(card.globalScore, 75);
    assert.ok(card.objectiveContract);
    assert.equal(card.objectiveContract.strategy, 'Anchor low');
  });
});
