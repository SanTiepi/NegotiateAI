// planner.mjs — Generates an optimal negotiation strategy plan post-session
// Contract: generatePlan(brief, feedbackReport, provider) → NegotiationPlan

/**
 * @typedef {object} NegotiationPlan
 * @property {string} recommendedOpening - How to open the retry
 * @property {string[]} labelsAndMirrors - Suggested labeling/mirroring phrases
 * @property {string[]} discoveryQuestions - Questions to uncover adversary's real interests
 * @property {string} anchoringStrategy - How to set and defend anchors
 * @property {Array<{condition: string, concession: string}>} concessionSequence - Ordered concessions
 * @property {string[]} redLines - Absolute limits
 * @property {string} walkAwayRule - When to invoke BATNA, tied to specific triggers
 */

/**
 * Produces a concrete retry plan based on the brief and feedback analysis.
 * The plan must not contradict the user's BATNA or red lines.
 *
 * @param {import('./scenario.mjs').Brief} brief
 * @param {import('./analyzer.mjs').FeedbackReport} feedbackReport
 * @param {{ generateJson: Function }} provider
 * @returns {Promise<NegotiationPlan>}
 */
export function generatePlan(brief, feedbackReport, provider) {
  throw new Error('Not implemented');
}

/**
 * Asserts that a NegotiationPlan is structurally valid.
 * @param {NegotiationPlan} plan
 * @throws {Error}
 */
export function assertValidPlan(plan) {
  throw new Error('Not implemented');
}
