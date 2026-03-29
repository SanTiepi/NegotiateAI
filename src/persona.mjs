// persona.mjs — Generates a structured adversary from brief + difficulty preset
// Contract: generatePersona(brief, provider) → Adversary

/**
 * @typedef {object} Adversary
 * @property {string} identity - Name and role
 * @property {string} style - Communication style
 * @property {string} publicObjective - What they openly want
 * @property {string} hiddenObjective - What they secretly want
 * @property {string} batna - Their best alternative
 * @property {string[]} nonNegotiables - Lines they won't cross
 * @property {string} timePressure - Their time constraints
 * @property {object} emotionalProfile - Initial emotional state
 * @property {number} emotionalProfile.confidence - 0-100
 * @property {number} emotionalProfile.frustration - 0-100
 * @property {number} emotionalProfile.egoThreat - 0-100
 * @property {string[]} likelyTactics - Tactics they'll use
 * @property {string[]} vulnerabilities - Moments where they might yield
 */

/**
 * Generates a fully structured adversary persona from the brief context
 * and the selected difficulty preset.
 *
 * @param {import('./scenario.mjs').Brief} brief
 * @param {{ generateJson: Function }} provider
 * @returns {Promise<Adversary>}
 */
export function generatePersona(brief, provider) {
  throw new Error('Not implemented');
}

/**
 * Asserts that an Adversary has all required fields.
 * @param {Adversary} adversary
 * @throws {Error}
 */
export function assertValidAdversary(adversary) {
  throw new Error('Not implemented');
}
