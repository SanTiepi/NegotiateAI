import { evaluateBelts, identifyWeaknesses } from './belt.mjs';
import { analyzeSessionBiases, updateBiasProfile } from './biasTracker.mjs';
import { computeDifficulty, assessZPD } from './difficulty.mjs';

export async function refreshProgression(store, session) {
  const sessions = await store.loadSessions();
  const belts = evaluateBelts(sessions);
  const weakDimensions = identifyWeaknesses(sessions);
  const previous = await store.loadProgression();

  const biasReport = analyzeSessionBiases(
    session.transcript,
    {
      confidence: session.confidence,
      frustration: session.frustration,
      pressure: session.pressure || 0,
      concessions: session.concessions,
      activeAnchor: session.activeAnchor,
    },
    session.brief,
  );
  const biasProfile = updateBiasProfile(previous.biasProfile || {}, biasReport, new Date().toISOString());
  const difficultyProfile = computeDifficulty(sessions);
  const zpd = assessZPD(sessions);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = previous.lastSessionDate === yesterday
    ? previous.currentStreak + 1
    : (previous.lastSessionDate === today ? previous.currentStreak : 1);

  const recentScores = sessions.slice(0, 3).map((entry) => entry.feedback?.globalScore || 0);
  const recentAvgScore = recentScores.length > 0
    ? Math.round(recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length)
    : 0;

  const progression = {
    belts,
    biasProfile,
    difficultyProfile,
    zpd: zpd.zone,
    totalSessions: sessions.length,
    currentStreak: streak,
    lastSessionDate: today,
    weakDimensions,
    recentAvgScore,
    currentDifficulty: sessions[0]?.brief?.difficulty || 'cooperative',
  };

  await store.saveProgression(progression);
  return progression;
}
