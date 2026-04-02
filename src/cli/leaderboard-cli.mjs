#!/usr/bin/env node
// leaderboard-cli.mjs — display persisted top runs for a packaged scenario

import { createStore } from '../store.mjs';
import { listScenarios } from '../../scenarios/index.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m', yellow: '\x1b[33m', dim: '\x1b[2m' };

async function main() {
  const scenarioId = process.argv[2];
  const limit = Math.max(1, Number(process.argv[3]) || 5);
  const store = createStore();

  if (!scenarioId) {
    const scenarios = await listScenarios();
    console.log(`\n${c.bold}${c.cyan}═══ NegotiateAI — Leaderboard${c.reset}\n`);
    console.log(`Usage: npm run leaderboard -- <scenario-id> [limit]\n`);
    console.log('Scenarios disponibles:');
    for (const scenario of scenarios) {
      console.log(`  ${c.yellow}•${c.reset} ${scenario.id} ${c.dim}— ${scenario.name}${c.reset}`);
    }
    console.log('');
    return;
  }

  const leaderboard = await store.getScenarioLeaderboard(scenarioId, { limit });
  console.log(`\n${c.bold}${c.cyan}═══ NegotiateAI — Leaderboard (${scenarioId}) ═══${c.reset}\n`);

  if (!leaderboard.entries.length) {
    console.log('Aucun run persisté pour ce scénario.\n');
    return;
  }

  for (const entry of leaderboard.entries) {
    console.log(`  ${c.yellow}#${entry.rank}${c.reset} ${entry.score}/100 ${c.dim}· ${entry.turns} tours · ${entry.mode} · ${entry.date || 'date inconnue'}${c.reset}`);
  }
  console.log('');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
