// worldEngine.mjs — Social Physics Engine for negotiation
// Deterministic emotional model (PAD/OCC) + ZOPA dynamics + leverage tracking
// The LLM generates TEXT. This engine computes STATE.

// ============================================================
// LAYER 1 — Emotional Model (PAD → derived emotions)
// ============================================================

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

/**
 * PAD space: Pleasure-Arousal-Dominance (3 fundamental axes)
 * All emotions are DERIVED from these 3 values — not set independently.
 */
export function createEmotionalState(initial = {}) {
  return {
    pleasure: initial.pleasure ?? 20,       // -100 (miserable) to +100 (delighted)
    arousal: initial.arousal ?? 30,          // 0 (calm) to 100 (agitated)
    dominance: initial.dominance ?? 50,      // -100 (submissive) to +100 (dominant)
  };
}

/**
 * Derive human-readable emotions from PAD axes.
 * Based on OCC model adapted for negotiation contexts.
 */
export function deriveEmotions(pad) {
  const p = pad.pleasure;
  const a = pad.arousal;
  const d = pad.dominance;

  return {
    confidence:   clamp(Math.round(50 + d * 0.35 + p * 0.15), 0, 100),
    frustration:  clamp(Math.round(50 - p * 0.35 + a * 0.25), 0, 100),
    egoThreat:    clamp(Math.round(50 - d * 0.30 + a * 0.20), 0, 100),
    fear:         clamp(Math.round(30 - p * 0.25 - d * 0.25 + a * 0.20), 0, 100),
    contempt:     clamp(Math.round(20 + d * 0.30 - p * 0.20), 0, 100),
    openness:     clamp(Math.round(50 + p * 0.30 - a * 0.15 + d * 0.05), 0, 100),
  };
}

/**
 * Apply a stimulus to the PAD state. Returns new PAD (immutable).
 * Stimuli are typed events with known impacts.
 */
const STIMULUS_IMPACTS = {
  // User actions
  user_anchor_high:     { pleasure: -8, arousal: 10, dominance: -12 },
  user_anchor_low:      { pleasure: 5, arousal: -3, dominance: 8 },
  user_concession:      { pleasure: 10, arousal: -5, dominance: 8 },
  user_batna_reveal:    { pleasure: -12, arousal: 15, dominance: -18 },
  user_batna_bluff:     { pleasure: -5, arousal: 8, dominance: -10 },
  user_mirror:          { pleasure: 6, arousal: -4, dominance: -2 },
  user_label:           { pleasure: 8, arousal: -6, dominance: -3 },
  user_calibrated_q:    { pleasure: 3, arousal: -2, dominance: -5 },
  user_reframe:         { pleasure: -5, arousal: 8, dominance: -10 },
  user_silence:         { pleasure: -3, arousal: 8, dominance: -5 },
  user_threat:          { pleasure: -15, arousal: 20, dominance: -8 },
  user_empathy:         { pleasure: 12, arousal: -8, dominance: -2 },
  user_aggression:      { pleasure: -10, arousal: 15, dominance: 5 },
  user_blocking:        { pleasure: -8, arousal: 10, dominance: 3 },
  user_accept:          { pleasure: 15, arousal: -10, dominance: 5 },
  user_reject:          { pleasure: -12, arousal: 12, dominance: -5 },

  // Adversary self-generated (for events)
  adversary_concession: { pleasure: -5, arousal: 5, dominance: -8 },
  adversary_escalation: { pleasure: -10, arousal: 15, dominance: 10 },
  adversary_softening:  { pleasure: 8, arousal: -10, dominance: -5 },

  // External events
  event_deadline:       { pleasure: -5, arousal: 15, dominance: 0 },
  event_stakeholder:    { pleasure: -3, arousal: 10, dominance: 5 },
  event_information:    { pleasure: -8, arousal: 12, dominance: -10 },
  event_budget_freeze:  { pleasure: -10, arousal: 8, dominance: -5 },
};

export function applyStimulus(pad, stimulusType, intensity = 1.0) {
  const impact = STIMULUS_IMPACTS[stimulusType];
  if (!impact) return { ...pad }; // unknown stimulus — no change

  return {
    pleasure:  clamp(pad.pleasure + Math.round(impact.pleasure * intensity), -100, 100),
    arousal:   clamp(pad.arousal + Math.round(impact.arousal * intensity), 0, 100),
    dominance: clamp(pad.dominance + Math.round(impact.dominance * intensity), -100, 100),
  };
}

/**
 * Natural decay — emotions tend toward equilibrium over time.
 * Called once per turn.
 */
export function decayPAD(pad, rate = 0.05) {
  return {
    pleasure:  Math.round(pad.pleasure * (1 - rate)),
    arousal:   Math.max(0, Math.round(pad.arousal * (1 - rate * 1.5))),
    dominance: Math.round(pad.dominance * (1 - rate * 0.5)),
  };
}

// ============================================================
// LAYER 2 — Negotiation Dynamics (ZOPA + Leverage)
// ============================================================

/**
 * Create negotiation state from brief + adversary.
 * Positions are normalized 0-100 where 0 = adversary's ideal, 100 = user's ideal.
 */
export function createNegotiationState(brief, adversary) {
  return {
    // Positions (normalized 0-100 scale)
    userTarget: 85,             // user aims high
    userReservation: 40,        // user's walkaway (from minimalThreshold)
    adversaryTarget: 15,        // adversary aims low
    adversaryReservation: 55,   // adversary's walkaway (from adversary BATNA)

    // Current negotiation position
    currentOffer: null,         // last number on the table
    firstAnchorBy: null,        // 'user' or 'adversary'

    // Leverage
    leverageBalance: 0,         // -100 (adversary dominates) to +100 (user dominates)
    informationAsymmetry: 0,    // -100 (adversary knows more) to +100 (user knows more)

    // Concession tracking
    userConcessions: [],        // { turn, from, to, size }
    adversaryConcessions: [],
    userConcessionRate: 0,      // avg concession size per turn
    adversaryConcessionRate: 0,

    // Momentum
    momentum: 0,                // -100 to +100
    momentumHistory: [],        // last 5 values for trend
  };
}

/**
 * Record a concession and update rates.
 */
export function recordConcession(negoState, by, from, to, turn) {
  const size = Math.abs(to - from);
  const entry = { turn, from, to, size };

  if (by === 'user') {
    negoState.userConcessions.push(entry);
    const total = negoState.userConcessions.reduce((a, c) => a + c.size, 0);
    negoState.userConcessionRate = total / negoState.userConcessions.length;
  } else {
    negoState.adversaryConcessions.push(entry);
    const total = negoState.adversaryConcessions.reduce((a, c) => a + c.size, 0);
    negoState.adversaryConcessionRate = total / negoState.adversaryConcessions.length;
  }

  return negoState;
}

/**
 * Update leverage balance based on events.
 */
export function updateLeverage(negoState, delta, reason) {
  negoState.leverageBalance = clamp(negoState.leverageBalance + delta, -100, 100);
  return negoState;
}

/**
 * Update momentum and track history.
 */
export function updateMomentum(negoState, delta) {
  negoState.momentum = clamp(negoState.momentum + delta, -100, 100);
  negoState.momentumHistory.push(negoState.momentum);
  if (negoState.momentumHistory.length > 5) negoState.momentumHistory.shift();
  return negoState;
}

/**
 * Compute ZOPA analysis.
 */
export function analyzeZOPA(negoState) {
  const zopaExists = negoState.userReservation <= negoState.adversaryReservation;
  const zopaWidth = zopaExists ? negoState.adversaryReservation - negoState.userReservation : 0;
  const zopaMidpoint = zopaExists ? (negoState.userReservation + negoState.adversaryReservation) / 2 : null;

  return {
    zopaExists,
    zopaWidth,
    zopaMidpoint,
    userDistanceToReservation: negoState.currentOffer !== null
      ? Math.abs(negoState.currentOffer - negoState.userReservation)
      : null,
    adversaryDistanceToReservation: negoState.currentOffer !== null
      ? Math.abs(negoState.currentOffer - negoState.adversaryReservation)
      : null,
    dealQuality: negoState.currentOffer !== null && zopaExists
      ? clamp(Math.round(((negoState.currentOffer - negoState.userReservation) / (zopaWidth || 1)) * 100), 0, 100)
      : null,
  };
}

/**
 * Compute momentum trend.
 */
export function getMomentumTrend(negoState) {
  const h = negoState.momentumHistory;
  if (h.length < 2) return 'stable';
  const recent = h.slice(-3);
  const diff = recent[recent.length - 1] - recent[0];
  if (diff > 10) return 'gaining';
  if (diff < -10) return 'losing';
  return 'stable';
}

// ============================================================
// LAYER 3 — World State (combines emotional + negotiation)
// ============================================================

/**
 * Create a complete WorldEngine state.
 */
export function createWorldState(brief, adversary) {
  // Convert adversary emotional profile to PAD
  const ep = adversary.emotionalProfile || { confidence: 60, frustration: 20, egoThreat: 10 };
  const initialPAD = {
    pleasure: clamp(30 - ep.frustration * 0.5, -100, 100),
    arousal: clamp(ep.frustration * 0.6 + ep.egoThreat * 0.4, 0, 100),
    dominance: clamp(ep.confidence - 50, -100, 100),
  };

  return {
    pad: createEmotionalState(initialPAD),
    emotions: deriveEmotions(createEmotionalState(initialPAD)),
    negotiation: createNegotiationState(brief, adversary),
    turn: 0,
  };
}

/**
 * Process a turn through the WorldEngine.
 * Takes detected stimuli and updates the entire world state deterministically.
 * Returns the new state + a summary for the LLM prompt.
 */
export function processTurnWorld(worldState, stimuli = []) {
  let pad = { ...worldState.pad };

  // Apply all stimuli
  for (const { type, intensity } of stimuli) {
    pad = applyStimulus(pad, type, intensity ?? 1.0);
  }

  // Natural decay
  pad = decayPAD(pad);

  // Derive emotions
  const emotions = deriveEmotions(pad);

  // Update momentum based on emotional shifts
  const oldEmotions = worldState.emotions;
  const confidenceDelta = oldEmotions.confidence - emotions.confidence;
  const momentumDelta = Math.round(confidenceDelta * 0.3 + (emotions.fear - oldEmotions.fear) * 0.2);
  updateMomentum(worldState.negotiation, momentumDelta);

  const newState = {
    pad,
    emotions,
    negotiation: worldState.negotiation,
    turn: worldState.turn + 1,
  };

  return newState;
}

/**
 * Generate a state summary string for the LLM prompt.
 * The LLM reads this to adapt its tone — but does NOT set these values.
 */
export function worldStateToPrompt(worldState) {
  const e = worldState.emotions;
  const n = worldState.negotiation;
  const zopa = analyzeZOPA(n);
  const trend = getMomentumTrend(n);

  // Emotion descriptors
  const emoDesc = [];
  if (e.confidence > 70) emoDesc.push('very confident');
  else if (e.confidence < 30) emoDesc.push('feeling insecure');
  if (e.frustration > 60) emoDesc.push('frustrated');
  if (e.fear > 40) emoDesc.push('worried about losing this deal');
  if (e.contempt > 50) emoDesc.push('contemptuous toward the other party');
  if (e.openness > 60) emoDesc.push('open to finding a solution');
  else if (e.openness < 30) emoDesc.push('closed off and defensive');
  if (e.egoThreat > 50) emoDesc.push('ego is threatened');

  const emotionalSummary = emoDesc.length > 0 ? emoDesc.join(', ') : 'emotionally neutral';

  return `WORLD STATE (computed — do NOT override these values):
Emotional state: ${emotionalSummary}
Confidence: ${e.confidence}/100 | Frustration: ${e.frustration}/100 | Fear: ${e.fear}/100
Openness: ${e.openness}/100 | Ego threat: ${e.egoThreat}/100
Leverage balance: ${n.leverageBalance} (${n.leverageBalance > 0 ? 'user has leverage' : n.leverageBalance < 0 ? 'you have leverage' : 'balanced'})
Momentum: ${n.momentum} (${trend})
User concession rate: ${n.userConcessionRate.toFixed(1)} | Your concession rate: ${n.adversaryConcessionRate.toFixed(1)}
${zopa.dealQuality !== null ? `Current deal quality for user: ${zopa.dealQuality}%` : 'No offer on the table yet.'}

INSTRUCTIONS: Respond in character reflecting this emotional state. If frustrated, show it. If afraid, try to hide it but let it leak through. If confident, be assertive. Your TEXT must match these computed emotions.`;
}

// ============================================================
// Exports for testing
// ============================================================

export { STIMULUS_IMPACTS };
