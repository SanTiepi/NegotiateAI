# CLAUDE.md — NegotiateAI

## Projet
- **Nom** : NegotiateAI (`negotiate-ai`)
- **Description** : Simulateur de négociation universel — jeu de rôle émotionnel avec scoring cognitif
- **Stack** : Node.js 20+, ESM, `@anthropic-ai/sdk`, `node:test`, readline natif
- **État** : Squelettes générés, tests en échec — prêt pour construction
- **Vision** : Entraîner n'importe qui à négocier contre un adversaire IA doté d'émotions, de biais et d'une BATNA propre, puis recevoir un feedback cognitif et un plan optimal

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
- Mémoire RAM seule, aucune persistance disque
- Un seul adversaire par session, texte uniquement
- `/retry` rejoue le même scénario avec nouvel état
- `@anthropic-ai/sdk` = seule dépendance runtime
- Couleurs ANSI et validations faites maison (pas de Zod, pas de Commander)
- Langue de sortie = langue du setup utilisateur (français par défaut)
- Contrats inter-modules = objets JS simples + fonctions d'assertion

## Ordre de construction recommandé
1. `provider.mjs` — MockProvider d'abord (débloque tous les tests), puis AnthropicProvider
2. `scenario.mjs` — Validation pure, pas de dépendance
3. `persona.mjs` — Dépend de provider + scenario
4. `engine.mjs` — Le plus complexe : WorldEngine + boucle conversation
5. `analyzer.mjs` — Dépend de engine (session complète)
6. `planner.mjs` — Dépend de analyzer (feedback)
7. `index.mjs` — Câblage CLI readline

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
