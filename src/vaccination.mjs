// vaccination.mjs — Cognitive Vaccination Card
// A shareable profile showing bias resistance status, like an immunization record.

import { BIAS_TYPES } from './biasTracker.mjs';
import { BELT_DEFINITIONS } from './belt.mjs';
import { evaluateAutonomyLevel, describeAutonomyGap } from './autonomy.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BIAS_LABELS = {
  anchoring: 'Ancrage',
  loss_aversion: 'Aversion perte',
  conflict_avoidance: 'Évitement conflit',
  framing: 'Framing',
  conversational_blocking: 'Blocage conv.',
};

const DIMENSION_LABELS = {
  outcomeLeverage: 'Leverage',
  batnaDiscipline: 'Discipline BATNA',
  emotionalRegulation: 'Régulation émotionnelle',
  biasResistance: 'Résistance aux biais',
  conversationalFlow: 'Flow conversationnel',
};

const DIMENSIONS = ['outcomeLeverage', 'batnaDiscipline', 'emotionalRegulation', 'biasResistance', 'conversationalFlow'];

const BELT_ORDER = ['white', 'yellow', 'green', 'blue', 'black'];

const BELT_LABELS = {
  white: 'Blanche',
  yellow: 'Jaune',
  green: 'Verte',
  blue: 'Bleue',
  black: 'Noire',
};

const STATUS_ICONS = {
  immunized: '\u{1F6E1}\uFE0F',
  partially_resistant: '\u26A1',
  vulnerable: '\u26A0\uFE0F',
  untested: '\u2753',
};

const STATUS_LABELS = {
  immunized: 'Immunisé',
  partially_resistant: 'Partiellement',
  vulnerable: 'Vulnérable',
  untested: 'Non testé',
};

// ---------------------------------------------------------------------------
// Status logic
// ---------------------------------------------------------------------------

function computeBiasStatus(exposures, frequency) {
  if (exposures < 3) return 'untested';
  if (frequency > 0.40) return 'vulnerable';
  if (exposures >= 3 && frequency > 0.30) return 'vulnerable';
  if (frequency < 0.15 && exposures >= 5) return 'immunized';
  if (frequency >= 0.15 && frequency <= 0.40 && exposures >= 3) return 'partially_resistant';
  // exposures 3-4 and frequency < 0.15 — not enough exposures for immunized
  return 'partially_resistant';
}

function computeTrend(recentCounts) {
  if (!recentCounts || recentCounts.length < 3) return 'stable';
  const half = Math.floor(recentCounts.length / 2);
  const firstHalf = recentCounts.slice(0, half);
  const secondHalf = recentCounts.slice(half);
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const diff = avgSecond - avgFirst;
  if (diff < -0.1) return 'improving';
  if (diff > 0.1) return 'declining';
  return 'stable';
}

// ---------------------------------------------------------------------------
// Negotiator level logic
// ---------------------------------------------------------------------------

function computeNegotiatorLevel(totalSessions, avgScore, earnedBeltCount) {
  if (totalSessions >= 50 && avgScore > 75 && earnedBeltCount >= 5) return 'Maître';
  if (totalSessions >= 30 && avgScore > 65 && earnedBeltCount >= 4) return 'Expert';
  if (totalSessions >= 15 && avgScore > 55 && earnedBeltCount >= 2) return 'Avancé';
  if (totalSessions >= 5 && avgScore > 40) return 'Intermédiaire';
  return 'Débutant';
}

function computeNextMilestone(level, totalSessions, avgScore, earnedBeltCount) {
  switch (level) {
    case 'Débutant':
      return 'Atteindre 5 sessions avec un score moyen > 40';
    case 'Intermédiaire':
      if (earnedBeltCount < 2) return `Obtenir ${2 - earnedBeltCount} ceinture(s) supplémentaire(s)`;
      if (avgScore <= 55) return 'Augmenter le score moyen au-dessus de 55';
      return 'Atteindre 15 sessions';
    case 'Avancé':
      if (earnedBeltCount < 4) return `Obtenir ${4 - earnedBeltCount} ceinture(s) supplémentaire(s)`;
      if (avgScore <= 65) return 'Augmenter le score moyen au-dessus de 65';
      return 'Atteindre 30 sessions';
    case 'Expert':
      if (earnedBeltCount < 5) return 'Obtenir la Ceinture Noire';
      if (avgScore <= 75) return 'Augmenter le score moyen au-dessus de 75';
      return 'Atteindre 50 sessions';
    case 'Maître':
      return 'Maintenir l\'excellence et explorer de nouveaux scénarios';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Main generation
// ---------------------------------------------------------------------------

/**
 * Generate a vaccination card from progression data and session history.
 * @param {object} progression — from store.loadProgression()
 * @param {Array} sessions — from store.loadSessions()
 * @returns {VaccinationCard}
 */
export function generateVaccinationCard(progression, sessions) {
  const totalSessions = sessions.length;

  // Compute average global score
  const scoredSessions = sessions.filter((s) => s.feedback?.globalScore != null);
  const avgScore = scoredSessions.length > 0
    ? scoredSessions.reduce((sum, s) => sum + s.feedback.globalScore, 0) / scoredSessions.length
    : 0;

  // Compute dimension averages for strengths/weaknesses
  const dimAvgs = {};
  for (const dim of DIMENSIONS) {
    const scores = sessions
      .filter((s) => s.feedback?.scores?.[dim] != null)
      .map((s) => s.feedback.scores[dim]);
    dimAvgs[dim] = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }
  const sortedDims = [...DIMENSIONS].sort((a, b) => dimAvgs[b] - dimAvgs[a]);
  const strengths = sortedDims.slice(0, 2).map((d) => DIMENSION_LABELS[d]);
  const weaknesses = sortedDims.slice(-2).map((d) => DIMENSION_LABELS[d]);

  // Belt info
  const belts = progression.belts || {};
  const earnedBelts = BELT_ORDER.filter((c) => belts[c]?.earned);
  const highestBelt = earnedBelts.length > 0 ? earnedBelts[earnedBelts.length - 1] : null;
  const belt = highestBelt ? BELT_LABELS[highestBelt] : 'Aucune';

  // Bias entries
  const biasProfile = progression.biasProfile || {};
  const biasEntries = BIAS_TYPES.map((biasType) => {
    const entry = biasProfile[biasType] || {};
    const exposures = entry.totalCount || 0;
    const frequency = entry.frequency || 0;
    const status = computeBiasStatus(exposures, frequency);
    const resistanceRate = exposures > 0 ? Math.round((1 - frequency) * 100) : 0;
    const trend = computeTrend(entry._recentCounts);
    return {
      biasType,
      status,
      exposures,
      resistanceRate,
      lastExposure: entry.lastSeen || null,
      trend,
      icon: STATUS_ICONS[status],
    };
  });

  // Level
  const negotiatorLevel = computeNegotiatorLevel(totalSessions, avgScore, earnedBelts.length);
  const nextMilestone = computeNextMilestone(negotiatorLevel, totalSessions, avgScore, earnedBelts.length);
  const autonomy = evaluateAutonomyLevel({ totalSessions, avgScore, earnedBelts: earnedBelts.length });

  return {
    generatedDate: new Date().toISOString().split('T')[0],
    totalSessions,
    belt,
    biases: biasEntries,
    strengths,
    weaknesses,
    negotiatorLevel,
    nextMilestone,
    autonomy: {
      level: autonomy.level,
      label: autonomy.label,
      key: autonomy.key,
      nextLabel: autonomy.next?.label || null,
      unlockGap: describeAutonomyGap(autonomy),
    },
  };
}

// ---------------------------------------------------------------------------
// CLI display (rich ANSI)
// ---------------------------------------------------------------------------

/**
 * Format vaccination card for CLI display with ANSI colors and box drawing.
 * @param {VaccinationCard} card
 * @returns {string}
 */
export function formatVaccinationCard(card) {
  const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m', red: '\x1b[31m' };
  const W = 48;
  const top = '\u2554' + '\u2550'.repeat(W) + '\u2557';
  const mid = '\u2560' + '\u2550'.repeat(W) + '\u2563';
  const bot = '\u255A' + '\u2550'.repeat(W) + '\u255D';
  const pad = (s, len) => {
    // Strip ANSI for length calculation
    const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
    const diff = len - visible.length;
    return diff > 0 ? s + ' '.repeat(diff) : s;
  };
  const row = (content) => '\u2551 ' + pad(content, W - 2) + ' \u2551';

  const lines = [];
  lines.push(top);
  lines.push(row(`${c.bold}${c.cyan}CARNET DE VACCINATION COGNITIVE${c.reset}`));
  lines.push(row(`Négociateur ${card.negotiatorLevel} (Ceinture ${card.belt})`));
  lines.push(mid);
  lines.push(row(''));

  for (const bias of card.biases) {
    const label = BIAS_LABELS[bias.biasType] || bias.biasType;
    const dots = '.'.repeat(Math.max(1, 20 - label.length));
    let statusText;
    if (bias.status === 'untested') {
      statusText = STATUS_LABELS[bias.status];
    } else {
      statusText = `${STATUS_LABELS[bias.status]} (${bias.resistanceRate}%)`;
    }
    lines.push(row(`${bias.icon} ${label} ${dots} ${statusText}`));
  }

  lines.push(row(''));
  lines.push(row(`${c.bold}Forces:${c.reset} ${card.strengths.join(', ')}`));
  lines.push(row(`${c.bold}À travailler:${c.reset} ${card.weaknesses.join(', ')}`));
  lines.push(row(`${c.bold}Autonomie:${c.reset} L${card.autonomy.level} — ${card.autonomy.label}`));
  lines.push(row(`${c.bold}Unlock:${c.reset} ${card.autonomy.unlockGap}`));
  lines.push(row(`${c.bold}Prochain objectif:${c.reset} ${card.nextMilestone}`));
  lines.push(bot);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Shareable plain text
// ---------------------------------------------------------------------------

/**
 * Format vaccination card as plain text suitable for copy-pasting / sharing.
 * @param {VaccinationCard} card
 * @returns {string}
 */
export function formatShareableCard(card) {
  const lines = [];
  lines.push('\uD83E\uDDE0 Mon profil NegotiateAI');
  lines.push(`Niveau: ${card.negotiatorLevel} | Ceinture: ${card.belt} | ${card.totalSessions} sessions`);
  lines.push(`Autonomie: L${card.autonomy.level} — ${card.autonomy.label}`);
  lines.push('');
  lines.push('Biais cognitifs:');

  for (const bias of card.biases) {
    if (bias.status === 'untested') continue;
    const label = BIAS_LABELS[bias.biasType] || bias.biasType;
    const shortStatus = bias.status === 'immunized' ? 'Immunisé'
      : bias.status === 'partially_resistant' ? 'Partiel'
        : 'Vulnérable';
    lines.push(`${bias.icon} ${label} — ${shortStatus} (${bias.resistanceRate}%)`);
  }

  lines.push('');
  lines.push('Teste tes propres biais: negotiateai.app');

  return lines.join('\n');
}
