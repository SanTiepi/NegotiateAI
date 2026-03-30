// narrativeArc.mjs — 4-act narrative structure for negotiation sessions
// DJ tension-release arc: Opening → Tension → Crisis → Resolution
// Events are not random — they follow dramatic structure

import { EVENT_CATALOG, applyEvent } from './events.mjs';

/**
 * 4-act structure with turn ranges and event policies.
 */
export const ACTS = [
  {
    id: 'opening',
    name: 'Ouverture',
    turnRange: [1, 3],
    description: 'L\'adversaire est stable. L\'utilisateur pose ses bases.',
    eventTypes: [],  // no events in act 1
    tensionTarget: [10, 30],
    emoji: '🎬',
  },
  {
    id: 'tension',
    name: 'Montée de tension',
    turnRange: [4, 6],
    description: 'Premier ancrage. La pression monte. Événement modéré possible.',
    eventTypes: ['budget_freeze', 'competing_offer', 'deadline_moved', 'concession_opportunity'],
    tensionTarget: [30, 60],
    emoji: '⚡',
  },
  {
    id: 'crisis',
    name: 'Crise',
    turnRange: [7, 9],
    description: 'Événement majeur. Adversaire volatile. Moment de vérité.',
    eventTypes: ['walkout_threat', 'emotional_outburst', 'tone_shift_aggressive', 'stakeholder_enters', 'information_leak'],
    tensionTarget: [60, 90],
    emoji: '🔥',
  },
  {
    id: 'resolution',
    name: 'Résolution',
    turnRange: [10, 12],
    description: 'Convergence ou rupture. Dernière chance. Ouverture possible.',
    eventTypes: ['tone_shift_friendly', 'concession_opportunity'],
    tensionTarget: [40, 70],
    emoji: '🎯',
  },
];

/**
 * Determine which act we're in based on turn number and maxTurns.
 */
export function getCurrentAct(turn, maxTurns = 12) {
  // Normalize turn ranges to actual maxTurns
  const ratio = turn / maxTurns;
  if (ratio <= 0.25) return ACTS[0]; // opening
  if (ratio <= 0.50) return ACTS[1]; // tension
  if (ratio <= 0.75) return ACTS[2]; // crisis
  return ACTS[3]; // resolution
}

/**
 * Select an event appropriate for the current narrative act.
 * Unlike random selection, this follows dramatic structure.
 */
export function selectNarrativeEvent(turn, maxTurns, session) {
  const act = getCurrentAct(turn, maxTurns);

  // No events in opening act
  if (act.id === 'opening') return null;

  // Filter events by act-appropriate types AND difficulty
  const applicable = EVENT_CATALOG.filter(
    (e) =>
      act.eventTypes.includes(e.id) &&
      e.applicableDifficulties.includes(session.brief?.difficulty || 'neutral') &&
      !(session._usedEventIds || []).includes(e.id)
  );

  if (applicable.length === 0) return null;

  // In crisis act, prefer high-impact events
  if (act.id === 'crisis') {
    const highImpact = applicable.filter((e) => {
      const totalImpact = Object.values(e.stateModifiers).reduce((a, b) => a + Math.abs(b), 0);
      return totalImpact >= 30;
    });
    if (highImpact.length > 0) {
      return highImpact[Math.floor(Math.random() * highImpact.length)];
    }
  }

  // In resolution act, prefer positive events
  if (act.id === 'resolution') {
    const positive = applicable.filter((e) => {
      const momentum = e.stateModifiers.momentum || 0;
      const frustration = e.stateModifiers.frustration || 0;
      return momentum > 0 || frustration < 0;
    });
    if (positive.length > 0) {
      return positive[Math.floor(Math.random() * positive.length)];
    }
  }

  return applicable[Math.floor(Math.random() * applicable.length)];
}

/**
 * Compute event probability based on act and session state.
 * Crisis act = higher probability. Opening = 0.
 */
export function getEventProbability(turn, maxTurns, session) {
  const act = getCurrentAct(turn, maxTurns);
  const base = {
    opening: 0,
    tension: 0.25,
    crisis: 0.50,
    resolution: 0.20,
  };

  let prob = base[act.id] || 0;

  // Increase probability if tension is below target
  if (session._world) {
    const tension = session._world.emotions?.arousal || 0;
    const [targetMin] = act.tensionTarget;
    if (tension < targetMin) prob += 0.15; // inject event to raise tension
  }

  // Decrease probability if too many events already fired
  const firedCount = (session._usedEventIds || []).length;
  if (firedCount >= 2) prob *= 0.5;
  if (firedCount >= 3) prob *= 0.3;

  return Math.min(0.7, prob);
}

/**
 * Format act transition notification for CLI.
 */
export function formatActTransition(turn, maxTurns) {
  const act = getCurrentAct(turn, maxTurns);
  const prevAct = turn > 1 ? getCurrentAct(turn - 1, maxTurns) : null;

  // Only show transition when act changes
  if (prevAct && prevAct.id === act.id) return null;

  return `${act.emoji} ${act.name} — ${act.description}`;
}

/**
 * Get narrative context for LLM prompt — tells the adversary what dramatic phase we're in.
 */
export function getNarrativePrompt(turn, maxTurns) {
  const act = getCurrentAct(turn, maxTurns);
  const prompts = {
    opening: 'This is the OPENING phase. Be measured and professional. Establish your position clearly but don\'t escalate yet. Feel out the other party.',
    tension: 'This is the RISING TENSION phase. Start pushing harder. Use more tactics. Show some frustration if pushed. The stakes are becoming clearer.',
    crisis: 'This is the CRISIS phase. This is the moment of truth. Be at your most intense — whether that means aggressive, emotional, or strategically vulnerable. Something must shift.',
    resolution: 'This is the RESOLUTION phase. Time is running out. Either converge toward a deal or make it clear one isn\'t possible. Show whether the negotiation will succeed or fail.',
  };
  return prompts[act.id] || '';
}
