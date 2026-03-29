// engine.mjs — Conversation loop orchestrator with WorldEngine state tracking
// Contract: createSession(brief, adversary, provider) → Session
//           processTurn(session, userMessage) → TurnResult

const MAX_TURNS = 12;

const CLI_COMMANDS = {
  '/end': 'ended',
  '/quit': 'quit',
};

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

  // Add user message to transcript
  session.transcript.push({ role: 'user', content: userMessage });
  session.turn++;

  // Check turn limit
  const isLastTurn = session.turn >= MAX_TURNS;

  // Build conversation context for the LLM
  const transcriptText = session.transcript
    .map((m) => `${m.role === 'user' ? 'Negotiator' : session.adversary.identity}: ${m.content}`)
    .join('\n');

  const result = await session.provider.generateJson({
    system: `You are simulating a negotiation adversary. You ARE this person:
${JSON.stringify(session.adversary, null, 2)}

Current emotional state: confidence=${session.confidence}, frustration=${session.frustration}, egoThreat=${session.egoThreat}, pressure=${session.pressure}
Current momentum (positive = user gaining ground): ${session.momentum}
Active anchor: ${session.activeAnchor || 'none'}
Concessions so far: ${JSON.stringify(session.concessions)}
Turn: ${session.turn}/${MAX_TURNS}

Respond in character. Also analyze the user's message for negotiation signals and suggest state updates.
Return JSON with: adversaryResponse, detectedSignals[], stateUpdates: {confidence, frustration, egoThreat?, pressure?, momentum?}, sessionOver (boolean), endReason (string|null), concession? ({by, detail}).
${isLastTurn ? 'This is the FINAL turn. Wrap up the negotiation — either accept, reject, or propose a final compromise.' : ''}`,
    prompt: `Conversation so far:\n${transcriptText}\n\nThe negotiator just said: "${userMessage}"\n\nRespond as ${session.adversary.identity} and analyze.`,
    schemaName: 'turn',
    temperature: 0.7,
  });

  // Update session state from LLM response
  const adversaryResponse = result.adversaryResponse || '';
  session.transcript.push({ role: 'adversary', content: adversaryResponse });

  if (result.stateUpdates) {
    if (typeof result.stateUpdates.confidence === 'number') session.confidence = result.stateUpdates.confidence;
    if (typeof result.stateUpdates.frustration === 'number') session.frustration = result.stateUpdates.frustration;
    if (typeof result.stateUpdates.egoThreat === 'number') session.egoThreat = result.stateUpdates.egoThreat;
    if (typeof result.stateUpdates.pressure === 'number') session.pressure = result.stateUpdates.pressure;
    if (typeof result.stateUpdates.momentum === 'number') session.momentum = result.stateUpdates.momentum;
  }

  if (result.concession) {
    session.concessions.push(result.concession);
  }

  // Detect anchor from adversary response
  if (result.activeAnchor !== undefined) {
    session.activeAnchor = result.activeAnchor;
  }

  let sessionOver = isLastTurn || !!result.sessionOver;
  let endReason = result.endReason || null;

  if (isLastTurn && !endReason) {
    endReason = 'Maximum turns reached (12)';
  }

  if (sessionOver && session.status === 'active') {
    session.status = result.sessionOver ? (result.endReason?.includes('accept') ? 'accepted' : 'broken') : 'ended';
  }

  return {
    adversaryResponse,
    detectedSignals: result.detectedSignals || [],
    state: session,
    sessionOver,
    endReason,
  };
}
