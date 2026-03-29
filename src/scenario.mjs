// scenario.mjs — Collects and validates a negotiation brief
// Contract: buildBrief(rawInput) → Brief (validated, normalized)

const VALID_DIFFICULTIES = ['cooperative', 'neutral', 'hostile', 'manipulative'];

/**
 * @typedef {object} Brief
 * @property {string} situation
 * @property {string} userRole
 * @property {string} adversaryRole
 * @property {string} objective
 * @property {string} minimalThreshold
 * @property {string} batna
 * @property {string[]} constraints
 * @property {'cooperative'|'neutral'|'hostile'|'manipulative'} difficulty
 * @property {string} relationalStakes
 */

/**
 * Validates and normalizes raw user input into a structured Brief.
 * Throws if objective, minimalThreshold, or batna are missing/empty.
 */
export function buildBrief(rawInput) {
  const raw = rawInput || {};

  if (!raw.objective || (typeof raw.objective === 'string' && raw.objective.trim() === '')) {
    throw new Error('Missing required field: objective');
  }
  if (!raw.batna || (typeof raw.batna === 'string' && raw.batna.trim() === '')) {
    throw new Error('Missing required field: batna');
  }
  if (!raw.minimalThreshold || (typeof raw.minimalThreshold === 'string' && raw.minimalThreshold.trim() === '')) {
    throw new Error('Missing required field: minimalThreshold');
  }

  const difficulty = raw.difficulty || 'neutral';
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    throw new Error(`Invalid difficulty "${difficulty}". Must be one of: ${VALID_DIFFICULTIES.join(', ')}`);
  }

  let constraints = raw.constraints;
  if (constraints === undefined || constraints === null) {
    constraints = [];
  } else if (typeof constraints === 'string') {
    constraints = [constraints];
  } else if (!Array.isArray(constraints)) {
    constraints = [];
  }

  return {
    situation: raw.situation || '',
    userRole: raw.userRole || '',
    adversaryRole: raw.adversaryRole || '',
    objective: raw.objective.trim(),
    minimalThreshold: raw.minimalThreshold.trim(),
    batna: raw.batna.trim(),
    constraints,
    difficulty,
    relationalStakes: raw.relationalStakes || '',
  };
}

/**
 * Asserts that a Brief is structurally valid.
 */
export function assertValidBrief(brief) {
  if (!brief || typeof brief !== 'object') throw new Error('Brief must be an object');
  if (!brief.objective) throw new Error('Brief missing objective');
  if (!brief.batna) throw new Error('Brief missing batna');
  if (!brief.minimalThreshold) throw new Error('Brief missing minimalThreshold');
  if (!VALID_DIFFICULTIES.includes(brief.difficulty)) throw new Error('Brief has invalid difficulty');
  if (!Array.isArray(brief.constraints)) throw new Error('Brief constraints must be an array');
}
