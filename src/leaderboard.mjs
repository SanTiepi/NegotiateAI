// leaderboard.mjs — local leaderboard, hall of fame, and scenario-of-the-week helpers

function toTimestamp(value) {
  const time = Date.parse(value || '');
  return Number.isNaN(time) ? 0 : time;
}

function getScenarioId(session) {
  return session?.scenario?.id || session?.scenarioId || null;
}

function getScore(session) {
  return Number(session?.feedback?.globalScore || 0);
}

function getGrade(session) {
  return session?.fightCard?.grade?.grade || null;
}

function getTitle(session) {
  return `${session?.brief?.userRole || 'Joueur'} vs ${session?.adversary?.identity || 'Adversaire'}`;
}

function isRankableSession(session) {
  return Boolean(session && session.feedback && Number.isFinite(getScore(session)));
}

function rankSessions(a, b) {
  const scoreDiff = getScore(b) - getScore(a);
  if (scoreDiff !== 0) return scoreDiff;

  const turnsDiff = Number(a?.turns || 999) - Number(b?.turns || 999);
  if (turnsDiff !== 0) return turnsDiff;

  return toTimestamp(b?.date) - toTimestamp(a?.date);
}

export function computeScenarioLeaderboard(sessions = [], options = {}) {
  const scenarioId = options.scenarioId || null;
  const limit = Math.max(1, options.limit || 10);

  const filtered = sessions
    .filter(isRankableSession)
    .filter((session) => !scenarioId || getScenarioId(session) === scenarioId)
    .sort(rankSessions)
    .slice(0, limit)
    .map((session, index) => ({
      rank: index + 1,
      sessionId: session.id,
      scenarioId: getScenarioId(session),
      score: getScore(session),
      turns: Number(session.turns || 0),
      mode: session.mode || 'unknown',
      playerId: session.playerId || null,
      grade: getGrade(session),
      title: getTitle(session),
      date: session.date || null,
    }));

  return {
    scenarioId,
    totalEntries: filtered.length,
    entries: filtered,
  };
}

export function computeHallOfFame(sessions = [], options = {}) {
  const limit = Math.max(1, options.limit || 5);
  const top = sessions
    .filter(isRankableSession)
    .sort(rankSessions)
    .slice(0, limit)
    .map((session, index) => ({
      rank: index + 1,
      sessionId: session.id,
      score: getScore(session),
      scenarioId: getScenarioId(session),
      mode: session.mode || 'unknown',
      date: session.date || null,
      title: getTitle(session),
    }));

  return {
    totalEntries: top.length,
    entries: top,
  };
}

function getIsoWeekParts(date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return { year: utcDate.getUTCFullYear(), week };
}

export function selectScenarioOfWeek(scenarios = [], options = {}) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new Error('At least one scenario is required');
  }

  const { year, week } = getIsoWeekParts(options.date || new Date());
  const ordered = [...scenarios].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const index = ((year * 53) + week - 1) % ordered.length;
  const scenario = ordered[index];

  return {
    weekKey: `${year}-W${String(week).padStart(2, '0')}`,
    scenario,
  };
}
