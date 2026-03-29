// planner.mjs — Generates an optimal negotiation strategy plan post-session
// Contract: generatePlan(brief, feedbackReport, provider) → NegotiationPlan

/**
 * Produces a concrete retry plan based on the brief and feedback analysis.
 * The plan must not contradict the user's BATNA or red lines.
 */
export async function generatePlan(brief, feedbackReport, provider) {
  const biasesSummary = feedbackReport.biasesDetected
    .map((b) => `- ${b.biasType} (turn ${b.turn}): ${b.explanation}`)
    .join('\n');

  const missedSummary = feedbackReport.missedOpportunities.join('\n- ');

  const result = await provider.generateJson({
    system: `You are an expert negotiation strategist. Based on a completed session's feedback, generate an optimal retry plan.

The plan MUST:
- Not contradict the user's BATNA or minimal threshold
- Address specific biases and missed opportunities from the feedback
- Include concrete phrases for labels/mirrors (Chris Voss style)
- Order concessions from smallest to largest, each with a clear trigger condition
- Define a walk-away rule tied to the BATNA

Return JSON matching the NegotiationPlan schema exactly.`,
    prompt: `Generate a negotiation retry plan:

Situation: ${brief.situation}
User role: ${brief.userRole}
Objective: ${brief.objective}
Minimal threshold: ${brief.minimalThreshold}
BATNA: ${brief.batna}
Constraints: ${brief.constraints.join(', ')}
Relational stakes: ${brief.relationalStakes}

Previous session score: ${feedbackReport.globalScore}/100
Biases detected:
${biasesSummary}

Missed opportunities:
- ${missedSummary}

Recommendations from analysis:
- ${feedbackReport.recommendations.join('\n- ')}

Return JSON with: recommendedOpening (string), labelsAndMirrors (string[]), discoveryQuestions (string[]), anchoringStrategy (string), concessionSequence ([{condition, concession}]), redLines (string[]), walkAwayRule (string)`,
    schemaName: 'plan',
    temperature: 0.6,
  });

  assertValidPlan(result);
  return result;
}

/**
 * Asserts that a NegotiationPlan is structurally valid.
 */
export function assertValidPlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('NegotiationPlan must be an object');
  if (typeof plan.recommendedOpening !== 'string') throw new Error('Plan missing recommendedOpening');
  if (!Array.isArray(plan.labelsAndMirrors)) throw new Error('Plan missing labelsAndMirrors');
  if (!Array.isArray(plan.discoveryQuestions)) throw new Error('Plan missing discoveryQuestions');
  if (typeof plan.anchoringStrategy !== 'string') throw new Error('Plan missing anchoringStrategy');
  if (!Array.isArray(plan.concessionSequence)) throw new Error('Plan missing concessionSequence');
  if (!Array.isArray(plan.redLines)) throw new Error('Plan missing redLines');
  if (typeof plan.walkAwayRule !== 'string') throw new Error('Plan missing walkAwayRule');
}
