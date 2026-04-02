// progressive-ui.mjs — Compute UI complexity layer from player experience
// Layer 1 (Discover): chat + grade. Layer 2 (Learn): + coaching + 2 gauges. Layer 3 (Master): full cockpit.

const LAYERS = [
  {
    level: 1, key: 'discover', label: 'Decouverte',
    minSessions: 0,
    features: ['chat', 'grade', 'guided_rounds'],
    gauges: [],
    coaching: false, signals: false, roundScore: false, simulate: false, triangle: false,
    description: 'Concentre-toi sur la conversation. On analyse pour toi.',
  },
  {
    level: 2, key: 'learn', label: 'Apprentissage',
    minSessions: 3,
    features: ['chat', 'grade', 'coaching', 'gauges_basic', 'briefing_sliders'],
    gauges: ['deal', 'momentum'],
    coaching: true, signals: false, roundScore: false, simulate: false, triangle: false,
    description: 'Le coaching temps reel apparait. Tes premieres jauges te guident.',
  },
  {
    level: 3, key: 'master', label: 'Expert',
    minSessions: 8,
    features: ['chat', 'grade', 'coaching', 'gauges_full', 'briefing_full', 'signals', 'round_score', 'simulate', 'triangle', 'theory'],
    gauges: ['deal', 'leverage', 'bias', 'probability', 'tension', 'momentum'],
    coaching: true, signals: true, roundScore: true, simulate: true, triangle: true,
    description: 'Cockpit complet. Tous les indicateurs, simulation pre-envoi, analyse theorique.',
  },
];

/**
 * Compute which UI layer a player should see.
 */
export function computeUILayer(totalSessions = 0, override = null) {
  if (override && typeof override === 'number') {
    return LAYERS.find((l) => l.level === override) || LAYERS[0];
  }
  let current = LAYERS[0];
  for (const layer of LAYERS) {
    if (totalSessions >= layer.minSessions) current = layer;
  }
  return current;
}

/**
 * Check if a specific feature is enabled for this layer.
 */
export function isFeatureEnabled(layer, feature) {
  return layer.features.includes(feature);
}

/**
 * Should guided rounds be active? (Layer 1 always, Layer 2 for first 2 turns, Layer 3 never)
 */
export function shouldGuideRound(layer, turn) {
  if (layer.level === 1) return turn <= 3;
  if (layer.level === 2) return turn <= 1;
  return false;
}

/**
 * Filter turn response based on UI layer — hide what the player shouldn't see yet.
 */
export function filterTurnResponse(response, layer) {
  const filtered = {
    adversaryResponse: response.adversaryResponse,
    sessionOver: response.sessionOver,
    endReason: response.endReason,
    state: response.state,
    uiLayer: response.uiLayer || layer,
  };

  if (response.guidedChoices) filtered.guidedChoices = response.guidedChoices;

  // Layer 2+: coaching
  if (layer.coaching) filtered.coaching = response.coaching;

  // Layer 2+: basic gauges, Layer 3: all gauges
  if (layer.gauges.length > 0 && response.ticker) {
    filtered.ticker = {};
    if (layer.gauges.includes('deal')) filtered.ticker.dealQuality = response.ticker.dealQuality;
    if (layer.gauges.includes('momentum')) {
      filtered.ticker.momentum = response.ticker.momentum;
      filtered.ticker.momentumTrend = response.ticker.momentumTrend;
    }
    if (layer.gauges.includes('leverage')) filtered.ticker.leverage = response.ticker.leverage;
    if (layer.gauges.includes('bias')) filtered.ticker.biasRisk = response.ticker.biasRisk;
    if (layer.gauges.includes('probability')) filtered.ticker.dealProbability = response.ticker.dealProbability;
    if (layer.gauges.includes('tension')) filtered.ticker.tension = response.ticker.tension;
  }

  if (layer.signals) filtered.detectedSignals = response.detectedSignals;
  if (layer.roundScore) filtered.roundScore = response.roundScore;
  if (response.actTransition) filtered.actTransition = response.actTransition;
  if (response.fightCard) filtered.fightCard = response.fightCard;
  if (response.feedback) filtered.feedback = response.feedback;

  return filtered;
}

export function getLayerDefinitions() {
  return LAYERS.map((l) => ({ ...l }));
}
