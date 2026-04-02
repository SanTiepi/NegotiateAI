// store.mjs — Persistence layer for sessions and progression
// Contract: createStore(options?) → Store

import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { computeHallOfFame, computeScenarioLeaderboard } from './leaderboard.mjs';
import { buildHallOfFameStories, formatHallOfFameStories } from './hall-of-fame.mjs';
import { computeDashboardStats } from './dashboard.mjs';

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
        text: formatHallOfFameStories(entries),
      };
    },

    async getScenarioLeaderboard(scenarioId, options = {}) {
      const sessions = await this.loadSessions();
      return computeScenarioLeaderboard(sessions, { ...options, scenarioId });
    },
  };
}

export { computeDashboardStats } from './dashboard.mjs';

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
