// ticker.mjs — Real-time negotiation ticker (biofeedback cognitif visuel)
// Inspired by: bookmaker odds + trader spread + DJ tension arc
// Shows deal quality, leverage, bias risk as live-updating bars

import { analyzeZOPA, getMomentumTrend } from './worldEngine.mjs';

/**
 * Compute all ticker values from current session state.
 */
export function computeTicker(session) {
  const world = session._world;
  if (!world) return defaultTicker();

  const emotions = world.emotions;
  const nego = world.negotiation;
  const zopa = analyzeZOPA(nego);
  const trend = getMomentumTrend(nego);

  // Deal quality: 0-100 (how close to user's ideal)
  const dealQuality = zopa.dealQuality ?? 50;

  // Leverage: -100 to +100
  const leverage = nego.leverageBalance;

  // Bias risk: based on adversary's tactical pressure vs user's resistance
  // High adversary arousal + low user momentum = high bias risk
  const biasRisk = Math.min(100, Math.max(0,
    Math.round(50 + (emotions.arousal || 0) * 0.3 - (nego.momentum || 0) * 0.2 - (emotions.openness || 0) * 0.1)
  ));

  // Adversary openness to deal
  const dealProbability = Math.min(100, Math.max(0,
    Math.round(emotions.openness * 0.4 + (100 - emotions.egoThreat) * 0.3 + (100 - emotions.frustration) * 0.2 + emotions.fear * 0.1)
  ));

  // Tension level (for narrative arc) — derived from emotions only, not PAD directly
  const tension = Math.min(100, Math.max(0,
    Math.round((emotions.frustration || 0) * 0.30 + (emotions.egoThreat || 0) * 0.25 + (emotions.fear || 0) * 0.20 + (100 - (emotions.openness || 50)) * 0.15 + (emotions.contempt || 0) * 0.10)
  ));

  return {
    dealQuality,
    leverage,
    biasRisk,
    dealProbability,
    tension,
    momentum: nego.momentum,
    momentumTrend: trend,
    turn: world.turn,
    zopaExists: zopa.zopaExists,
  };
}

function defaultTicker() {
  return {
    dealQuality: 50,
    leverage: 0,
    biasRisk: 50,
    dealProbability: 50,
    tension: 30,
    momentum: 0,
    momentumTrend: 'stable',
    turn: 0,
    zopaExists: true,
  };
}

/**
 * Format ticker as ANSI CLI display — the "trading floor" view.
 */
export function formatTicker(ticker) {
  const trendIcon = ticker.momentumTrend === 'gaining' ? '▲' : ticker.momentumTrend === 'losing' ? '▼' : '►';
  const trendColor = ticker.momentumTrend === 'gaining' ? '\x1b[32m' : ticker.momentumTrend === 'losing' ? '\x1b[31m' : '\x1b[33m';
  const reset = '\x1b[0m';
  const dim = '\x1b[2m';
  const bold = '\x1b[1m';
  const cyan = '\x1b[36m';
  const green = '\x1b[32m';
  const red = '\x1b[31m';
  const yellow = '\x1b[33m';

  const dealBar = colorBar(ticker.dealQuality, 100, 12, green, red);
  const leverageBar = colorBarSigned(ticker.leverage, 12);
  const biasBar = colorBar(ticker.biasRisk, 100, 12, red, green); // reversed: high = bad
  const probBar = colorBar(ticker.dealProbability, 100, 12, green, red);
  const tensionBar = colorBar(ticker.tension, 100, 12, yellow, dim);

  return [
    `${dim}  ┌─ TICKER ─────────────────────────────────────────────────────┐${reset}`,
    `${dim}  │${reset} ${cyan}Deal${reset}    ${dealBar} ${bold}${ticker.dealQuality}%${reset}   ${cyan}Leverage${reset} ${leverageBar} ${bold}${ticker.leverage > 0 ? '+' : ''}${ticker.leverage}${reset}  ${dim}│${reset}`,
    `${dim}  │${reset} ${red}Risque${reset}  ${biasBar} ${bold}${ticker.biasRisk}%${reset}   ${cyan}Probab.${reset}  ${probBar} ${bold}${ticker.dealProbability}%${reset}  ${dim}│${reset}`,
    `${dim}  │${reset} ${yellow}Tension${reset} ${tensionBar} ${bold}${ticker.tension}%${reset}   ${trendColor}Momentum ${trendIcon} ${ticker.momentum > 0 ? '+' : ''}${ticker.momentum}${reset}      ${dim}│${reset}`,
    `${dim}  └──────────────────────────────────────────────────────────────┘${reset}`,
  ].join('\n');
}

/**
 * Format ticker as compact one-liner for drill/daily modes.
 */
export function formatTickerCompact(ticker) {
  const trendIcon = ticker.momentumTrend === 'gaining' ? '↑' : ticker.momentumTrend === 'losing' ? '↓' : '→';
  return `Deal:${ticker.dealQuality}% Lev:${ticker.leverage > 0 ? '+' : ''}${ticker.leverage} Risk:${ticker.biasRisk}% Mom:${trendIcon}${ticker.momentum}`;
}

/**
 * Compute pre-session odds — "Your estimated success rate"
 * Based on user's historical performance + scenario difficulty.
 */
export function computePreSessionOdds(progression, difficulty) {
  if (!progression || progression.totalSessions < 3) {
    return { successRate: 50, confidence: 'low', message: 'Pas assez de données — estimation par défaut.' };
  }

  const avgScore = progression.recentAvgScore || 50;
  const difficultyPenalty = { cooperative: 0, neutral: -10, hostile: -20, manipulative: -30 }[difficulty] || -10;

  // Factor in bias vulnerability
  const biasProfile = progression.biasProfile || {};
  const vulnerableCount = Object.values(biasProfile).filter((b) => (b.frequency || 0) > 0.4).length;
  const biasPenalty = vulnerableCount * -5;

  const rate = Math.min(95, Math.max(10, Math.round(avgScore + difficultyPenalty + biasPenalty)));
  const confidence = progression.totalSessions >= 10 ? 'high' : progression.totalSessions >= 5 ? 'medium' : 'low';

  return {
    successRate: rate,
    confidence,
    message: `Basé sur ${progression.totalSessions} sessions (confiance: ${confidence}).`,
  };
}

// ============================================================
// Helper: colored progress bars
// ============================================================

function colorBar(value, max, width, goodColor, badColor) {
  const reset = '\x1b[0m';
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  const color = value > 60 ? goodColor : value > 35 ? '\x1b[33m' : badColor;
  return `${color}${'█'.repeat(filled)}${reset}\x1b[2m${'░'.repeat(empty)}${reset}`;
}

function colorBarSigned(value, width) {
  const reset = '\x1b[0m';
  const half = Math.floor(width / 2);
  const normalized = Math.round((value / 100) * half);

  if (value >= 0) {
    const leftEmpty = '░'.repeat(half);
    const rightFilled = '█'.repeat(Math.min(normalized, half));
    const rightEmpty = '░'.repeat(half - Math.min(normalized, half));
    return `\x1b[2m${leftEmpty}${reset}\x1b[32m${rightFilled}${reset}\x1b[2m${rightEmpty}${reset}`;
  } else {
    const leftEmpty = '░'.repeat(half + normalized);
    const leftFilled = '█'.repeat(-normalized);
    const rightEmpty = '░'.repeat(half);
    return `\x1b[2m${leftEmpty}${reset}\x1b[31m${leftFilled}${reset}\x1b[2m${rightEmpty}${reset}`;
  }
}
