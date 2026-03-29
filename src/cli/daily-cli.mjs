#!/usr/bin/env node
// daily-cli.mjs — Daily auto-calibrated challenge

import * as readline from 'node:readline';
import { createStore, randomUUID } from '../store.mjs';
import { generateDaily, dailyAlreadyPlayed } from '../daily.mjs';
import { createSession, processTurn } from '../engine.mjs';
import { analyzeFeedback } from '../analyzer.mjs';
import { createAnthropicProvider } from '../provider.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m', green: '\x1b[32m', magenta: '\x1b[35m' };

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.log(`${c.red}ANTHROPIC_API_KEY non définie.${c.reset}`); process.exit(1); }

  const store = createStore();

  if (await dailyAlreadyPlayed(store)) {
    console.log(`\n${c.yellow}Tu as déjà joué le daily aujourd'hui. Reviens demain !${c.reset}\n`);
    process.exit(0);
  }

  const provider = createAnthropicProvider({ apiKey });
  console.log(`\n${c.dim}Génération du challenge quotidien...${c.reset}`);
  const daily = await generateDaily(store, provider);

  console.log(`\n${c.bold}${c.cyan}═══ Daily Challenge — ${daily.date} ═══${c.reset}`);
  console.log(`  ${c.dim}Difficulté:${c.reset} ${daily.difficulty}`);
  console.log(`  ${c.dim}Skill ciblé:${c.reset} ${daily.targetSkill}`);
  console.log(`  ${c.dim}Tours max:${c.reset} ${daily.maxTurns}`);
  console.log(`  ${c.dim}Situation:${c.reset} ${daily.brief.situation}`);
  console.log(`  ${c.dim}Objectif:${c.reset} ${daily.brief.objective}\n`);

  const session = createSession(daily.brief, daily.adversary, provider, {
    maxTurns: daily.maxTurns,
    eventPolicy: daily.eventPolicy,
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  while (session.status === 'active') {
    const userMsg = await new Promise((r) => rl.question(`${c.green}[${session.turn + 1}/${daily.maxTurns}] Toi > ${c.reset}`, r));
    if (!userMsg.trim()) continue;
    if (userMsg.trim().toLowerCase() === '/quit') { session.status = 'quit'; break; }
    if (userMsg.trim().toLowerCase() === '/end') { session.status = 'ended'; break; }

    try {
      const result = await processTurn(session, userMsg);
      if (result.event) {
        console.log(`\n${c.bold}${c.yellow}${result.event.narrative}${c.reset}`);
      }
      if (result.adversaryResponse) {
        console.log(`\n${c.magenta}  ${session.adversary.identity}:${c.reset} ${result.adversaryResponse}`);
      }
      if (result.coaching?.tip) {
        console.log(`${c.cyan}  💡 ${result.coaching.tip}${c.reset}`);
      }
      console.log(`${c.dim}  [Momentum: ${result.state.momentum}]${c.reset}\n`);
      if (result.sessionOver) {
        console.log(`${c.bold}${c.yellow}Session terminée: ${result.endReason}${c.reset}\n`);
        break;
      }
    } catch (err) {
      console.log(`${c.red}  Erreur: ${err.message}. Réessayez.${c.reset}`);
    }
  }

  console.log(`${c.dim}Analyse...${c.reset}`);
  const feedback = await analyzeFeedback(session, provider);

  console.log(`\n${c.bold}Score: ${feedback.globalScore}/100${c.reset}`);
  console.log(`  ${c.dim}Outcome:${c.reset} ${feedback.scores.outcomeLeverage}/25  ${c.dim}BATNA:${c.reset} ${feedback.scores.batnaDiscipline}/20  ${c.dim}Émotions:${c.reset} ${feedback.scores.emotionalRegulation}/25`);
  if (feedback.biasesDetected.length > 0) {
    console.log(`  ${c.red}Biais:${c.reset} ${feedback.biasesDetected.map((b) => b.biasType).join(', ')}`);
  }

  await store.saveSession({
    id: randomUUID(),
    date: new Date().toISOString(),
    brief: session.brief,
    adversary: session.adversary,
    transcript: session.transcript,
    status: session.status === 'active' ? 'ended' : session.status,
    turns: session.turn,
    feedback,
    mode: 'daily',
    eventPolicy: daily.eventPolicy,
    eventsActive: daily.eventPolicy !== 'none',
  });

  console.log(`${c.dim}Session sauvegardée. À demain !${c.reset}\n`);
  rl.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
