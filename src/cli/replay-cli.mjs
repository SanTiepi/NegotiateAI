#!/usr/bin/env node
// replay-cli.mjs — Select and replay a past session with annotations

import * as readline from 'node:readline';
import { createStore } from '../store.mjs';
import { generateReplay, formatReplay } from '../replay.mjs';
import { createAnthropicProvider } from '../provider.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m' };

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.log(`${c.red}ANTHROPIC_API_KEY non définie.${c.reset}`); process.exit(1); }

  const store = createStore();
  const sessions = await store.loadSessions();

  if (sessions.length === 0) {
    console.log(`${c.yellow}Aucune session enregistrée. Joue d'abord une partie avec npm start.${c.reset}`);
    process.exit(0);
  }

  console.log(`\n${c.bold}${c.cyan}═══ Replay — Choisis une session ═══${c.reset}\n`);
  sessions.slice(0, 10).forEach((s, i) => {
    const score = s.feedback?.globalScore ?? '?';
    const diff = s.brief?.difficulty || '?';
    const date = s.date?.slice(0, 10) || '?';
    console.log(`  ${c.dim}${i + 1}.${c.reset} [${date}] ${diff} — Score: ${score}/100 — ${s.brief?.objective?.slice(0, 50) || 'N/A'}`);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((r) => rl.question(`\n${c.yellow}Numéro de session: ${c.reset}`, r));
  const idx = parseInt(answer, 10) - 1;

  if (isNaN(idx) || idx < 0 || idx >= sessions.length) {
    console.log(`${c.red}Choix invalide.${c.reset}`);
    rl.close();
    process.exit(1);
  }

  const provider = createAnthropicProvider({ apiKey });
  console.log(`\n${c.dim}Génération du replay annoté...${c.reset}`);
  const replay = await generateReplay(sessions[idx], provider);
  console.log(formatReplay(replay));

  rl.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
