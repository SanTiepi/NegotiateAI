// real-prep.mjs — "Prépare ta vraie négo" mode
// The hero use case: user has a REAL negotiation coming up.
// System generates a realistic adversary from their description,
// runs a simulation, then produces a concrete prep sheet.

import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { analyzeFeedback } from './analyzer.mjs';
import { analyzeWithTheory } from './negotiation-theory.mjs';

/**
 * Guided intake questions for a real negotiation.
 * Designed to feel like a coach asking the right questions, not a form.
 */
export function getRealPrepQuestions() {
  return [
    { id: 'when', label: 'Quand a lieu ta négociation ?', hint: 'Date, heure. L\'urgence change la stratégie.', type: 'text', required: true },
    { id: 'who', label: 'Avec qui tu négocies ?', hint: 'Nom, rôle, ce que tu sais sur cette personne.', type: 'textarea', required: true },
    { id: 'context', label: 'Le contexte en 2-3 phrases', hint: 'Pourquoi cette négo a lieu maintenant ?', type: 'textarea', required: true },
    { id: 'objective', label: 'Si tout se passe bien, tu obtiens quoi ?', hint: 'Sois précis : chiffres, termes, conditions.', type: 'textarea', required: true },
    { id: 'minimum', label: 'En dessous de quoi tu dis non ?', hint: 'Ton seuil. Si tu ne sais pas, c\'est un problème.', type: 'textarea', required: true },
    { id: 'planB', label: 'Si ça échoue, c\'est quoi ton plan B ?', hint: 'Ta BATNA. Plus elle est solide, plus tu es fort.', type: 'textarea', required: true },
    { id: 'fear', label: 'C\'est quoi ta plus grande peur ?', hint: 'Ce qui te stresse le plus dans cette négo. On va s\'y préparer.', type: 'textarea', required: false },
    { id: 'history', label: 'Tu as déjà négocié avec cette personne ?', hint: 'Comment ça s\'était passé ? Quel est le rapport de force ?', type: 'textarea', required: false },
  ];
}

/**
 * Build a real-prep brief from the intake answers.
 */
export function buildRealPrepBrief(answers) {
  if (!answers.context || !answers.context.trim()) throw new Error('Le contexte est requis');
  if (!answers.objective || !answers.objective.trim()) throw new Error('L\'objectif est requis');
  if (!answers.minimum || !answers.minimum.trim()) throw new Error('Le seuil minimal est requis');
  if (!answers.planB || !answers.planB.trim()) throw new Error('Le plan B (BATNA) est requis');

  const brief = buildBrief({
    situation: answers.context.trim(),
    userRole: 'Vous (préparation d\'une négociation réelle)',
    adversaryRole: (answers.who || 'Votre interlocuteur').trim(),
    objective: answers.objective.trim(),
    minimalThreshold: answers.minimum.trim(),
    batna: answers.planB.trim(),
    difficulty: 'neutral',
    relationalStakes: answers.history || '',
  });

  return {
    brief,
    metadata: {
      when: answers.when || null,
      fear: answers.fear || null,
      history: answers.history || null,
      isRealPrep: true,
    },
  };
}

/**
 * Generate a prep sheet from a completed simulation.
 * This is the deliverable — what the user takes to their real negotiation.
 */
export async function generatePrepSheet(session, feedback, provider) {
  const theoryAnalysis = analyzeWithTheory(session, feedback);

  const result = await provider.generateJson({
    system: `Tu es un coach en négociation expert. Tu viens d'observer une simulation de préparation.
Génère une fiche de préparation ACTIONNABLE que le joueur imprimera avant sa vraie négociation.
Sois concret, direct, pas de jargon inutile. Parle comme un coach, pas comme un prof.

Retourne du JSON :
{
  "openingLine": "La phrase exacte pour ouvrir la négociation",
  "keyArguments": ["3-5 arguments forts à utiliser, dans l'ordre"],
  "redLines": ["2-3 lignes rouges à ne pas franchir"],
  "trapsToAvoid": ["2-3 pièges identifiés pendant la simulation"],
  "ifTheyDo": [
    {"trigger": "S'ils disent X", "response": "Tu réponds Y", "why": "Parce que Z"}
  ],
  "batnaReminder": "Rappel de ton plan B en une phrase",
  "confidenceBooster": "Un message d'encouragement basé sur tes forces observées",
  "oneThingToRemember": "LA chose la plus importante à garder en tête"
}`,
    prompt: `Scénario : ${session.brief?.situation || '?'}
Adversaire : ${session.adversary?.identity || '?'}
Objectif : ${session.brief?.objective || '?'}
Seuil : ${session.brief?.minimalThreshold || '?'}
BATNA : ${session.brief?.batna || '?'}

Résultat de la simulation :
- Score global : ${feedback?.globalScore || '?'}/100
- Status : ${session.status}
- Tours joués : ${session.turn}
- Biais détectés : ${(feedback?.biasesDetected || []).map((b) => b.biasType).join(', ') || 'aucun'}
- Tactiques utilisées : ${(feedback?.tacticsUsed || []).join(', ') || 'aucune'}
- Forces : leverage ${feedback?.scores?.outcomeLeverage || '?'}/25, BATNA ${feedback?.scores?.batnaDiscipline || '?'}/20
- Faiblesses : régulation ${feedback?.scores?.emotionalRegulation || '?'}/25, biais ${feedback?.scores?.biasResistance || '?'}/15

Analyse théorique :
${theoryAnalysis.summary}
${theoryAnalysis.insights.slice(0, 3).map((i) => `- ${i.observation}`).join('\n')}

Transcript (derniers échanges) :
${(session.transcript || []).slice(-6).map((m) => `${m.role}: ${m.content}`).join('\n')}

Génère la fiche de préparation en français.`,
    schemaName: 'prepSheet',
    temperature: 0.4,
  });

  // Validate minimum fields
  if (!result.openingLine) result.openingLine = session.brief?.objective || 'Commencez par votre objectif.';
  if (!Array.isArray(result.keyArguments)) result.keyArguments = [];
  if (!Array.isArray(result.redLines)) result.redLines = [];
  if (!Array.isArray(result.trapsToAvoid)) result.trapsToAvoid = [];
  if (!Array.isArray(result.ifTheyDo)) result.ifTheyDo = [];

  return {
    ...result,
    theory: theoryAnalysis,
    generatedAt: new Date().toISOString(),
  };
}
