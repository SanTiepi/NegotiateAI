#!/usr/bin/env node
// dashboard-cli.mjs — Display reusable dashboard stats from persisted sessions

import { createStore } from '../store.mjs';
import { computeDashboardStats } from '../dashboard.mjs';
import { evaluateAutonomyLevel, describeAutonomyGap } from '../autonomy.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m', yellow: '\x1b[33m' };

async function main() {
  const store = createStore();
  const [sessions, progression] = await Promise.all([store.loadSessions(), store.loadProgression()]);
  const stats = computeDashboardStats(sessions, progression);
  const autonomy = evaluateAutonomyLevel({
    totalSessions: stats.totalSessions,
    avgScore: stats.averageScore,
    earnedBelts: Object.values(stats.belts || {}).filter((belt) => belt?.earned).length,
  });

  console.log(`\n${c.bold}${c.cyan}═══ NegotiateAI — Dashboard ═══${c.reset}\n`);
  console.log(`  ${c.dim}Sessions:${c.reset} ${stats.totalSessions}`);
  console.log(`  ${c.dim}Score moyen:${c.reset} ${stats.averageScore}/100`);
  console.log(`  ${c.dim}Dernier score:${c.reset} ${stats.latestScore}/100`);
  console.log(`  ${c.dim}Progression:${c.reset} ${stats.progressionDelta >= 0 ? '+' : ''}${stats.progressionDelta}`);
  console.log(`  ${c.dim}Streak:${c.reset} ${stats.currentStreak} jours`);
  console.log(`  ${c.dim}Autonomie:${c.reset} ${autonomy.label} — ${describeAutonomyGap(autonomy)}`);

  if (stats.bestDimension?.dimension) {
    console.log(`\n${c.bold}${c.cyan}Dimensions${c.reset}`);
    console.log(`  ${c.dim}Plus forte:${c.reset} ${stats.bestDimension.dimension} (${stats.bestDimension.average})`);
    console.log(`  ${c.dim}A renforcer:${c.reset} ${stats.weakestDimension.dimension} (${stats.weakestDimension.average})`);
    for (const entry of stats.dimensionAverages) {
      console.log(`  ${c.yellow}•${c.reset} ${entry.dimension}: ${entry.average}`);
    }
  }

  if (stats.modeBreakdown.length) {
    console.log(`\n${c.bold}${c.cyan}Répartition modes${c.reset}`);
    for (const entry of stats.modeBreakdown) console.log(`  ${c.yellow}•${c.reset} ${entry.mode}: ${entry.count}`);
  }

  if (stats.difficultyBreakdown.length) {
    console.log(`\n${c.bold}${c.cyan}Répartition difficultés${c.reset}`);
    for (const entry of stats.difficultyBreakdown) console.log(`  ${c.yellow}•${c.reset} ${entry.difficulty}: ${entry.count}`);
  }

  console.log('');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
