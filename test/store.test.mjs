import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStore, assertValidSessionEntry, randomUUID } from '../src/store.mjs';

function makeEntry(overrides = {}) {
  return {
    id: randomUUID(),
    date: new Date().toISOString(),
    brief: { objective: 'test', batna: 'test', minimalThreshold: 'test' },
    adversary: { identity: 'Test' },
    transcript: [{ role: 'user', content: 'hi' }],
    status: 'ended',
    turns: 1,
    feedback: { globalScore: 50, scores: {} },
    mode: 'full',
    ...overrides,
  };
}

let tmpDir;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'negotiate-test-'));
});

describe('store', () => {
  it('creates data directory if it does not exist', async () => {
    const dir = join(tmpDir, 'subdir', 'nested');
    const store = createStore({ dataDir: dir });
    await store.saveSession(makeEntry());
    assert.equal(store.getDataDir(), dir);
  });

  it('saveSession + loadSessions round-trips a SessionEntry', async () => {
    const store = createStore({ dataDir: tmpDir });
    const entry = makeEntry();
    await store.saveSession(entry);
    const loaded = await store.loadSessions();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, entry.id);
  });

  it('loadSessions returns newest first, capped at 50', async () => {
    const store = createStore({ dataDir: tmpDir });
    for (let i = 0; i < 5; i++) {
      await store.saveSession(makeEntry({ id: `id-${i}`, date: new Date(2026, 0, i + 1).toISOString() }));
    }
    const loaded = await store.loadSessions();
    assert.equal(loaded.length, 5);
    assert.equal(loaded[0].id, 'id-4'); // newest first
  });

  it('lastN(3) returns exactly 3 entries', async () => {
    const store = createStore({ dataDir: tmpDir });
    for (let i = 0; i < 5; i++) {
      await store.saveSession(makeEntry());
    }
    const last3 = await store.lastN(3);
    assert.equal(last3.length, 3);
  });

  it('saveProgression + loadProgression round-trips', async () => {
    const store = createStore({ dataDir: tmpDir });
    const prog = { belts: {}, biasProfile: [], totalSessions: 5, currentStreak: 3, lastSessionDate: '2026-03-30', weakDimensions: ['batnaDiscipline'] };
    await store.saveProgression(prog);
    const loaded = await store.loadProgression();
    assert.equal(loaded.totalSessions, 5);
    assert.equal(loaded.currentStreak, 3);
  });

  it('loadSessions returns empty array when file does not exist', async () => {
    const store = createStore({ dataDir: tmpDir });
    const loaded = await store.loadSessions();
    assert.deepEqual(loaded, []);
  });

  it('loadProgression returns default when file does not exist', async () => {
    const store = createStore({ dataDir: tmpDir });
    const prog = await store.loadProgression();
    assert.equal(prog.totalSessions, 0);
    assert.equal(prog.currentStreak, 0);
    assert.deepEqual(prog.belts, {});
  });

  it('assertValidSessionEntry throws on missing id', () => {
    assert.throws(() => assertValidSessionEntry({ date: 'x', feedback: {}, brief: {}, transcript: [], status: 'ended' }), /id/i);
  });

  it('assertValidSessionEntry throws on missing feedback', () => {
    assert.throws(() => assertValidSessionEntry({ id: 'x', date: 'x', brief: {}, transcript: [], status: 'ended' }), /feedback/i);
  });

  it('concurrent writes do not corrupt the file', async () => {
    const store = createStore({ dataDir: tmpDir });
    await Promise.all([
      store.saveSession(makeEntry({ id: 'a' })),
      store.saveSession(makeEntry({ id: 'b' })),
    ]);
    const loaded = await store.loadSessions();
    assert.equal(loaded.length, 2);
  });

  it('respects custom dataDir option', async () => {
    const customDir = join(tmpDir, 'custom');
    const store = createStore({ dataDir: customDir });
    assert.equal(store.getDataDir(), customDir);
  });
});
