import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateDaily, dailyAlreadyPlayed, calibrateDifficulty } from '../src/daily.mjs';
import { createStore, randomUUID } from '../src/store.mjs';
import { createMockProvider } from '../src/provider.mjs';

const MOCK_ADVERSARY = {
  identity: 'Test',
  style: 'Firm',
  publicObjective: 'Test',
  hiddenObjective: 'Test',
  batna: 'Test',
  nonNegotiables: ['No'],
  timePressure: 'Low',
  emotionalProfile: { confidence: 50, frustration: 20, egoThreat: 10 },
  likelyTactics: ['Pressure'],
  vulnerabilities: ['Time'],
};

describe('daily', () => {
  it('generateDaily returns a DailyChallenge with all required fields', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'daily-'));
    const store = createStore({ dataDir: tmpDir });
    const provider = createMockProvider({ adversary: MOCK_ADVERSARY });
    const daily = await generateDaily(store, provider);
    assert.equal(typeof daily.date, 'string');
    assert.ok(daily.brief);
    assert.ok(daily.adversary);
    assert.equal(typeof daily.targetSkill, 'string');
    assert.equal(typeof daily.difficulty, 'string');
    assert.equal(typeof daily.maxTurns, 'number');
  });

  it('dailyAlreadyPlayed returns false when no sessions today', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'daily-'));
    const store = createStore({ dataDir: tmpDir });
    const result = await dailyAlreadyPlayed(store);
    assert.equal(result, false);
  });

  it('dailyAlreadyPlayed returns true when daily session exists today', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'daily-'));
    const store = createStore({ dataDir: tmpDir });
    await store.saveSession({
      id: randomUUID(),
      date: new Date().toISOString(),
      brief: { objective: 'x', batna: 'x', minimalThreshold: 'x' },
      adversary: {},
      transcript: [],
      status: 'ended',
      feedback: { globalScore: 50 },
      mode: 'daily',
    });
    const result = await dailyAlreadyPlayed(store);
    assert.equal(result, true);
  });

  it('calibrateDifficulty returns cooperative for < 3 sessions', () => {
    assert.equal(calibrateDifficulty({ totalSessions: 0 }), 'cooperative');
    assert.equal(calibrateDifficulty({ totalSessions: 2 }), 'cooperative');
  });

  it('calibrateDifficulty steps up when average > 40', () => {
    const result = calibrateDifficulty({ totalSessions: 5, recentAvgScore: 55, currentDifficulty: 'cooperative' });
    assert.equal(result, 'neutral');
  });

  it('calibrateDifficulty steps up 2 when average > 70', () => {
    const result = calibrateDifficulty({ totalSessions: 10, recentAvgScore: 75, currentDifficulty: 'cooperative' });
    assert.equal(result, 'hostile');
  });

  it('calibrateDifficulty caps at manipulative', () => {
    const result = calibrateDifficulty({ totalSessions: 20, recentAvgScore: 85, currentDifficulty: 'manipulative' });
    assert.equal(result, 'manipulative');
  });

  it('daily maxTurns is between 5 and 8', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'daily-'));
    const store = createStore({ dataDir: tmpDir });
    const provider = createMockProvider({ adversary: MOCK_ADVERSARY });
    const daily = await generateDaily(store, provider);
    assert.ok(daily.maxTurns >= 5 && daily.maxTurns <= 8);
  });

  it('daily prioritizes due bias training when a bias review is scheduled', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'daily-'));
    const store = createStore({ dataDir: tmpDir });
    await store.saveProgression({
      totalSessions: 8,
      recentAvgScore: 58,
      currentDifficulty: 'neutral',
      biasProfile: {
        framing: {
          totalCount: 4,
          recentCount: 3,
          frequency: 0.6,
          lastSeen: '2026-03-20T10:00:00.000Z',
          nextDrillDate: '2026-03-21',
        },
      },
    });

    const provider = createMockProvider({ adversary: MOCK_ADVERSARY });
    const daily = await generateDaily(store, provider);

    assert.equal(daily.targetBias, 'framing');
    assert.equal(daily.targetSkill, 'biasResistance');
    assert.match(daily.challengeFocus, /reframe/i);
    assert.match(daily.biasReason, /High frequency bias|Overdue for drill|Frequency/i);
    assert.equal(daily.brief.situation, 'Négociation d\'un délai de livraison projet');
  });
});
