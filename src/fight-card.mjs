// fight-card.mjs — Round scoring, session grades, triangle score
// Every turn is a round. Every session gets a grade. Every result is a triangle.

/**
 * Score a single round (turn) — called after each processTurn.
 * Returns points (-3 to +3) with label and detail.
 */
export function scoreRound(turnResult, session) {
  const state = turnResult.state || {};
  const prevConfidence = session._prevConfidence ?? 50;
  const prevFrustration = session._prevFrustration ?? 30;

  let points = 0;
  const signals = [];

  // Momentum: gaining = good
  const momentum = state.momentum ?? session.momentum ?? 0;
  if (momentum > 15) { points += 1; signals.push('momentum positif'); }
  else if (momentum < -15) { points -= 1; signals.push('momentum negatif'); }

  // Confidence: rising adversary confidence is neutral, dropping is good for us
  const confDelta = (state.confidence ?? 50) - prevConfidence;
  if (confDelta < -10) { points += 1; signals.push('adversaire destabilise'); }
  else if (confDelta > 10) { points -= 1; signals.push('adversaire renforce'); }

  // Frustration: high adversary frustration = we're pushing (can be good or bad)
  const frustDelta = (state.frustration ?? 30) - prevFrustration;
  if (frustDelta > 15) { points -= 1; signals.push('tension excessive'); }

  // Coaching: bias detected = penalty
  if (turnResult.coaching?.biasDetected) {
    points -= 1;
    signals.push(`biais: ${turnResult.coaching.biasDetected}`);
  }

  // Detected techniques by user = bonus
  const techniques = turnResult.detectedSignals?.filter((s) => {
    const str = typeof s === 'string' ? s : s.type || '';
    return str.startsWith('user:');
  }) || [];
  if (techniques.length > 0) { points += 1; signals.push('technique efficace'); }

  // Clamp
  points = Math.max(-3, Math.min(3, points));

  const label = points > 0 ? 'Round gagne' : points < 0 ? 'Round perdu' : 'Round neutre';

  return {
    turn: state.turn || session.turn || 0,
    points,
    label,
    signals,
    cumulativeScore: (session._roundScores || []).reduce((sum, r) => sum + r.points, 0) + points,
  };
}

/**
 * Compute session grade — A+ to X, with label.
 */
export function computeSessionGrade(feedback, session, objectiveContract) {
  const globalScore = feedback?.globalScore ?? 0;
  const status = session?.status || 'ended';
  const frustration = session?.frustration ?? 30;
  const egoThreat = session?._world?.emotions?.egoThreat ?? session?.egoThreat ?? 20;

  // Rupture: relationship destroyed regardless of deal
  if (frustration > 85 && egoThreat > 70) {
    return { grade: 'X', label: 'Rupture', description: 'Relation detruite — meme un bon deal ne compense pas.', color: '#6b21a8' };
  }

  // Walk-away detection
  if (status === 'quit' || status === 'broken') {
    const roundScores = session._roundScores || [];
    const totalRounds = roundScores.length;
    const negativeRounds = roundScores.filter((r) => r.points < 0).length;
    const concessions = session?.concessions?.length || 0;

    if (totalRounds <= 4 && negativeRounds >= totalRounds * 0.5) {
      // Early walk-away when things were going bad = correct
      return { grade: 'D+', label: 'Walk-away correct', description: 'BATNA activee au bon moment. C\'est une victoire strategique.', color: '#22c55e' };
    }
    if (concessions >= 3) {
      return { grade: 'E', label: 'Walk-away tardif', description: 'Trop de concessions avant de partir. La BATNA aurait du etre activee plus tot.', color: '#f59e0b' };
    }
    return { grade: 'D', label: 'Walk-away', description: 'Session interrompue. Resultat neutre.', color: '#94a3b8' };
  }

  // Deal-based grades
  if (globalScore >= 90) return { grade: 'A+', label: 'Masterclass', description: 'Objectif depasse, relation intacte, biais evites.', color: '#22c55e' };
  if (globalScore >= 80) return { grade: 'A', label: 'Excellent', description: 'Negociation maitrisee.', color: '#22c55e' };
  if (globalScore >= 65) return { grade: 'B', label: 'Solid', description: 'Bon resultat, quelques axes d\'amelioration.', color: '#3b82f6' };
  if (globalScore >= 50) return { grade: 'C', label: 'Acceptable', description: 'Deal obtenu mais des erreurs notables.', color: '#f59e0b' };
  if (globalScore >= 35) return { grade: 'D', label: 'Insuffisant', description: 'En dessous du seuil. La BATNA aurait ete preferable.', color: '#ef4444' };
  return { grade: 'F', label: 'Capitulation', description: 'Deal bien en dessous du minimum, sans activer le plan B.', color: '#ef4444' };
}

/**
 * Compute the triangle score — 3 axes: transaction, relation, intelligence.
 */
export function computeTriangleScore(feedback, session, objectiveContract) {
  const scores = feedback?.scores || {};
  const biases = feedback?.biasesDetected || [];
  const tactics = feedback?.tacticsUsed || [];

  // TRANSACTION: based on outcome leverage + BATNA discipline
  const leverageMax = 25;
  const batnaMax = 20;
  const transaction = Math.min(100, Math.round(
    ((scores.outcomeLeverage || 0) / leverageMax) * 60 +
    ((scores.batnaDiscipline || 0) / batnaMax) * 40
  ));

  // RELATION: based on adversary's final emotional state + conversation flow
  const flowMax = 15;
  const frustration = session?.frustration ?? 50;
  const egoThreat = session?._world?.emotions?.egoThreat ?? session?.egoThreat ?? 50;
  const relFromFlow = ((scores.conversationalFlow || 0) / flowMax) * 40;
  const relFromEmotions = ((100 - frustration) / 100) * 30 + ((100 - egoThreat) / 100) * 30;
  const relation = Math.min(100, Math.max(0, Math.round(relFromFlow + relFromEmotions)));

  // INTELLIGENCE: based on bias resistance + number of adversary signals detected + hidden obj hints
  const biasMax = 15;
  const biasScore = ((scores.biasResistance || 0) / biasMax) * 40;

  // Signals detected across the session (adversary tactics spotted)
  const signalCount = session?.transcript?.filter((m) => m.role === 'adversary').length || 0;
  const detectedSignalBonus = Math.min(30, signalCount * 5);

  // Hidden objective discovery bonus
  const hints = objectiveContract?.hiddenObjectiveHints || [];
  const transcript = (session?.transcript || []).map((m) => m.content || '').join(' ').toLowerCase();
  const hintsDiscovered = hints.filter((h) => {
    const keywords = h.toLowerCase().split(/\s+/).filter((w) => w.length > 5);
    return keywords.some((kw) => transcript.includes(kw));
  }).length;
  const discoveryBonus = hints.length > 0 ? Math.round((hintsDiscovered / hints.length) * 30) : 15;

  const intelligence = Math.min(100, Math.max(0, Math.round(biasScore + detectedSignalBonus + discoveryBonus)));

  // Weighted final score
  const weights = objectiveContract?.triangleWeights || { transaction: 50, relation: 25, intelligence: 25 };
  const totalWeight = weights.transaction + weights.relation + weights.intelligence;
  const weightedScore = Math.round(
    (transaction * weights.transaction + relation * weights.relation + intelligence * weights.intelligence) / totalWeight
  );

  return {
    transaction,
    relation,
    intelligence,
    weightedScore,
    weights,
    hintsDiscovered,
    totalHints: hints.length,
  };
}

/**
 * Build the full fight card summary for end-of-session display.
 */
export function buildFightCard(feedback, session, objectiveContract) {
  const grade = computeSessionGrade(feedback, session, objectiveContract);
  const triangle = computeTriangleScore(feedback, session, objectiveContract);
  const roundScores = session?._roundScores || [];
  const totalRounds = roundScores.length;
  const roundsWon = roundScores.filter((r) => r.points > 0).length;
  const roundsLost = roundScores.filter((r) => r.points < 0).length;
  const roundsNeutral = totalRounds - roundsWon - roundsLost;

  return {
    grade,
    triangle,
    rounds: {
      total: totalRounds,
      won: roundsWon,
      lost: roundsLost,
      neutral: roundsNeutral,
      detail: roundScores,
    },
    globalScore: feedback?.globalScore ?? 0,
    objectiveContract: objectiveContract ? {
      objective: objectiveContract.objective,
      threshold: objectiveContract.minimalThreshold,
      batna: objectiveContract.batna,
      strategy: objectiveContract.strategy,
      relationalGoal: objectiveContract.relationalGoal,
    } : null,
  };
}
