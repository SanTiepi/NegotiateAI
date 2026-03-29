// index.mjs — CLI entry point
// Flow: setup → conversation → feedback → plan
// Commands: /end, /restart, /retry, /quit, /stats

import * as readline from 'node:readline';
import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { createSession, processTurn } from './engine.mjs';
import { analyzeFeedback } from './analyzer.mjs';
import { generatePlan } from './planner.mjs';
import { createAnthropicProvider } from './provider.mjs';
import { createStore, randomUUID } from './store.mjs';
import { evaluateBelts, computeBiasProfile, identifyWeaknesses, formatBeltDisplay } from './belt.mjs';

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function print(text) { process.stdout.write(text + '\n'); }
function header(text) { print(`\n${c.bold}${c.cyan}═══ ${text} ═══${c.reset}\n`); }
function label(name, value) { print(`  ${c.dim}${name}:${c.reset} ${value}`); }

async function askQuestion(rl, question, required = false) {
  return new Promise((resolve) => {
    const ask = () => {
      rl.question(`${c.yellow}${question}${c.reset} `, (answer) => {
        const trimmed = answer.trim();
        if (required && !trimmed) {
          print(`${c.red}  Ce champ est obligatoire.${c.reset}`);
          ask();
        } else {
          resolve(trimmed);
        }
      });
    };
    ask();
  });
}

async function setupPhase(rl) {
  header('SETUP — Décris ta négociation');
  print(`${c.dim}  Les champs marqués * sont obligatoires. Sans BATNA, pas de session.${c.reset}\n`);

  const situation = await askQuestion(rl, 'Situation (contexte) :');
  const userRole = await askQuestion(rl, 'Ton rôle :');
  const adversaryRole = await askQuestion(rl, "Rôle de l'adversaire :");
  const objective = await askQuestion(rl, '* Ton objectif :', true);
  const minimalThreshold = await askQuestion(rl, '* Seuil minimal acceptable :', true);
  const batna = await askQuestion(rl, '* Ta BATNA (plan B si échec) :', true);
  const constraintsRaw = await askQuestion(rl, 'Contraintes (séparées par des virgules) :');
  const constraints = constraintsRaw ? constraintsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  print(`\n${c.dim}  Difficulté : cooperative / neutral / hostile / manipulative${c.reset}`);
  const difficulty = (await askQuestion(rl, 'Difficulté [neutral] :')) || 'neutral';
  const relationalStakes = await askQuestion(rl, 'Enjeu relationnel :');

  print(`\n${c.dim}  Événements imprévus : oui / non${c.reset}`);
  const eventsRaw = await askQuestion(rl, 'Activer les événements ? [non] :');
  const eventPolicy = eventsRaw.toLowerCase().startsWith('o') || eventsRaw.toLowerCase() === 'yes' ? 'random' : 'none';

  return { brief: buildBrief({ situation, userRole, adversaryRole, objective, minimalThreshold, batna, constraints, difficulty, relationalStakes }), eventPolicy };
}

async function conversationPhase(rl, session, store) {
  header(`NÉGOCIATION — vs ${session.adversary.identity}`);
  print(`${c.dim}  Commandes : /end /quit /restart /retry /stats${c.reset}`);
  print(`${c.dim}  Max ${session.maxTurns} tours. Bonne chance.${c.reset}\n`);

  while (session.status === 'active') {
    const userMsg = await askQuestion(rl, `${c.green}[Tour ${session.turn + 1}] Toi >${c.reset}`);
    if (!userMsg) continue;

    if (userMsg.trim().toLowerCase() === '/restart') return 'restart';
    if (userMsg.trim().toLowerCase() === '/retry') return 'retry';
    if (userMsg.trim().toLowerCase() === '/stats') {
      const sessions = await store.loadSessions();
      const belts = evaluateBelts(sessions);
      print(`\n${formatBeltDisplay(belts)}\n`);
      continue;
    }

    let result;
    try {
      result = await processTurn(session, userMsg);
    } catch (err) {
      print(`\n${c.red}  Erreur durant le tour: ${err.message}${c.reset}`);
      print(`${c.dim}  Le tour n'a pas été comptabilisé. Réessayez ou tapez /end.${c.reset}\n`);
      continue;
    }

    // Event display
    if (result.event) {
      print(`\n${c.bold}${c.yellow}${result.event.narrative}${c.reset}`);
    }

    if (result.adversaryResponse) {
      print(`\n${c.magenta}  ${session.adversary.identity}:${c.reset} ${result.adversaryResponse}`);
    }

    // Real-time coaching
    if (result.coaching) {
      if (result.coaching.biasDetected) {
        print(`${c.red}  ⚠ Biais détecté: ${result.coaching.biasDetected}${c.reset}`);
      }
      if (result.coaching.alternative) {
        print(`${c.cyan}  → Alternative: ${result.coaching.alternative}${c.reset}`);
      }
      if (result.coaching.tip) {
        print(`${c.cyan}  💡 ${result.coaching.tip}${c.reset}`);
      }
    }

    if (result.detectedSignals.length > 0) {
      print(`${c.dim}  [Signaux: ${result.detectedSignals.join(', ')}]${c.reset}`);
    }

    print(`${c.dim}  [Confiance: ${result.state.confidence} | Frustration: ${result.state.frustration} | Momentum: ${result.state.momentum}]${c.reset}\n`);

    if (result.sessionOver) {
      print(`\n${c.bold}${c.yellow}Session terminée: ${result.endReason}${c.reset}`);
      break;
    }
  }

  return 'done';
}

function displayFeedback(report) {
  header('FEEDBACK');
  print(`${c.bold}  Score global: ${report.globalScore}/100${c.reset}\n`);
  print(`  ${c.cyan}Détail des scores:${c.reset}`);
  label('Outcome/Leverage', `${report.scores.outcomeLeverage}/25`);
  label('Discipline BATNA', `${report.scores.batnaDiscipline}/20`);
  label('Régulation émotionnelle', `${report.scores.emotionalRegulation}/25`);
  label('Résistance aux biais', `${report.scores.biasResistance}/15`);
  label('Flow conversationnel', `${report.scores.conversationalFlow}/15`);

  if (report.biasesDetected.length > 0) {
    print(`\n  ${c.red}Biais détectés:${c.reset}`);
    for (const bias of report.biasesDetected) {
      print(`  ${c.red}•${c.reset} ${bias.biasType} (tour ${bias.turn}): "${bias.excerpt}"`);
      print(`    ${c.dim}${bias.explanation}${c.reset}`);
    }
  }
  if (report.tacticsUsed.length > 0) {
    print(`\n  ${c.green}Tactiques utilisées:${c.reset}`);
    for (const t of report.tacticsUsed) print(`  ${c.green}•${c.reset} ${t}`);
  }
  if (report.missedOpportunities.length > 0) {
    print(`\n  ${c.yellow}Opportunités manquées:${c.reset}`);
    for (const o of report.missedOpportunities) print(`  ${c.yellow}•${c.reset} ${o}`);
  }
  if (report.recommendations.length > 0) {
    print(`\n  ${c.blue}Recommandations:${c.reset}`);
    for (const r of report.recommendations) print(`  ${c.blue}•${c.reset} ${r}`);
  }
}

function displayPlan(plan) {
  header('PLAN DE NÉGOCIATION OPTIMAL');
  print(`  ${c.cyan}Ouverture recommandée:${c.reset}`);
  print(`  ${plan.recommendedOpening}\n`);
  print(`  ${c.cyan}Labels & Mirrors:${c.reset}`);
  for (const lm of plan.labelsAndMirrors) print(`  • ${lm}`);
  print(`\n  ${c.cyan}Questions de découverte:${c.reset}`);
  for (const q of plan.discoveryQuestions) print(`  • ${q}`);
  print(`\n  ${c.cyan}Stratégie d'ancrage:${c.reset}`);
  print(`  ${plan.anchoringStrategy}`);
  print(`\n  ${c.cyan}Séquence de concessions:${c.reset}`);
  for (const step of plan.concessionSequence) {
    print(`  ${c.dim}Si:${c.reset} ${step.condition} → ${step.concession}`);
  }
  print(`\n  ${c.red}Lignes rouges:${c.reset}`);
  for (const r of plan.redLines) print(`  ${c.red}•${c.reset} ${r}`);
  print(`\n  ${c.bold}Walk-away:${c.reset} ${plan.walkAwayRule}`);
}

async function updateProgression(store) {
  const sessions = await store.loadSessions();
  const belts = evaluateBelts(sessions);
  const biasProfile = computeBiasProfile(sessions);
  const weak = identifyWeaknesses(sessions);

  const today = new Date().toISOString().slice(0, 10);
  const prev = await store.loadProgression();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = prev.lastSessionDate === yesterday ? prev.currentStreak + 1 : (prev.lastSessionDate === today ? prev.currentStreak : 1);

  const recentScores = sessions.slice(0, 3).map((s) => s.feedback?.globalScore || 0);
  const recentAvg = recentScores.length > 0 ? recentScores.reduce((a, b) => a + b, 0) / recentScores.length : 0;

  await store.saveProgression({
    belts,
    biasProfile,
    totalSessions: sessions.length,
    currentStreak: streak,
    lastSessionDate: today,
    weakDimensions: weak,
    recentAvgScore: Math.round(recentAvg),
    currentDifficulty: sessions[0]?.brief?.difficulty || 'cooperative',
  });

  return belts;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    print(`${c.red}Erreur: ANTHROPIC_API_KEY non définie.${c.reset}`);
    print(`${c.dim}export ANTHROPIC_API_KEY=sk-ant-...${c.reset}`);
    process.exit(1);
  }

  const provider = createAnthropicProvider({ apiKey });
  const store = createStore();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  process.on('SIGINT', () => { print(`\n${c.dim}  Interruption. Au revoir !${c.reset}\n`); rl.close(); process.exit(0); });

  print(`\n${c.bold}${c.cyan}╔════════════════════════════════════════════╗${c.reset}`);
  print(`${c.bold}${c.cyan}║   NegotiateAI — Simulateur de négociation  ║${c.reset}`);
  print(`${c.bold}${c.cyan}║   Miroir cognitif + Coach temps réel       ║${c.reset}`);
  print(`${c.bold}${c.cyan}╚════════════════════════════════════════════╝${c.reset}`);

  // Show progression on start
  const prog = await store.loadProgression();
  if (prog.totalSessions > 0) {
    print(`\n${c.dim}  Sessions: ${prog.totalSessions} | Streak: ${prog.currentStreak}j | Score moyen: ${prog.recentAvgScore || '?'}/100${c.reset}`);
  }

  let running = true;

  while (running) {
    try {
      const { brief, eventPolicy } = await setupPhase(rl);

      print(`\n${c.dim}  Génération de l'adversaire...${c.reset}`);
      const adversary = await generatePersona(brief, provider);
      print(`${c.dim}  Adversaire prêt: ${adversary.identity}${c.reset}`);

      let retryWithSameBrief = true;

      while (retryWithSameBrief) {
        const session = createSession(brief, adversary, provider, { eventPolicy });
        const outcome = await conversationPhase(rl, session, store);

        if (outcome === 'restart') { retryWithSameBrief = false; continue; }
        if (outcome === 'retry') { print(`\n${c.dim}  Nouvelle tentative...${c.reset}`); continue; }

        // Feedback
        print(`\n${c.dim}  Analyse en cours...${c.reset}`);
        const report = await analyzeFeedback(session, provider);
        displayFeedback(report);

        // Plan
        print(`\n${c.dim}  Génération du plan optimal...${c.reset}`);
        const plan = await generatePlan(brief, report, provider);
        displayPlan(plan);

        // Save session
        await store.saveSession({
          id: randomUUID(),
          date: new Date().toISOString(),
          brief: session.brief,
          adversary: session.adversary,
          transcript: session.transcript,
          status: session.status,
          turns: session.turn,
          feedback: report,
          plan,
          mode: 'full',
          eventPolicy,
          eventsActive: eventPolicy !== 'none',
        });

        // Update progression
        const belts = await updateProgression(store);
        const newBelts = Object.values(belts).filter((b) => b.earned);
        if (newBelts.length > 0) {
          print(`\n${c.bold}${c.green}Ceintures obtenues:${c.reset}`);
          for (const b of newBelts) print(`  ${c.green}● ${b.color}${c.reset}`);
        }

        print(`${c.dim}  Session sauvegardée.${c.reset}`);

        // Post-session menu
        const choice = await askQuestion(rl, `\n${c.cyan}[R]ejouer / [N]ouveau / [S]tats / [Q]uitter${c.reset} `);
        const ch = choice.toLowerCase();
        if (ch === 'r' || ch.startsWith('rej')) continue;
        if (ch === 's' || ch.startsWith('sta')) {
          const sessions = await store.loadSessions();
          const allBelts = evaluateBelts(sessions);
          print(`\n${formatBeltDisplay(allBelts)}\n`);
          retryWithSameBrief = false;
          continue;
        }
        if (ch === 'q' || ch.startsWith('qui')) { running = false; retryWithSameBrief = false; continue; }
        retryWithSameBrief = false; // 'n' or anything else = new scenario
      }
    } catch (err) {
      print(`\n${c.red}Erreur: ${err.message}${c.reset}`);
      const cont = await askQuestion(rl, `${c.yellow}Continuer ? (oui/non)${c.reset} `);
      if (!cont.toLowerCase().startsWith('o')) running = false;
    }
  }

  print(`\n${c.dim}  Au revoir. Bonne négociation !${c.reset}\n`);
  rl.close();
}

main();
