// coach.mjs — explicit coaching ladder (levels 1-3)
// Level 1: observer | Level 2: suggest | Level 3: draft

function clean(text) {
  return typeof text === 'string' ? text.trim() : '';
}

function sentence(text) {
  const value = clean(text);
  if (!value) return '';
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function pickPrimaryBias(biasIndicators = [], fallback = null) {
  if (Array.isArray(biasIndicators) && biasIndicators.length > 0) {
    return biasIndicators
      .slice()
      .sort((a, b) => (b.severity || 0) - (a.severity || 0))[0]?.biasType || fallback;
  }
  return fallback;
}

function techniqueSummary(userTechniques = []) {
  if (!Array.isArray(userTechniques) || userTechniques.length === 0) return 'Aucune technique forte détectée';
  const top = userTechniques
    .slice()
    .sort((a, b) => (b.quality || 0) - (a.quality || 0))
    .slice(0, 2)
    .map((entry) => entry.technique)
    .join(', ');
  return `Techniques détectées: ${top}`;
}

export function buildCoachingLevels({
  userMessage,
  adversaryResponse,
  coaching = {},
  biasIndicators = [],
  userTechniques = [],
}) {
  const primaryBias = pickPrimaryBias(biasIndicators, coaching.biasDetected || null);
  const alternative = clean(coaching.alternative);
  const tip = clean(coaching.tip) || 'Reste concret et protège ta BATNA';
  const momentum = clean(coaching.momentum) || 'stable';
  const obsChunks = [];

  if (primaryBias) obsChunks.push(`Biais probable: ${primaryBias}`);
  obsChunks.push(`Momentum: ${momentum}`);
  obsChunks.push(techniqueSummary(userTechniques));

  const observer = obsChunks.join(' | ');
  const suggest = sentence(alternative || tip);

  const draftBase = alternative || tip;
  const draft = sentence(
    `Proposition de reformulation: ${draftBase}${clean(adversaryResponse) ? ` en réponse à « ${clean(adversaryResponse)} »` : ''}`,
  );

  return {
    observer,
    suggest,
    draft,
    modeLabels: {
      level1: 'observer',
      level2: 'suggest',
      level3: 'draft',
    },
    context: {
      primaryBias,
      momentum,
      userMessage: clean(userMessage),
    },
  };
}
