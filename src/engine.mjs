// engine.mjs — Conversation loop orchestrator with WorldEngine state tracking
// Contract: createSession(brief, adversary, provider) → Session
//           processTurn(session, userMessage) → TurnResult

/**
 * @typedef {object} SessionState
 * @property {number} turn - Current turn number (1-based)
 * @property {Array<{role: string, content: string}>} transcript - Full conversation
 * @property {number} confidence - Adversary confidence 0-100
 * @property {number} frustration - Adversary frustration 0-100
 * @property {number} egoThreat - Adversary ego threat 0-100
 * @property {number} pressure - Overall pressure level 0-100
 * @property {number} momentum - User's negotiation momentum -100 to +100
 * @property {string|null} activeAnchor - Current anchoring point if any
 * @property {string[]} concessions - Registry of concessions made (by whom)
 * @property {'active'|'accepted'|'broken'|'ended'|'quit'} status - Session status
 */

/**
 * @typedef {object} TurnResult
 * @property {string} adversaryResponse - What the adversary says
 * @property {string[]} detectedSignals - Signals detected in user's message
 * @property {SessionState} state - Updated session state
 * @property {boolean} sessionOver - Whether the session has ended
 * @property {string|null} endReason - Why the session ended (if it did)
 */

const MAX_TURNS = 12;

/**
 * Creates a new negotiation session.
 *
 * @param {import('./scenario.mjs').Brief} brief
 * @param {import('./persona.mjs').Adversary} adversary
 * @param {{ generateJson: Function }} provider
 * @returns {SessionState & { brief: object, adversary: object, provider: object }}
 */
export function createSession(brief, adversary, provider) {
  throw new Error('Not implemented');
}

/**
 * Processes one turn of negotiation.
 * Updates WorldEngine state: emotions, anchor, concessions, momentum.
 * Detects /end, /restart, /retry, /quit commands.
 * Ends session on acceptance, breakdown, /end, /quit, or turn 12.
 *
 * @param {object} session - Session created by createSession
 * @param {string} userMessage - User's input (may be a CLI command)
 * @returns {Promise<TurnResult>}
 */
export function processTurn(session, userMessage) {
  throw new Error('Not implemented');
}
