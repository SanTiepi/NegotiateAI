// replay.mjs — Annotated session replay
// Contract: generateReplay(session, provider) → AnnotatedReplay

import { detectAdversaryTactics, detectUserTechniques } from './tactics.mjs';
import { analyzeTurnForBias } from './biasTracker.mjs';

/**
 * Replays a session with AI annotations on each turn.
 */
export async function generateReplay(session, provider) {
  const turns = [];
  const runningState = { transcript: [] };

  for (let i = 0; i < session.transcript.length; i += 2) {
    const userMsg = session.transcript[i];
    const advMsg = session.transcript[i + 1];
    if (userMsg) {
      const turnNumber = Math.floor(i / 2) + 1;

      // --- Algorithmic annotations (WorldEngine V2) ---
      const techniques = detectUserTechniques(userMsg.content, advMsg?.content || '', { transcript: session.transcript, turn: turnNumber });
      const adversaryTactics = advMsg ? detectAdversaryTactics(advMsg.content, { transcript: session.transcript, turn: turnNumber }) : [];
      const biasIndicators = analyzeTurnForBias(
        { role: 'user', content: userMsg.content, turnIndex: turnNumber },
        runningState,
      );

      // Update running state for bias tracker
      runningState.transcript.push(userMsg);
      if (advMsg) runningState.transcript.push(advMsg);

      turns.push({
        turnNumber,
        userMessage: userMsg.content,
        adversaryMessage: advMsg?.content || '',
        techniques,
        adversaryTactics,
        _biasIndicators: biasIndicators,
      });
    }
  }

  // Build algorithmic context for LLM
  const algoContext = turns.map((t) => {
    const techStr = t.techniques.length > 0 ? `Techniques: ${t.techniques.map(tc => tc.technique).join(', ')}` : '';
    const tacStr = t.adversaryTactics.length > 0 ? `Adversary tactics: ${t.adversaryTactics.map(tc => tc.principle).join(', ')}` : '';
    const biasStr = t._biasIndicators.length > 0 ? `Bias indicators: ${t._biasIndicators.map(b => b.biasType).join(', ')}` : '';
    return `[Turn ${t.turnNumber}] ${[techStr, tacStr, biasStr].filter(Boolean).join(' | ')}`;
  }).join('\n');

  let annotations;
  try {
    annotations = await provider.generateJson({
      system: `You are an expert negotiation coach reviewing a completed session. Annotate each turn with coaching insights.
Return JSON with: turns (array of { turnNumber, biasDetected (string|null), alternativeSuggestion (string|null), momentumLabel ("gaining"|"losing"|"stable"), annotation (string) }), summary (string — 2-3 sentence narrative arc).`,
      prompt: `Session transcript:
${turns.map((t) => `[Turn ${t.turnNumber}]\nUser: ${t.userMessage}\nAdversary: ${t.adversaryMessage}`).join('\n\n')}

User's objective: ${session.brief?.objective || 'unknown'}
BATNA: ${session.brief?.batna || 'unknown'}
Final status: ${session.status}
Score: ${session.feedback?.globalScore || 'N/A'}/100

Algorithmic analysis per turn:
${algoContext}

Annotate each turn with coaching insights. Reference the algorithmic analysis where relevant.`,
      schemaName: 'replay',
      temperature: 0.4,
    });
  } catch {
    // Degraded replay — raw transcript with algorithmic annotations only
    return {
      sessionId: session.id || 'unknown',
      turns: turns.map((t) => ({
        turnNumber: t.turnNumber,
        userMessage: t.userMessage,
        adversaryMessage: t.adversaryMessage,
        techniques: t.techniques,
        adversaryTactics: t.adversaryTactics,
        biasDetected: null,
        alternativeSuggestion: null,
        momentumLabel: 'stable',
        annotation: '',
      })),
      summary: 'Replay annotation unavailable.',
    };
  }

  const annotatedTurns = turns.map((t, i) => {
    const ann = annotations.turns?.[i] || {};
    return {
      turnNumber: t.turnNumber,
      userMessage: t.userMessage,
      adversaryMessage: t.adversaryMessage,
      techniques: t.techniques,
      adversaryTactics: t.adversaryTactics,
      biasDetected: ann.biasDetected || null,
      alternativeSuggestion: ann.alternativeSuggestion || null,
      momentumLabel: ann.momentumLabel || 'stable',
      annotation: ann.annotation || '',
    };
  });

  return {
    sessionId: session.id || 'unknown',
    turns: annotatedTurns,
    summary: annotations.summary || '',
  };
}

/**
 * Non-interactive display.
 */
export function formatReplay(replay) {
  const lines = [`\n=== REPLAY — Session ${replay.sessionId} ===\n`];
  for (const t of replay.turns) {
    lines.push(`--- Tour ${t.turnNumber} [${t.momentumLabel}] ---`);
    lines.push(`  Toi: ${t.userMessage}`);
    lines.push(`  Adversaire: ${t.adversaryMessage}`);
    if (t.techniques && t.techniques.length > 0) {
      lines.push(`  Techniques: ${t.techniques.map(tc => tc.technique).join(', ')}`);
    }
    if (t.adversaryTactics && t.adversaryTactics.length > 0) {
      lines.push(`  Tactiques adversaire: ${t.adversaryTactics.map(tc => tc.principle).join(', ')}`);
    }
    if (t.biasDetected) lines.push(`  ⚠ Biais: ${t.biasDetected}`);
    if (t.alternativeSuggestion) lines.push(`  → Alternative: ${t.alternativeSuggestion}`);
    if (t.annotation) lines.push(`  📝 ${t.annotation}`);
    lines.push('');
  }
  if (replay.summary) lines.push(`Résumé: ${replay.summary}\n`);
  return lines.join('\n');
}
