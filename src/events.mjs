// events.mjs — Mid-session event injection
// Contract: selectEvent(state, brief, options?) → NegotiationEvent | null
//           applyEvent(session, event) → void (mutates)

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export const EVENT_CATALOG = [
  {
    id: 'budget_freeze',
    name: 'Budget gel',
    narrative: '[ÉVÉNEMENT] Votre interlocuteur reçoit un message : gel budgétaire immédiat imposé par la direction.',
    stateModifiers: { pressure: 20, frustration: 10 },
    adversaryInstruction: 'You just learned there is an immediate budget freeze from upper management. React to this — it limits your room to negotiate but you still want a deal.',
    applicableDifficulties: ['neutral', 'hostile', 'manipulative'],
  },
  {
    id: 'competing_offer',
    name: 'Offre concurrente',
    narrative: '[ÉVÉNEMENT] Vous recevez un SMS : un concurrent vous fait une offre intéressante en temps réel.',
    stateModifiers: { confidence: -15, pressure: 15 },
    adversaryInstruction: 'The other party just glanced at their phone and seems more confident suddenly. They might have a competing offer.',
    applicableDifficulties: ['cooperative', 'neutral', 'hostile', 'manipulative'],
  },
  {
    id: 'tone_shift_aggressive',
    name: 'Changement de ton agressif',
    narrative: '[ÉVÉNEMENT] L\'adversaire change brusquement de ton — plus sec, plus impatient.',
    stateModifiers: { frustration: 20, egoThreat: 15 },
    adversaryInstruction: 'You are now frustrated and impatient. Shift to a more aggressive, dismissive tone. Put pressure on the other party to decide NOW.',
    applicableDifficulties: ['cooperative', 'neutral'],
  },
  {
    id: 'tone_shift_friendly',
    name: 'Adoucissement inattendu',
    narrative: '[ÉVÉNEMENT] L\'adversaire se détend visiblement — quelque chose a changé dans son attitude.',
    stateModifiers: { frustration: -15, confidence: -10 },
    adversaryInstruction: 'You just realized you have been too hard. Soften your approach, show genuine interest in finding a good deal for both sides.',
    applicableDifficulties: ['hostile', 'manipulative'],
  },
  {
    id: 'deadline_moved',
    name: 'Deadline avancée',
    narrative: '[ÉVÉNEMENT] Un message urgent : la deadline est avancée de 2 semaines. La pression monte.',
    stateModifiers: { pressure: 25 },
    adversaryInstruction: 'The deadline has been moved up by 2 weeks. You need to close this deal faster. Show urgency.',
    applicableDifficulties: ['cooperative', 'neutral', 'hostile', 'manipulative'],
  },
  {
    id: 'stakeholder_enters',
    name: 'Nouveau décideur',
    narrative: '[ÉVÉNEMENT] Un supérieur de l\'adversaire rejoint la conversation de façon inattendue.',
    stateModifiers: { confidence: 10, egoThreat: 10 },
    adversaryInstruction: 'Your boss just joined the negotiation unexpectedly. You need to appear strong and in control. Be more formal and cautious about concessions.',
    applicableDifficulties: ['neutral', 'hostile'],
  },
  {
    id: 'information_leak',
    name: 'Fuite d\'information',
    narrative: '[ÉVÉNEMENT] Vous apprenez accidentellement que l\'adversaire est sous plus de pression qu\'il ne le montre.',
    stateModifiers: { confidence: -20 },
    adversaryInstruction: 'The other party seems to know something about your situation that you did not reveal. Be on guard.',
    applicableDifficulties: ['hostile', 'manipulative'],
  },
  {
    id: 'walkout_threat',
    name: 'Menace de départ',
    narrative: '[ÉVÉNEMENT] L\'adversaire commence à ranger ses affaires — il semble prêt à partir.',
    stateModifiers: { pressure: 30, frustration: 15 },
    adversaryInstruction: 'Start packing up. Threaten to walk away unless the other party makes a significant concession RIGHT NOW. This is high-pressure.',
    applicableDifficulties: ['neutral', 'hostile'],
  },
  {
    id: 'concession_opportunity',
    name: 'Ouverture inattendue',
    narrative: '[ÉVÉNEMENT] L\'adversaire laisse échapper un soupir — il semble prêt à faire un pas.',
    stateModifiers: { momentum: 20 },
    adversaryInstruction: 'You are feeling worn down and ready to make a small concession if the other party asks the right question. Drop subtle hints.',
    applicableDifficulties: ['cooperative', 'neutral'],
  },
  {
    id: 'emotional_outburst',
    name: 'Explosion émotionnelle',
    narrative: '[ÉVÉNEMENT] L\'adversaire perd son calme — il hausse la voix et tape sur la table.',
    stateModifiers: { egoThreat: 25, frustration: 20 },
    adversaryInstruction: 'You have LOST YOUR COMPOSURE. Raise your voice, show anger, accuse the other party of wasting your time. This is an emotional outburst.',
    applicableDifficulties: ['hostile', 'manipulative'],
  },
];

/**
 * Selects an event appropriate for the current session state.
 */
export function selectEvent(state, brief, options = {}) {
  const excludeIds = options.excludeIds || [];
  const applicable = EVENT_CATALOG.filter(
    (e) => e.applicableDifficulties.includes(brief.difficulty) && !excludeIds.includes(e.id),
  );
  if (applicable.length === 0) return null;
  return applicable[Math.floor(Math.random() * applicable.length)];
}

/**
 * Applies event state modifiers to a session (mutates). Uses deltas, not absolutes.
 */
export function applyEvent(session, event) {
  for (const [key, delta] of Object.entries(event.stateModifiers)) {
    if (typeof session[key] === 'number') {
      const range = key === 'momentum' ? [-100, 100] : [0, 100];
      session[key] = clamp(session[key] + delta, range[0], range[1]);
    }
  }
}
