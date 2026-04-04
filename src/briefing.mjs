// briefing.mjs — Socratic briefing + objective contract
// The player formulates their own objectives before each session.
// Scenarios provide suggestions, the player commits in their own words.

import { computePreSessionOdds } from './ticker.mjs';

/**
 * Generate briefing context for a scenario — what the player sees before committing.
 */
const BRIEFING_QUESTIONS = {
  negotiation: [
    { id: 'objective', label: 'Qu\'est-ce qui te ferait partir content ?', hint: 'Ton objectif ideal — sois precis.', required: true },
    { id: 'threshold', label: 'En dessous de quoi tu refuses ?', hint: 'Le minimum acceptable. En dessous, active ton plan B.', required: true },
    { id: 'batna', label: 'Si ca echoue, quel est ton plan B ?', hint: 'Ton meilleure alternative. Elle definit ta marge de manoeuvre.', required: true },
    { id: 'relationalGoal', label: 'Comment tu veux que la relation soit apres ?', hint: 'Partenariat long terme ? Transaction unique ? Peu importe ?', required: false },
    { id: 'strategy', label: 'Quelle approche tu vas utiliser ?', hint: 'Ecoute d\'abord ? Proposition haute ? Collaboration ? Pression ?', required: false },
  ],
  assertiveness: [
    { id: 'objective', label: 'Qu\'est-ce que tu veux dire clairement ?', hint: 'Le message central que tu veux faire passer.', required: true },
    { id: 'threshold', label: 'Qu\'est-ce que tu n\'acceptes plus ?', hint: 'Ta limite. Ce qui n\'est plus negociable pour toi.', required: true },
    { id: 'batna', label: 'Si la conversation se ferme, tu fais quoi ?', hint: 'Ton alternative si l\'autre ne comprend pas.', required: true },
    { id: 'relationalGoal', label: 'Tu veux preserver la relation ?', hint: 'Oui, c\'est important ? Ou tu es pret(e) a assumer une distance ?', required: false },
    { id: 'strategy', label: 'Comment tu comptes aborder le sujet ?', hint: 'Direct ? En douceur ? Avec un exemple concret ?', required: false },
  ],
  feedback: [
    { id: 'objective', label: 'Quel message tu veux faire passer ?', hint: 'Le point precis que l\'autre doit comprendre.', required: true },
    { id: 'threshold', label: 'C\'est quoi le minimum acceptable ?', hint: 'Au minimum, qu\'est-ce qui doit changer ?', required: true },
    { id: 'batna', label: 'Si ca ne passe pas, tu fais quoi ?', hint: 'Escalader ? Laisser tomber ? Documenter ?', required: true },
    { id: 'relationalGoal', label: 'Tu veux que la relation reste intacte ?', hint: 'Oui a tout prix ? Oui si possible ? Secondaire ?', required: false },
    { id: 'strategy', label: 'Comment tu comptes formuler ?', hint: 'Factuel ? Empathique d\'abord ? Direct sans detour ?', required: false },
  ],
};

const BRIEFING_SLIDERS = {
  negotiation: {
    ambition: { label: 'Ambition', leftLabel: 'Prudent', rightLabel: 'Maximaliste' },
    relation: { label: 'Relation', leftLabel: 'Accord pur', rightLabel: 'Relation compte' },
    posture: { label: 'Posture', leftLabel: 'Diplomate', rightLabel: 'Assertif' },
  },
  assertiveness: {
    ambition: { label: 'Fermete', leftLabel: 'Souple', rightLabel: 'Intransigeant' },
    relation: { label: 'Relation', leftLabel: 'Secondaire', rightLabel: 'Essentielle' },
    posture: { label: 'Ton', leftLabel: 'Doux', rightLabel: 'Direct' },
  },
  feedback: {
    ambition: { label: 'Precision', leftLabel: 'Vague', rightLabel: 'Chirurgical' },
    relation: { label: 'Relation', leftLabel: 'Secondaire', rightLabel: 'Prioritaire' },
    posture: { label: 'Approche', leftLabel: 'Empathique', rightLabel: 'Factuel' },
  },
};

export function generateBriefing(scenario, progression) {
  const brief = scenario.brief || scenario;
  const adversary = scenario.adversary || null;
  const difficulty = brief.difficulty || 'neutral';
  const convType = scenario.metadata?.conversationType || 'negotiation';

  const odds = progression
    ? computePreSessionOdds(progression, difficulty)
    : { successRate: 50, confidence: 'low', message: 'Premiere session — estimation par defaut.' };

  const questions = (BRIEFING_QUESTIONS[convType] || BRIEFING_QUESTIONS.negotiation).map((q) => ({
    ...q,
    suggestion: q.id === 'objective' ? (brief.objective || '')
      : q.id === 'threshold' ? (brief.minimalThreshold || '')
        : q.id === 'batna' ? (brief.batna || '')
          : q.id === 'relationalGoal' ? (brief.relationalStakes ? 'Preserver la relation' : '')
            : '',
  }));

  const sliderDefs = BRIEFING_SLIDERS[convType] || BRIEFING_SLIDERS.negotiation;

  return {
    // Context shown to player
    situation: brief.situation || '',
    playerRole: brief.userRole || '',
    adversaryRole: brief.adversaryRole || '',
    adversaryPublic: adversary ? {
      identity: adversary.identity,
      style: adversary.style,
      publicObjective: adversary.publicObjective,
    } : null,
    difficulty,
    conversationType: convType,
    constraints: brief.constraints || [],
    relationalStakes: brief.relationalStakes || '',

    // Suggestions (player can adopt or modify)
    suggestions: {
      objective: brief.objective || '',
      minimalThreshold: brief.minimalThreshold || '',
      batna: brief.batna || '',
    },

    // Pre-session odds
    odds,

    // Briefing questions (contextual)
    questions,

    // Sliders (quick mode: 3 sliders -> computed contract)
    sliders: {
      ambition: { ...sliderDefs.ambition, min: 0, max: 100, default: 60 },
      relation: { ...sliderDefs.relation, min: 0, max: 100, default: brief.relationalStakes ? 70 : 30 },
      posture: { ...sliderDefs.posture, min: 0, max: 100, default: 50 },
    },
  };
}

/**
 * Build an ObjectiveContract from 3 slider values + scenario defaults.
 * This is the quick mode — no text input needed.
 */
export function buildContractFromSliders(sliders, scenario) {
  const brief = scenario?.brief || scenario || {};
  const adversary = scenario?.adversary || {};
  const { ambition = 60, relation = 50, posture = 50 } = sliders;

  // Compute objective text from ambition level
  const objective = ambition >= 70
    ? (brief.objective || 'Objectif ambitieux')
    : ambition >= 40
      ? (brief.minimalThreshold || brief.objective || 'Objectif modere')
      : (brief.batna || 'Objectif minimal');

  const threshold = ambition >= 60
    ? (brief.minimalThreshold || 'Seuil standard')
    : (brief.batna || 'Flexible');

  const batna = brief.batna || 'Alternative disponible';

  const relationalGoal = relation >= 70
    ? 'Preserver la relation a long terme'
    : relation >= 40
      ? 'Relation correcte'
      : 'Transaction pure, relation secondaire';

  const strategies = [];
  if (posture >= 70) strategies.push('assertif', 'ancrage haut');
  else if (posture >= 40) strategies.push('equilibre', 'ecoute puis proposition');
  else strategies.push('diplomate', 'ecoute active', 'empathie tactique');
  const strategy = strategies.join(', ');

  return buildObjectiveContract(
    { objective, threshold, batna, relationalGoal, strategy },
    scenario,
  );
}

/**
 * Build an ObjectiveContract from the player's answers.
 * This is what the scoring system uses to evaluate the session.
 */
export function buildObjectiveContract(answers, scenario) {
  const brief = scenario?.brief || scenario || {};

  if (!answers.objective || !answers.objective.trim()) {
    throw new Error('ObjectiveContract requires an objective');
  }
  if (!answers.threshold || !answers.threshold.trim()) {
    throw new Error('ObjectiveContract requires a threshold');
  }
  if (!answers.batna || !answers.batna.trim()) {
    throw new Error('ObjectiveContract requires a BATNA');
  }

  const contract = {
    // Player's own words
    objective: answers.objective.trim(),
    minimalThreshold: answers.threshold.trim(),
    batna: answers.batna.trim(),
    relationalGoal: (answers.relationalGoal || '').trim() || null,
    strategy: (answers.strategy || '').trim() || null,

    // From scenario (not shown to player during session)
    hiddenObjectiveHints: scenario?.adversary?.hiddenObjective
      ? extractHints(scenario.adversary.hiddenObjective)
      : [],
    adversaryVulnerabilities: scenario?.adversary?.vulnerabilities || [],

    // Triangle weights — adjusted by scenario type
    triangleWeights: computeTriangleWeights(brief, answers),

    // Metadata
    committedAt: new Date().toISOString(),
    scenarioId: scenario?.id || null,
    difficulty: brief.difficulty || 'neutral',
  };

  assertValidObjectiveContract(contract);
  return contract;
}

/**
 * Compute triangle weights based on scenario + player's relational goal.
 */
function computeTriangleWeights(brief, answers) {
  const relGoal = (answers.relationalGoal || '').toLowerCase();
  const hasRelationalStakes = !!(brief.relationalStakes && brief.relationalStakes.length > 10);

  // Default: transaction-heavy
  let transaction = 50, relation = 25, intelligence = 25;

  if (hasRelationalStakes || relGoal.includes('partenariat') || relGoal.includes('long terme') || relGoal.includes('relation')) {
    transaction = 35;
    relation = 40;
    intelligence = 25;
  }

  if (relGoal.includes('transaction') || relGoal.includes('peu importe') || relGoal.includes('aucune')) {
    transaction = 60;
    relation = 10;
    intelligence = 30;
  }

  return { transaction, relation, intelligence };
}

/**
 * Extract hints from the adversary's hidden objective (for post-session scoring).
 */
function extractHints(hiddenObjective) {
  if (!hiddenObjective || typeof hiddenObjective !== 'string') return [];
  // Split on sentence boundaries, take key phrases
  const sentences = hiddenObjective.split(/[.!]\s+/).filter((s) => s.length > 15);
  return sentences.slice(0, 3).map((s) => s.trim());
}

export function assertValidObjectiveContract(contract) {
  if (!contract || typeof contract !== 'object') throw new Error('ObjectiveContract must be an object');
  if (typeof contract.objective !== 'string' || !contract.objective) throw new Error('ObjectiveContract missing objective');
  if (typeof contract.minimalThreshold !== 'string' || !contract.minimalThreshold) throw new Error('ObjectiveContract missing minimalThreshold');
  if (typeof contract.batna !== 'string' || !contract.batna) throw new Error('ObjectiveContract missing batna');
  if (!contract.triangleWeights || typeof contract.triangleWeights !== 'object') throw new Error('ObjectiveContract missing triangleWeights');
  const { transaction, relation, intelligence } = contract.triangleWeights;
  if (typeof transaction !== 'number' || typeof relation !== 'number' || typeof intelligence !== 'number') {
    throw new Error('ObjectiveContract triangleWeights must have numeric values');
  }
}
