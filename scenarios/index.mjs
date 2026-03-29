// scenarios/index.mjs — Standardized scenario loader
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function listScenarios() {
  const files = await readdir(__dirname);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));
  const scenarios = [];
  for (const f of jsonFiles) {
    const raw = JSON.parse(await readFile(join(__dirname, f), 'utf-8'));
    scenarios.push({ id: raw.id, name: raw.name, description: raw.description });
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
  return { brief, adversary: raw.adversary, metadata: { id: raw.id, name: raw.name, version: raw.version } };
}
