// guided-rounds.mjs — Generate 3 response choices for early turns
// Each choice teaches a different negotiation concept

/**
 * Generate 3 response options for a guided round.
 * Uses LLM to create contextual choices tagged with negotiation concepts.
 */
export async function generateGuidedChoices(session, lastAdversaryMessage, provider) {
  const brief = session.brief || {};
  const turn = session.turn || 0;
  const transcript = (session.transcript || []).slice(-6);

  const result = await provider.generateJson({
    system: `You are a negotiation coach generating 3 possible responses for a student.
Each response teaches a DIFFERENT negotiation technique.
One should be a STRONG move, one MODERATE, one a common TRAP (that looks good but is actually weak).
NEVER label which is which — let the player discover through consequences.

Return JSON:
{
  "choices": [
    {
      "text": "The actual response message (2-3 sentences max, in the same language as the conversation)",
      "technique": "Short technique name (e.g. 'mirroring', 'anchoring', 'concession')",
      "concept": "One-line explanation of the technique",
      "quality": "strong|moderate|trap"
    }
  ]
}

Negotiation techniques to draw from:
- Mirroring (Chris Voss): repeat the last 3 words as a question
- Labeling: name the emotion ("It seems like you're concerned about...")
- Anchoring: set the first number to frame the range
- Calibrated questions: "How am I supposed to do that?" / "What makes this fair?"
- BATNA reference: subtle mention of alternatives without threatening
- Strategic silence: say less, let them fill the void
- Reframing: change the frame from positions to interests
- Logrolling: trade low-value items for high-value ones
- Expanding the pie: find new value neither side considered
- Commitment/consistency: get small yeses before the big ask
- Loss framing: frame in terms of what they'll lose, not what you'll gain
- Accusation audit: list their objections before they raise them
- Common traps: premature concession, split-the-difference, over-justifying, emotional reaction`,
    prompt: `Scenario: ${brief.situation || 'Negotiation'}
Player role: ${brief.userRole || 'Negotiator'}
Adversary role: ${brief.adversaryRole || 'Counterpart'}
Player objective: ${brief.objective || 'Best deal possible'}
Turn: ${turn + 1}
Difficulty: ${brief.difficulty || 'neutral'}

Last adversary message: "${lastAdversaryMessage}"

Recent transcript:
${transcript.map((m) => `${m.role}: ${m.content}`).join('\n')}

Generate 3 response options. Shuffle the order randomly (don't always put the strong one first).
Write responses in the same language as the adversary message.`,
    schemaName: 'guidedChoices',
    temperature: 0.8,
  });

  const choices = (result.choices || []).slice(0, 3);

  // Validate
  for (const c of choices) {
    if (!c.text || typeof c.text !== 'string') c.text = '...';
    if (!c.technique) c.technique = 'unknown';
    if (!c.concept) c.concept = '';
    if (!['strong', 'moderate', 'trap'].includes(c.quality)) c.quality = 'moderate';
  }

  // Ensure we have exactly 3
  while (choices.length < 3) {
    choices.push({ text: 'Je vous ecoute, continuez.', technique: 'active listening', concept: 'Laisser parler', quality: 'moderate' });
  }

  return choices;
}

/**
 * Build feedback for a guided choice — shown AFTER the adversary responds.
 */
export function buildChoiceFeedback(chosenChoice, allChoices) {
  const strong = allChoices.find((c) => c.quality === 'strong');
  const trap = allChoices.find((c) => c.quality === 'trap');

  const feedback = {
    chosen: {
      technique: chosenChoice.technique,
      concept: chosenChoice.concept,
      quality: chosenChoice.quality,
    },
    wasStrong: chosenChoice.quality === 'strong',
    wasTrap: chosenChoice.quality === 'trap',
  };

  if (chosenChoice.quality === 'trap' && strong) {
    feedback.lesson = `Tu es tombe dans le piege "${chosenChoice.technique}". La meilleure option etait "${strong.technique}" : ${strong.concept}`;
  } else if (chosenChoice.quality === 'strong') {
    feedback.lesson = `Bon choix ! "${chosenChoice.technique}" : ${chosenChoice.concept}`;
  } else {
    feedback.lesson = `Correct mais pas optimal. Compare avec "${strong?.technique || 'alternative'}" : ${strong?.concept || 'technique plus puissante disponible.'}`;
  }

  return feedback;
}
