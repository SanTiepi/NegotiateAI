// analyzer.mjs — Post-session feedback with cognitive bias detection and scoring
// Contract: analyzeFeedback(session, provider) → FeedbackReport

const BIAS_TYPES = ['anchoring', 'loss_aversion', 'conflict_avoidance', 'framing', 'conversational_blocking'];

/**
 * Analyzes a completed negotiation session and produces a detailed feedback report.
 * Every judgment must cite a specific turn or short transcript excerpt.
 */
export async function analyzeFeedback(session, provider) {
  const transcriptText = session.transcript
    .map((m, i) => `[Turn ${Math.floor(i / 2) + 1}] ${m.role}: ${m.content}`)
    .join('\n');

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

Return JSON matching the FeedbackReport schema exactly.`,
    prompt: `Analyze this negotiation session:

User's objective: ${session.brief.objective}
Minimal threshold: ${session.brief.minimalThreshold}
BATNA: ${session.brief.batna}
Final status: ${session.status}
Concessions: ${JSON.stringify(session.concessions)}

Transcript:
${transcriptText}

Return a JSON FeedbackReport with: globalScore (0-100), scores: { outcomeLeverage, batnaDiscipline, emotionalRegulation, biasResistance, conversationalFlow }, biasesDetected: [{ biasType, turn, excerpt, explanation }], tacticsUsed: [], missedOpportunities: [], recommendations: []`,
    schemaName: 'feedback',
    temperature: 0.5,
  });

  assertValidFeedbackReport(result);
  return result;
}

/**
 * Asserts that a FeedbackReport is structurally valid.
 */
export function assertValidFeedbackReport(report) {
  if (!report || typeof report !== 'object') throw new Error('FeedbackReport must be an object');
  if (typeof report.globalScore !== 'number') throw new Error('FeedbackReport missing globalScore');
  if (!report.scores || typeof report.scores !== 'object') throw new Error('FeedbackReport missing scores');

  const scoreFields = ['outcomeLeverage', 'batnaDiscipline', 'emotionalRegulation', 'biasResistance', 'conversationalFlow'];
  for (const field of scoreFields) {
    if (typeof report.scores[field] !== 'number') throw new Error(`FeedbackReport scores missing: ${field}`);
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
