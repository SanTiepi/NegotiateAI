import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractNumbers,
  analyzeTurnForBias,
  analyzeSessionBiases,
  updateBiasProfile,
  adjustDrillInterval,
  recommendBiasTraining,
  BIAS_TYPES,
} from '../src/biasTracker.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTranscript(exchanges) {
  // exchanges: [{ adversary: string, user: string }]
  const transcript = [];
  for (const ex of exchanges) {
    if (ex.adversary) transcript.push({ role: 'adversary', content: ex.adversary });
    if (ex.user) transcript.push({ role: 'user', content: ex.user });
  }
  return transcript;
}

function makeSessionState(overrides = {}) {
  return {
    transcript: [],
    activeAnchor: null,
    userTarget: null,
    negotiationSpace: null,
    frustration: 0,
    confidence: 0,
    pressure: 0,
    _framesAdopted: 0,
    _blockCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// extractNumbers
// ---------------------------------------------------------------------------

describe('extractNumbers', () => {
  it('extracts plain numbers', () => {
    const nums = extractNumbers('Le prix est de 50000 euros');
    assert.ok(nums.includes(50000));
  });

  it('extracts numbers with currency symbols', () => {
    const nums = extractNumbers('I offer $45000 for this');
    assert.ok(nums.includes(45000));
  });
});

// ---------------------------------------------------------------------------
// 1. Anchoring submission
// ---------------------------------------------------------------------------

describe('anchoring bias', () => {
  it('detects anchoring when user counter is within 20% of adversary anchor', () => {
    const state = makeSessionState({
      activeAnchor: 100000,
      userTarget: 50000,
      negotiationSpace: 50000,
      transcript: [
        { role: 'adversary', content: 'Mon prix est de 100000 euros.' },
      ],
    });

    const turn = { role: 'user', content: 'Je propose 95000 euros.', turnIndex: 1 };
    const indicators = analyzeTurnForBias(turn, state);

    assert.ok(indicators.length > 0, 'Should detect anchoring');
    assert.equal(indicators[0].biasType, 'anchoring');
    assert.ok(indicators[0].severity > 0.5, 'Severity should be high (far from target)');
    assert.ok(indicators[0].evidence.includes('95000'));
  });

  it('does NOT trigger anchoring when user stays near own target', () => {
    const state = makeSessionState({
      activeAnchor: 100000,
      userTarget: 50000,
      negotiationSpace: 50000,
      transcript: [
        { role: 'adversary', content: 'Mon prix est de 100000 euros.' },
      ],
    });

    const turn = { role: 'user', content: 'Je propose 55000 euros.', turnIndex: 1 };
    const indicators = analyzeTurnForBias(turn, state);
    const anchoring = indicators.filter((i) => i.biasType === 'anchoring');
    assert.equal(anchoring.length, 0, 'Should not detect anchoring near own target');
  });
});

// ---------------------------------------------------------------------------
// 2. Loss aversion
// ---------------------------------------------------------------------------

describe('loss aversion', () => {
  it('detects loss aversion after adversary threat and user concession', () => {
    const state = makeSessionState({
      activeAnchor: 100000,
      userTarget: 50000,
      negotiationSpace: 50000,
      transcript: [
        { role: 'user', content: 'Je propose 60000 euros.' },
        { role: 'adversary', content: 'Vous allez perdre cette opportunité si vous restez à ce prix.' },
      ],
    });

    const turn = { role: 'user', content: 'Bon... 80000 euros alors.', turnIndex: 2 };
    const indicators = analyzeTurnForBias(turn, state);

    const loss = indicators.filter((i) => i.biasType === 'loss_aversion');
    assert.ok(loss.length > 0, 'Should detect loss aversion');
    assert.ok(loss[0].severity > 0, 'Severity should be positive');
  });

  it('detects loss aversion with English threat', () => {
    const state = makeSessionState({
      activeAnchor: 5000,
      userTarget: 3000,
      negotiationSpace: 2000,
      transcript: [
        { role: 'user', content: 'I offer 3200 dollars.' },
        { role: 'adversary', content: "You'll lose this deal entirely if you don't come up." },
      ],
    });

    const turn = { role: 'user', content: 'Okay, 4500 dollars.', turnIndex: 2 };
    const indicators = analyzeTurnForBias(turn, state);
    const loss = indicators.filter((i) => i.biasType === 'loss_aversion');
    assert.ok(loss.length > 0, 'Should detect English loss aversion');
  });
});

// ---------------------------------------------------------------------------
// 3. Conflict avoidance
// ---------------------------------------------------------------------------

describe('conflict avoidance', () => {
  it('detects premature concession under high pressure', () => {
    const state = makeSessionState({
      activeAnchor: 100000,
      userTarget: 50000,
      negotiationSpace: 50000,
      frustration: 0.8,
      confidence: 0.9,
      pressure: 0.7,
      transcript: [
        { role: 'user', content: 'Mon offre est de 55000 euros.' },
        { role: 'adversary', content: 'Vous plaisantez ? C\'est ridicule.' },
      ],
    });

    const turn = { role: 'user', content: 'D\'accord, 85000 euros.', turnIndex: 2 };
    const indicators = analyzeTurnForBias(turn, state);
    const ca = indicators.filter((i) => i.biasType === 'conflict_avoidance');
    assert.ok(ca.length > 0, 'Should detect conflict avoidance');
    assert.ok(ca[0].severity > 0.3, 'Severity should reflect large concession');
  });
});

// ---------------------------------------------------------------------------
// 4. Framing submission
// ---------------------------------------------------------------------------

describe('framing', () => {
  it('detects user adopting adversary frame language', () => {
    const state = makeSessionState({
      transcript: [
        { role: 'adversary', content: "C'est la norme dans notre industrie, tout le monde paie ce prix." },
      ],
    });

    const turn = { role: 'user', content: "Oui, c'est la norme, je comprends.", turnIndex: 1 };
    const indicators = analyzeTurnForBias(turn, state);
    const framing = indicators.filter((i) => i.biasType === 'framing');
    assert.ok(framing.length > 0, 'Should detect framing submission');
  });

  it('does NOT trigger framing when user challenges the frame', () => {
    const state = makeSessionState({
      transcript: [
        { role: 'adversary', content: "C'est la norme dans ce secteur." },
      ],
    });

    const turn = { role: 'user', content: "Ce n'est pas la norme, les prix du marché sont bien plus bas.", turnIndex: 1 };
    const indicators = analyzeTurnForBias(turn, state);
    const framing = indicators.filter((i) => i.biasType === 'framing');
    assert.equal(framing.length, 0, 'Should not trigger when user challenges');
  });
});

// ---------------------------------------------------------------------------
// 5. Conversational blocking
// ---------------------------------------------------------------------------

describe('conversational blocking', () => {
  it('detects blocking without alternative', () => {
    const state = makeSessionState({ transcript: [] });

    const turn = { role: 'user', content: 'Non mais je refuse catégoriquement.', turnIndex: 1 };
    const indicators = analyzeTurnForBias(turn, state);
    const blocking = indicators.filter((i) => i.biasType === 'conversational_blocking');
    assert.ok(blocking.length > 0, 'Should detect blocking');
  });

  it('does NOT trigger blocking when alternative is offered', () => {
    const state = makeSessionState({ transcript: [] });

    const turn = { role: 'user', content: "Non mais je refuse ce prix. En revanche, je propose 45000.", turnIndex: 1 };
    const indicators = analyzeTurnForBias(turn, state);
    const blocking = indicators.filter((i) => i.biasType === 'conversational_blocking');
    assert.equal(blocking.length, 0, 'Should not trigger when alternative is present');
  });
});

// ---------------------------------------------------------------------------
// Full session analysis
// ---------------------------------------------------------------------------

describe('analyzeSessionBiases', () => {
  it('produces a BiasReport with summary for all bias types', () => {
    const transcript = makeTranscript([
      { adversary: "C'est la norme du marché, 100000 euros.", user: "Oui c'est la norme, 95000 euros." },
      { adversary: 'Vous allez perdre cette affaire.', user: 'Bon, 98000 euros.' },
    ]);

    const state = { activeAnchor: 100000, frustration: 0.3, confidence: 0.5, pressure: 0.2 };
    const brief = { target: 50000, minimalThreshold: 60000 };

    const report = analyzeSessionBiases(transcript, state, brief);

    assert.ok(report.biases.length > 0, 'Should find biases');
    assert.ok(report.summary, 'Should have summary');
    for (const biasType of BIAS_TYPES) {
      assert.ok(biasType in report.summary, `Summary should include ${biasType}`);
      assert.ok(typeof report.summary[biasType].count === 'number');
      assert.ok(typeof report.summary[biasType].avgSeverity === 'number');
    }
  });
});

// ---------------------------------------------------------------------------
// updateBiasProfile
// ---------------------------------------------------------------------------

describe('updateBiasProfile', () => {
  it('aggregates biases across sessions', () => {
    const report1 = {
      biases: [
        { biasType: 'anchoring', turn: 1, evidence: 'test', severity: 0.7 },
        { biasType: 'anchoring', turn: 3, evidence: 'test2', severity: 0.5 },
      ],
      summary: {},
    };

    const profile1 = updateBiasProfile(null, report1, '2026-03-25');
    assert.equal(profile1.anchoring.totalCount, 2);
    assert.equal(profile1.anchoring.recentCount, 1); // 1 session with anchoring
    assert.equal(profile1.anchoring.frequency, 1); // 1/1 sessions

    const report2 = {
      biases: [{ biasType: 'anchoring', turn: 2, evidence: 'test3', severity: 0.3 }],
      summary: {},
    };

    const profile2 = updateBiasProfile(profile1, report2, '2026-03-26');
    assert.equal(profile2.anchoring.totalCount, 3);
    assert.equal(profile2.anchoring.recentCount, 2); // 2 sessions with anchoring
    assert.equal(profile2.anchoring.frequency, 1); // 2/2 sessions
    assert.equal(profile2.anchoring.lastSeen, '2026-03-26');
  });

  it('tracks frequency correctly with sessions without bias', () => {
    const withBias = { biases: [{ biasType: 'loss_aversion', turn: 1, evidence: 'x', severity: 0.5 }], summary: {} };
    const noBias = { biases: [], summary: {} };

    let profile = updateBiasProfile(null, withBias, '2026-03-20');
    for (let i = 0; i < 9; i++) {
      profile = updateBiasProfile(profile, noBias, `2026-03-${21 + i}`);
    }

    // 1 session with bias out of 10
    assert.equal(profile.loss_aversion.recentCount, 1);
    assert.equal(profile.loss_aversion.frequency, 0.1);
  });
});

// ---------------------------------------------------------------------------
// Spaced repetition nextDrillDate
// ---------------------------------------------------------------------------

describe('spaced repetition', () => {
  it('sets nextDrillDate to 1 day for high frequency bias (>0.5)', () => {
    const report = { biases: [{ biasType: 'framing', turn: 1, evidence: 'x', severity: 0.6 }], summary: {} };
    const profile = updateBiasProfile(null, report, '2026-03-25');
    // frequency = 1.0 (>0.5), so interval = 1 day
    assert.equal(profile.framing.nextDrillDate, '2026-03-26');
  });

  it('sets nextDrillDate to 14 days for rare bias (freq <0.1, not seen recently)', () => {
    const withBias = { biases: [{ biasType: 'anchoring', turn: 1, evidence: 'x', severity: 0.3 }], summary: {} };
    const noBias = { biases: [], summary: {} };

    let profile = updateBiasProfile(null, withBias, '2026-03-01');
    // Add 10+ sessions without this bias to push frequency below 0.1
    for (let i = 0; i < 11; i++) {
      profile = updateBiasProfile(profile, noBias, `2026-03-${String(2 + i).padStart(2, '0')}`);
    }

    // recentCount should be 0 (the original session scrolled out of window), freq < 0.1
    assert.equal(profile.anchoring.recentCount, 0);
    assert.ok(profile.anchoring.frequency < 0.1);
    assert.equal(profile.anchoring.nextDrillDate, '2026-03-26'); // March 12 + 14 days
  });

  it('adjustDrillInterval multiplies by 1.5 on improvement', () => {
    const report = { biases: [{ biasType: 'anchoring', turn: 1, evidence: 'x', severity: 0.5 }], summary: {} };
    const profile = updateBiasProfile(null, report, '2026-03-25');
    const originalInterval = profile.anchoring._interval || 3;

    const adjusted = adjustDrillInterval(profile, 'anchoring', true);
    assert.equal(adjusted.anchoring._interval, originalInterval * 1.5);
  });

  it('adjustDrillInterval multiplies by 0.5 on no improvement', () => {
    const report = { biases: [{ biasType: 'anchoring', turn: 1, evidence: 'x', severity: 0.5 }], summary: {} };
    const profile = updateBiasProfile(null, report, '2026-03-25');

    const adjusted = adjustDrillInterval(profile, 'anchoring', false);
    assert.ok(adjusted.anchoring._interval < profile.anchoring._interval);
  });
});

// ---------------------------------------------------------------------------
// recommendBiasTraining
// ---------------------------------------------------------------------------

describe('recommendBiasTraining', () => {
  it('returns the highest urgency bias', () => {
    const reportHigh = { biases: [{ biasType: 'anchoring', turn: 1, evidence: 'x', severity: 0.8 }], summary: {} };
    const reportLow = { biases: [{ biasType: 'framing', turn: 1, evidence: 'x', severity: 0.2 }], summary: {} };

    let profile = updateBiasProfile(null, reportHigh, '2026-03-20');
    profile = updateBiasProfile(profile, reportHigh, '2026-03-21');
    profile = updateBiasProfile(profile, reportHigh, '2026-03-22');
    profile = updateBiasProfile(profile, reportLow, '2026-03-23');

    const rec = recommendBiasTraining(profile);
    assert.ok(rec, 'Should return a recommendation');
    // anchoring appeared in 3/4 sessions = 0.75 freq, framing in 1/4 = 0.25
    assert.equal(rec.biasType, 'anchoring');
    assert.ok(rec.urgency > 0);
    assert.ok(rec.reason.length > 0);
  });

  it('returns null when no biases in profile', () => {
    const profile = updateBiasProfile(null, { biases: [], summary: {} }, '2026-03-25');
    const rec = recommendBiasTraining(profile);
    assert.equal(rec, null);
  });
});

// ---------------------------------------------------------------------------
// False positive: normal negotiation
// ---------------------------------------------------------------------------

describe('false positives', () => {
  it('normal negotiation text does not trigger biases', () => {
    const transcript = makeTranscript([
      { adversary: "Bonjour, je vous propose de discuter du contrat.", user: "Bonjour, oui discutons. Mon objectif est 60000 euros." },
      { adversary: "Je pensais plutôt à 75000 euros.", user: "Je comprends votre position. En revanche, je propose 62000 avec des conditions flexibles." },
      { adversary: "Intéressant, parlons des conditions.", user: "Oui, je suggère un paiement en 3 fois si on se met d'accord sur 63000." },
    ]);

    const state = { activeAnchor: null, frustration: 0.2, confidence: 0.4, pressure: 0.1 };
    const brief = { target: 60000, minimalThreshold: 65000 };

    const report = analyzeSessionBiases(transcript, state, brief);
    assert.equal(report.biases.length, 0, `Expected no biases but found: ${JSON.stringify(report.biases)}`);
  });
});
