import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { createStore } from '../src/store.mjs';

const execFile = promisify(execFileCb);
const repoRoot = process.cwd();

async function seedStore() {
  const dataDir = await mkdtemp(join(tmpdir(), 'negotiate-ai-cli-'));
  const store = createStore({ dataDir });
  await store.saveSession({
    id: 'cli-1',
    date: '2026-04-02T10:00:00.000Z',
    turns: 4,
    mode: 'cli',
    status: 'ended',
    brief: { userRole: 'Acheteur', objective: 'Signer', minimalThreshold: 'Remise', batna: 'Autre bien' },
    adversary: { identity: 'Mme Dubois' },
    transcript: [],
    feedback: { globalScore: 93, scores: {} },
    scenario: { id: 'salary-negotiation' },
  });
  return dataDir;
}

describe('academy CLI commands', () => {
  it('leaderboard CLI prints persisted ranks for a scenario', async () => {
    const dataDir = await seedStore();
    const { stdout } = await execFile(process.execPath, ['src/cli/leaderboard-cli.mjs', 'salary-negotiation', '3'], {
      cwd: repoRoot,
      env: { ...process.env, NEGOTIATE_AI_DATA_DIR: dataDir },
    });

    assert.match(stdout, /Leaderboard \(salary-negotiation\)/);
    assert.match(stdout, /#1/);
    assert.match(stdout, /93\/100/);
  });

  it('weekly CLI prints a deterministic scenario of the week payload shape', async () => {
    const { stdout } = await execFile(process.execPath, ['src/cli/weekly-cli.mjs'], {
      cwd: repoRoot,
      env: process.env,
    });

    assert.match(stdout, /Scenario of the Week/);
    assert.match(stdout, /Semaine:/);
    assert.match(stdout, /ID:/);
    assert.match(stdout, /Nom:/);
  });
});
