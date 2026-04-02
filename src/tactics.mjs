// tactics.mjs — Tactic Detection Engine (pure algorithmic, no LLM)
// Contract: detectAdversaryTactics(msg, ctx) → TacticResult[]
//           detectUserTechniques(msg, advMsg, ctx) → TechniqueResult[]
//           computeTacticalScore(techniques, turns) → { score, breakdown }

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

const ACCENT_MAP = {
  à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e',
  î: 'i', ï: 'i', ô: 'o', ö: 'o', ù: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n',
};

function normalize(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[àâäéèêëîïôöùûüçñ]/g, (ch) => ACCENT_MAP[ch] || ch)
    .trim();
}

function words(text) {
  return normalize(text).replace(/[.,;:!?'"()[\]{}]/g, '').split(/\s+/).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Adversary tactic patterns — Cialdini's 7 principles (FR + EN)
// ---------------------------------------------------------------------------

export const ADVERSARY_PATTERNS = {
  reciprocity: [
    // FR
    /je vous ai deja fait/,
    /en echange/,
    /donnant[- ]donnant/,
    /j'ai fait l'effort/,
    /j'ai fait un effort/,
    /je vous ai accorde/,
    /je vous ai donne/,
    /en contrepartie/,
    // EN
    /i already gave you/,
    /in return/,
    /i did you a fav/,
    /quid pro quo/,
    /i made the effort/,
    /i gave you/,
  ],
  scarcity: [
    // FR
    /derniere chance/,
    /offre limitee/,
    /deadline/,
    /il ne reste plus/,
    /maintenant ou jamais/,
    /urgent/,
    /temps est compte/,
    /plus beaucoup de temps/,
    /c'est a prendre ou a laisser/,
    // EN
    /last chance/,
    /limited offer/,
    /now or never/,
    /running out of time/,
    /take it or leave it/,
    /won't last/,
    /only available until/,
  ],
  authority: [
    // FR
    /la direction a decide/,
    /le marche dit/,
    /c'est la norme/,
    /standard du secteur/,
    /standard de l'industrie/,
    /tout le monde fait comme ca/,
    /la politique de l'entreprise/,
    /la politique interne/,
    /les experts s'accordent/,
    /selon les etudes/,
    // EN
    /management has decided/,
    /the market says/,
    /industry standard/,
    /company policy/,
    /it's the norm/,
    /experts agree/,
    /according to studies/,
  ],
  consistency: [
    // FR
    /vous aviez dit/,
    /comme convenu/,
    /vous vous etiez engage/,
    /on avait dit/,
    /vous aviez accepte/,
    /vous aviez promis/,
    /on s'etait mis d'accord/,
    // EN
    /you said earlier/,
    /as agreed/,
    /you committed to/,
    /you had agreed/,
    /you promised/,
    /we had agreed/,
    /you already accepted/,
  ],
  liking: [
    // FR
    /vous etes vraiment/,
    /j'apprecie votre/,
    /on se ressemble/,
    /entre nous/,
    /je vous aime bien/,
    /vous avez du talent/,
    /c'est un plaisir/,
    /vous etes formidable/,
    /bravo/,
    /chapeau/,
    // EN
    /you're really great/,
    /i appreciate your/,
    /we're alike/,
    /between us/,
    /i like you/,
    /you're talented/,
    /it's a pleasure/,
    /great job/,
    /well done/,
    /i admire/,
  ],
  socialProof: [
    // FR
    /tout le monde/,
    /les autres clients/,
    /les autres font/,
    /en general/,
    /la plupart/,
    /normalement/,
    /c'est ce que font/,
    /les gens choisissent/,
    /la majorite/,
    // EN
    /everyone does/,
    /other clients/,
    /most people/,
    /generally speaking/,
    /the majority/,
    /it's what people do/,
    /others have chosen/,
    /typically people/,
  ],
  unity: [
    // FR
    /on est dans le meme bateau/,
    /nous sommes ensemble/,
    /notre projet/,
    /notre equipe/,
    /entre partenaires/,
    /on forme une equipe/,
    /notre interet commun/,
    /on partage le meme/,
    // EN
    /we're in this together/,
    /we're on the same team/,
    /our project/,
    /our team/,
    /as partners/,
    /our shared interest/,
    /we share the same/,
    /our common goal/,
  ],
};

// ---------------------------------------------------------------------------
// User technique patterns — Chris Voss (FR + EN)
// ---------------------------------------------------------------------------

export const USER_PATTERNS = {
  labeling: [
    // FR
    /on dirait que/,
    /j'ai l'impression que/,
    /il semble que/,
    /vous semblez/,
    /ca a l'air/,
    /il semblerait que/,
    /vous avez l'air/,
    // EN
    /it sounds like/,
    /it seems like/,
    /it looks like/,
    /you seem/,
    /it feels like/,
    /i sense that/,
    /what i'm hearing is/,
  ],
  calibratedQuestion: [
    // FR
    /^comment /,
    /^qu'est-ce qui /,
    /^qu'est-ce que /,
    /^comment est-ce que/,
    /^de quelle maniere/,
    /^dans quelle mesure/,
    // EN
    /^how /,
    /^what makes /,
    /^what would it take/,
    /^how am i supposed/,
    /^how can we/,
    /^what can we do/,
  ],
  accusationAudit: [
    // FR
    /vous allez probablement penser que/,
    /ca va sembler/,
    /vous allez trouver que/,
    /je sais que ca peut paraitre/,
    /vous allez peut-etre trouver/,
    /je sais que ca semble/,
    // EN
    /you're probably going to think/,
    /this is going to sound/,
    /you might think/,
    /i know this may seem/,
    /you may feel that/,
    /before you react/,
  ],
  reframing: [
    // FR
    /en fait/,
    /si on regarde autrement/,
    /d'un autre point de vue/,
    /si on voit ca sous un autre angle/,
    /en y reflechissant/,
    /a bien y penser/,
    /vu sous cet angle/,
    // EN
    /actually if we/,
    /looking at it differently/,
    /from another perspective/,
    /if we think about it another way/,
    /let me reframe/,
    /another way to see this/,
    /on the other hand/,
  ],
  logrolling: [
    // FR — proposer un échange multi-thèmes
    /si.*en echange/,
    /si.*en contrepartie/,
    /je.*si vous/,
    /on pourrait.*et en meme temps/,
    /je suis pret a.*si/,
    /je peux.*a condition que/,
    /en echange de/,
    /je cede.*si/,
    /package/i,
    /accord global/,
    // EN
    /if.*in exchange/,
    /i could.*if you/,
    /what if we.*and/,
    /i'm willing to.*if/,
    /trade.*for/,
    /package deal/,
    /bundle/,
  ],
  identityAppeal: [
    // FR — appel à l'identité de l'autre
    /vous etes quelqu'un qui/,
    /je sais que vous valorisez/,
    /votre reputation/,
    /en tant que professionnel/,
    /quelqu'un de votre calibre/,
    /vous avez toujours ete/,
    /c'est pas votre genre de/,
    // EN
    /you're someone who/,
    /i know you value/,
    /your reputation/,
    /someone of your caliber/,
    /you've always been/,
  ],
};

// ---------------------------------------------------------------------------
// Detection: Adversary tactics
// ---------------------------------------------------------------------------

/**
 * Detects Cialdini influence principles in an adversary message.
 * @param {string} adversaryMessage
 * @param {object} sessionContext  — { transcript, turn, activeAnchor, firstAnchorBy }
 * @returns {TacticResult[]} — [{ type, principle, evidence, confidence }]
 */
export function detectAdversaryTactics(adversaryMessage, sessionContext = {}) {
  if (!adversaryMessage) return [];
  const norm = normalize(adversaryMessage);
  const results = [];

  for (const [principle, patterns] of Object.entries(ADVERSARY_PATTERNS)) {
    for (const pattern of patterns) {
      const match = norm.match(pattern);
      if (match) {
        results.push({
          type: 'adversaryTactic',
          principle,
          evidence: match[0],
          confidence: computeConfidence(match[0], norm),
        });
        break; // one detection per principle per message
      }
    }
  }

  return results;
}

function computeConfidence(matchStr, fullNorm) {
  // Longer match relative to message → higher confidence
  const ratio = matchStr.length / fullNorm.length;
  if (ratio > 0.3) return 0.9;
  if (ratio > 0.15) return 0.8;
  return 0.7;
}

// ---------------------------------------------------------------------------
// Detection: User techniques
// ---------------------------------------------------------------------------

const NUMBER_RE = /\d[\d\s,.]*(%|€|\$|eur|usd|chf|k\b|m\b)?/i;

/**
 * Detects Chris Voss negotiation techniques in a user message.
 * @param {string} userMessage
 * @param {string} adversaryLastMessage — previous adversary turn
 * @param {object} sessionContext
 * @returns {TechniqueResult[]} — [{ type, technique, evidence, quality }]
 */
export function detectUserTechniques(userMessage, adversaryLastMessage = '', sessionContext = {}) {
  if (!userMessage) return [];
  const norm = normalize(userMessage);
  const results = [];

  // --- Pattern-based techniques ---
  for (const [technique, patterns] of Object.entries(USER_PATTERNS)) {
    for (const pattern of patterns) {
      const match = norm.match(pattern);
      if (match) {
        results.push({
          type: 'userTechnique',
          technique,
          evidence: match[0],
          quality: qualityFromEvidence(match[0]),
        });
        break;
      }
    }
  }

  // --- Mirroring (fuzzy match: 2+ consecutive words from adversary) ---
  if (adversaryLastMessage) {
    const mirrorResult = detectMirroring(norm, normalize(adversaryLastMessage));
    if (mirrorResult) {
      results.push(mirrorResult);
    }
  }

  // --- Strategic silence: very short reply after adversary pressure ---
  if (norm.length < 15 && adversaryLastMessage) {
    const advTactics = detectAdversaryTactics(adversaryLastMessage, sessionContext);
    const pressurePrinciples = ['scarcity', 'authority', 'consistency'];
    const hasPressure = advTactics.some((t) => pressurePrinciples.includes(t.principle));
    if (hasPressure) {
      results.push({
        type: 'userTechnique',
        technique: 'strategicSilence',
        evidence: userMessage.trim(),
        quality: 0.6,
      });
    }
  }

  // --- Anchoring first: user states a number before adversary did ---
  if (!sessionContext.firstAnchorBy && NUMBER_RE.test(norm)) {
    results.push({
      type: 'userTechnique',
      technique: 'anchoringFirst',
      evidence: norm.match(NUMBER_RE)[0].trim(),
      quality: 0.8,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Mirroring detection (fuzzy: 2+ consecutive adversary words in user msg)
// ---------------------------------------------------------------------------

function detectMirroring(normUser, normAdversary) {
  const advWords = words(normAdversary);
  const userWords = words(normUser);
  if (advWords.length < 2 || userWords.length < 2) return null;

  let bestRun = [];
  // Slide over adversary words, find consecutive runs present in user message
  for (let i = 0; i < advWords.length; i++) {
    for (let j = 0; j < userWords.length; j++) {
      if (advWords[i] !== userWords[j]) continue;
      // extend run
      const run = [advWords[i]];
      let ai = i + 1;
      let uj = j + 1;
      while (ai < advWords.length && uj < userWords.length && advWords[ai] === userWords[uj]) {
        run.push(advWords[ai]);
        ai++;
        uj++;
      }
      if (run.length >= 2 && run.length > bestRun.length) {
        bestRun = run;
      }
    }
  }

  if (bestRun.length < 2) return null;

  // Quality scales with how many words mirrored (2=0.5, 3=0.7, 4=0.8, 5+=0.9)
  const quality = Math.min(0.9, 0.3 + bestRun.length * 0.15);
  return {
    type: 'userTechnique',
    technique: 'mirroring',
    evidence: bestRun.join(' '),
    quality: Math.round(quality * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Quality helper for pattern-matched techniques
// ---------------------------------------------------------------------------

function qualityFromEvidence(evidence) {
  // Longer, more specific evidence → higher quality
  if (evidence.length > 25) return 0.9;
  if (evidence.length > 15) return 0.8;
  return 0.7;
}

// ---------------------------------------------------------------------------
// Tactical Score — user proficiency across all Voss techniques
// ---------------------------------------------------------------------------

const TECHNIQUE_WEIGHTS = {
  mirroring: 15,
  labeling: 20,
  calibratedQuestion: 20,
  accusationAudit: 10,
  strategicSilence: 10,
  anchoringFirst: 15,
  reframing: 10,
};

/**
 * Computes a 0-100 tactical proficiency score for the user.
 * @param {TechniqueResult[]} techniques — all detected techniques across session
 * @param {number} turns — total number of user turns
 * @returns {{ score: number, breakdown: object }}
 */
export function computeTacticalScore(techniques, turns) {
  const breakdown = {};
  const techniqueCounts = {};

  for (const tech of techniques) {
    const t = tech.technique;
    if (!TECHNIQUE_WEIGHTS[t]) continue;
    techniqueCounts[t] = (techniqueCounts[t] || 0) + 1;
  }

  let totalScore = 0;

  for (const [technique, maxWeight] of Object.entries(TECHNIQUE_WEIGHTS)) {
    const count = techniqueCounts[technique] || 0;
    if (count === 0) {
      breakdown[technique] = 0;
      continue;
    }

    // Average quality for this technique
    const relevantTechs = techniques.filter((t) => t.technique === technique);
    const avgQuality = relevantTechs.reduce((s, t) => s + t.quality, 0) / relevantTechs.length;

    // Usage ratio: how often was it used relative to available turns
    // Cap at 1 — using it every turn is max usage
    const usageRatio = Math.min(1, count / Math.max(1, turns));

    // Score = weight * quality * min(1, usageBoost)
    // usageBoost: at least one use = 0.6 base, scales up with usage ratio
    const usageBoost = Math.min(1, 0.6 + usageRatio * 0.4);
    const score = Math.round(maxWeight * avgQuality * usageBoost * 10) / 10;
    breakdown[technique] = Math.min(maxWeight, score);
    totalScore += breakdown[technique];
  }

  return {
    score: Math.min(100, Math.round(totalScore)),
    breakdown,
  };
}
