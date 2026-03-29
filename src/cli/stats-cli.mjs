#!/usr/bin/env node
// stats-cli.mjs — Display belt status, bias profile, and streak

import { createStore } from '../store.mjs';
import { evaluateBelts, computeBiasProfile, identifyWeaknesses, formatBeltDisplay } from '../belt.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m', green: '\x1b[32m' };

async function main() {
  const store = createStore();
  const sessions = await store.loadSessions();
  const progression = await store.loadProgression();

  console.log(`\n${c.bold}${c.cyan}═══ NegotiateAI — Statistiques ═══${c.reset}\n`);

  console.log(`  ${c.dim}Sessions totales:${c.reset} ${sessions.length}`);
  console.log(`  ${c.dim}Streak:${c.reset} ${progression.currentStreak || 0} jours`);

  if (sessions.length > 0) {
    const avgScore = Math.round(sessions.slice(0, 10).reduce((a, s) => a + (s.feedback?.globalScore || 0), 0) / Math.min(sessions.length, 10));
    console.log(`  ${c.dim}Score moyen (10 dernières):${c.reset} ${avgScore}/100`);
  }

  console.log(`\n${c.bold}${c.cyan}Ceintures${c.reset}`);
  const belts = evaluateBelts(sessions);
  console.log(formatBeltDisplay(belts));

  if (sessions.length > 0) {
    console.log(`\n${c.bold}${c.cyan}Profil de biais${c.reset}`);
    const biasProfile = computeBiasProfile(sessions);
    if (biasProfile.length === 0) {
      console.log(`  ${c.green}Aucun biais récurrent détecté.${c.reset}`);
    } else {
      for (const b of biasProfile.sort((a, b) => b.frequency - a.frequency)) {
        const bar = '█'.repeat(Math.round(b.frequency * 10));
        console.log(`  ${b.biasType.padEnd(25)} ${bar} ${Math.round(b.frequency * 100)}%`);
      }
    }

    console.log(`\n${c.bold}${c.cyan}Faiblesses${c.reset}`);
    const weak = identifyWeaknesses(sessions);
    for (const w of weak) console.log(`  ${c.yellow}•${c.reset} ${w}`);
  }

  console.log('');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
