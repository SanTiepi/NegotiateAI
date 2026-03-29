// persona.mjs — Generates a structured adversary from brief + difficulty preset
// Contract: generatePersona(brief, provider) → Adversary

const DIFFICULTY_PROMPTS = {
  cooperative: 'The adversary is open to compromise, empathetic, and seeks win-win outcomes. They share information relatively freely.',
  neutral: 'The adversary is professional and fair but firm. They protect their interests without being aggressive.',
  hostile: 'The adversary is aggressive, dismissive, and uses pressure tactics. They reveal little and push hard.',
  manipulative: 'The adversary uses psychological manipulation: false urgency, guilt-tripping, gaslighting, love-bombing then withdrawing. They appear reasonable on the surface but undermine the other party systematically.',
};

/**
 * @typedef {object} Adversary
 * @property {string} identity
 * @property {string} style
 * @property {string} publicObjective
 * @property {string} hiddenObjective
 * @property {string} batna
 * @property {string[]} nonNegotiables
 * @property {string} timePressure
 * @property {{ confidence: number, frustration: number, egoThreat: number }} emotionalProfile
 * @property {string[]} likelyTactics
 * @property {string[]} vulnerabilities
 */

/**
 * Generates a fully structured adversary persona from the brief context
 * and the selected difficulty preset.
 */
export async function generatePersona(brief, provider) {
  const difficultyDesc = DIFFICULTY_PROMPTS[brief.difficulty] || DIFFICULTY_PROMPTS.neutral;

  const result = await provider.generateJson({
    system: `You are an expert negotiation scenario designer. Generate a realistic adversary persona for a negotiation simulation. Return valid JSON matching the requested schema exactly.`,
    prompt: `Create an adversary persona for this negotiation scenario:

Situation: ${brief.situation}
Adversary role: ${brief.adversaryRole}
User role: ${brief.userRole}
User's objective: ${brief.objective}
Difficulty preset: ${brief.difficulty}
Difficulty description: ${difficultyDesc}
Relational stakes: ${brief.relationalStakes}

Generate a JSON object with these exact fields:
- identity (string): Name and brief background
- style (string): Communication style matching difficulty "${brief.difficulty}"
- publicObjective (string): What they openly state they want
- hiddenObjective (string): Their real underlying interest
- batna (string): Their best alternative if negotiation fails
- nonNegotiables (string[]): 2-3 lines they absolutely won't cross
- timePressure (string): Their time constraints
- emotionalProfile: { confidence: 0-100, frustration: 0-100, egoThreat: 0-100 }
- likelyTactics (string[]): 3-5 tactics they'll employ
- vulnerabilities (string[]): 2-3 moments where they might yield`,
    schemaName: 'adversary',
    temperature: 0.8,
  });

  assertValidAdversary(result);
  return result;
}

/**
 * Asserts that an Adversary has all required fields.
 */
export function assertValidAdversary(adversary) {
  if (!adversary || typeof adversary !== 'object') throw new Error('Adversary must be an object');
  const requiredStrings = ['identity', 'style', 'publicObjective', 'hiddenObjective', 'batna', 'timePressure'];
  for (const field of requiredStrings) {
    if (typeof adversary[field] !== 'string') throw new Error(`Adversary missing string field: ${field}`);
  }
  const requiredArrays = ['nonNegotiables', 'likelyTactics', 'vulnerabilities'];
  for (const field of requiredArrays) {
    if (!Array.isArray(adversary[field])) throw new Error(`Adversary missing array field: ${field}`);
  }
  if (!adversary.emotionalProfile || typeof adversary.emotionalProfile !== 'object') {
    throw new Error('Adversary missing emotionalProfile');
  }
  for (const key of ['confidence', 'frustration', 'egoThreat']) {
    if (typeof adversary.emotionalProfile[key] !== 'number') {
      throw new Error(`Adversary emotionalProfile missing number field: ${key}`);
    }
  }
}
