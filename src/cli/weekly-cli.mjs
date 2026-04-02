#!/usr/bin/env node
// weekly-cli.mjs — display the packaged scenario of the ISO week

import { listScenarios } from '../../scenarios/index.mjs';
import { selectScenarioOfWeek } from '../leaderboard.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m', yellow: '\x1b[33m', dim: '\x1b[2m' };

async function main() {
  const scenarios = await listScenarios();
  const weekly = selectScenarioOfWeek(scenarios, { date: new Date() });

  console.log(`\n${c.bold}${c.cyan}═══ NegotiateAI — Scenario of the Week ═══${c.reset}\n`);
  console.log(`  ${c.dim}Semaine:${c.reset} ${weekly.weekKey}`);
  console.log(`  ${c.dim}ID:${c.reset} ${weekly.scenario.id}`);
  console.log(`  ${c.dim}Nom:${c.reset} ${weekly.scenario.name}`);
  if (weekly.scenario.description) {
    console.log(`  ${c.dim}Pitch:${c.reset} ${weekly.scenario.description}`);
  }
  console.log(`\n  ${c.yellow}Tip:${c.reset} lance-le avec ${c.bold}npm start${c.reset} ou via le web/Telegram preset correspondant.\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
