import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmotionalState, deriveEmotions, applyStimulus, decayPAD,
  createNegotiationState, recordConcession, updateLeverage, updateMomentum,
  analyzeZOPA, getMomentumTrend,
  createWorldState, processTurnWorld, worldStateToPrompt,
  STIMULUS_IMPACTS,
} from '../src/worldEngine.mjs';

// ============================================================
// Layer 1 — Emotional Model
// ============================================================

describe('worldEngine — Emotional Model', () => {
  it('createEmotionalState returns default PAD values', () => {
    const pad = createEmotionalState();
    assert.equal(typeof pad.pleasure, 'number');
    assert.equal(typeof pad.arousal, 'number');
    assert.equal(typeof pad.dominance, 'number');
  });

  it('createEmotionalState accepts custom initial values', () => {
    const pad = createEmotionalState({ pleasure: -50, arousal: 80, dominance: 30 });
    assert.equal(pad.pleasure, -50);
    assert.equal(pad.arousal, 80);
    assert.equal(pad.dominance, 30);
  });

  it('deriveEmotions produces all 6 emotions from PAD', () => {
    const pad = { pleasure: 20, arousal: 30, dominance: 50 };
    const e = deriveEmotions(pad);
    assert.equal(typeof e.confidence, 'number');
    assert.equal(typeof e.frustration, 'number');
    assert.equal(typeof e.egoThreat, 'number');
    assert.equal(typeof e.fear, 'number');
    assert.equal(typeof e.contempt, 'number');
    assert.equal(typeof e.openness, 'number');
  });

  it('high dominance + high pleasure → high confidence, low fear', () => {
    const e = deriveEmotions({ pleasure: 80, arousal: 20, dominance: 80 });
    assert.ok(e.confidence > 70, `confidence ${e.confidence} should be > 70`);
    assert.ok(e.fear < 20, `fear ${e.fear} should be < 20`);
  });

  it('low dominance + low pleasure + high arousal → high frustration, high egoThreat', () => {
    const e = deriveEmotions({ pleasure: -60, arousal: 80, dominance: -40 });
    assert.ok(e.frustration > 60, `frustration ${e.frustration} should be > 60`);
    assert.ok(e.egoThreat > 60, `egoThreat ${e.egoThreat} should be > 60`);
  });

  it('all derived emotions are clamped 0-100', () => {
    const extremes = [
      { pleasure: 100, arousal: 100, dominance: 100 },
      { pleasure: -100, arousal: 100, dominance: -100 },
      { pleasure: -100, arousal: 0, dominance: -100 },
    ];
    for (const pad of extremes) {
      const e = deriveEmotions(pad);
      for (const [k, v] of Object.entries(e)) {
        assert.ok(v >= 0 && v <= 100, `${k}=${v} out of range for PAD ${JSON.stringify(pad)}`);
      }
    }
  });

  it('applyStimulus changes PAD values based on stimulus type', () => {
    const pad = createEmotionalState({ pleasure: 20, arousal: 30, dominance: 50 });
    const after = applyStimulus(pad, 'user_batna_reveal');
    assert.ok(after.pleasure < pad.pleasure, 'pleasure should decrease');
    assert.ok(after.dominance < pad.dominance, 'dominance should decrease');
    assert.ok(after.arousal > pad.arousal, 'arousal should increase');
  });

  it('applyStimulus with unknown type returns unchanged PAD', () => {
    const pad = createEmotionalState({ pleasure: 20, arousal: 30, dominance: 50 });
    const after = applyStimulus(pad, 'unknown_stimulus');
    assert.deepEqual(after, pad);
  });

  it('applyStimulus respects intensity multiplier', () => {
    const pad = createEmotionalState({ pleasure: 50, arousal: 30, dominance: 50 });
    const half = applyStimulus(pad, 'user_threat', 0.5);
    const full = applyStimulus(pad, 'user_threat', 1.0);
    // Half intensity should produce smaller change
    assert.ok(Math.abs(full.pleasure - pad.pleasure) > Math.abs(half.pleasure - pad.pleasure));
  });

  it('applyStimulus clamps values to PAD ranges', () => {
    const pad = { pleasure: -95, arousal: 95, dominance: -95 };
    const after = applyStimulus(pad, 'user_threat', 2.0);
    assert.ok(after.pleasure >= -100);
    assert.ok(after.arousal <= 100);
    assert.ok(after.dominance >= -100);
  });

  it('decayPAD moves values toward equilibrium', () => {
    const pad = { pleasure: 80, arousal: 60, dominance: 40 };
    const decayed = decayPAD(pad, 0.1);
    assert.ok(decayed.pleasure < pad.pleasure);
    assert.ok(decayed.arousal < pad.arousal);
    assert.ok(decayed.dominance < pad.dominance);
  });

  it('STIMULUS_IMPACTS has entries for all expected stimulus types', () => {
    const expected = ['user_anchor_high', 'user_concession', 'user_batna_reveal', 'user_mirror', 'user_label', 'user_threat', 'adversary_concession', 'event_deadline'];
    for (const type of expected) {
      assert.ok(STIMULUS_IMPACTS[type], `Missing stimulus: ${type}`);
    }
  });
});

// ============================================================
// Layer 2 — Negotiation Dynamics
// ============================================================

describe('worldEngine — Negotiation Dynamics', () => {
  it('createNegotiationState returns valid initial state', () => {
    const n = createNegotiationState({}, {});
    assert.equal(typeof n.userTarget, 'number');
    assert.equal(typeof n.adversaryTarget, 'number');
    assert.equal(n.leverageBalance, 0);
    assert.equal(n.momentum, 0);
    assert.deepEqual(n.userConcessions, []);
  });

  it('recordConcession tracks concessions and updates rate', () => {
    const n = createNegotiationState({}, {});
    recordConcession(n, 'user', 85, 75, 1);
    assert.equal(n.userConcessions.length, 1);
    assert.equal(n.userConcessionRate, 10);

    recordConcession(n, 'user', 75, 70, 2);
    assert.equal(n.userConcessions.length, 2);
    assert.equal(n.userConcessionRate, 7.5);
  });

  it('updateLeverage changes balance and clamps', () => {
    const n = createNegotiationState({}, {});
    updateLeverage(n, 30, 'batna_reveal');
    assert.equal(n.leverageBalance, 30);
    updateLeverage(n, 80, 'big_move');
    assert.equal(n.leverageBalance, 100); // clamped
  });

  it('updateMomentum tracks history', () => {
    const n = createNegotiationState({}, {});
    updateMomentum(n, 15);
    updateMomentum(n, 10);
    updateMomentum(n, 5);
    assert.equal(n.momentum, 30);
    assert.equal(n.momentumHistory.length, 3);
  });

  it('analyzeZOPA detects existing ZOPA', () => {
    const n = createNegotiationState({}, {});
    // Default: userReservation=40, adversaryReservation=55 → ZOPA exists
    const zopa = analyzeZOPA(n);
    assert.equal(zopa.zopaExists, true);
    assert.equal(zopa.zopaWidth, 15);
    assert.ok(zopa.zopaMidpoint !== null);
  });

  it('analyzeZOPA detects no ZOPA when reservations don\'t overlap', () => {
    const n = createNegotiationState({}, {});
    n.userReservation = 60;
    n.adversaryReservation = 50;
    const zopa = analyzeZOPA(n);
    assert.equal(zopa.zopaExists, false);
    assert.equal(zopa.zopaWidth, 0);
  });

  it('analyzeZOPA computes deal quality', () => {
    const n = createNegotiationState({}, {});
    n.currentOffer = 50;
    const zopa = analyzeZOPA(n);
    assert.ok(zopa.dealQuality !== null);
    assert.ok(zopa.dealQuality >= 0 && zopa.dealQuality <= 100);
  });

  it('getMomentumTrend returns gaining/losing/stable', () => {
    const n = createNegotiationState({}, {});
    assert.equal(getMomentumTrend(n), 'stable');

    n.momentumHistory = [10, 20, 35];
    assert.equal(getMomentumTrend(n), 'gaining');

    n.momentumHistory = [30, 15, 5];
    assert.equal(getMomentumTrend(n), 'losing');

    n.momentumHistory = [30, 28, 32];
    assert.equal(getMomentumTrend(n), 'stable');
  });
});

// ============================================================
// Layer 3 — World State Integration
// ============================================================

describe('worldEngine — World State', () => {
  const MOCK_BRIEF = { objective: 'raise', batna: 'other offer', minimalThreshold: '8%' };
  const MOCK_ADVERSARY = {
    emotionalProfile: { confidence: 70, frustration: 20, egoThreat: 10 },
  };

  it('createWorldState produces complete state from brief + adversary', () => {
    const ws = createWorldState(MOCK_BRIEF, MOCK_ADVERSARY);
    assert.ok(ws.pad);
    assert.ok(ws.emotions);
    assert.ok(ws.negotiation);
    assert.equal(ws.turn, 0);
    assert.equal(typeof ws.emotions.confidence, 'number');
    assert.equal(typeof ws.emotions.fear, 'number');
  });

  it('processTurnWorld applies stimuli and advances turn', () => {
    const ws = createWorldState(MOCK_BRIEF, MOCK_ADVERSARY);
    const oldConfidence = ws.emotions.confidence;

    const newWs = processTurnWorld(ws, [
      { type: 'user_batna_reveal', intensity: 1.0 },
    ]);

    assert.equal(newWs.turn, 1);
    assert.ok(newWs.emotions.confidence < oldConfidence, 'Confidence should drop after BATNA reveal');
  });

  it('processTurnWorld handles multiple stimuli in one turn', () => {
    const ws = createWorldState(MOCK_BRIEF, MOCK_ADVERSARY);
    const newWs = processTurnWorld(ws, [
      { type: 'user_mirror', intensity: 1.0 },
      { type: 'user_label', intensity: 1.0 },
      { type: 'user_empathy', intensity: 1.0 },
    ]);
    // Empathy + mirror + label should increase openness
    assert.ok(newWs.emotions.openness >= ws.emotions.openness, 'Openness should increase');
  });

  it('processTurnWorld with no stimuli still decays and advances', () => {
    const ws = createWorldState(MOCK_BRIEF, MOCK_ADVERSARY);
    ws.pad = { pleasure: 50, arousal: 60, dominance: 30 };
    const newWs = processTurnWorld(ws, []);
    assert.equal(newWs.turn, 1);
    assert.ok(newWs.pad.arousal <= 60, 'Arousal should decay');
  });

  it('worldStateToPrompt generates non-empty instruction string', () => {
    const ws = createWorldState(MOCK_BRIEF, MOCK_ADVERSARY);
    const prompt = worldStateToPrompt(ws);
    assert.ok(prompt.length > 100);
    assert.ok(prompt.includes('WORLD STATE'));
    assert.ok(prompt.includes('Confidence'));
    assert.ok(prompt.includes('Momentum'));
  });

  it('worldStateToPrompt reflects emotional state in descriptors', () => {
    const ws = createWorldState(MOCK_BRIEF, MOCK_ADVERSARY);
    // Force extreme state
    ws.emotions = { confidence: 20, frustration: 80, egoThreat: 70, fear: 60, contempt: 10, openness: 15 };
    const prompt = worldStateToPrompt(ws);
    assert.ok(prompt.includes('frustrated'));
    assert.ok(prompt.includes('worried'));
  });

  it('repeated stimuli accumulate effect over turns', () => {
    let ws = createWorldState(MOCK_BRIEF, MOCK_ADVERSARY);
    const initialConfidence = ws.emotions.confidence;

    // 3 turns of pressure
    for (let i = 0; i < 3; i++) {
      ws = processTurnWorld(ws, [{ type: 'user_threat', intensity: 1.0 }]);
    }

    assert.ok(ws.emotions.confidence < initialConfidence - 10,
      `After 3 threats, confidence (${ws.emotions.confidence}) should be well below initial (${initialConfidence})`);
    assert.ok(ws.emotions.fear > 30, `Fear (${ws.emotions.fear}) should be elevated`);
  });
});
