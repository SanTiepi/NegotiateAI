// belt.mjs — Belt progression system + bias profile + weakness identification

const DIFFICULTY_ORDER = ['cooperative', 'neutral', 'hostile', 'manipulative'];

export const BELT_DEFINITIONS = [
  { color: 'white', name: 'Ceinture Blanche — BATNA', dimension: 'batnaDiscipline', threshold: 14, maxScore: 20, requiredSessions: 3, requiredDifficulty: 'cooperative', requiresEvents: false, description: 'Maîtrise de la discipline BATNA en contexte coopératif' },
  { color: 'yellow', name: 'Ceinture Jaune — Ancrage', dimension: 'outcomeLeverage', threshold: 18, maxScore: 25, requiredSessions: 3, requiredDifficulty: 'neutral', requiresEvents: false, description: 'Maîtrise de l\'ancrage et du leverage en contexte neutre' },
  { color: 'green', name: 'Ceinture Verte — Flow', dimension: 'conversationalFlow', threshold: 11, maxScore: 15, requiredSessions: 3, requiredDifficulty: 'neutral', requiresEvents: true, description: 'Maîtrise du flow conversationnel avec événements imprévus' },
  { color: 'blue', name: 'Ceinture Bleue — Émotions', dimension: 'emotionalRegulation', threshold: 18, maxScore: 25, requiredSessions: 3, requiredDifficulty: 'hostile', requiresEvents: false, description: 'Maîtrise de la régulation émotionnelle sous pression hostile' },
  { color: 'black', name: 'Ceinture Noire — Biais', dimension: 'biasResistance', threshold: 12, maxScore: 15, requiredSessions: 3, requiredDifficulty: 'manipulative', requiresEvents: false, description: 'Résistance aux biais face à un adversaire manipulateur' },
];

function difficultyMeetsOrExceeds(sessionDiff, requiredDiff) {
  return DIFFICULTY_ORDER.indexOf(sessionDiff) >= DIFFICULTY_ORDER.indexOf(requiredDiff);
}

/**
 * Evaluates all belt statuses from session history.
 */
export function evaluateBelts(sessions) {
  const belts = {};
  for (const def of BELT_DEFINITIONS) {
    const qualifying = sessions.filter((s) => {
      if (!s.feedback || !s.feedback.scores) return false;
      const score = s.feedback.scores[def.dimension];
      if (typeof score !== 'number' || score < def.threshold) return false;
      const diff = s.brief?.difficulty || 'neutral';
      if (!difficultyMeetsOrExceeds(diff, def.requiredDifficulty)) return false;
      if (def.requiresEvents && !s.eventsActive && (!s.eventPolicy || s.eventPolicy === 'none')) return false;
      return true;
    });

    // Take the most recent qualifying sessions (sessions are newest first)
    const qualifyingRecent = qualifying.slice(0, def.requiredSessions);
    const earned = qualifyingRecent.length >= def.requiredSessions;

    belts[def.color] = {
      color: def.color,
      earned,
      qualifyingSessions: qualifyingRecent.length,
      qualifyingSessionIds: qualifyingRecent.map((s) => s.id),
      earnedDate: earned ? qualifyingRecent[0]?.date || null : null,
    };
  }
  return belts;
}

/**
 * Computes the user's bias profile from N sessions.
 */
export function computeBiasProfile(sessions) {
  const counts = {};
  for (const s of sessions) {
    if (!s.feedback?.biasesDetected) continue;
    for (const b of s.feedback.biasesDetected) {
      counts[b.biasType] = (counts[b.biasType] || 0) + 1;
    }
  }
  const total = Math.min(sessions.length, 10);
  const recentSessions = sessions.slice(0, 10);
  const recentCounts = {};
  for (const s of recentSessions) {
    if (!s.feedback?.biasesDetected) continue;
    for (const b of s.feedback.biasesDetected) {
      recentCounts[b.biasType] = (recentCounts[b.biasType] || 0) + 1;
    }
  }

  return Object.keys(counts).map((biasType) => ({
    biasType,
    count: counts[biasType],
    lastNSessions: recentCounts[biasType] || 0,
    frequency: total > 0 ? (recentCounts[biasType] || 0) / total : 0,
  }));
}

/**
 * Identifies the 2 weakest scoring dimensions.
 */
export function identifyWeaknesses(sessions) {
  const dims = ['outcomeLeverage', 'batnaDiscipline', 'emotionalRegulation', 'biasResistance', 'conversationalFlow'];
  const avgs = {};
  for (const dim of dims) {
    const scores = sessions
      .filter((s) => s.feedback?.scores?.[dim] !== undefined)
      .map((s) => s.feedback.scores[dim]);
    avgs[dim] = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }
  return dims.sort((a, b) => avgs[a] - avgs[b]).slice(0, 2);
}

/**
 * Formats belt status for CLI display.
 */
export function formatBeltDisplay(belts) {
  const lines = [];
  for (const def of BELT_DEFINITIONS) {
    const status = belts[def.color];
    const icon = status?.earned ? '●' : '○';
    const progress = status ? `${status.qualifyingSessions}/${def.requiredSessions}` : '0/' + def.requiredSessions;
    lines.push(`  ${icon} ${def.name} [${progress}]${status?.earned ? ' — OBTENUE' : ''}`);
  }
  return lines.join('\n');
}
