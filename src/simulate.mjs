// simulate.mjs — Simulate Before Send
// Contract: simulateBeforeSend({ brief, adversary, offerMessage, provider, transcript? }) → OfferSimulationReport

import { createSession, processTurn } from './engine.mjs';
import { detectUserTechniques } from './tactics.mjs';
import { analyzeTurnForBias } from './biasTracker.mjs';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Simulates a candidate offer before the user sends it for real.
 * Creates a shadow session, runs the proposed message through the normal engine,
 * then asks the provider for a compact recommendation verdict.
 */
export async function simulateBeforeSend({ brief, adversary, offerMessage, provider, transcript = [] }) {
  if (!brief || typeof brief !== 'object') throw new Error('simulateBeforeSend requires a brief');
  if (!adversary || typeof adversary !== 'object') throw new Error('simulateBeforeSend requires an adversary');
  if (!provider || typeof provider.generateJson !== 'function') throw new Error('simulateBeforeSend requires a provider');
  if (typeof offerMessage !== 'string' || offerMessage.trim().length === 0) {
    throw new Error('simulateBeforeSend requires a non-empty offerMessage');
  }
  if (!Array.isArray(transcript)) throw new Error('simulateBeforeSend transcript must be an array');

  const session = createSession(brief, adversary, provider);
  session.transcript = transcript.map((entry) => ({ ...entry }));
  session.turn = Math.floor(session.transcript.length / 2);

  const adversaryLastMsg = session.transcript.length > 0
    ? session.transcript[session.transcript.length - 1]?.content || ''
    : '';
  const userTechniques = detectUserTechniques(offerMessage, adversaryLastMsg, {
    transcript: session.transcript,
    turn: session.turn + 1,
    activeAnchor: session.activeAnchor,
    firstAnchorBy: session._world?.negotiation?.firstAnchorBy || null,
  });

  const simulation = await processTurn(session, offerMessage);

  const biasIndicators = analyzeTurnForBias(
    {
      userMessage: offerMessage,
      adversaryMessage: simulation.adversaryResponse,
      turn: session.turn,
    },
    {
      confidence: session.confidence,
      frustration: session.frustration,
      pressure: session.pressure || 0,
      concessions: session.concessions,
      activeAnchor: session.activeAnchor,
    },
    brief,
  );

  const report = await provider.generateJson({
    system: `You are a negotiation pre-send reviewer. Evaluate whether the user's proposed message should be sent now.
Return JSON with exactly these fields:
{
  "sendVerdict": "send|revise|do_not_send",
  "approvalScore": 0,
  "predictedOutcome": "short string",
  "riskLevel": "low|medium|high",
  "likelyObjections": ["..."],
  "strengths": ["..."],
  "vulnerabilities": ["..."],
  "recommendedRewrite": "string"
}`,
    prompt: `Negotiation brief:
${JSON.stringify(brief, null, 2)}

Adversary:
${JSON.stringify(adversary, null, 2)}

Candidate message:
${offerMessage}

Recent transcript:
${session.transcript.map((m) => `${m.role}: ${m.content}`).join('\n')}

Immediate simulation:
- adversaryResponse: ${simulation.adversaryResponse}
- sessionOver: ${simulation.sessionOver}
- endReason: ${simulation.endReason || 'none'}
- momentum: ${session.momentum}
- pressure: ${session.pressure}
- userTechniques: ${userTechniques.map((t) => `${t.technique}:${Math.round((t.quality || 0) * 100)}%`).join(', ') || 'none'}
- biasIndicators: ${biasIndicators.map((b) => `${b.biasType}:${Math.round((b.severity || 0) * 100)}%`).join(', ') || 'none'}

Give a practical pre-send verdict in the same language as the candidate message.`,
    schemaName: 'offerSimulation',
    temperature: 0.3,
  });

  if (typeof report.approvalScore === 'number') {
    report.approvalScore = clamp(report.approvalScore, 0, 100);
  }

  report.simulatedResponse = simulation.adversaryResponse;
  report.biasIndicators = biasIndicators;
  report.detectedSignals = simulation.detectedSignals;
  report.userTechniques = userTechniques;
  report.sessionOver = simulation.sessionOver;
  report.endReason = simulation.endReason;

  assertValidOfferSimulationReport(report);
  return report;
}

export async function simulateBeforeSendBatch({ brief, adversary, offerMessages, provider, transcript = [] }) {
  if (!Array.isArray(offerMessages) || offerMessages.length === 0) {
    throw new Error('simulateBeforeSendBatch requires a non-empty offerMessages array');
  }

  const normalized = offerMessages.map((message) => {
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new Error('simulateBeforeSendBatch offerMessages must contain non-empty strings');
    }
    return message;
  });

  const reports = await Promise.all(
    normalized.map((offerMessage) => simulateBeforeSend({ brief, adversary, offerMessage, provider, transcript })),
  );

  const ranked = reports
    .map((report, index) => ({ report, index }))
    .sort((a, b) => {
      if (b.report.approvalScore !== a.report.approvalScore) return b.report.approvalScore - a.report.approvalScore;
      const riskOrder = { low: 0, medium: 1, high: 2 };
      return riskOrder[a.report.riskLevel] - riskOrder[b.report.riskLevel];
    });

  return {
    reports,
    bestIndex: ranked[0].index,
    bestReport: ranked[0].report,
  };
}

export function assertValidOfferSimulationReport(report) {
  if (!report || typeof report !== 'object') throw new Error('OfferSimulationReport must be an object');
  if (!['send', 'revise', 'do_not_send'].includes(report.sendVerdict)) {
    throw new Error('OfferSimulationReport invalid sendVerdict');
  }
  if (typeof report.approvalScore !== 'number' || report.approvalScore < 0 || report.approvalScore > 100) {
    throw new Error('OfferSimulationReport invalid approvalScore');
  }
  if (!['low', 'medium', 'high'].includes(report.riskLevel)) {
    throw new Error('OfferSimulationReport invalid riskLevel');
  }
  if (typeof report.predictedOutcome !== 'string' || report.predictedOutcome.length === 0) {
    throw new Error('OfferSimulationReport missing predictedOutcome');
  }
  if (!Array.isArray(report.likelyObjections)) throw new Error('OfferSimulationReport missing likelyObjections');
  if (!Array.isArray(report.strengths)) throw new Error('OfferSimulationReport missing strengths');
  if (!Array.isArray(report.vulnerabilities)) throw new Error('OfferSimulationReport missing vulnerabilities');
  if (typeof report.recommendedRewrite !== 'string') throw new Error('OfferSimulationReport missing recommendedRewrite');
  if (typeof report.simulatedResponse !== 'string') throw new Error('OfferSimulationReport missing simulatedResponse');
  if (!Array.isArray(report.biasIndicators)) throw new Error('OfferSimulationReport missing biasIndicators');
  if (!Array.isArray(report.detectedSignals)) throw new Error('OfferSimulationReport missing detectedSignals');
  if (!Array.isArray(report.userTechniques)) throw new Error('OfferSimulationReport missing userTechniques');
  if (typeof report.sessionOver !== 'boolean') throw new Error('OfferSimulationReport missing sessionOver');
}
