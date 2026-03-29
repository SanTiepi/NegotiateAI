// scenario.mjs — Collects and validates a negotiation brief
// Contract: buildBrief(rawInput) → Brief (validated, normalized)

/**
 * @typedef {object} Brief
 * @property {string} situation - Context description
 * @property {string} userRole - Who the user plays
 * @property {string} adversaryRole - Who the adversary is
 * @property {string} objective - What the user wants to achieve
 * @property {string} minimalThreshold - Minimum acceptable outcome
 * @property {string} batna - Best Alternative To Negotiated Agreement
 * @property {string[]} constraints - Hard constraints
 * @property {'cooperative'|'neutral'|'hostile'|'manipulative'} difficulty - Adversary preset
 * @property {string} relationalStakes - Importance of ongoing relationship
 */

/**
 * Validates and normalizes raw user input into a structured Brief.
 * Throws if objective, minimalThreshold, or batna are missing/empty.
 *
 * @param {object} rawInput
 * @returns {Brief}
 */
export function buildBrief(rawInput) {
  throw new Error('Not implemented');
}

/**
 * Asserts that a Brief is structurally valid.
 * @param {Brief} brief
 * @throws {Error} if any required field is missing
 */
export function assertValidBrief(brief) {
  throw new Error('Not implemented');
}
