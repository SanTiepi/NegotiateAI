#!/usr/bin/env node
// simulate-batch-cli.mjs — compare up to 5 offer formulations from the terminal

import { readFile } from 'node:fs/promises';

import { createAnthropicProvider } from '../provider.mjs';
import { simulateBeforeSendBatch } from '../simulate.mjs';
import { loadScenario } from '../../scenarios/index.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m' };

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
  return JSON.parse(await readFileImpl(filePath, 'utf8'));
}

async function readMessagesFile(filePath, readFileImpl = readFile) {
  const raw = await readFileImpl(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function resolveInputs(options, { readFileImpl = readFile, loadScenarioImpl = loadScenario } = {}) {
  if (options.scenario) {
    const { brief, adversary } = await loadScenarioImpl(options.scenario, options.tier || 'neutral');
    return { brief, adversary };
  }

  if (!options.brief || !options.adversary) {
    throw new Error('Either --scenario <id> or both --brief <file> and --adversary <file> are required');
  }

  const [brief, adversary] = await Promise.all([
    readJsonFile(options.brief, readFileImpl),
    readJsonFile(options.adversary, readFileImpl),
  ]);

  return { brief, adversary };
}

export async function runSimulateBatchCli({
  argv = process.argv.slice(2),
  provider,
  stdout = process.stdout,
  stderr = process.stderr,
  readFileImpl = readFile,
  loadScenarioImpl = loadScenario,
} = {}) {
  const options = parseArgs(argv);

  if (options.help || options.h || !options.messages || (!options.scenario && (!options.brief || !options.adversary))) {
    stdout.write(`\n${c.bold}${c.cyan}═══ NegotiateAI — Simulate Batch CLI ═══${c.reset}\n\n`);
    stdout.write('Compare jusqu\'a 5 formulations avant de les envoyer pour de vrai.\n\n');
    stdout.write('Usage:\n');
    stdout.write('  npm run simulate-batch -- --scenario swiss-property-purchase --tier neutral --messages variants.txt [--transcript transcript.json]\n');
    stdout.write('  npm run simulate-batch -- --brief brief.json --adversary adversary.json --messages variants.txt [--transcript transcript.json]\n\n');
    stdout.write('variants.txt = une formulation par ligne (max 5).\n\n');
    return 0;
  }

  try {
    const { brief, adversary } = await resolveInputs(options, { readFileImpl, loadScenarioImpl });
    const messages = await readMessagesFile(options.messages, readFileImpl);
    const transcript = options.transcript ? await readJsonFile(options.transcript, readFileImpl) : [];

    if (messages.length === 0) throw new Error('messages file must contain at least one non-empty line');
    if (messages.length > 5) throw new Error('simulate-batch CLI supports up to 5 variants per run');

    const llmProvider = provider || createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY });
    const batch = await simulateBeforeSendBatch({
      brief,
      adversary,
      offerMessages: messages,
      transcript,
      provider: llmProvider,
    });

    stdout.write(`\n${c.bold}${c.cyan}═══ NegotiateAI — Simulate Batch Verdict ═══${c.reset}\n\n`);
    stdout.write(`  ${c.dim}Variantes:${c.reset} ${messages.length}\n`);
    stdout.write(`  ${c.dim}Meilleure option:${c.reset} #${batch.bestIndex + 1}\n\n`);

    batch.reports.forEach((report, index) => {
      const isBest = index === batch.bestIndex;
      const marker = isBest ? `${c.green}★${c.reset}` : `${c.dim}·${c.reset}`;
      const verdictColor = report.sendVerdict === 'send' ? c.green : report.sendVerdict === 'revise' ? c.yellow : c.red;
      stdout.write(`${marker} ${c.bold}#${index + 1}${c.reset} ${messages[index]}\n`);
      stdout.write(`    Verdict: ${verdictColor}${report.sendVerdict}${c.reset} · Score ${report.approvalScore}/100 · Risque ${report.riskLevel}\n`);
      stdout.write(`    Outcome: ${report.predictedOutcome}\n`);
      if (report.likelyObjections?.length) {
        stdout.write(`    Objections: ${report.likelyObjections.join(' · ')}\n`);
      }
      if (report.recommendedRewrite) {
        stdout.write(`    Rewrite: ${report.recommendedRewrite}\n`);
      }
      stdout.write('\n');
    });

    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (isDirectRun) {
  const exitCode = await runSimulateBatchCli();
  process.exit(exitCode);
}
