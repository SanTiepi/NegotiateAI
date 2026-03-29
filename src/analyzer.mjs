// analyzer.mjs — Post-session feedback with cognitive bias detection and scoring
// Contract: analyzeFeedback(session, provider) → FeedbackReport

import { analyzeSessionBiases } from './biasTracker.mjs';
import { detectUserTechniques, computeTacticalScore } from './tactics.mjs';

const SCORE_RANGES = {
  outcomeLeverage: [0, 25],
  batnaDiscipline: [0, 20],
  emotionalRegulation: [0, 25],
  biasResistance: [0, 15],
  conversationalFlow: [0, 15],
};

function clampScore(field, value) {
  const [min, max] = SCORE_RANGES[field];
  return Math.max(min, Math.min(max, value));
}

/**
 * Analyzes a completed negotiation session and produces a detailed feedback report.
 * Every judgment must cite a specific turn or short transcript excerpt.
 */
export async function analyzeFeedback(session, provider) {
  const transcriptText = session.transcript
    .map((m, i) => `[Turn ${Math.floor(i / 2) + 1}] ${m.role}: ${m.content}`)
    .join('\n');

  // --- Algorithmic pre-analysis (WorldEngine V2) ---
  const biasReport = analyzeSessionBiases(session.transcript,
    { confidence: session.confidence, frustration: session.frustration, pressure: session.pressure || 0, concessions: session.concessions, activeAnchor: session.activeAnchor },
    session.brief);

  const userMessages = session.transcript.filter(m => m.role === 'user');
  const allTechniques = userMessages.flatMap((m, i) => {
    const advMsg = session.transcript[i * 2 + 1]?.content || '';
    return detectUserTechniques(m.content, advMsg, { transcript: session.transcript, turn: i + 1 });
  });
  const tacticalScore = computeTacticalScore(allTechniques, userMessages.length);

  const algorithmicContext = `
--- Algorithmic Analysis (pre-computed) ---
Biases detected algorithmically: ${JSON.stringify(biasReport.biases.map(b => ({ biasType: b.biasType, turn: b.turn, evidence: b.evidence, severity: b.severity })))}
Bias summary: ${JSON.stringify(biasReport.summary)}
User techniques detected: ${JSON.stringify(allTechniques.map(t => ({ technique: t.technique, evidence: t.evidence, quality: t.quality })))}
Tactical score: ${tacticalScore.score}/100, breakdown: ${JSON.stringify(tacticalScore.breakdown)}
--- End Algorithmic Analysis ---`;

  const result = await provider.generateJson({
    system: `You are an expert negotiation coach analyzing a completed negotiation session. You detect cognitive biases, score performance, and give actionable feedback.

Scoring dimensions (must sum to globalScore):
- outcomeLeverage (0-25): Did the user achieve their objective?
- batnaDiscipline (0-20): Did they protect and leverage their BATNA?
- emotionalRegulation (0-25): Tactical empathy and emotional control
- biasResistance (0-15): Resistance to cognitive biases
- conversationalFlow (0-15): Creating options, "yes and", avoiding blocks

Biases to detect: anchoring, loss_aversion, conflict_avoidance, framing, conversational_blocking.
Every bias instance MUST cite the turn number and a short excerpt as evidence.

You have access to pre-computed algorithmic analysis below. Use it to ground your scoring and commentary, but add your own qualitative insights.

Return JSON matching the FeedbackReport schema exactly.`,
    prompt: `Analyze this negotiation session:

User's objective: ${session.brief.objective}
Minimal threshold: ${session.brief.minimalThreshold}
BATNA: ${session.brief.batna}
Final status: ${session.status}
Concessions: ${JSON.stringify(session.concessions)}

Transcript:
${transcriptText}
${algorithmicContext}

Return a JSON FeedbackReport with: globalScore (0-100), scores: { outcomeLeverage, batnaDiscipline, emotionalRegulation, biasResistance, conversationalFlow }, biasesDetected: [{ biasType, turn, excerpt, explanation }], tacticsUsed: [], missedOpportunities: [], recommendations: []`,
    schemaName: 'feedback',
    temperature: 0.5,
  });

  // Clamp scores to valid ranges before validation
  if (result.scores && typeof result.scores === 'object') {
    for (const field of Object.keys(SCORE_RANGES)) {
      if (typeof result.scores[field] === 'number') {
        result.scores[field] = clampScore(field, result.scores[field]);
      }
    }
    // Recompute globalScore as sum of clamped sub-scores
    const sum = Object.keys(SCORE_RANGES).reduce((acc, f) => acc + (result.scores[f] || 0), 0);
    result.globalScore = Math.max(0, Math.min(100, sum));
  }

  // Attach algorithmic data to the report
  result.algorithmicBiases = biasReport.biases;
  result.tacticalScore = tacticalScore;

  assertValidFeedbackReport(result);
  return result;
}

/**
 * Asserts that a FeedbackReport is structurally valid.
 */
export function assertValidFeedbackReport(report) {
  if (!report || typeof report !== 'object') throw new Error('FeedbackReport must be an object');
  if (typeof report.globalScore !== 'number') throw new Error('FeedbackReport missing globalScore');
  if (report.globalScore < 0 || report.globalScore > 100) throw new Error('FeedbackReport globalScore out of range 0-100');
  if (!report.scores || typeof report.scores !== 'object') throw new Error('FeedbackReport missing scores');

  for (const [field, [min, max]] of Object.entries(SCORE_RANGES)) {
    if (typeof report.scores[field] !== 'number') throw new Error(`FeedbackReport scores missing: ${field}`);
    if (report.scores[field] < min || report.scores[field] > max) {
      throw new Error(`FeedbackReport scores.${field} out of range ${min}-${max}`);
    }
  }

  if (!Array.isArray(report.biasesDetected)) throw new Error('FeedbackReport missing biasesDetected array');
  for (const bias of report.biasesDetected) {
    if (typeof bias.biasType !== 'string') throw new Error('BiasInstance missing biasType');
    if (typeof bias.turn !== 'number') throw new Error('BiasInstance missing turn number');
    if (typeof bias.excerpt !== 'string' || bias.excerpt.length === 0) throw new Error('BiasInstance missing excerpt');
    if (typeof bias.explanation !== 'string') throw new Error('BiasInstance missing explanation');
  }

  if (!Array.isArray(report.tacticsUsed)) throw new Error('FeedbackReport missing tacticsUsed');
  if (!Array.isArray(report.missedOpportunities)) throw new Error('FeedbackReport missing missedOpportunities');
  if (!Array.isArray(report.recommendations)) throw new Error('FeedbackReport missing recommendations');
}
