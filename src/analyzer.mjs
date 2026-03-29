// analyzer.mjs — Post-session feedback with cognitive bias detection and scoring
// Contract: analyzeFeedback(session, provider) → FeedbackReport

/**
 * @typedef {object} BiasInstance
 * @property {string} biasType - 'anchoring'|'loss_aversion'|'conflict_avoidance'|'framing'|'conversational_blocking'
 * @property {number} turn - Turn number where bias was detected
 * @property {string} excerpt - Short quote from the transcript as evidence
 * @property {string} explanation - Why this qualifies as the bias
 */

/**
 * @typedef {object} ScoreBreakdown
 * @property {number} outcomeLeverage - 0-25: Did the user achieve their objective?
 * @property {number} batnaDiscipline - 0-20: Did they protect their BATNA?
 * @property {number} emotionalRegulation - 0-25: Tactical empathy and emotional control
 * @property {number} biasResistance - 0-15: Resistance to cognitive biases
 * @property {number} conversationalFlow - 0-15: Creating options, "yes and", avoiding blocks
 */

/**
 * @typedef {object} FeedbackReport
 * @property {number} globalScore - 0-100 weighted total
 * @property {ScoreBreakdown} scores - Per-dimension scores
 * @property {BiasInstance[]} biasesDetected - Specific bias instances with evidence
 * @property {string[]} tacticsUsed - Tactics the user employed
 * @property {string[]} missedOpportunities - Opportunities the user didn't exploit
 * @property {string[]} recommendations - Actionable improvement tips
 */

/**
 * Analyzes a completed negotiation session and produces a detailed feedback report.
 * Every judgment must cite a specific turn or short transcript excerpt.
 *
 * @param {object} session - Completed session (status !== 'active')
 * @param {{ generateJson: Function }} provider
 * @returns {Promise<FeedbackReport>}
 */
export function analyzeFeedback(session, provider) {
  throw new Error('Not implemented');
}

/**
 * Asserts that a FeedbackReport is structurally valid.
 * @param {FeedbackReport} report
 * @throws {Error}
 */
export function assertValidFeedbackReport(report) {
  throw new Error('Not implemented');
}
