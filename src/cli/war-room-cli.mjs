#!/usr/bin/env node
// war-room-cli.mjs — Run the Overnight War Room batch from the terminal

import { readFileSync } from 'node:fs';
try { for (const line of readFileSync(new URL('../../.env', import.meta.url), 'utf-8').split('\n')) { const [key, ...value] = line.split('='); if (key?.trim() && value.length) process.env[key.trim()] = value.join('=').trim(); } } catch {}

import { createAnthropicProvider } from '../provider.mjs';
import { createStore } from '../store.mjs';
import { generateMorningReport, runWarRoom } from '../war-room.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m' };

function parseDrillCount(argv) {
  const raw = argv.find((arg) => /^\d+$/.test(arg))
    || argv.find((arg) => arg.startsWith('--count='))?.split('=')[1];
  const count = parseInt(raw || '50', 10);
  return Number.isFinite(count) && count > 0 ? count : 50;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log(`${c.red}ANTHROPIC_API_KEY non définie.${c.reset}`);
    process.exit(1);
  }

  const drillCount = parseDrillCount(process.argv.slice(2));
  const store = createStore();
  const provider = createAnthropicProvider({ apiKey });

  console.log(`\n${c.bold}${c.cyan}═══ Overnight War Room ═══${c.reset}`);
  console.log(`${c.dim}Lancement de ${drillCount} drills batch...${c.reset}\n`);

  const result = await runWarRoom(store, provider, { drillCount });
  const report = await generateMorningReport(result, provider);

  console.log(report);
  console.log(`\n${c.dim}Batch terminé. Sessions ajoutées: ${result.drillsCompleted}.${c.reset}\n`);
}

main().catch((error) => {
  console.error(`${c.red}${error.message}${c.reset}`);
  process.exit(1);
});
