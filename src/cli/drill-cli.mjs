#!/usr/bin/env node
// drill-cli.mjs — Run a focused skill drill

import * as readline from 'node:readline';
import { createStore, randomUUID } from '../store.mjs';
import { DRILL_CATALOG, createDrill, recommendDrill, scoreDrill } from '../drill.mjs';
import { processTurn } from '../engine.mjs';
import { createAnthropicProvider } from '../provider.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m', green: '\x1b[32m', magenta: '\x1b[35m' };

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.log(`${c.red}ANTHROPIC_API_KEY non définie.${c.reset}`); process.exit(1); }

  const store = createStore();
  const progression = await store.loadProgression();
  const recommended = recommendDrill(progression);

  console.log(`\n${c.bold}${c.cyan}═══ Drill — Exercice ciblé ═══${c.reset}\n`);
  console.log(`  ${c.dim}Recommandé:${c.reset} ${recommended}\n`);

  DRILL_CATALOG.forEach((d, i) => {
    const rec = d.id === recommended ? ` ${c.green}← recommandé${c.reset}` : '';
    console.log(`  ${i + 1}. ${c.bold}${d.name}${c.reset} (${d.maxTurns} tours) — ${d.description}${rec}`);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((r) => rl.question(`\n${c.yellow}Choix [${recommended}]: ${c.reset}`, r));
  const choice = answer.trim();
  const drillId = choice ? (DRILL_CATALOG[parseInt(choice, 10) - 1]?.id || choice) : recommended;

  const provider = createAnthropicProvider({ apiKey });
  console.log(`\n${c.dim}Préparation du drill "${drillId}"...${c.reset}`);

  const { session, drill } = await createDrill(drillId, provider);
  console.log(`\n${c.bold}${c.cyan}═══ ${drill.name} — ${drill.maxTurns} tours ═══${c.reset}`);
  console.log(`${c.dim}  ${drill.description}${c.reset}\n`);

  for (let t = 0; t < drill.maxTurns; t++) {
    const userMsg = await new Promise((r) => rl.question(`${c.green}[${t + 1}/${drill.maxTurns}] Toi > ${c.reset}`, r));
    if (!userMsg.trim()) { t--; continue; }
    if (userMsg.trim().toLowerCase() === '/quit') break;

    const result = await processTurn(session, userMsg);
    if (result.adversaryResponse) {
      console.log(`\n${c.magenta}  ${session.adversary.identity}:${c.reset} ${result.adversaryResponse}`);
    }
    if (result.coaching?.tip) {
      console.log(`${c.cyan}  💡 ${result.coaching.tip}${c.reset}`);
    }
    console.log('');
    if (result.sessionOver) break;
  }

  console.log(`\n${c.dim}Évaluation...${c.reset}`);
  const drillResult = await scoreDrill(session, drill, provider);

  console.log(`\n${c.bold}${drillResult.passed ? c.green : c.red}Score: ${drillResult.skillScore}/100 ${drillResult.passed ? '— RÉUSSI' : '— À RETRAVAILLER'}${c.reset}`);
  console.log(`  ${drillResult.feedback}`);
  if (drillResult.tips.length > 0) {
    console.log(`\n${c.cyan}  Tips:${c.reset}`);
    for (const tip of drillResult.tips) console.log(`  • ${tip}`);
  }

  // Save to store
  await store.saveSession({
    id: randomUUID(),
    date: new Date().toISOString(),
    brief: session.brief,
    adversary: session.adversary,
    transcript: session.transcript,
    status: session.status === 'active' ? 'ended' : session.status,
    turns: session.turn,
    feedback: { globalScore: drillResult.skillScore, scores: { [drill.skill]: drillResult.skillScore } },
    mode: 'drill',
  });

  console.log(`${c.dim}  Session sauvegardée.${c.reset}\n`);
  rl.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
