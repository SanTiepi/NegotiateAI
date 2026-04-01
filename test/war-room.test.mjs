import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMockProvider } from '../src/provider.mjs';
import { createStore, randomUUID } from '../src/store.mjs';
import { DRILL_CATALOG } from '../src/drill.mjs';
import { assertValidWarRoomReport, generateMorningReport, runWarRoom } from '../src/war-room.mjs';

const MOCK_ADVERSARY = {
  identity: 'Morgan, Procurement Lead',
  style: 'Firm and analytical',
  publicObjective: 'Reduce cost and protect margins',
  hiddenObjective: 'Needs a fast signature before quarter close',
  batna: 'Delay the project one month',
  nonNegotiables: ['No vague scope', 'Needs a signed timeline'],
  timePressure: 'High',
  emotionalProfile: { confidence: 70, frustration: 25, egoThreat: 10 },
  likelyTactics: ['Budget pressure', 'Normative framing'],
  vulnerabilities: ['Deadline pressure', 'Stakeholder scrutiny'],
};

function createWarRoomProvider(options = {}) {
  let turnCalls = 0;

  return createMockProvider({
    adversary: () => MOCK_ADVERSARY,
    autoMessage: (req) => ({
      message: options.autoMessage?.(req) || 'Oui, c\'est la norme, je comprends.',
    }),
    turn: (req) => {
      turnCalls += 1;
      if (options.failTurnCalls?.includes(turnCalls)) {
        throw new Error(`turn fail ${turnCalls}`);
      }
      return {
        adversaryResponse: options.adversaryResponse?.(turnCalls, req) || 'C\'est la norme du marché, tout le monde paie ce prix.',
        sessionOver: false,
        endReason: null,
      };
    },
    drillScore: () => ({
      feedback: 'Feedback qualitatif utile.',
      tips: ['Reste structuré', 'Protège ton seuil'],
    }),
    warRoomStrategy: {
      strategy: options.strategy || 'Reframe plus tôt, protège ton seuil minimal, puis ancre avec plus de conviction.',
    },
  });
}

async function seedSession(store, overrides = {}) {
  await store.saveSession({
    id: randomUUID(),
    date: new Date().toISOString(),
    brief: {
      objective: 'Win',
      batna: 'Walk away',
      minimalThreshold: 'Survive',
      difficulty: 'neutral',
    },
    adversary: MOCK_ADVERSARY,
    transcript: [],
    status: 'ended',
    turns: 1,
    feedback: {
      globalScore: 58,
      scores: {
        outcomeLeverage: 8,
        batnaDiscipline: 11,
        emotionalRegulation: 9,
        biasResistance: 4,
        conversationalFlow: 6,
      },
      biasesDetected: [],
    },
    mode: 'full',
    ...overrides,
  });
}

describe('war-room', () => {
  it('runWarRoom returns a valid report and saves completed sessions', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'war-room-'));
    const store = createStore({ dataDir: tmpDir });
    const provider = createWarRoomProvider();

    const report = await runWarRoom(store, provider, { drillCount: 4 });
    const sessions = await store.loadSessions();
    const progression = await store.loadProgression();

    assert.doesNotThrow(() => assertValidWarRoomReport(report));
    assert.equal(report.drillsCompleted + report.drillsFailed, 4);
    assert.equal(sessions.length, report.drillsCompleted);
    assert.equal(progression.totalSessions, sessions.length);
    assert.equal(typeof report.strategy, 'string');
  });

  it('targets drills from an existing bias profile instead of cold-start rotation', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'war-room-'));
    const store = createStore({ dataDir: tmpDir });
    await seedSession(store);
    await store.saveProgression({
      belts: {},
      biasProfile: {
        anchoring: {
          totalCount: 4,
          recentCount: 4,
          frequency: 0.8,
          lastSeen: '2026-04-01T00:00:00.000Z',
          nextDrillDate: '2026-04-01',
          _recentCounts: [1, 1, 1, 1],
          _interval: 1,
        },
      },
      totalSessions: 1,
      currentStreak: 1,
      lastSessionDate: '2026-04-01',
      weakDimensions: ['outcomeLeverage', 'biasResistance'],
      recentAvgScore: 58,
      currentDifficulty: 'neutral',
    });

    const report = await runWarRoom(store, createWarRoomProvider(), { drillCount: 6 });

    assert.equal(report.targetedBias, 'anchoring');
    assert.equal(report.targetedDrillId, 'anchor');
    assert.ok(report.drillCounts.anchor >= 3, `Expected anchor to dominate plan, got ${JSON.stringify(report.drillCounts)}`);
  });

  it('continues the batch when one drill fails', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'war-room-'));
    const store = createStore({ dataDir: tmpDir });
    const provider = createWarRoomProvider({ failTurnCalls: [2] });

    const report = await runWarRoom(store, provider, { drillCount: 3 });
    const sessions = await store.loadSessions();

    assert.equal(report.drillsFailed, 1);
    assert.equal(report.drillsCompleted, 2);
    assert.equal(report.failedDrills.length, 1);
    assert.equal(sessions.length, 2);
  });

  it('updates the cumulative bias profile after the batch', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'war-room-'));
    const store = createStore({ dataDir: tmpDir });
    const provider = createWarRoomProvider();

    const report = await runWarRoom(store, provider, { drillCount: 2 });
    const progression = await store.loadProgression();

    assert.ok(report.biasProfile.framing.totalCount > 0, 'Expected framing bias to be tracked');
    assert.ok(progression.biasProfile.framing.totalCount > 0, 'Expected saved progression to include framing bias');
  });

  it('generateMorningReport formats a readable morning summary', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'war-room-'));
    const store = createStore({ dataDir: tmpDir });
    const provider = createWarRoomProvider({ strategy: 'Commence par reframer le cadre, puis ancre plus haut.' });

    const report = await runWarRoom(store, provider, { drillCount: 2 });
    const morning = await generateMorningReport(report, provider);

    assert.ok(morning.includes('Overnight War Room'));
    assert.ok(morning.includes(`Drills complétés: ${report.drillsCompleted}/${report.drillCountRequested}`));
    assert.ok(morning.includes('Stratégie du jour'));
  });

  it('cold start rotates across the full drill catalog', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'war-room-'));
    const store = createStore({ dataDir: tmpDir });
    const provider = createWarRoomProvider();

    const report = await runWarRoom(store, provider, { drillCount: DRILL_CATALOG.length });

    assert.equal(report.targetedBias, null);
    assert.equal(report.targetedDrillId, null);
    assert.deepEqual(report.drillPlan, DRILL_CATALOG.map((drill) => drill.id));
  });
});
