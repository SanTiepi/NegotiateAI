// difficulty.mjs — Adaptive Difficulty Engine
// Based on Ericsson's deliberate practice and Vygotsky's Zone of Proximal Development.
// Contract: pure computation, no LLM calls, no async.
//
// 5 independent axes (0-100):
//   adversaryPushback, tacticalComplexity, emotionalVolatility, hiddenInformation, timePressure
//
// Scoring dimension mapping (axis ↔ scoring dimension):
//   pushback ↔ outcomeLeverage
//   complexity ↔ biasResistance
//   volatility ↔ emotionalRegulation
//   hidden ↔ batnaDiscipline
//   pressure ↔ conversationalFlow

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AXIS_MIN = 10;
const AXIS_MAX = 95;
const STEP_MIN = 5;
const STEP_MAX = 10;
const ZPD_LOW = 40;
const ZPD_HIGH = 65;
const HIGH_SCORE_THRESHOLD = 0.70; // > 70% of max → increase challenge
const LOW_SCORE_THRESHOLD = 0.40;  // < 40% of max → decrease challenge
const ZPD_SESSIONS = 5;           // look at last N sessions

// Scoring dimension max values (from analyzer.mjs)
const SCORE_MAX = {
  outcomeLeverage: 25,
  batnaDiscipline: 20,
  emotionalRegulation: 25,
  biasResistance: 15,
  conversationalFlow: 15,
};

// Axis ↔ scoring dimension mapping
const AXIS_TO_SCORE = {
  adversaryPushback: 'outcomeLeverage',
  tacticalComplexity: 'biasResistance',
  emotionalVolatility: 'emotionalRegulation',
  hiddenInformation: 'batnaDiscipline',
  timePressure: 'conversationalFlow',
};

const AXES = Object.keys(AXIS_TO_SCORE);

// Axis weights for the overall score
const AXIS_WEIGHTS = {
  adversaryPushback: 0.25,
  tacticalComplexity: 0.20,
  emotionalVolatility: 0.20,
  hiddenInformation: 0.20,
  timePressure: 0.15,
};

// Preset definitions (backward compatible)
const PRESETS = {
  cooperative: {
    adversaryPushback: 20,
    tacticalComplexity: 15,
    emotionalVolatility: 10,
    hiddenInformation: 10,
    timePressure: 15,
  },
  neutral: {
    adversaryPushback: 45,
    tacticalComplexity: 40,
    emotionalVolatility: 35,
    hiddenInformation: 35,
    timePressure: 40,
  },
  hostile: {
    adversaryPushback: 70,
    tacticalComplexity: 60,
    emotionalVolatility: 65,
    hiddenInformation: 50,
    timePressure: 60,
  },
  manipulative: {
    adversaryPushback: 60,
    tacticalComplexity: 85,
    emotionalVolatility: 55,
    hiddenInformation: 90,
    timePressure: 50,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value) {
  return Math.max(AXIS_MIN, Math.min(AXIS_MAX, Math.round(value)));
}

function computeOverall(profile) {
  let sum = 0;
  for (const axis of AXES) {
    sum += profile[axis] * AXIS_WEIGHTS[axis];
  }
  return Math.round(sum);
}

function makeProfile(axes) {
  const profile = {};
  for (const axis of AXES) {
    profile[axis] = clamp(axes[axis] ?? PRESETS.neutral[axis]);
  }
  profile.overall = computeOverall(profile);
  return profile;
}

/**
 * Compute the adjustment delta for one axis based on the user's score ratio.
 * Positive → increase difficulty, negative → decrease.
 * Magnitude is proportional to distance from the threshold but capped to STEP_MAX.
 */
function axisAdjustment(scoreRatio) {
  if (scoreRatio > HIGH_SCORE_THRESHOLD) {
    // User is strong here — push harder
    const strength = (scoreRatio - HIGH_SCORE_THRESHOLD) / (1 - HIGH_SCORE_THRESHOLD);
    return Math.round(STEP_MIN + strength * (STEP_MAX - STEP_MIN));
  }
  if (scoreRatio < LOW_SCORE_THRESHOLD) {
    // User is struggling — ease off
    const weakness = (LOW_SCORE_THRESHOLD - scoreRatio) / LOW_SCORE_THRESHOLD;
    return -Math.round(STEP_MIN + weakness * (STEP_MAX - STEP_MIN));
  }
  // In the sweet spot — no adjustment
  return 0;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Convert an old-style preset name to a 5-axis DifficultyProfile.
 * @param {string} preset — 'cooperative' | 'neutral' | 'hostile' | 'manipulative'
 * @returns {DifficultyProfile}
 */
export function presetToProfile(preset) {
  const base = PRESETS[preset];
  if (!base) throw new Error(`Unknown preset: ${preset}`);
  return makeProfile(base);
}

/**
 * Compute optimal difficulty from session history.
 * Sessions are newest-first. Uses the most recent session's scores and difficulty
 * to compute the next profile. Returns neutral if no sessions.
 *
 * @param {Array} sessions — session objects with .feedback.scores and .difficulty
 * @returns {DifficultyProfile}
 */
export function computeDifficulty(sessions) {
  if (!sessions || sessions.length === 0) {
    return presetToProfile('neutral');
  }

  const latest = sessions[0];
  const scores = latest.feedback?.scores;

  // Determine the base profile — either the session's existing 5-axis profile
  // or convert its preset, or fall back to neutral.
  let base;
  if (latest.difficulty && typeof latest.difficulty === 'object' && 'adversaryPushback' in latest.difficulty) {
    base = { ...latest.difficulty };
  } else if (latest.brief?.difficulty && typeof latest.brief.difficulty === 'string') {
    base = presetToProfile(latest.brief.difficulty);
  } else {
    base = presetToProfile('neutral');
  }

  if (!scores) return makeProfile(base);

  // Apply per-axis adjustments based on scoring dimensions
  const adjusted = {};
  for (const axis of AXES) {
    const scoreDim = AXIS_TO_SCORE[axis];
    const maxVal = SCORE_MAX[scoreDim];
    const actual = scores[scoreDim] ?? 0;
    const ratio = actual / maxVal;
    const delta = axisAdjustment(ratio);
    adjusted[axis] = (base[axis] ?? PRESETS.neutral[axis]) + delta;
  }

  return makeProfile(adjusted);
}

/**
 * Assess whether the user is in their Zone of Proximal Development.
 * Uses the last ZPD_SESSIONS sessions (newest-first).
 *
 * @param {Array} sessions
 * @returns {{ zone: 'too_easy'|'optimal'|'too_hard', avgScore: number, recommendation: string }}
 */
export function assessZPD(sessions) {
  if (!sessions || sessions.length === 0) {
    return {
      zone: 'optimal',
      avgScore: 50,
      recommendation: 'No session history. Starting at neutral difficulty.',
    };
  }

  const recent = sessions.slice(0, ZPD_SESSIONS);
  const scores = recent
    .map((s) => s.feedback?.globalScore ?? null)
    .filter((s) => s !== null);

  if (scores.length === 0) {
    return {
      zone: 'optimal',
      avgScore: 50,
      recommendation: 'No scored sessions found. Keeping current difficulty.',
    };
  }

  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  if (avgScore > ZPD_HIGH) {
    return {
      zone: 'too_easy',
      avgScore,
      recommendation: `Average score ${avgScore}/100 is above the ZPD ceiling (${ZPD_HIGH}). Increase difficulty to maintain deliberate practice.`,
    };
  }
  if (avgScore < ZPD_LOW) {
    return {
      zone: 'too_hard',
      avgScore,
      recommendation: `Average score ${avgScore}/100 is below the ZPD floor (${ZPD_LOW}). Decrease difficulty to avoid frustration and build confidence.`,
    };
  }
  return {
    zone: 'optimal',
    avgScore,
    recommendation: `Average score ${avgScore}/100 is within the Zone of Proximal Development (${ZPD_LOW}-${ZPD_HIGH}). Current difficulty is well-calibrated.`,
  };
}

/**
 * Convert a 5-axis DifficultyProfile to clear natural-language instructions
 * that can be injected into an LLM system prompt.
 *
 * @param {DifficultyProfile} profile
 * @returns {string}
 */
export function profileToPromptInstructions(profile) {
  const label = (v) => {
    if (v <= 20) return 'VERY LOW';
    if (v <= 40) return 'LOW';
    if (v <= 60) return 'MODERATE';
    if (v <= 80) return 'HIGH';
    return 'VERY HIGH';
  };

  const lines = [];

  // Adversary pushback
  const pb = profile.adversaryPushback;
  lines.push(`Resistance level: ${label(pb)} (${pb}/100).`);
  if (pb <= 30) lines.push('Concede readily when the user makes reasonable arguments.');
  else if (pb <= 60) lines.push('Push back on some points but be willing to compromise.');
  else lines.push('Resist concessions strongly. Require significant justification before yielding.');

  // Tactical complexity
  const tc = profile.tacticalComplexity;
  lines.push(`Tactical complexity: ${label(tc)} (${tc}/100).`);
  if (tc <= 30) lines.push('Keep your approach straightforward — one tactic at a time.');
  else if (tc <= 60) lines.push('Use occasional persuasion tactics (anchoring, framing).');
  else lines.push('Use multiple tactics per message. Layer Cialdini principles (reciprocity, scarcity, authority, social proof).');

  // Emotional volatility
  const ev = profile.emotionalVolatility;
  lines.push(`Emotional volatility: ${label(ev)} (${ev}/100).`);
  if (ev <= 30) lines.push('Maintain a stable, professional tone throughout.');
  else if (ev <= 60) lines.push('Show moderate emotional volatility — shift between calm and impatient.');
  else lines.push('Display rapid emotional shifts — go from friendly to hostile with little warning. Use frustration and urgency as pressure tools.');

  // Hidden information
  const hi = profile.hiddenInformation;
  lines.push(`Hidden information: ${label(hi)} (${hi}/100).`);
  if (hi <= 30) lines.push('Be relatively transparent about your constraints and interests.');
  else if (hi <= 60) lines.push('Withhold some information. Do not reveal your full flexibility.');
  else lines.push('Conceal your true BATNA. Use misleading statements about your constraints. Introduce hidden agendas mid-negotiation.');

  // Time pressure
  const tp = profile.timePressure;
  lines.push(`Time pressure: ${label(tp)} (${tp}/100).`);
  if (tp <= 30) lines.push('Allow the negotiation to proceed at a relaxed pace.');
  else if (tp <= 60) lines.push('Apply moderate time pressure. Mention deadlines occasionally.');
  else lines.push('Apply extreme deadline pressure. Emphasize urgency in every exchange. Threaten to walk away if agreement is not reached quickly.');

  return lines.join(' ');
}
