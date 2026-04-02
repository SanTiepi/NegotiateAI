#!/usr/bin/env node
// versus-cli.mjs — compare 2 human messages on the same brief from the terminal

import { readFile } from 'node:fs/promises';

import { createAnthropicProvider } from '../provider.mjs';
import { adjudicateVersusRound } from '../versus.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m', magenta: '\x1b[35m', dim: '\x1b[2m' };

function parseArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

async function readJsonFile(filePath, readFileImpl = readFile) {
  const raw = await readFileImpl(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function runVersusCli({
  argv = process.argv.slice(2),
  provider,
  stdout = process.stdout,
  stderr = process.stderr,
  readFileImpl = readFile,
} = {}) {
  const options = parseArgs(argv);

  if (options.help || options.h || !options.brief || !options['message-a'] || !options['message-b']) {
    stdout.write(`\n${c.bold}${c.cyan}═══ NegotiateAI — Versus CLI ═══${c.reset}\n\n`);
    stdout.write('Compare 2 formulations humaines sur le meme brief.\n\n');
    stdout.write('Usage:\n');
    stdout.write('  npm run versus -- --brief brief.json --message-a "..." --message-b "..." [--name-a Alice] [--name-b Bob] [--transcript transcript.json]\n\n');
    stdout.write('brief.json doit respecter le contrat Brief (objective + minimalThreshold + batna obligatoires).\n\n');
    return 0;
  }

  try {
    const brief = await readJsonFile(options.brief, readFileImpl);
    const transcript = options.transcript ? await readJsonFile(options.transcript, readFileImpl) : [];
    const llmProvider = provider || createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY });
    const judgment = await adjudicateVersusRound({
      brief,
      transcript,
      playerA: { name: options['name-a'] || 'Message A', message: options['message-a'] },
      playerB: { name: options['name-b'] || 'Message B', message: options['message-b'] },
    }, llmProvider);

    const winnerLabel = judgment.winner === 'playerA'
      ? (options['name-a'] || 'Message A')
      : judgment.winner === 'playerB'
        ? (options['name-b'] || 'Message B')
        : 'Match nul';

    stdout.write(`\n${c.bold}${c.cyan}═══ NegotiateAI — Versus Verdict ═══${c.reset}\n\n`);
    stdout.write(`  ${c.dim}Vainqueur:${c.reset} ${c.bold}${winnerLabel}${c.reset}\n`);
    stdout.write(`  ${c.dim}Score A:${c.reset} ${judgment.scoreA.total}/100\n`);
    stdout.write(`  ${c.dim}Score B:${c.reset} ${judgment.scoreB.total}/100\n`);
    stdout.write(`  ${c.dim}Rationale:${c.reset} ${judgment.rationale}\n`);

    if (judgment.swingFactors?.length) {
      stdout.write(`  ${c.dim}Swing factors:${c.reset} ${judgment.swingFactors.join(' · ')}\n`);
    }

    stdout.write(`\n${c.bold}${c.green}Coach A${c.reset}\n`);
    for (const line of judgment.coachingA || []) {
      stdout.write(`  ${c.yellow}•${c.reset} ${line}\n`);
    }

    stdout.write(`\n${c.bold}${c.magenta}Coach B${c.reset}\n`);
    for (const line of judgment.coachingB || []) {
      stdout.write(`  ${c.yellow}•${c.reset} ${line}\n`);
    }
    stdout.write('\n');
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isDirectRun) {
  const exitCode = await runVersusCli();
  process.exit(exitCode);
}
