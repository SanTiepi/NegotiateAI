// versus.mjs — 2 humans + 1 AI referee
// Contract:
//   adjudicateVersusRound({ brief, playerA, playerB, transcript? }, provider) → Promise<VersusJudgment>
//   assertValidVersusJudgment(judgment) → void | throws

import { buildBrief } from './scenario.mjs';

const WINNERS = new Set(['playerA', 'playerB', 'tie']);

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeList(value, fallback = []) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    : fallback;
}

function normalizeSide(raw = {}, defaultId) {
  return {
    id: String(raw.id || defaultId),
    name: String(raw.name || defaultId),
    message: String(raw.message || '').trim(),
  };
}

export function assertValidVersusJudgment(judgment) {
  if (!judgment || typeof judgment !== 'object') throw new Error('VersusJudgment must be an object');
  if (!WINNERS.has(judgment.winner)) throw new Error('VersusJudgment winner must be playerA, playerB, or tie');
  if (!judgment.scoreA || typeof judgment.scoreA !== 'object') throw new Error('VersusJudgment missing scoreA');
  if (!judgment.scoreB || typeof judgment.scoreB !== 'object') throw new Error('VersusJudgment missing scoreB');

  for (const side of ['scoreA', 'scoreB']) {
    const score = judgment[side];
    for (const key of ['clarity', 'leverage', 'emotionalControl', 'batnaDiscipline', 'total']) {
      if (!Number.isFinite(score[key])) throw new Error(`VersusJudgment ${side}.${key} must be a number`);
      if (score[key] < 0 || score[key] > 100) throw new Error(`VersusJudgment ${side}.${key} out of range`);
    }
  }

  if (typeof judgment.rationale !== 'string' || !judgment.rationale.trim()) {
    throw new Error('VersusJudgment rationale is required');
  }

  if (!Array.isArray(judgment.coachingA) || !Array.isArray(judgment.coachingB)) {
    throw new Error('VersusJudgment coaching arrays are required');
  }
}

function computeFallbackTotals(playerA, playerB) {
  const messageA = playerA.message;
  const messageB = playerB.message;
  const mentionsBatnaA = /batna|alternative|plan b|fallback/i.test(messageA);
  const mentionsBatnaB = /batna|alternative|plan b|fallback/i.test(messageB);
  const softenerA = /understand|propose|can we|je propose|je comprends|explore/i.test(messageA);
  const softenerB = /understand|propose|can we|je propose|je comprends|explore/i.test(messageB);

  const scoreA = {
    clarity: clampScore(45 + Math.min(messageA.length / 4, 20)),
    leverage: clampScore(40 + (mentionsBatnaA ? 20 : 0)),
    emotionalControl: clampScore(55 + (softenerA ? 15 : 0)),
    batnaDiscipline: clampScore(35 + (mentionsBatnaA ? 30 : 0)),
  };
  const scoreB = {
    clarity: clampScore(45 + Math.min(messageB.length / 4, 20)),
    leverage: clampScore(40 + (mentionsBatnaB ? 20 : 0)),
    emotionalControl: clampScore(55 + (softenerB ? 15 : 0)),
    batnaDiscipline: clampScore(35 + (mentionsBatnaB ? 30 : 0)),
  };

  scoreA.total = clampScore((scoreA.clarity + scoreA.leverage + scoreA.emotionalControl + scoreA.batnaDiscipline) / 4);
  scoreB.total = clampScore((scoreB.clarity + scoreB.leverage + scoreB.emotionalControl + scoreB.batnaDiscipline) / 4);

  return {
    winner: scoreA.total === scoreB.total ? 'tie' : scoreA.total > scoreB.total ? 'playerA' : 'playerB',
    scoreA,
    scoreB,
    rationale: 'Fallback judgment based on clarity, BATNA mentions, and emotional tone.',
    coachingA: mentionsBatnaA ? ['Good: you surfaced an alternative.'] : ['State your BATNA more explicitly.'],
    coachingB: mentionsBatnaB ? ['Good: you surfaced an alternative.'] : ['State your BATNA more explicitly.'],
    swingFactors: ['Clarity', 'BATNA discipline', 'Emotional control'],
  };
}

export async function adjudicateVersusRound(input, provider) {
  if (!provider?.generateJson) throw new Error('provider.generateJson is required');
  const brief = buildBrief(input?.brief || {});
  const playerA = normalizeSide(input?.playerA, 'playerA');
  const playerB = normalizeSide(input?.playerB, 'playerB');
  if (!playerA.message) throw new Error('playerA.message is required');
  if (!playerB.message) throw new Error('playerB.message is required');

  const transcript = Array.isArray(input?.transcript) ? input.transcript : [];

  try {
    const raw = await provider.generateJson({
      system: `You are the impartial referee in a negotiation sparring match between two human players.
Judge only the quality of their negotiation move, not their status.
Use the brief's objective, minimal threshold, BATNA, tone control, and leverage quality.
Return strict JSON only.`,
      prompt: `Brief: ${JSON.stringify(brief)}\nPrevious transcript: ${JSON.stringify(transcript)}\nPlayer A: ${JSON.stringify(playerA)}\nPlayer B: ${JSON.stringify(playerB)}\nReturn winner, scoreA, scoreB, rationale, coachingA, coachingB, swingFactors.`,
      schemaName: 'versusJudgment',
      temperature: 0.2,
    });

    const judgment = {
      winner: WINNERS.has(raw?.winner) ? raw.winner : 'tie',
      scoreA: {
        clarity: clampScore(raw?.scoreA?.clarity),
        leverage: clampScore(raw?.scoreA?.leverage),
        emotionalControl: clampScore(raw?.scoreA?.emotionalControl),
        batnaDiscipline: clampScore(raw?.scoreA?.batnaDiscipline),
        total: clampScore(raw?.scoreA?.total),
      },
      scoreB: {
        clarity: clampScore(raw?.scoreB?.clarity),
        leverage: clampScore(raw?.scoreB?.leverage),
        emotionalControl: clampScore(raw?.scoreB?.emotionalControl),
        batnaDiscipline: clampScore(raw?.scoreB?.batnaDiscipline),
        total: clampScore(raw?.scoreB?.total),
      },
      rationale: String(raw?.rationale || '').trim(),
      coachingA: normalizeList(raw?.coachingA),
      coachingB: normalizeList(raw?.coachingB),
      swingFactors: normalizeList(raw?.swingFactors),
    };

    if (!judgment.scoreA.total) judgment.scoreA.total = clampScore((judgment.scoreA.clarity + judgment.scoreA.leverage + judgment.scoreA.emotionalControl + judgment.scoreA.batnaDiscipline) / 4);
    if (!judgment.scoreB.total) judgment.scoreB.total = clampScore((judgment.scoreB.clarity + judgment.scoreB.leverage + judgment.scoreB.emotionalControl + judgment.scoreB.batnaDiscipline) / 4);
    if (!judgment.rationale) {
      judgment.rationale = 'The referee judged the stronger move based on leverage, BATNA discipline, clarity, and emotional control.';
    }

    assertValidVersusJudgment(judgment);
    return judgment;
  } catch {
    const fallback = computeFallbackTotals(playerA, playerB);
    assertValidVersusJudgment(fallback);
    return fallback;
  }
}
