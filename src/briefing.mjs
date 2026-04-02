// briefing.mjs — Socratic briefing + objective contract
// The player formulates their own objectives before each session.
// Scenarios provide suggestions, the player commits in their own words.

import { computePreSessionOdds } from './ticker.mjs';

/**
 * Generate briefing context for a scenario — what the player sees before committing.
 */
export function generateBriefing(scenario, progression) {
  const brief = scenario.brief || scenario;
  const adversary = scenario.adversary || null;
  const difficulty = brief.difficulty || 'neutral';

  const odds = progression
    ? computePreSessionOdds(progression, difficulty)
    : { successRate: 50, confidence: 'low', message: 'Première session — estimation par défaut.' };

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

    // Briefing questions
    questions: [
      {
        id: 'objective',
        label: 'Qu\'est-ce qui vous ferait partir content ?',
        hint: 'Votre objectif ideal — soyez precis.',
        suggestion: brief.objective || '',
        required: true,
      },
      {
        id: 'threshold',
        label: 'En dessous de quoi vous refusez ?',
        hint: 'Le minimum acceptable. En dessous, activez votre plan B.',
        suggestion: brief.minimalThreshold || '',
        required: true,
      },
      {
        id: 'batna',
        label: 'Si ca echoue, quel est votre plan B ?',
        hint: 'Votre meilleure alternative. Elle definit votre pouvoir de negociation.',
        suggestion: brief.batna || '',
        required: true,
      },
      {
        id: 'relationalGoal',
        label: 'Comment voulez-vous que la relation soit apres ?',
        hint: 'Partenariat long terme ? Transaction unique ? Peu importe ?',
        suggestion: brief.relationalStakes ? 'Preserver la relation' : 'Transaction pure',
        required: false,
      },
      {
        id: 'strategy',
        label: 'Quelle approche allez-vous utiliser ?',
        hint: 'Ecoute d\'abord ? Ancrage haut ? Collaboration ? Pression ?',
        suggestion: '',
        required: false,
      },
    ],
  };
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
