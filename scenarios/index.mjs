// scenarios/index.mjs — Standardized scenario loader
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CATEGORY_PREFIXES = [
  { prefix: 'swiss-', category: 'swiss' },
  { prefix: 'tutorial-', category: 'tutorial' },
  { prefix: 'vs-', category: 'celebrity' },
  { prefix: 'assert-', category: 'assertiveness' },
];

const CONVERSATION_TYPES = {
  tutorial: 'negotiation',
  core: 'negotiation',
  swiss: 'negotiation',
  celebrity: 'negotiation',
  extreme: 'negotiation',
  assertiveness: 'assertiveness',
  feedback: 'feedback',
};

const CANONICAL_TIERS = ['cooperative', 'neutral', 'hostile', 'manipulative'];

function extractAvailableTiers(raw) {
  const configured = Object.keys(raw?.tiers || {}).filter(Boolean);
  const all = new Set(['neutral', ...configured]);
  return CANONICAL_TIERS.filter((tier) => all.has(tier));
}

function inferScenarioCategory(id) {
  if (typeof id !== 'string') return 'core';
  return CATEGORY_PREFIXES.find(({ prefix }) => id.startsWith(prefix))?.category || 'core';
}

function buildScenarioMetadata(raw, scenarioFile) {
  const category = raw.category || inferScenarioCategory(raw.id);
  return {
    id: raw.id,
    name: raw.name,
    version: raw.version,
    category,
    conversationType: raw.conversationType || CONVERSATION_TYPES[category] || 'negotiation',
    scenarioFile,
    availableTiers: extractAvailableTiers(raw),
  };
}

function buildScenarioSummary(raw, scenarioFile) {
  const metadata = buildScenarioMetadata(raw, scenarioFile);
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    category: metadata.category,
    scenarioFile: metadata.scenarioFile,
    metadata,
  };
}

export async function listScenarios() {
  const files = await readdir(__dirname);
  const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
  const scenarios = [];
  for (const fileName of jsonFiles) {
    const raw = JSON.parse(await readFile(join(__dirname, fileName), 'utf-8'));
    scenarios.push(buildScenarioSummary(raw, fileName.replace(/\.json$/i, '')));
  }
  return scenarios;
}

export async function loadScenario(id, tier = 'neutral') {
  const files = await readdir(__dirname);
  const match = files.find((f) => f === `${id}.json`);
  if (!match) throw new Error(`Scenario not found: ${id}`);

  const raw = JSON.parse(await readFile(join(__dirname, match), 'utf-8'));
  const tierOverrides = raw.tiers?.[tier] || {};
  const brief = { ...raw.brief, ...tierOverrides };
  const metadata = {
    ...buildScenarioMetadata(raw, match.replace(/\.json$/i, '')),
    tier,
  };

  return { brief, adversary: raw.adversary, metadata };
}
