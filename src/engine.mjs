// engine.mjs — Conversation loop orchestrator with WorldEngine V2
// The LLM generates TEXT. The WorldEngine computes STATE.
// Contract: createSession(brief, adversary, provider, options?) → Session
//           processTurn(session, userMessage) → TurnResult

import { selectEvent, applyEvent } from './events.mjs';
import { createWorldState, processTurnWorld, worldStateToPrompt, applyStimulus } from './worldEngine.mjs';
import { detectAdversaryTactics, detectUserTechniques } from './tactics.mjs';
import { analyzeTurnForBias } from './biasTracker.mjs';
import { computeTicker } from './ticker.mjs';
import { selectNarrativeEvent, getEventProbability, getNarrativePrompt, formatActTransition } from './narrativeArc.mjs';
import { buildCoachingLevels } from './coach.mjs';

const MAX_TURNS_DEFAULT = 12;

const CLI_COMMANDS = {
  '/end': 'ended',
  '/quit': 'quit',
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Map detected user techniques to WorldEngine stimuli.
 */
function techniquesToStimuli(techniques) {
  const map = {
    mirroring: 'user_mirror',
    labeling: 'user_label',
    calibratedQuestion: 'user_calibrated_q',
    accusationAudit: 'user_empathy',
    strategicSilence: 'user_silence',
    anchoringFirst: 'user_anchor_high',
    reframing: 'user_reframe',
  };
  return techniques
    .map((t) => ({ type: map[t.technique] || null, intensity: t.quality || 1.0 }))
    .filter((s) => s.type);
}

/**
 * Creates a new negotiation session.
 */
export function createSession(brief, adversary, provider, options = {}) {
  const worldState = createWorldState(brief, adversary);
  const emotions = worldState.emotions;

  return {
    turn: 0,
    transcript: [],
    // V1 compat: derived from WorldEngine
    confidence: emotions.confidence,
    frustration: emotions.frustration,
    egoThreat: emotions.egoThreat,
    pressure: 0,
    momentum: 0,
    activeAnchor: null,
    concessions: [],
    status: 'active',
    brief,
    adversary,
    provider,
    maxTurns: options.maxTurns || MAX_TURNS_DEFAULT,
    eventPolicy: options.eventPolicy || 'none',
    eventChance: options.eventChance ?? 0.3,
    _usedEventIds: [],
    // V2: WorldEngine state
    _world: worldState,
  };
}

/**
 * Processes one turn of negotiation.
 * V2: WorldEngine computes state, tactics detector analyzes text, LLM only generates response.
 */
export async function processTurn(session, userMessage) {
  const trimmed = userMessage.trim().toLowerCase();

  // Handle CLI commands
  if (CLI_COMMANDS[trimmed]) {
    session.status = CLI_COMMANDS[trimmed];
    return {
      adversaryResponse: '',
      detectedSignals: [],
      state: session,
      sessionOver: true,
      endReason: `User command: ${trimmed}`,
      coaching: null,
      event: null,
      tactics: null,
      biasIndicators: [],
    };
  }

  const nextTurn = session.turn + 1;
  const isLastTurn = nextTurn >= session.maxTurns;

  // --- STEP 1: Detect user techniques (algorithmic, no LLM) ---
  const adversaryLastMsg = session.transcript.length > 0
    ? session.transcript[session.transcript.length - 1]?.content || ''
    : '';
  const sessionContext = {
    transcript: session.transcript,
    turn: nextTurn,
    activeAnchor: session.activeAnchor,
    firstAnchorBy: session._world?.negotiation?.firstAnchorBy || null,
  };
  const userTechniques = detectUserTechniques(userMessage, adversaryLastMsg, sessionContext);

  // --- STEP 2: Convert techniques to stimuli + process WorldEngine ---
  const stimuli = techniquesToStimuli(userTechniques);
  session._world = processTurnWorld(session._world, stimuli);

  // --- STEP 3: Event injection via Narrative Arc ---
  let firedEvent = null;
  const actTransition = formatActTransition(nextTurn, session.maxTurns);

  if (session.eventPolicy !== 'none') {
    // Use narrative arc for structured event timing (not random)
    const eventProb = getEventProbability(nextTurn, session.maxTurns, session);
    if (Math.random() < eventProb) {
      firedEvent = selectNarrativeEvent(nextTurn, session.maxTurns, session);
      if (firedEvent) {
        applyEvent(session, firedEvent);
        session._usedEventIds.push(firedEvent.id);
      }
    }
  }

  // --- STEP 4: Build LLM prompt with WorldEngine state ---
  const transcriptText = [
    ...session.transcript,
    { role: 'user', content: userMessage },
  ]
    .map((m) => `${m.role === 'user' ? 'Negotiator' : session.adversary.identity}: ${m.content}`)
    .join('\n');

  const worldPrompt = worldStateToPrompt(session._world);
  const narrativePrompt = getNarrativePrompt(nextTurn, session.maxTurns);
  const eventInstruction = firedEvent
    ? `\n\nIMPORTANT EVENT: ${firedEvent.adversaryInstruction}`
    : '';

  // LLM generates ONLY the adversary's response text — no state computation
  const result = await session.provider.generateJson({
    system: `You are simulating a negotiation adversary. You ARE this person:
${JSON.stringify(session.adversary, null, 2)}

${worldPrompt}
${narrativePrompt}

Turn: ${nextTurn}/${session.maxTurns}
${isLastTurn ? 'This is the FINAL turn. Wrap up — accept, reject, or final compromise.' : ''}${eventInstruction}

Return JSON with: adversaryResponse (string — your in-character response), sessionOver (boolean), endReason (string|null), sessionStatus ("accepted"|"broken"|null).
Do NOT include stateUpdates — the WorldEngine handles state computation.`,
    prompt: `Conversation so far:\n${transcriptText}\n\nThe negotiator just said: "${userMessage}"\n\nRespond as ${session.adversary.identity}.`,
    schemaName: 'turn',
    temperature: 0.7,
  });

  // --- STEP 5: Commit state changes ---
  session.transcript.push({ role: 'user', content: userMessage });
  session.turn = nextTurn;

  const adversaryResponse = result.adversaryResponse || '';
  session.transcript.push({ role: 'adversary', content: adversaryResponse });

  // --- STEP 6: Detect adversary tactics (algorithmic) ---
  const adversaryTactics = detectAdversaryTactics(adversaryResponse, sessionContext);

  // Apply adversary tactic stimuli to WorldEngine
  // (adversary tactics affect the adversary's own emotional state — e.g., escalation boosts their arousal)
  const adversaryStimuli = adversaryTactics.map((t) => {
    if (['scarcity', 'authority'].includes(t.principle)) return { type: 'adversary_escalation', intensity: 0.5 };
    if (t.principle === 'liking') return { type: 'adversary_softening', intensity: 0.5 };
    return null;
  }).filter(Boolean);
  if (adversaryStimuli.length > 0) {
    session._world = processTurnWorld(session._world, adversaryStimuli);
  }

  // --- STEP 7: Sync V1 compat fields from WorldEngine ---
  const emotions = session._world.emotions;
  session.confidence = emotions.confidence;
  session.frustration = emotions.frustration;
  session.egoThreat = emotions.egoThreat;
  session.momentum = session._world.negotiation.momentum;
  session.pressure = clamp(Math.round(emotions.fear * 0.5 + emotions.frustration * 0.3), 0, 100);

  // --- STEP 8: Bias detection (algorithmic) ---
  const biasIndicators = analyzeTurnForBias(
    { userMessage, adversaryMessage: adversaryResponse, turn: nextTurn },
    { confidence: session.confidence, frustration: session.frustration, pressure: session.pressure,
      concessions: session.concessions, activeAnchor: session.activeAnchor },
  );

  // --- STEP 9: Session termination ---
  let sessionOver = isLastTurn || !!result.sessionOver;
  let endReason = result.endReason || null;

  if (isLastTurn && !endReason) {
    endReason = `Maximum turns reached (${session.maxTurns})`;
  }

  if (sessionOver && session.status === 'active') {
    if (result.sessionStatus === 'accepted') session.status = 'accepted';
    else if (result.sessionStatus === 'broken') session.status = 'broken';
    else session.status = 'ended';
  }

  // --- STEP 10: Coaching (LLM, fail-safe) ---
  let coaching = null;
  try {
    const biasNames = biasIndicators.map((b) => b.biasType).join(', ');
    const techNames = userTechniques.map((t) => t.technique).join(', ');
    coaching = await session.provider.generateJson({
      system: `You are a negotiation coach. Give a brief real-time hint. Return JSON: biasDetected (string|null), alternative (string|null), momentum ("gaining"|"losing"|"stable"), tip (string).`,
      prompt: `User: "${userMessage}"\nAdversary: "${adversaryResponse}"\nBiases detected: ${biasNames || 'none'}\nTechniques used: ${techNames || 'none'}\nMomentum: ${session.momentum}\nConfidence: ${session.confidence}`,
      schemaName: 'coaching',
      temperature: 0.3,
    });
  } catch {
    // Non-fatal
  }

  if (coaching) {
    coaching.levels = buildCoachingLevels({
      userMessage,
      adversaryResponse,
      coaching,
      biasIndicators,
      userTechniques,
    });
  }

  // Combine all detected signals
  const detectedSignals = [
    ...adversaryTactics.map((t) => `adversary:${t.principle}`),
    ...userTechniques.map((t) => `user:${t.technique}`),
    ...biasIndicators.map((b) => `bias:${b.biasType}`),
  ];

  // --- STEP 11: Compute ticker ---
  const ticker = computeTicker(session);

  return {
    adversaryResponse,
    detectedSignals,
    state: session,
    sessionOver,
    endReason,
    coaching,
    event: firedEvent,
    tactics: { user: userTechniques, adversary: adversaryTactics },
    biasIndicators,
    ticker,
    actTransition,
  };
}
