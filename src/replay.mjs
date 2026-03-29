// replay.mjs — Annotated session replay
// Contract: generateReplay(session, provider) → AnnotatedReplay

/**
 * Replays a session with AI annotations on each turn.
 */
export async function generateReplay(session, provider) {
  const turns = [];
  for (let i = 0; i < session.transcript.length; i += 2) {
    const userMsg = session.transcript[i];
    const advMsg = session.transcript[i + 1];
    if (userMsg) {
      turns.push({
        turnNumber: Math.floor(i / 2) + 1,
        userMessage: userMsg.content,
        adversaryMessage: advMsg?.content || '',
      });
    }
  }

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

Annotate each turn with coaching insights.`,
      schemaName: 'replay',
      temperature: 0.4,
    });
  } catch {
    // Degraded replay — raw transcript without annotations
    return {
      sessionId: session.id || 'unknown',
      turns: turns.map((t) => ({
        ...t,
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
      ...t,
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
    if (t.biasDetected) lines.push(`  ⚠ Biais: ${t.biasDetected}`);
    if (t.alternativeSuggestion) lines.push(`  → Alternative: ${t.alternativeSuggestion}`);
    if (t.annotation) lines.push(`  📝 ${t.annotation}`);
    lines.push('');
  }
  if (replay.summary) lines.push(`Résumé: ${replay.summary}\n`);
  return lines.join('\n');
}
