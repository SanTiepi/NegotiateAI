// negotiation-theory.mjs — Expert feedback grounded in negotiation science
// References: Getting to Yes (Fisher/Ury), Never Split the Difference (Voss),
// Influence (Cialdini), Thinking Fast and Slow (Kahneman), The Strategy of Conflict (Schelling)

/**
 * Theoretical frameworks used for analysis.
 */
export const FRAMEWORKS = {
  harvard: {
    id: 'harvard',
    name: 'Harvard (Fisher & Ury)',
    source: 'Getting to Yes, 1981',
    principles: [
      { id: 'separate_people', name: 'Separer les personnes du probleme', description: 'Attaquer le probleme, pas la personne. Emotions et substance sont distincts.' },
      { id: 'interests_not_positions', name: 'Se concentrer sur les interets, pas les positions', description: 'Derriere chaque position ("je veux 100k") il y a un interet ("je veux etre reconnu"). Les interets sont compatibles quand les positions ne le sont pas.' },
      { id: 'generate_options', name: 'Inventer des options a benefice mutuel', description: 'Elargir le gateau avant de le decouper. Le brainstorming creatif cree de la valeur.' },
      { id: 'objective_criteria', name: 'Insister sur des criteres objectifs', description: 'Utiliser des references externes (marche, precedents, expertise) plutot que la volonte des parties.' },
    ],
  },
  voss: {
    id: 'voss',
    name: 'Tactical Empathy (Chris Voss)',
    source: 'Never Split the Difference, 2016',
    principles: [
      { id: 'mirroring', name: 'Mirroring', description: 'Repeter les 1-3 derniers mots de l\'autre. Declenche l\'elaboration et la confiance.' },
      { id: 'labeling', name: 'Labeling', description: '"On dirait que..." — nommer l\'emotion la desactive. La validation est plus puissante que l\'argumentation.' },
      { id: 'calibrated_q', name: 'Questions calibrees', description: '"Comment suis-je cense faire ca ?" — transfere le probleme a l\'autre sans confrontation.' },
      { id: 'accusation_audit', name: 'Audit des accusations', description: 'Lister les objections de l\'adversaire AVANT qu\'il les souleve. Desactive les dynamiques negatives.' },
      { id: 'no_split', name: 'Ne jamais couper la poire en deux', description: 'Le compromis est souvent un mauvais deal pour les deux. Chercher une solution creative plutot que le milieu.' },
      { id: 'black_swan', name: 'Black Swans', description: 'Les informations inconnues qui changent tout. 3 types : ce que tu sais, ce qu\'ils savent, ce que personne ne sait.' },
    ],
  },
  cialdini: {
    id: 'cialdini',
    name: 'Influence & Persuasion (Cialdini)',
    source: 'Influence: The Psychology of Persuasion, 1984',
    principles: [
      { id: 'reciprocity', name: 'Reciprocite', description: 'Donner avant de demander. Une concession appelle une concession.' },
      { id: 'commitment', name: 'Engagement et coherence', description: 'Obtenir de petits "oui" avant le grand. Les gens veulent etre coherents avec leurs engagements passes.' },
      { id: 'social_proof', name: 'Preuve sociale', description: '"D\'autres dans votre situation ont choisi..." — le comportement des pairs influence les decisions.' },
      { id: 'scarcity', name: 'Rarete', description: 'Ce qui est rare est desire. Les deadlines et l\'exclusivite augmentent la valeur percue.' },
      { id: 'authority', name: 'Autorite', description: 'Les experts et les titres influencent les decisions. Citer des sources credibles.' },
      { id: 'liking', name: 'Sympathie', description: 'On dit oui plus facilement aux gens qu\'on aime. Similarite, compliments, cooperation.' },
    ],
  },
  kahneman: {
    id: 'kahneman',
    name: 'Biais cognitifs (Kahneman)',
    source: 'Thinking, Fast and Slow, 2011',
    principles: [
      { id: 'anchoring_effect', name: 'Effet d\'ancrage', description: 'Le premier chiffre mentionne cadre toute la negociation. Celui qui ancre en premier a un avantage statistique.' },
      { id: 'loss_aversion', name: 'Aversion a la perte', description: 'Perdre 100$ fait 2x plus mal que gagner 100$ fait plaisir. Cadrer en termes de perte est plus persuasif.' },
      { id: 'framing_effect', name: 'Effet de cadrage', description: 'La meme information presentee differemment change la decision. "90% de survie" vs "10% de mortalite".' },
      { id: 'sunk_cost', name: 'Cout irrecuperable', description: 'Plus on a investi, plus on s\'accroche — meme quand c\'est irrationnel. La BATNA protege contre ce biais.' },
      { id: 'overconfidence', name: 'Surconfiance', description: 'On surestime systematiquement nos chances. Le calibrage passe par le feedback, pas l\'intuition.' },
    ],
  },
  schelling: {
    id: 'schelling',
    name: 'Théorie des jeux (Schelling)',
    source: 'The Strategy of Conflict, 1960',
    principles: [
      { id: 'focal_point', name: 'Point focal', description: 'Certaines solutions sont "naturelles" — chiffres ronds, précédents, conventions. Les exploiter accélère l\'accord.' },
      { id: 'credible_commitment', name: 'Engagement crédible', description: 'Brûler ses propres vaisseaux rend la menace crédible. Mais attention : si le bluff est découvert, tout s\'effondre.' },
      { id: 'information_asymmetry', name: 'Asymétrie d\'information', description: 'Celui qui sait ce que l\'autre ne sait pas a le pouvoir. La découverte d\'information est le vrai jeu.' },
    ],
  },
  shapiro: {
    id: 'shapiro',
    name: 'Négociation identitaire (Shapiro)',
    source: 'Negotiating the Nonnegotiable, 2016',
    principles: [
      { id: 'identity_threat', name: 'Menace identitaire', description: 'Quand l\'identité est menacée ("je ne suis pas le genre de personne qui..."), la logique s\'effondre. La honte pousse à la capitulation ou à l\'escalade — jamais à la rationalité.' },
      { id: 'tribes_effect', name: 'Effet tribal', description: 'Nous classons inconsciemment l\'autre en "nous" ou "eux". Créer du "nous" (intérêts communs, vécu partagé) transforme la dynamique.' },
      { id: 'sacred_values', name: 'Valeurs sacrées', description: 'Certains enjeux ne sont PAS négociables — honneur, justice, loyauté. Les traiter comme du marchandage est une insulte qui détruit la relation.' },
    ],
  },
};

/**
 * Analyze a session transcript and map behaviors to theoretical concepts.
 * Returns rich, educational feedback.
 */
export function analyzeWithTheory(session, feedback) {
  const transcript = session?.transcript || [];
  const scores = feedback?.scores || {};
  const biases = feedback?.biasesDetected || [];
  const tactics = feedback?.tacticsUsed || [];

  const insights = [];

  // Harvard: interests vs positions
  const userMessages = transcript.filter((m) => m.role === 'user').map((m) => m.content || '');
  const hasPositionalLanguage = userMessages.some((m) => /je veux|je demande|il me faut|mon prix|c'est non/i.test(m));
  const hasInterestLanguage = userMessages.some((m) => /pourquoi|comment|qu'est-ce qui|important pour vous|votre besoin/i.test(m));

  if (hasPositionalLanguage && !hasInterestLanguage) {
    insights.push({
      framework: 'harvard',
      principle: 'interests_not_positions',
      observation: 'Tu as negocie sur des POSITIONS (chiffres, exigences) sans explorer les INTERETS sous-jacents.',
      recommendation: 'Essaie "Qu\'est-ce qui est le plus important pour vous dans cet accord ?" avant de parler chiffres.',
      severity: 'high',
    });
  } else if (hasInterestLanguage) {
    insights.push({
      framework: 'harvard',
      principle: 'interests_not_positions',
      observation: 'Tu as explore les interets de l\'adversaire — c\'est le fondement de la negociation raisonnee.',
      recommendation: 'Continue a chercher les interets CACHES derriere les positions affichees.',
      severity: 'positive',
    });
  }

  // Voss: mirroring/labeling
  const hasMirroring = userMessages.some((m) => /\?$/.test(m.trim()) && m.split(' ').length <= 8);
  const hasLabeling = userMessages.some((m) => /on dirait|il semble|j'ai l'impression|vous semblez|ca a l'air/i.test(m));

  if (!hasMirroring && !hasLabeling && transcript.length > 4) {
    insights.push({
      framework: 'voss',
      principle: 'labeling',
      observation: 'Tu n\'as utilise ni le mirroring ni le labeling — deux outils de base de l\'empathie tactique.',
      recommendation: 'Au prochain tour ou l\'adversaire exprime une emotion, essaie : "On dirait que [emotion] est important pour vous."',
      severity: 'medium',
    });
  }

  if (hasMirroring) {
    insights.push({
      framework: 'voss',
      principle: 'mirroring',
      observation: 'Tu as utilise le mirroring (questions courtes, repetition) — ca pousse l\'adversaire a elaborer.',
      severity: 'positive',
    });
  }

  // Kahneman: anchoring
  const firstUserMsg = userMessages[0] || '';
  const mentionsNumber = /\d/.test(firstUserMsg);
  if (mentionsNumber && (scores.outcomeLeverage || 0) >= 18) {
    insights.push({
      framework: 'kahneman',
      principle: 'anchoring_effect',
      observation: 'Tu as ancre en premier avec un chiffre — et l\'effet d\'ancrage a joue en ta faveur.',
      recommendation: 'L\'ancrage fonctionne mieux quand il est justifie par des criteres objectifs (marche, precedents).',
      severity: 'positive',
    });
  }

  // Bias detection → Kahneman mapping
  for (const bias of biases) {
    const mapping = BIAS_TO_THEORY[bias.biasType];
    if (mapping) {
      insights.push({
        framework: mapping.framework,
        principle: mapping.principle,
        observation: `Biais detecte : ${bias.biasType}${bias.explanation ? ` — ${bias.explanation}` : ''}`,
        recommendation: mapping.antidote,
        severity: 'high',
        turn: bias.turn,
      });
    }
  }

  // Cialdini: reciprocity check
  const userConcessions = transcript.filter((m) => m.role === 'user' && /j'accepte|je peux|je suis pret|d'accord pour|ok pour/i.test(m.content || ''));
  const adversaryConcessions = transcript.filter((m) => m.role === 'adversary' && /j'accepte|je peux|je suis pret|d'accord pour/i.test(m.content || ''));
  if (userConcessions.length > adversaryConcessions.length + 1) {
    insights.push({
      framework: 'cialdini',
      principle: 'reciprocity',
      observation: `Tu as fait ${userConcessions.length} concessions vs ${adversaryConcessions.length} de l'adversaire. La reciprocite est desequilibree.`,
      recommendation: 'Chaque concession devrait etre conditionnelle : "Je peux bouger sur X SI vous bougez sur Y."',
      severity: 'high',
    });
  }

  // Schelling: information discovery
  const questionsAsked = userMessages.filter((m) => m.includes('?')).length;
  if (questionsAsked < 2 && transcript.length > 6) {
    insights.push({
      framework: 'schelling',
      principle: 'information_asymmetry',
      observation: 'Tu as pose tres peu de questions. L\'asymetrie d\'information joue contre toi.',
      recommendation: 'La decouverte d\'information est le vrai jeu. Pose au moins 1 question par tour.',
      severity: 'medium',
    });
  }

  // Shame/identity detection (Shapiro, "Negotiating the Nonnegotiable")
  const frustration = session?.frustration ?? session?._world?.emotions?.frustration ?? 30;
  const shame = session?._world?.emotions?.shame ?? 30;
  const belonging = session?._world?.emotions?.belonging ?? 50;
  const hasEarlyCapitulation = userConcessions.length > 0 && transcript.length <= 4;

  if (hasEarlyCapitulation && shame > 40) {
    insights.push({
      framework: 'shapiro',
      principle: 'identity_threat',
      observation: 'Tu as cédé très tôt — possiblement par peur de paraître déraisonnable (honte anticipée).',
      recommendation: 'Ce n\'est pas de la faiblesse stratégique, c\'est la honte qui parle. Rappelle-toi : défendre tes intérêts N\'EST PAS être déraisonnable.',
      severity: 'high',
    });
  }

  // Logrolling detection
  const hasLogrolling = userMessages.some((m) => /si.*en (é|e)change|en contrepartie|à condition que|package|accord global|si vous.*je peux/i.test(m));
  if (hasLogrolling) {
    insights.push({
      framework: 'harvard',
      principle: 'generate_options',
      observation: 'Tu as proposé un échange multi-thèmes (logrolling) — c\'est la technique la plus puissante pour créer de la valeur.',
      recommendation: 'Continue à élargir le gâteau. Chaque concession devrait ouvrir une contrepartie sur un autre axe.',
      severity: 'positive',
    });
  } else if (userConcessions.length >= 2 && !hasLogrolling) {
    insights.push({
      framework: 'harvard',
      principle: 'generate_options',
      observation: 'Tu as fait plusieurs concessions sans les conditionner à des contreparties.',
      recommendation: 'Essaie le logrolling : "Je peux bouger sur X si vous bougez sur Y." Ne cède jamais gratuitement.',
      severity: 'medium',
    });
  }

  // Belonging/rapport
  if (belonging < 30 && transcript.length > 4) {
    insights.push({
      framework: 'voss',
      principle: 'labeling',
      observation: 'La relation s\'est dégradée — le rapport est faible. L\'adversaire se ferme.',
      recommendation: 'Restaure le lien : label une émotion ("On dirait que c\'est frustrant pour vous aussi"), montre que tu comprends sa position AVANT de pousser la tienne.',
      severity: 'medium',
    });
  }

  // Sort: positive first for encouragement, then high severity
  insights.sort((a, b) => {
    if (a.severity === 'positive' && b.severity !== 'positive') return -1;
    if (b.severity === 'positive' && a.severity !== 'positive') return 1;
    const sev = { high: 3, medium: 2, low: 1, positive: 0 };
    return (sev[b.severity] || 0) - (sev[a.severity] || 0);
  });

  return {
    insights: insights.slice(0, 6),
    frameworksUsed: [...new Set(insights.map((i) => i.framework))],
    summary: buildTheorySummary(insights),
  };
}

const BIAS_TO_THEORY = {
  anchoring: {
    framework: 'kahneman', principle: 'anchoring_effect',
    antidote: 'Prends du recul : le premier chiffre n\'est PAS la realite. Recalibre avec tes propres references (marche, BATNA).',
  },
  loss_aversion: {
    framework: 'kahneman', principle: 'loss_aversion',
    antidote: 'Tu crains de perdre ce que tu as plus que tu ne desires gagner. Rappelle-toi ta BATNA — tu as une alternative.',
  },
  conflict_avoidance: {
    framework: 'harvard', principle: 'separate_people',
    antidote: 'Le conflit n\'est pas personnel. Separe la personne du probleme. Tu peux etre ferme et respectueux.',
  },
  framing: {
    framework: 'kahneman', principle: 'framing_effect',
    antidote: 'L\'adversaire a cadre la discussion a son avantage. Recadre : change la perspective, la metrique ou le timeframe.',
  },
  conversational_blocking: {
    framework: 'voss', principle: 'calibrated_q',
    antidote: 'Tu t\'es laisse bloquer dans la conversation. Utilise une question calibree pour reprendre le controle : "Comment voyez-vous la suite ?"',
  },
  sunk_cost: {
    framework: 'kahneman', principle: 'sunk_cost',
    antidote: 'Le temps investi ne justifie pas de continuer. Seul le futur compte. Ta BATNA est-elle meilleure que ce deal ?',
  },
  premature_concession: {
    framework: 'shapiro', principle: 'identity_threat',
    antidote: 'Tu as cédé sans contrepartie — souvent par peur de paraître déraisonnable. Défendre tes intérêts n\'est PAS agressif. C\'est respectueux envers toi-même.',
  },
};

function buildTheorySummary(insights) {
  const positives = insights.filter((i) => i.severity === 'positive');
  const issues = insights.filter((i) => i.severity !== 'positive');

  const parts = [];
  if (positives.length > 0) {
    parts.push(`Points forts : ${positives.map((p) => p.principle).join(', ')}.`);
  }
  if (issues.length > 0) {
    const top = issues[0];
    const fw = FRAMEWORKS[top.framework];
    parts.push(`Axe principal : ${top.observation} (${fw?.name || top.framework}).`);
  }
  return parts.join(' ') || 'Analyse en cours.';
}

export function getFrameworkInfo(frameworkId) {
  return FRAMEWORKS[frameworkId] || null;
}
