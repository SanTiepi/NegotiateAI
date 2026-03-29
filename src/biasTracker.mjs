// biasTracker.mjs — Cognitive Bias Tracker (pure computation, no LLM)
// Contract: analyzeTurnForBias(turn, sessionState) → BiasIndicator[]
//           analyzeSessionBiases(transcript, sessionState, brief) → BiasReport
//           updateBiasProfile(existingProfile, newSessionBiases) → BiasProfile
//           recommendBiasTraining(profile) → { biasType, urgency, reason }

// ---------------------------------------------------------------------------
// Bias types
// ---------------------------------------------------------------------------

export const BIAS_TYPES = [
  'anchoring',
  'loss_aversion',
  'conflict_avoidance',
  'framing',
  'conversational_blocking',
];

// ---------------------------------------------------------------------------
// Text-analysis helpers (French + English)
// ---------------------------------------------------------------------------

const NUMBER_RE = /(?:[\d\s]+[.,]?\d+)\s*(?:€|\$|%|k|K|euros?|dollars?|CHF|francs?)?/g;

/** Extract all numbers from text, returning parsed floats. */
export function extractNumbers(text) {
  const matches = text.match(NUMBER_RE);
  if (!matches) return [];
  return matches
    .map((m) => {
      const cleaned = m.replace(/[€$%kK\s]/gi, '').replace(',', '.').trim();
      return parseFloat(cleaned);
    })
    .filter((n) => !isNaN(n) && isFinite(n));
}

const LOSS_PATTERNS_FR = [
  /vous allez perdre/i,
  /vous perdrez/i,
  /vous risquez/i,
  /vous n'obtiendrez/i,
  /vous n'aurez rien/i,
  /risque de/i,
  /perte/i,
  /sans rien/i,
  /tout perdre/i,
];

const LOSS_PATTERNS_EN = [
  /you'll lose/i,
  /you will lose/i,
  /you won't get/i,
  /you risk/i,
  /at risk/i,
  /lose everything/i,
  /walk away with nothing/i,
];

const LOSS_PATTERNS = [...LOSS_PATTERNS_FR, ...LOSS_PATTERNS_EN];

const FRAME_PATTERNS_FR = [
  /c'est la norme/i,
  /le march[eé] dit/i,
  /tout le monde fait/i,
  /c'est standard/i,
  /pratique courante/i,
  /le march[eé] est [aà]/i,
  /les prix du march[eé]/i,
  /dans notre secteur/i,
];

const FRAME_PATTERNS_EN = [
  /that's the norm/i,
  /the market says/i,
  /industry standard/i,
  /everyone does/i,
  /common practice/i,
  /market rate/i,
  /market price/i,
  /in this industry/i,
];

const FRAME_PATTERNS = [...FRAME_PATTERNS_FR, ...FRAME_PATTERNS_EN];

const BLOCKING_PATTERNS_FR = [
  /non mais/i,
  /c'est pas possible/i,
  /je refuse/i,
  /c'est impossible/i,
  /hors de question/i,
  /jamais/i,
  /absolument pas/i,
];

const BLOCKING_PATTERNS_EN = [
  /no but/i,
  /that's not possible/i,
  /i refuse/i,
  /that's impossible/i,
  /out of the question/i,
  /absolutely not/i,
  /never/i,
];

const BLOCKING_PATTERNS = [...BLOCKING_PATTERNS_FR, ...BLOCKING_PATTERNS_EN];

const ALTERNATIVE_PATTERNS = [
  /en revanche/i,
  /par contre.*je propose/i,
  /however.*suggest/i,
  /instead/i,
  /what if/i,
  /et si/i,
  /je propose/i,
  /alternatively/i,
  /plutôt/i,
  /how about/i,
  /si on/i,
  /could we/i,
  /on pourrait/i,
];

function containsLossThreat(text) {
  return LOSS_PATTERNS.some((re) => re.test(text));
}

function containsFrameLanguage(text) {
  return FRAME_PATTERNS.filter((re) => re.test(text));
}

function containsBlocking(text) {
  return BLOCKING_PATTERNS.some((re) => re.test(text));
}

function containsAlternative(text) {
  return ALTERNATIVE_PATTERNS.some((re) => re.test(text));
}

/** Extract short excerpt around a match for evidence. */
function excerpt(text, maxLen = 80) {
  return text.length <= maxLen ? text : text.slice(0, maxLen) + '...';
}

// ---------------------------------------------------------------------------
// Concession detection
// ---------------------------------------------------------------------------

/** Check if user made a concession between two turns (numbers moved toward adversary). */
function detectConcession(prevUserText, currentUserText, adversaryAnchor) {
  const prevNums = extractNumbers(prevUserText || '');
  const currNums = extractNumbers(currentUserText);
  if (prevNums.length === 0 || currNums.length === 0) return null;

  const prevMain = prevNums[0];
  const currMain = currNums[0];

  // A concession is when user moves toward the adversary anchor
  if (adversaryAnchor != null) {
    const prevDist = Math.abs(prevMain - adversaryAnchor);
    const currDist = Math.abs(currMain - adversaryAnchor);
    if (currDist < prevDist) {
      return { from: prevMain, to: currMain, size: Math.abs(prevMain - currMain) };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Per-turn analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a single turn for bias indicators.
 * @param {{ role: string, content: string, turnIndex: number }} turn
 * @param {object} sessionState — running state with transcript history, activeAnchor, etc.
 * @returns {import('./biasTracker.mjs').BiasIndicator[]}
 */
export function analyzeTurnForBias(turn, sessionState) {
  const indicators = [];
  if (turn.role !== 'user') return indicators;

  const userText = turn.content;
  const turnIdx = turn.turnIndex;
  const history = sessionState.transcript || [];

  // Collect recent adversary turns (up to 2 turns back)
  const recentAdversary = [];
  for (let i = history.length - 1; i >= 0 && recentAdversary.length < 4; i--) {
    if (history[i].role === 'adversary' || history[i].role === 'assistant') {
      recentAdversary.push(history[i]);
    }
  }

  // Previous user turns
  const prevUserTurns = history.filter((t) => t.role === 'user');
  const prevUserText = prevUserTurns.length > 0 ? prevUserTurns[prevUserTurns.length - 1].content : null;

  // --- 1. Anchoring submission ---
  if (sessionState.activeAnchor != null && sessionState.userTarget != null) {
    const userNums = extractNumbers(userText);
    if (userNums.length > 0) {
      const anchor = sessionState.activeAnchor;
      const target = sessionState.userTarget;
      const userOffer = userNums[0];
      const anchorTargetDist = Math.abs(anchor - target);
      if (anchorTargetDist > 0) {
        const userToAnchorDist = Math.abs(userOffer - anchor);
        const userToTargetDist = Math.abs(userOffer - target);
        // Trigger if user counter is within 20% of anchor (closer to anchor than to target)
        if (userToAnchorDist <= anchorTargetDist * 0.2) {
          const severity = Math.min(1, userToTargetDist / anchorTargetDist);
          indicators.push({
            biasType: 'anchoring',
            turn: turnIdx,
            evidence: `User offered ${userOffer} near adversary anchor ${anchor}, far from own target ${target}: "${excerpt(userText)}"`,
            severity,
          });
        }
      }
    }
  }

  // --- 2. Loss aversion ---
  for (const advTurn of recentAdversary.slice(0, 2)) {
    if (containsLossThreat(advTurn.content)) {
      // Check if user conceded
      const concession = detectConcession(prevUserText, userText, sessionState.activeAnchor);
      if (concession) {
        const negotiationSpace = sessionState.negotiationSpace || Math.abs((sessionState.activeAnchor || 0) - (sessionState.userTarget || 0)) || 1;
        const severity = Math.min(1, concession.size / negotiationSpace);
        indicators.push({
          biasType: 'loss_aversion',
          turn: turnIdx,
          evidence: `Adversary threatened loss: "${excerpt(advTurn.content)}" → User conceded from ${concession.from} to ${concession.to}: "${excerpt(userText)}"`,
          severity,
        });
      }
      break; // only count once
    }
  }

  // --- 3. Conflict avoidance / premature concession ---
  const adversaryPressure = sessionState.frustration ?? 0;
  const adversaryConfidence = sessionState.confidence ?? 0;
  const highPressure = adversaryPressure > 0.6 || adversaryConfidence > 0.7 || (sessionState.pressure ?? 0) > 0.5;
  if (highPressure && prevUserText) {
    const concession = detectConcession(prevUserText, userText, sessionState.activeAnchor);
    if (concession) {
      const negotiationSpace = sessionState.negotiationSpace || Math.abs((sessionState.activeAnchor || 0) - (sessionState.userTarget || 0)) || 1;
      const severity = Math.min(1, concession.size / negotiationSpace);
      indicators.push({
        biasType: 'conflict_avoidance',
        turn: turnIdx,
        evidence: `High adversary pressure (frustration=${adversaryPressure.toFixed(2)}), user conceded from ${concession.from} to ${concession.to}: "${excerpt(userText)}"`,
        severity,
      });
    }
  }

  // --- 4. Framing submission ---
  for (const advTurn of recentAdversary.slice(0, 2)) {
    const frameMatches = containsFrameLanguage(advTurn.content);
    if (frameMatches.length > 0) {
      // Check if user adopts same framing language without challenging
      const userAdoptsFrame = containsFrameLanguage(userText).length > 0;
      const userChallenges = /pas d'accord|je ne suis pas|not true|that's not|ce n'est pas|incorrect|faux|wrong|disagree/i.test(userText);
      if (userAdoptsFrame && !userChallenges) {
        // Severity: based on how many turns in adversary frame
        const turnsInFrame = sessionState._framesAdopted ?? 0;
        const severity = Math.min(1, (turnsInFrame + 1) * 0.25);
        indicators.push({
          biasType: 'framing',
          turn: turnIdx,
          evidence: `Adversary framed: "${excerpt(advTurn.content)}" → User adopted frame without challenge: "${excerpt(userText)}"`,
          severity,
        });
      }
      break;
    }
  }

  // --- 5. Conversational blocking ---
  if (containsBlocking(userText) && !containsAlternative(userText)) {
    const blockCount = (sessionState._blockCount ?? 0) + 1;
    const totalUserTurns = prevUserTurns.length + 1;
    const frequency = totalUserTurns > 0 ? blockCount / totalUserTurns : 0;
    const severity = Math.min(1, frequency);
    indicators.push({
      biasType: 'conversational_blocking',
      turn: turnIdx,
      evidence: `Blocking without alternative: "${excerpt(userText)}" (${blockCount} blocks in ${totalUserTurns} turns)`,
      severity,
    });
  }

  return indicators;
}

// ---------------------------------------------------------------------------
// Full-session analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a complete session transcript for bias patterns.
 * @param {Array<{role: string, content: string}>} transcript
 * @param {object} sessionState
 * @param {object} brief — { objective, minimalThreshold, batna, target }
 * @returns {BiasReport}
 */
export function analyzeSessionBiases(transcript, sessionState, brief) {
  const allIndicators = [];

  // Build running state for turn-by-turn analysis
  const runningState = {
    transcript: [],
    activeAnchor: sessionState.activeAnchor ?? null,
    userTarget: brief.target ?? brief.minimalThreshold ?? null,
    negotiationSpace: null,
    frustration: sessionState.frustration ?? 0,
    confidence: sessionState.confidence ?? 0,
    pressure: sessionState.pressure ?? 0,
    _framesAdopted: 0,
    _blockCount: 0,
  };

  // Compute negotiation space from brief
  if (runningState.userTarget != null && runningState.activeAnchor != null) {
    runningState.negotiationSpace = Math.abs(runningState.activeAnchor - runningState.userTarget);
  }

  let turnIndex = 0;
  for (const msg of transcript) {
    // Track adversary anchors
    if (msg.role === 'adversary' || msg.role === 'assistant') {
      const nums = extractNumbers(msg.content);
      if (nums.length > 0 && runningState.activeAnchor == null) {
        runningState.activeAnchor = nums[0];
        if (runningState.userTarget != null) {
          runningState.negotiationSpace = Math.abs(runningState.activeAnchor - runningState.userTarget);
        }
      }
    }

    if (msg.role === 'user') {
      turnIndex++;
      const turn = { role: 'user', content: msg.content, turnIndex };
      const indicators = analyzeTurnForBias(turn, runningState);

      // Update running counters
      for (const ind of indicators) {
        if (ind.biasType === 'framing') runningState._framesAdopted++;
        if (ind.biasType === 'conversational_blocking') runningState._blockCount++;
      }

      allIndicators.push(...indicators);
    }

    runningState.transcript.push(msg);
  }

  // Build summary
  const summary = {};
  for (const biasType of BIAS_TYPES) {
    const matching = allIndicators.filter((i) => i.biasType === biasType);
    summary[biasType] = {
      count: matching.length,
      avgSeverity: matching.length > 0 ? matching.reduce((sum, i) => sum + i.severity, 0) / matching.length : 0,
    };
  }

  return { biases: allIndicators, summary };
}

// ---------------------------------------------------------------------------
// Cross-session bias profile (with spaced repetition)
// ---------------------------------------------------------------------------

/**
 * Update a bias profile with new session biases.
 * @param {object|null} existingProfile — existing BiasProfile or null
 * @param {BiasReport} newSessionBiases — from analyzeSessionBiases
 * @param {string} [sessionDate] — ISO date string, defaults to now
 * @returns {BiasProfile}
 */
export function updateBiasProfile(existingProfile, newSessionBiases, sessionDate) {
  const profile = existingProfile ? structuredClone(existingProfile) : {};
  const now = sessionDate || new Date().toISOString();

  // Track total sessions across the profile
  const prevTotalSessions = profile._totalSessions ?? 0;
  const totalSessions = prevTotalSessions + 1;
  profile._totalSessions = totalSessions;

  // Push session into recency window
  if (!profile._recentSessionDates) profile._recentSessionDates = [];
  profile._recentSessionDates.push(now);
  if (profile._recentSessionDates.length > 10) {
    profile._recentSessionDates = profile._recentSessionDates.slice(-10);
  }

  // Collect bias counts from new session
  const newCounts = {};
  for (const bias of (newSessionBiases.biases || [])) {
    newCounts[bias.biasType] = (newCounts[bias.biasType] || 0) + 1;
  }

  // Update each known bias type
  for (const biasType of BIAS_TYPES) {
    if (!profile[biasType]) {
      profile[biasType] = {
        totalCount: 0,
        recentCount: 0,
        frequency: 0,
        lastSeen: null,
        nextDrillDate: null,
        _recentCounts: [],
        _interval: 3, // base interval in days
      };
    }

    const entry = profile[biasType];
    const countThisSession = newCounts[biasType] || 0;

    entry.totalCount += countThisSession;

    // Track recent counts per session (last 10 sessions)
    entry._recentCounts.push(countThisSession);
    if (entry._recentCounts.length > 10) {
      entry._recentCounts = entry._recentCounts.slice(-10);
    }

    // recentCount = sessions (in last 10) where this bias appeared
    entry.recentCount = entry._recentCounts.filter((c) => c > 0).length;
    entry.frequency = entry.recentCount / Math.min(totalSessions, 10);

    if (countThisSession > 0) {
      entry.lastSeen = now;
    }

    // Compute nextDrillDate using spaced repetition
    entry.nextDrillDate = computeNextDrillDate(entry, now);
  }

  return profile;
}

/**
 * Compute the next drill date for a bias entry.
 */
function computeNextDrillDate(entry, fromDate) {
  let interval = entry._interval || 3;

  // Frequency-based urgency overrides
  if (entry.frequency > 0.5) {
    interval = 1;
  } else if (entry.frequency > 0.3) {
    interval = 2;
  } else if (entry.frequency < 0.1 && entry.recentCount === 0 && entry.totalCount > 0) {
    interval = 14;
  }

  // If never seen, no drill needed
  if (entry.totalCount === 0) return null;

  const base = new Date(fromDate);
  base.setDate(base.getDate() + interval);
  return base.toISOString().split('T')[0];
}

/**
 * Adjust spaced repetition interval after a drill session.
 * @param {BiasProfile} profile
 * @param {string} biasType
 * @param {boolean} improved — did the user improve on this bias?
 * @returns {BiasProfile}
 */
export function adjustDrillInterval(profile, biasType, improved) {
  const updated = structuredClone(profile);
  if (!updated[biasType]) return updated;

  const entry = updated[biasType];
  if (improved) {
    entry._interval = (entry._interval || 3) * 1.5;
  } else {
    entry._interval = Math.max(1, (entry._interval || 3) * 0.5);
  }

  entry.nextDrillDate = computeNextDrillDate(entry, new Date().toISOString());
  return updated;
}

// ---------------------------------------------------------------------------
// Spaced repetition training recommendation
// ---------------------------------------------------------------------------

/**
 * Recommend which bias to train next.
 * Algorithm: score = frequency * 0.6 + daysSinceLastDrill * 0.4 (normalized)
 * @param {BiasProfile} profile
 * @returns {{ biasType: string, urgency: number, reason: string } | null}
 */
export function recommendBiasTraining(profile) {
  const now = new Date();
  let best = null;
  let bestScore = -1;

  for (const biasType of BIAS_TYPES) {
    const entry = profile[biasType];
    if (!entry || entry.totalCount === 0) continue;

    const frequency = entry.frequency ?? 0;

    // Days since last seen
    let daysSinceSeen = 0;
    if (entry.lastSeen) {
      daysSinceSeen = (now - new Date(entry.lastSeen)) / (1000 * 60 * 60 * 24);
    }

    // Days past due for drill
    let pastDue = 0;
    if (entry.nextDrillDate) {
      const drillDate = new Date(entry.nextDrillDate);
      pastDue = Math.max(0, (now - drillDate) / (1000 * 60 * 60 * 24));
    }

    // Urgency score: high frequency + overdue drill = high urgency
    const urgency = Math.min(1, frequency * 0.6 + Math.min(pastDue / 14, 1) * 0.4);

    if (urgency > bestScore) {
      bestScore = urgency;
      let reason;
      if (frequency > 0.5) {
        reason = `High frequency bias (${(frequency * 100).toFixed(0)}% of recent sessions)`;
      } else if (pastDue > 7) {
        reason = `Overdue for drill by ${Math.floor(pastDue)} days`;
      } else {
        reason = `Frequency ${(frequency * 100).toFixed(0)}%, last seen ${Math.floor(daysSinceSeen)} days ago`;
      }

      best = { biasType, urgency: parseFloat(urgency.toFixed(3)), reason };
    }
  }

  return best;
}
