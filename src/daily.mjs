// daily.mjs — Daily auto-calibrated challenge
// Contract: generateDaily(store, provider) → DailyChallenge

import { buildBrief } from './scenario.mjs';
import { generatePersona } from './persona.mjs';
import { identifyWeaknesses } from './belt.mjs';
import { computeDifficulty, presetToProfile, assessZPD } from './difficulty.mjs';
import { recommendBiasTraining } from './biasTracker.mjs';

const DIFFICULTY_LADDER = ['cooperative', 'neutral', 'hostile', 'manipulative'];

const DAILY_SCENARIOS = [
  { situation: 'Négociation d\'un prix lors d\'un achat immobilier', userRole: 'Acheteur', adversaryRole: 'Vendeur', objective: 'Acheter 10% sous le prix affiché', minimalThreshold: '5% sous le prix', batna: 'Un autre bien similaire à proximité' },
  { situation: 'Demande de télétravail supplémentaire', userRole: 'Employé', adversaryRole: 'Manager', objective: 'Obtenir 3 jours de télétravail par semaine', minimalThreshold: '2 jours minimum', batna: 'Postuler dans une entreprise full-remote' },
  { situation: 'Résolution d\'un conflit de voisinage', userRole: 'Résident', adversaryRole: 'Voisin bruyant', objective: 'Réduire les nuisances sonores après 22h', minimalThreshold: 'Réduction partielle du bruit', batna: 'Signaler à la copropriété' },
  { situation: 'Négociation d\'un délai de livraison projet', userRole: 'Chef de projet', adversaryRole: 'Client exigeant', objective: 'Obtenir 2 semaines supplémentaires', minimalThreshold: '1 semaine supplémentaire', batna: 'Livrer une version réduite dans les délais initiaux' },
  { situation: 'Négociation du prix d\'un service de consulting', userRole: 'Consultant', adversaryRole: 'Directeur achats', objective: 'Maintenir votre tarif jour à 1200€', minimalThreshold: '1000€/jour', batna: 'Travailler avec un autre client à 1100€/jour' },
  { situation: 'Partage des tâches domestiques', userRole: 'Partenaire A', adversaryRole: 'Partenaire B', objective: 'Répartition équitable 50/50', minimalThreshold: 'Au moins 40% pris en charge par l\'autre', batna: 'Engager une aide ménagère (coût partagé)' },
  { situation: 'Retour d\'un produit défectueux en magasin', userRole: 'Client', adversaryRole: 'Responsable SAV', objective: 'Remboursement intégral', minimalThreshold: 'Échange contre un produit neuf', batna: 'Signalement à la DGCCRF' },
];

const BIAS_FOCUS = {
  anchoring: {
    targetSkill: 'outcomeLeverage',
    scenarioIndex: 0,
    challengeFocus: 'Ouvre avec une ancre claire avant que l’adversaire ne fixe le cadre.',
  },
  loss_aversion: {
    targetSkill: 'batnaDiscipline',
    scenarioIndex: 4,
    challengeFocus: 'Ne cède pas sous la peur de perdre le deal : protège ton seuil minimal et ta BATNA.',
  },
  conflict_avoidance: {
    targetSkill: 'emotionalRegulation',
    scenarioIndex: 2,
    challengeFocus: 'Reste ferme sans chercher à acheter la paix trop vite.',
  },
  framing: {
    targetSkill: 'biasResistance',
    scenarioIndex: 3,
    challengeFocus: 'Repère le cadre imposé et reframe la discussion à ton avantage.',
  },
  conversational_blocking: {
    targetSkill: 'conversationalFlow',
    scenarioIndex: 5,
    challengeFocus: 'Évite les blocages secs : réponds avec une alternative ou une question calibrée.',
  },
};

/**
 * Auto-selects difficulty based on progression.
 */
export function calibrateDifficulty(progression) {
  if (progression.totalSessions < 3) return 'cooperative';

  const avgScore = progression.recentAvgScore || 0;
  const currentIdx = DIFFICULTY_LADDER.indexOf(progression.currentDifficulty || 'cooperative');

  if (avgScore > 70) return DIFFICULTY_LADDER[Math.min(currentIdx + 2, DIFFICULTY_LADDER.length - 1)];
  if (avgScore > 40) return DIFFICULTY_LADDER[Math.min(currentIdx + 1, DIFFICULTY_LADDER.length - 1)];
  return DIFFICULTY_LADDER[currentIdx] || 'cooperative';
}

/**
 * Checks if daily has already been played today.
 */
export async function dailyAlreadyPlayed(store) {
  const sessions = await store.lastN(5);
  const today = new Date().toISOString().slice(0, 10);
  return sessions.some((s) => s.mode === 'daily' && s.date?.slice(0, 10) === today);
}

/**
 * Generates today's daily challenge.
 */
export async function generateDaily(store, provider) {
  const progression = await store.loadProgression();
  const sessions = await store.loadSessions();

  // V2: Use adaptive difficulty engine
  const diffProfile = computeDifficulty(sessions);
  const zpd = assessZPD(sessions);
  const difficulty = calibrateDifficulty(progression);
  const weakDims = sessions.length > 0 ? identifyWeaknesses(sessions) : ['batnaDiscipline', 'outcomeLeverage'];
  const biasRecommendation = recommendBiasTraining(progression.biasProfile || {});
  const biasFocus = biasRecommendation ? BIAS_FOCUS[biasRecommendation.biasType] : null;
  const targetSkill = biasFocus?.targetSkill || weakDims[0];

  // Pick a scenario (bias-driven when a review is due, otherwise rotate by day)
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const scenarioBase = biasFocus
    ? DAILY_SCENARIOS[biasFocus.scenarioIndex % DAILY_SCENARIOS.length]
    : DAILY_SCENARIOS[dayOfYear % DAILY_SCENARIOS.length];

  const brief = buildBrief({
    ...scenarioBase,
    difficulty,
    constraints: [],
    relationalStakes: 'Moyen',
  });

  const adversary = await generatePersona(brief, provider);
  const maxTurns = Math.min(8, Math.max(5, 5 + Math.floor(progression.totalSessions / 5)));

  return {
    date: new Date().toISOString().slice(0, 10),
    brief,
    adversary,
    targetSkill,
    targetBias: biasRecommendation?.biasType || null,
    challengeFocus: biasFocus?.challengeFocus || `Renforce ta dimension la plus faible : ${targetSkill}.`,
    biasReason: biasRecommendation?.reason || null,
    difficulty,
    difficultyProfile: diffProfile,
    zpd: zpd.zone,
    maxTurns,
    eventPolicy: progression.totalSessions >= 10 ? 'adaptive' : 'none',
  };
}
