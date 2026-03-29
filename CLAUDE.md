# CLAUDE.md — NegotiateAI

## Projet
- **Nom** : NegotiateAI (`negotiate-ai`)
- **Description** : Simulateur de négociation universel — jeu de rôle émotionnel avec scoring cognitif
- **Stack** : Node.js 20+, ESM, `@anthropic-ai/sdk`, `node:test`, readline natif
- **État** : MVP fonctionnel — 54 tests verts, 6 modules implémentés, CLI interactive
- **Vision** : Système d'entraînement cognitif déguisé en jeu de rôle — miroir de tes patterns de pensée sous pression, pas juste un simulateur

## Sources de vérité
1. Ce fichier
2. Code + tests
3. JSDoc dans les fichiers source

## Session start
Lance `/context`. Résume en 2-3 lignes.

## Contrats d'interface

### Provider (`src/provider.mjs`)
```js
createAnthropicProvider({ apiKey, model? }) → { generateJson({ system, prompt, schemaName, temperature? }) → Promise<object> }
createMockProvider(fixtures) → { generateJson(...) → Promise<object> }
// fixtures: Record<schemaName, object | (req) => object>
```

### Scenario (`src/scenario.mjs`)
```js
buildBrief(rawInput) → Brief
assertValidBrief(brief) → void | throws
```
**Brief** : `{ situation, userRole, adversaryRole, objective, minimalThreshold, batna, constraints[], difficulty, relationalStakes }`
- `difficulty` : `'cooperative' | 'neutral' | 'hostile' | 'manipulative'`
- Throws si `objective`, `minimalThreshold` ou `batna` manquant/vide
- Default difficulty = `'neutral'`, default constraints = `[]`

### Persona (`src/persona.mjs`)
```js
generatePersona(brief, provider) → Promise<Adversary>
assertValidAdversary(adversary) → void | throws
```
**Adversary** : `{ identity, style, publicObjective, hiddenObjective, batna, nonNegotiables[], timePressure, emotionalProfile: { confidence, frustration, egoThreat }, likelyTactics[], vulnerabilities[] }`

### Engine (`src/engine.mjs`)
```js
createSession(brief, adversary, provider) → Session
processTurn(session, userMessage) → Promise<TurnResult>
```
**SessionState** : `{ turn, transcript[], confidence, frustration, egoThreat, pressure, momentum, activeAnchor, concessions[], status }`
- `status` : `'active' | 'accepted' | 'broken' | 'ended' | 'quit'`
- Max 12 tours
- Commandes CLI : `/end`, `/restart`, `/retry`, `/quit`

**TurnResult** : `{ adversaryResponse, detectedSignals[], state: SessionState, sessionOver, endReason }`

### Analyzer (`src/analyzer.mjs`)
```js
analyzeFeedback(session, provider) → Promise<FeedbackReport>
assertValidFeedbackReport(report) → void | throws
```
**FeedbackReport** : `{ globalScore, scores: ScoreBreakdown, biasesDetected: BiasInstance[], tacticsUsed[], missedOpportunities[], recommendations[] }`

**ScoreBreakdown** : `{ outcomeLeverage(0-25), batnaDiscipline(0-20), emotionalRegulation(0-25), biasResistance(0-15), conversationalFlow(0-15) }`

**BiasInstance** : `{ biasType, turn, excerpt, explanation }`
- Biais MVP : `anchoring`, `loss_aversion`, `conflict_avoidance`, `framing`, `conversational_blocking`

### Planner (`src/planner.mjs`)
```js
generatePlan(brief, feedbackReport, provider) → Promise<NegotiationPlan>
assertValidPlan(plan) → void | throws
```
**NegotiationPlan** : `{ recommendedOpening, labelsAndMirrors[], discoveryQuestions[], anchoringStrategy, concessionSequence[{condition, concession}], redLines[], walkAwayRule }`

## Architecture
```
src/
  provider.mjs    — Couche LLM abstraite (Anthropic + Mock)
  scenario.mjs    — Collecte et validation du brief
  persona.mjs     — Génération adversaire structuré
  engine.mjs      — Boucle conversation + WorldEngine (état émotionnel)
  analyzer.mjs    — Feedback post-session + détection biais cognitifs
  planner.mjs     — Plan de négociation optimal
  index.mjs       — Point d'entrée CLI (readline)

test/
  provider.test.mjs
  scenario.test.mjs
  persona.test.mjs
  engine.test.mjs
  analyzer.test.mjs
  planner.test.mjs
  integration.test.mjs  — Flow complet : setup → 3 tours → fin → feedback → plan
```

## Décisions figées
- CLI uniquement, pas de web/GUI pour le MVP
- `/retry` rejoue le même scénario avec nouvel état
- `@anthropic-ai/sdk` = seule dépendance runtime
- Couleurs ANSI et validations faites maison (pas de Zod, pas de Commander)
- Langue de sortie = langue du setup utilisateur (français par défaut)
- Contrats inter-modules = objets JS simples + fonctions d'assertion
- Provider: timeout 60s, try-catch JSON.parse, session state intact si erreur
- Engine: clamp 0-100 sur toutes les valeurs émotionnelles, sessionStatus explicite (pas de string matching)
- Analyzer: clamp scores aux ranges contractuels, recompute globalScore

## Insight fondamental (brainstorm 2026-03-30)

NegotiateAI n'est PAS un simulateur — c'est un **miroir cognitif**. Le vrai problème utilisateur :
1. **Voir ses propres patterns** (le miroir)
2. **Avoir la permission de s'affirmer** (red lines + BATNA = structure de permission)
3. **Construire du muscle mémoire émotionnel** (rester calme sous pression)

Le MVP fait le 1 et le 2. Le gap = le 3.

## Roadmap post-MVP (3 vagues)

### Vague B — Coach cognitif temps réel (priorité 1)
Objectif : transformer "j'ai joué une fois" en "j'ai appris quelque chose sur moi"

1. **Coaching mid-session** — enrichir `TurnResult` avec un champ `coaching` (détection de biais en temps réel, suggestion d'alternative)
2. **Persistance sessions** — `sessions.jsonl` local, dernières 10 sessions avec metadata (score, date, adversary, difficulty)
3. **Replay annoté** — `npm run replay` : revoir la session tour par tour avec overlay IA (ancrage détecté, alternative suggérée, momentum expliqué)
4. **Profil de biais personnel** — tracker les fréquences de biais sur N sessions ("tu tombes dans l'ancrage 70% du temps")
5. **Injection de pannes mid-session** — événements imprévus injectés par l'engine (gel budgétaire, appel concurrent, changement de ton)

### Vague A — Duolingo de la négo (priorité 2)
Objectif : créer l'habitude quotidienne

1. **Mode drill** — 3-5 tours focusés sur UN skill (miroir, ancrage, pression). `mode: 'drill'` dans le brief
2. **Système de ceintures** — progression visible par dimension de scoring :
   - Blanche : BATNA discipline (>14/20 × 3 sessions coopératives)
   - Jaune : Ancrage & leverage (>18/25 × 3 sessions neutres)
   - Verte : Flow conversationnel (>11/15 × 3 sessions neutres avec surprises)
   - Bleue : Régulation émotionnelle (>18/25 × 3 sessions hostiles)
   - Noire : Résistance aux biais (>12/15 × 3 sessions manipulateur)
3. **Daily challenge** — `npm run daily` : 1 scénario auto-calibré en 5 min
4. **Spaced repetition** — le système sert des scénarios qui exploitent tes faiblesses détectées
5. **Progression locale** — `progression.json` : ceinture, historique scores, streaks

### Vague C — Sparring compétitif (priorité 3, besoin d'utilisateurs)
Objectif : motivation sociale

1. **Scénarios standardisés** — fixtures dans `scenarios/` pour scoring comparable
2. **Leaderboard local** — score sur le même scénario, comparaison avec les runs précédentes
3. **Scenario of the week** — 1 scénario commun avec 3 tiers de difficulté
4. **Hall of fame** — meilleurs transcripts annotés (anonymisés)
5. **Mode versus** (stretch) — 2 humains + 1 IA arbitre

## Architecture cible (post-roadmap)
```
src/
  provider.mjs       — Couche LLM (existant)
  scenario.mjs       — Brief validation (existant)
  persona.mjs        — Adversaire structuré (existant)
  engine.mjs         — WorldEngine + coaching temps réel (enrichir)
  analyzer.mjs       — Feedback + biais (existant)
  planner.mjs        — Plan optimal (existant)
  index.mjs          — CLI principale (existant)
  store.mjs          — Persistance sessions.jsonl + progression.json (nouveau)
  replay.mjs         — Replay annoté tour par tour (nouveau)
  drill.mjs          — Mode drill : exercices courts ciblés (nouveau)
  daily.mjs          — Daily challenge auto-calibré (nouveau)
  belt.mjs           — Système de ceintures + progression (nouveau)
  events.mjs         — Injection de pannes mid-session (nouveau)

scenarios/           — Scénarios standardisés fixtures (nouveau)
```

## Mode A / Mode B

### Mode A — Autonome
L'agent lit CLAUDE.md, implémente module par module dans l'ordre recommandé, fait passer les tests.
- `npm test` doit être vert avant de passer au module suivant
- Pas de question à l'humain sauf blocage réel

### Mode B — Collaboratif
L'agent propose, l'humain valide avant chaque implémentation.

## Commandes
```bash
npm test          # Tous les tests (node --test)
npm start         # Lance la CLI interactive
```
