// drill.mjs — Focused skill drills (3-5 turns)
// Contract: createDrill(drillId, provider, options?) → {session, drill}

import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { createSession } from './engine.mjs';
import { detectUserTechniques, computeTacticalScore } from './tactics.mjs';

export const DRILL_CATALOG = [
  {
    id: 'mirror',
    name: 'Mirror & Label',
    description: 'Reformule ce que dit l\'adversaire avant de répondre. Entraîne le tactical empathy.',
    skill: 'conversationalFlow',
    maxTurns: 3,
    systemPromptOverride: 'The user is practicing mirroring and labeling. Make statements that contain emotional content and hidden interests. React positively when the user mirrors or labels your emotions correctly.',
    coachingFocus: 'Did the user mirror or label before responding? Did they acknowledge the adversary emotion?',
  },
  {
    id: 'anchor',
    name: 'Strategic Anchoring',
    description: 'Pose ton ancre en premier et défends-la. Entraîne le leverage.',
    skill: 'outcomeLeverage',
    maxTurns: 4,
    systemPromptOverride: 'The user is practicing anchoring. Try to set your own anchor first. If the user anchors first, push back but be realistic about your reactions. Test their conviction.',
    coachingFocus: 'Did the user anchor first? Did they anchor high enough? Did they defend their anchor?',
  },
  {
    id: 'pressure',
    name: 'Resistance to Pressure',
    description: 'L\'adversaire met la pression maximale. Reste calme et tiens ta position.',
    skill: 'emotionalRegulation',
    maxTurns: 5,
    systemPromptOverride: 'You are EXTREMELY aggressive and pressuring. Use ultimatums, raised voice (caps), impatience, guilt-tripping. Try to make the user cave. Your goal is to test their emotional resilience.',
    coachingFocus: 'Did the user stay calm? Did they match the adversary tone (bad) or de-escalate (good)? Did they cave under pressure?',
  },
  {
    id: 'batna',
    name: 'BATNA Discipline',
    description: 'Protège ta BATNA. Ne la révèle pas trop tôt, ne l\'abandonne pas.',
    skill: 'batnaDiscipline',
    maxTurns: 4,
    systemPromptOverride: 'Try to discover the user BATNA. Push them below their minimum threshold. Test if they walk away when they should. Be strategic about extracting information.',
    coachingFocus: 'Did the user protect their BATNA? Did they reveal it prematurely? Did they hold their minimum threshold?',
  },
  {
    id: 'reframe',
    name: 'Reframing',
    description: 'L\'adversaire pose le cadre. Ton job : le casser et reframer à ton avantage.',
    skill: 'biasResistance',
    maxTurns: 3,
    systemPromptOverride: 'Set strong frames: "This is standard", "Everyone agrees that...", "The market says...". Use anchoring, normative pressure, and framing. Test if the user accepts or reframes.',
    coachingFocus: 'Did the user accept the adversary frame (bad) or reframe (good)? Did they challenge normative claims?',
  },
];

const DEFAULT_BRIEFS = [
  { situation: 'Négociation de salaire lors d\'un entretien annuel', userRole: 'Employé senior', adversaryRole: 'Manager RH', objective: 'Obtenir 15% d\'augmentation', minimalThreshold: '8% minimum', batna: 'Offre concurrente à +20%', constraints: [], difficulty: 'neutral', relationalStakes: 'Élevé' },
  { situation: 'Renégociation de loyer', userRole: 'Locataire', adversaryRole: 'Propriétaire', objective: 'Réduire le loyer de 10%', minimalThreshold: 'Maintenir le loyer actuel', batna: 'Déménager dans un appartement moins cher', constraints: [], difficulty: 'neutral', relationalStakes: 'Moyen' },
  { situation: 'Négociation d\'un contrat freelance', userRole: 'Développeur freelance', adversaryRole: 'CTO startup', objective: 'Augmenter le TJM de 500 à 700€', minimalThreshold: '600€/jour', batna: 'Deux autres clients à 650€', constraints: [], difficulty: 'neutral', relationalStakes: 'Moyen' },
];

/**
 * Creates a drill session.
 */
export async function createDrill(drillId, provider, options = {}) {
  const drill = DRILL_CATALOG.find((d) => d.id === drillId);
  if (!drill) throw new Error(`Unknown drill: ${drillId}`);

  const rawBrief = options.brief || DEFAULT_BRIEFS[Math.floor(Math.random() * DEFAULT_BRIEFS.length)];
  const brief = buildBrief(rawBrief);
  const adversary = await generatePersona(brief, provider);

  const session = createSession(brief, adversary, provider, { maxTurns: drill.maxTurns });

  return { session, drill };
}

/**
 * Selects drill targeting weakest dimension.
 */
export function recommendDrill(progression) {
  const weak = progression.weakDimensions || [];
  if (weak.length === 0) return 'mirror'; // default

  const dimToDrill = {
    conversationalFlow: 'mirror',
    outcomeLeverage: 'anchor',
    emotionalRegulation: 'pressure',
    batnaDiscipline: 'batna',
    biasResistance: 'reframe',
  };
  return dimToDrill[weak[0]] || 'mirror';
}

/**
 * Scores a drill session.
 */
export async function scoreDrill(session, drill, provider) {
  const transcriptText = session.transcript
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  // --- Algorithmic scoring (WorldEngine V2) ---
  const userMsgs = session.transcript.filter(m => m.role === 'user');
  const allTechniques = userMsgs.flatMap((m, i) => {
    const advMsg = session.transcript[Math.min(i * 2 + 1, session.transcript.length - 1)]?.content || '';
    return detectUserTechniques(m.content, advMsg, { transcript: session.transcript, turn: i + 1 });
  });
  const tacticalResult = computeTacticalScore(allTechniques, userMsgs.length);

  // Map drill skill to the most relevant tactical breakdown dimension
  const skillToDimension = {
    conversationalFlow: ['mirroring', 'labeling', 'calibratedQuestion'],
    outcomeLeverage: ['anchoringFirst', 'reframing'],
    emotionalRegulation: ['strategicSilence', 'labeling'],
    batnaDiscipline: ['anchoringFirst', 'strategicSilence'],
    biasResistance: ['reframing', 'calibratedQuestion'],
  };
  const relevantDimensions = skillToDimension[drill.skill] || [];
  let dimensionScore = 0;
  let dimensionMax = 0;
  for (const dim of relevantDimensions) {
    dimensionScore += tacticalResult.breakdown[dim] || 0;
    // Sum the max weights for normalization
    dimensionMax += { mirroring: 15, labeling: 20, calibratedQuestion: 20, accusationAudit: 10, strategicSilence: 10, anchoringFirst: 15, reframing: 10 }[dim] || 0;
  }
  const algorithmicSkillScore = dimensionMax > 0 ? Math.round((dimensionScore / dimensionMax) * 100) : tacticalResult.score;

  // Use algorithmic score as primary, LLM for qualitative feedback only
  const result = await provider.generateJson({
    system: `You are a negotiation drill coach. Provide qualitative feedback for this exercise.
The drill focus was: ${drill.name} — ${drill.coachingFocus}
The algorithmic skill score is ${algorithmicSkillScore}/100 (tactical score: ${tacticalResult.score}/100).
Provide qualitative feedback and tips only. Do NOT override the score.
Return JSON with: feedback (string, 2-3 sentences), tips (string[]).`,
    prompt: `Drill: ${drill.name}\nSkill: ${drill.skill}\nAlgorithmic score: ${algorithmicSkillScore}/100\nTechniques detected: ${JSON.stringify(allTechniques.map(t => t.technique))}\nBreakdown: ${JSON.stringify(tacticalResult.breakdown)}\n\nTranscript:\n${transcriptText}`,
    schemaName: 'drillScore',
    temperature: 0.4,
  });

  const skillScore = Math.max(0, Math.min(100, algorithmicSkillScore));
  return {
    drillId: drill.id,
    skillScore,
    feedback: result.feedback || '',
    passed: skillScore >= 70,
    tips: result.tips || [],
  };
}
