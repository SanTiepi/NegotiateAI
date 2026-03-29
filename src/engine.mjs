// engine.mjs — Conversation loop orchestrator with WorldEngine state tracking
// Contract: createSession(brief, adversary, provider) → Session
//           processTurn(session, userMessage) → TurnResult

const MAX_TURNS = 12;

const CLI_COMMANDS = {
  '/end': 'ended',
  '/quit': 'quit',
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Creates a new negotiation session.
 */
export function createSession(brief, adversary, provider) {
  return {
    turn: 0,
    transcript: [],
    confidence: adversary.emotionalProfile.confidence,
    frustration: adversary.emotionalProfile.frustration,
    egoThreat: adversary.emotionalProfile.egoThreat,
    pressure: 0,
    momentum: 0,
    activeAnchor: null,
    concessions: [],
    status: 'active',
    brief,
    adversary,
    provider,
  };
}

/**
 * Processes one turn of negotiation.
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
    };
  }

  // Check turn limit before calling LLM
  const nextTurn = session.turn + 1;
  const isLastTurn = nextTurn >= MAX_TURNS;

  // Build conversation context for the LLM (include current user message in prompt but don't persist yet)
  const transcriptText = [
    ...session.transcript,
    { role: 'user', content: userMessage },
  ]
    .map((m) => `${m.role === 'user' ? 'Negotiator' : session.adversary.identity}: ${m.content}`)
    .join('\n');

  // Call LLM — if this throws, session state is untouched
  const result = await session.provider.generateJson({
    system: `You are simulating a negotiation adversary. You ARE this person:
${JSON.stringify(session.adversary, null, 2)}

Current emotional state: confidence=${session.confidence}, frustration=${session.frustration}, egoThreat=${session.egoThreat}, pressure=${session.pressure}
Current momentum (positive = user gaining ground): ${session.momentum}
Active anchor: ${session.activeAnchor || 'none'}
Concessions so far: ${JSON.stringify(session.concessions)}
Turn: ${nextTurn}/${MAX_TURNS}

Respond in character. Also analyze the user's message for negotiation signals and suggest state updates.
Return JSON with: adversaryResponse, detectedSignals[], stateUpdates: {confidence, frustration, egoThreat?, pressure?, momentum?}, sessionOver (boolean), endReason (string|null), sessionStatus? ("accepted"|"broken"|null), concession? ({by, detail}).
${isLastTurn ? 'This is the FINAL turn. Wrap up the negotiation — either accept, reject, or propose a final compromise.' : ''}`,
    prompt: `Conversation so far:\n${transcriptText}\n\nThe negotiator just said: "${userMessage}"\n\nRespond as ${session.adversary.identity} and analyze.`,
    schemaName: 'turn',
    temperature: 0.7,
  });

  // LLM call succeeded — now commit state changes
  session.transcript.push({ role: 'user', content: userMessage });
  session.turn = nextTurn;

  const adversaryResponse = result.adversaryResponse || '';
  session.transcript.push({ role: 'adversary', content: adversaryResponse });

  // Update WorldEngine state with bounds checking
  if (result.stateUpdates) {
    if (typeof result.stateUpdates.confidence === 'number') session.confidence = clamp(result.stateUpdates.confidence, 0, 100);
    if (typeof result.stateUpdates.frustration === 'number') session.frustration = clamp(result.stateUpdates.frustration, 0, 100);
    if (typeof result.stateUpdates.egoThreat === 'number') session.egoThreat = clamp(result.stateUpdates.egoThreat, 0, 100);
    if (typeof result.stateUpdates.pressure === 'number') session.pressure = clamp(result.stateUpdates.pressure, 0, 100);
    if (typeof result.stateUpdates.momentum === 'number') session.momentum = clamp(result.stateUpdates.momentum, -100, 100);
  }

  // Validate and record concession
  if (result.concession && typeof result.concession.by === 'string' && typeof result.concession.detail === 'string') {
    session.concessions.push(result.concession);
  }

  // Update anchor
  if (typeof result.activeAnchor === 'string' || result.activeAnchor === null) {
    session.activeAnchor = result.activeAnchor;
  }

  let sessionOver = isLastTurn || !!result.sessionOver;
  let endReason = result.endReason || null;

  if (isLastTurn && !endReason) {
    endReason = 'Maximum turns reached (12)';
  }

  // Determine session status from explicit LLM field, not string matching
  if (sessionOver && session.status === 'active') {
    if (result.sessionStatus === 'accepted') {
      session.status = 'accepted';
    } else if (result.sessionStatus === 'broken') {
      session.status = 'broken';
    } else {
      session.status = 'ended';
    }
  }

  return {
    adversaryResponse,
    detectedSignals: result.detectedSignals || [],
    state: session,
    sessionOver,
    endReason,
  };
}
