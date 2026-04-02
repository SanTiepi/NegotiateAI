// store.mjs — Persistence layer for sessions and progression
// Contract: createStore(options?) → Store

import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { computeHallOfFame, computeScenarioLeaderboard } from './leaderboard.mjs';
import { buildHallOfFameStories } from './hall-of-fame.mjs';

const DEFAULT_DIR = process.env.NEGOTIATE_AI_DATA_DIR || join(homedir(), '.negotiate-ai');
const SESSIONS_FILE = 'sessions.jsonl';
const PROGRESSION_FILE = 'progression.json';
const ANALYTICS_FILE = 'analytics.jsonl';
const MAX_SESSIONS = 50;

function defaultProgression() {
  return {
    belts: {},
    biasProfile: {},
    totalSessions: 0,
    currentStreak: 0,
    lastSessionDate: null,
    weakDimensions: [],
  };
}

export function createStore(options = {}) {
  const dataDir = options.dataDir || DEFAULT_DIR;
  let initialized = false;

  async function ensureDir() {
    if (!initialized) {
      await mkdir(dataDir, { recursive: true });
      initialized = true;
    }
  }

  return {
    getDataDir() {
      return dataDir;
    },

    async saveSession(entry) {
      assertValidSessionEntry(entry);
      await ensureDir();
      const line = JSON.stringify(entry) + '\n';
      await appendFile(join(dataDir, SESSIONS_FILE), line, 'utf-8');
    },

    async loadSessions() {
      await ensureDir();
      let raw;
      try {
        raw = await readFile(join(dataDir, SESSIONS_FILE), 'utf-8');
      } catch {
        return [];
      }
      const lines = raw.trim().split('\n').filter(Boolean);
      const sessions = lines.map((l) => JSON.parse(l));
      sessions.reverse(); // newest first
      return sessions.slice(0, MAX_SESSIONS);
    },

    async lastN(n = 10) {
      const all = await this.loadSessions();
      return all.slice(0, n);
    },

    async loadProgression() {
      await ensureDir();
      try {
        const raw = await readFile(join(dataDir, PROGRESSION_FILE), 'utf-8');
        return JSON.parse(raw);
      } catch {
        return defaultProgression();
      }
    },

    async saveProgression(progression) {
      await ensureDir();
      await writeFile(join(dataDir, PROGRESSION_FILE), JSON.stringify(progression, null, 2), 'utf-8');
    },

    async appendAnalytics(event) {
      await ensureDir();
      const line = JSON.stringify(event) + '\n';
      await appendFile(join(dataDir, ANALYTICS_FILE), line, 'utf-8');
    },

    async loadAnalytics(limit = 200) {
      await ensureDir();
      let raw;
      try {
        raw = await readFile(join(dataDir, ANALYTICS_FILE), 'utf-8');
      } catch {
        return [];
      }
      const lines = raw.trim().split('\n').filter(Boolean);
      return lines.slice(-limit).map((l) => JSON.parse(l)).reverse();
    },

    async getDashboardStats() {
      const sessions = await this.loadSessions();
      const progression = await this.loadProgression();
      return computeDashboardStats(sessions, progression);
    },

    async getHallOfFame(options = {}) {
      const sessions = await this.loadSessions();
      return computeHallOfFame(sessions, options);
    },

    async getHallOfFameStories(options = {}) {
      const sessions = await this.loadSessions();
      const entries = buildHallOfFameStories(sessions, options);
      return {
        totalEntries: entries.length,
        entries,
      };
    },

    async getScenarioLeaderboard(scenarioId, options = {}) {
      const sessions = await this.loadSessions();
      return computeScenarioLeaderboard(sessions, { ...options, scenarioId });
    },
  };
}

export function computeDashboardStats(sessions = [], progression = {}) {
  const recentSessions = sessions.slice(0, 10);
  const averageScore = recentSessions.length > 0
    ? Math.round(recentSessions.reduce((sum, session) => sum + (session.feedback?.globalScore || 0), 0) / recentSessions.length)
    : 0;

  const latest = sessions[0] || null;
  const earliest = sessions[sessions.length - 1] || null;
  const latestScore = latest?.feedback?.globalScore || 0;
  const earliestScore = earliest?.feedback?.globalScore || latestScore || 0;

  const scoreHistory = recentSessions
    .slice()
    .reverse()
    .map((session) => ({
      id: session.id,
      score: session.feedback?.globalScore || 0,
      mode: session.mode || 'cli',
      difficulty: session.brief?.difficulty || 'neutral',
      date: session.date,
    }));

  const modeBreakdownMap = new Map();
  const difficultyBreakdownMap = new Map();
  const dimensionTotals = {
    outcomeLeverage: 0,
    batnaDiscipline: 0,
    emotionalRegulation: 0,
    biasResistance: 0,
    conversationalFlow: 0,
  };
  let dimensionCount = 0;

  for (const session of sessions) {
    const mode = session.mode || 'cli';
    modeBreakdownMap.set(mode, (modeBreakdownMap.get(mode) || 0) + 1);

    const difficulty = session.brief?.difficulty || 'neutral';
    difficultyBreakdownMap.set(difficulty, (difficultyBreakdownMap.get(difficulty) || 0) + 1);

    const scores = session.feedback?.scores;
    if (scores && typeof scores === 'object') {
      dimensionCount += 1;
      for (const key of Object.keys(dimensionTotals)) {
        dimensionTotals[key] += Number(scores[key] || 0);
      }
    }
  }

  const dimensionAverages = Object.entries(dimensionTotals).map(([dimension, total]) => ({
    dimension,
    average: dimensionCount > 0 ? Math.round(total / dimensionCount) : 0,
  }));

  const bestDimension = dimensionAverages.reduce((best, current) => current.average > best.average ? current : best, { dimension: null, average: -1 });
  const weakestDimension = dimensionAverages.reduce((worst, current) => worst.dimension === null || current.average < worst.average ? current : worst, { dimension: null, average: Infinity });

  const modeBreakdown = [...modeBreakdownMap.entries()]
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count || a.mode.localeCompare(b.mode));

  const difficultyBreakdown = [...difficultyBreakdownMap.entries()]
    .map(([difficulty, count]) => ({ difficulty, count }))
    .sort((a, b) => b.count - a.count || a.difficulty.localeCompare(b.difficulty));

  return {
    totalSessions: sessions.length,
    currentStreak: progression.currentStreak || 0,
    averageScore,
    latestScore,
    progressionDelta: latest ? latestScore - earliestScore : 0,
    belts: progression.belts || {},
    weakDimensions: progression.weakDimensions || [],
    recentSessionIds: recentSessions.map((session) => session.id),
    scoreHistory,
    modeBreakdown,
    difficultyBreakdown,
    dimensionAverages,
    bestDimension,
    weakestDimension,
  };
}

export function assertValidSessionEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('SessionEntry must be an object');
  if (typeof entry.id !== 'string' || !entry.id) throw new Error('SessionEntry missing id');
  if (typeof entry.date !== 'string' || !entry.date) throw new Error('SessionEntry missing date');
  if (!entry.feedback || typeof entry.feedback !== 'object') throw new Error('SessionEntry missing feedback');
  if (!entry.brief || typeof entry.brief !== 'object') throw new Error('SessionEntry missing brief');
  if (!Array.isArray(entry.transcript)) throw new Error('SessionEntry missing transcript');
  if (typeof entry.status !== 'string') throw new Error('SessionEntry missing status');
}

export { randomUUID };
