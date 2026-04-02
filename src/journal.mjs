// journal.mjs — Post-negotiation debrief + comparison with simulation
// Closes the learning loop: simulate → prepare → negotiate for real → debrief → learn

/**
 * Questions for the post-negotiation journal.
 */
export function getJournalQuestions() {
  return [
    { id: 'outcome', label: 'Comment ça s\'est passé ?', hint: 'Accord, rupture, report ? Résume en 2-3 phrases.', type: 'textarea', required: true },
    { id: 'obtained', label: 'Qu\'as-tu obtenu concrètement ?', hint: 'Chiffres, termes, conditions.', type: 'textarea', required: true },
    { id: 'surprise', label: 'Qu\'est-ce qui t\'a surpris ?', hint: 'Ce que tu n\'avais pas prévu — en bien ou en mal.', type: 'textarea', required: false },
    { id: 'usedFromPrep', label: 'Qu\'as-tu utilisé de ta préparation ?', hint: 'Quels arguments, techniques, réflexes ont servi ?', type: 'textarea', required: false },
    { id: 'regret', label: 'Si c\'était à refaire, tu changerais quoi ?', hint: 'Le moment où tu aurais agi différemment.', type: 'textarea', required: false },
    { id: 'emotion', label: 'Comment tu te sens maintenant ?', hint: 'Fier, frustré, soulagé, en colère ? L\'émotion dit quelque chose.', type: 'text', required: false },
    { id: 'score', label: 'Note ta performance (1-10)', hint: 'Honnêtement, sans fausse modestie.', type: 'range', min: 1, max: 10, required: true },
  ];
}

/**
 * Build a journal entry from the user's answers + link to the simulation.
 */
export function buildJournalEntry(answers, simulationSessionId) {
  if (!answers.outcome || !answers.outcome.trim()) throw new Error('Le résultat est requis');
  if (!answers.obtained || !answers.obtained.trim()) throw new Error('Ce qui a été obtenu est requis');

  const selfScore = typeof answers.score === 'number'
    ? Math.min(10, Math.max(1, answers.score))
    : (parseInt(answers.score, 10) || 5);

  return {
    id: `journal-${Date.now()}`,
    date: new Date().toISOString(),
    simulationSessionId: simulationSessionId || null,
    outcome: answers.outcome.trim(),
    obtained: answers.obtained.trim(),
    surprise: (answers.surprise || '').trim() || null,
    usedFromPrep: (answers.usedFromPrep || '').trim() || null,
    regret: (answers.regret || '').trim() || null,
    emotion: (answers.emotion || '').trim() || null,
    selfScore,
    type: 'journal',
  };
}

/**
 * Compare journal entry with the simulation that prepared it.
 * Returns insights on what transferred and what didn't.
 */
export function compareWithSimulation(journalEntry, simulationSession) {
  if (!simulationSession) {
    return {
      hasSimulation: false,
      summary: 'Pas de simulation associée — impossible de comparer.',
      insights: [],
    };
  }

  const insights = [];
  const simFeedback = simulationSession.feedback || {};
  const simScore = simFeedback.globalScore || 0;
  const selfScore = journalEntry.selfScore || 5;
  const selfScoreNormalized = selfScore * 10;

  // Score comparison
  const delta = selfScoreNormalized - simScore;
  if (delta > 15) {
    insights.push({
      type: 'positive',
      text: `Tu as fait mieux en réel (${selfScore}/10) qu\'en simulation (${simScore}/100). La préparation a payé.`,
    });
  } else if (delta < -15) {
    insights.push({
      type: 'warning',
      text: `Tu as trouvé la réalité plus difficile que la simulation. C\'est normal — le stress change la donne. Continue à t\'entraîner.`,
    });
  } else {
    insights.push({
      type: 'neutral',
      text: `Score cohérent entre simulation et réalité. Ton auto-évaluation est calibrée.`,
    });
  }

  // Surprise analysis
  if (journalEntry.surprise) {
    insights.push({
      type: 'learning',
      text: `Surprise : "${journalEntry.surprise}" — les surprises sont les meilleures sources d\'apprentissage. Intègre ça dans ta prochaine simulation.`,
    });
  }

  // Prep usage
  if (journalEntry.usedFromPrep) {
    insights.push({
      type: 'positive',
      text: `Transfert réussi : tu as utilisé ta préparation en situation réelle. C\'est ça le but.`,
    });
  }

  // Regret → next simulation suggestion
  if (journalEntry.regret) {
    insights.push({
      type: 'actionable',
      text: `Regret identifié : "${journalEntry.regret}". Suggestion : relance une simulation en te concentrant sur ce point spécifique.`,
    });
  }

  // Bias check from simulation
  const simBiases = (simFeedback.biasesDetected || []).map((b) => b.biasType);
  if (simBiases.length > 0) {
    insights.push({
      type: 'warning',
      text: `En simulation, on avait détecté : ${simBiases.join(', ')}. Est-ce que ces biais sont apparus en réel aussi ?`,
    });
  }

  // Emotional state
  if (journalEntry.emotion) {
    const negativeEmotions = /frustré|colère|déçu|anxieux|stressé|nul/i;
    const positiveEmotions = /fier|soulagé|content|confiant|satisfait/i;
    if (negativeEmotions.test(journalEntry.emotion)) {
      insights.push({
        type: 'support',
        text: `Tu ressens "${journalEntry.emotion}". C\'est normal après une négo intense. L\'important : qu\'as-tu appris ?`,
      });
    } else if (positiveEmotions.test(journalEntry.emotion)) {
      insights.push({
        type: 'positive',
        text: `"${journalEntry.emotion}" — bien mérité. Ancre cette confiance pour la prochaine.`,
      });
    }
  }

  return {
    hasSimulation: true,
    simulationScore: simScore,
    selfScore,
    summary: insights.filter((i) => i.type === 'positive').length >= 2
      ? 'La préparation a clairement fait une différence. Continue sur cette lancée.'
      : insights.filter((i) => i.type === 'warning').length >= 2
        ? 'Des points de friction identifiés. Chaque négo réelle te rend meilleur — surtout celles qui piquent.'
        : 'Boucle d\'apprentissage fermée. Chaque cycle simulation → réel → débrief te rend plus affûté.',
    insights,
  };
}

/**
 * Compute real-world stats from journal entries.
 */
export function computeRealWorldStats(journalEntries) {
  if (!journalEntries || journalEntries.length === 0) {
    return { totalReal: 0, avgSelfScore: 0, transferRate: 0, topLearning: null };
  }

  const scores = journalEntries.map((j) => j.selfScore || 5);
  const avgSelfScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10;
  const withPrep = journalEntries.filter((j) => j.usedFromPrep).length;
  const transferRate = Math.round((withPrep / journalEntries.length) * 100);

  // Most common surprise (learning)
  const surprises = journalEntries.filter((j) => j.surprise).map((j) => j.surprise);
  const topLearning = surprises.length > 0 ? surprises[surprises.length - 1] : null;

  return {
    totalReal: journalEntries.length,
    avgSelfScore,
    transferRate,
    topLearning,
    withPrep,
    withRegrets: journalEntries.filter((j) => j.regret).length,
  };
}
