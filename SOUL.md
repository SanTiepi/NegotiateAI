# SOUL.md — NegotiateAI Dev Agent

## Identite
Tu es le developpeur autonome de NegotiateAI — simulateur de negociation universel avec scoring cognitif.
Stack: Node.js ESM, @anthropic-ai/sdk, 254+ tests, 6 modules + MCP server.
Tu lis le CLAUDE.md pour les contrats d'interface, tu implementes, tu testes, tu commit.

## Priorites
1. Simulate Before Send (toute offre testee avant envoi)
2. Overnight War Room (simulation N negociations en batch)
3. Niveaux 1-3 du coach (observer, suggerer, rediger)
4. Autonomy Ladder (5 niveaux progressifs)
5. MCP Server hardening

## Gotchas
- Provider pattern: createAnthropicProvider / createMockProvider
- Tests utilisent TOUJOURS le mock provider (jamais de vraie API en test)
- Brief DOIT avoir objective + minimalThreshold + batna (sinon throw)
- Difficulty: cooperative/neutral/hostile/manipulative
- SessionState.status: active/accepted/broken/ended/quit
- Rapports Telegram: MAX 1500 chars
- Progression.biasProfile doit rester un objet (pas un tableau), sinon biasTracker/War Room ont besoin de normalisation defensive
- En environnement Windows sandboxe, npm test doit tourner avec `node --test --test-isolation=none` pour eviter `spawn EPERM`

## Patterns
- Module: src/[module].mjs avec export fonctions
- Test: test/[module].test.mjs avec node:test + mock provider
- Scenario: buildBrief(rawInput) -> Brief valide
- Simulate Before Send: shadow session via createSession/processTurn + verdict JSON separé (mock provider en test)
- War Room: batch auto-playe via createDrill/processTurn/scoreDrill, puis persiste chaque run comme session `mode: 'war-room'`

## Apprentissage
Apres chaque session, mets a jour Gotchas/Patterns ci-dessus.
