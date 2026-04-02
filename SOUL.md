# SOUL.md — NegotiateAI Dev Agent

## Identite
Tu es le developpeur autonome de NegotiateAI — simulateur de negociation universel avec scoring cognitif.
Stack: Node.js ESM, @anthropic-ai/sdk, 277+ tests, 6 modules + MCP server.
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
- Le coach temps reel doit maintenant exposer 3 niveaux explicites: observer / suggest / draft, sans casser `coaching.tip`
- L'Autonomy Ladder est un systeme separe des ceintures: 5 niveaux derives de sessions + score moyen + ceintures gagnees
- Le serveur MCP doit borner ses sessions en memoire (TTL + max size) et renvoyer des erreurs JSON structurees, pas juste du texte brut
- En environnement Windows sandboxe, `npm test` doit embarquer `--test-isolation=none` pour eviter `spawn EPERM`
- Les 5 priorites SOUL sont codees et couvertes par des tests dedies (simulate-before-send, war-room, coach L1-L3, autonomy ladder, MCP hardening)
- Avant tout nouveau batch prioritaire, verifier le script `npm test` + `git log -10 --oneline` : si les 5 priorites sont deja la et que les 277 tests passent, c'est un batch zero-delta legitime
- `git status --short` peut montrer des fichiers workspace non suivis (.claude/, .openclaw/, docs locaux) : ne pas les melanger aux commits de features tant qu'ils ne font pas partie du produit
- Batch dev-runner valide : si `git log -10 --oneline` montre deja simulate-before-send, war-room, coach L1-L3, autonomy ladder et MCP hardening, et que `npm test` reste a 277 verts, ne pas reouvrir artificiellement une feature
- Si le top-10 git est compose des 5 feats cibles suivies de commits `docs: refresh soul after zero-delta validation batch`, traiter le run comme maintenance documentaire uniquement
- Le commit Simulate Before Send peut sortir du top-10 apres plusieurs batches doc ; en cas de doute, verifier aussi `git log --grep="simulate" -n 5` avant de rouvrir la feature

## Patterns
- Module: src/[module].mjs avec export fonctions
- Test: test/[module].test.mjs avec node:test + mock provider
- Scenario: buildBrief(rawInput) -> Brief valide
- Simulate Before Send: shadow session via createSession/processTurn + verdict JSON separé (mock provider en test)
- Coaching Ladder: partir d'un coaching court LLM puis deriver deterministiquement les niveaux 1-3 (observer / suggest / draft)
- Autonomy Ladder: calcul pur, testable, branche sur les stats de progression et l'affichage profil/carnet
- MCP hardening: encapsuler TTL/cap/error-format dans un helper dedie pour tester sans lancer le serveur MCP
- War Room: batch auto-playe via createDrill/processTurn/scoreDrill, puis persiste chaque run comme session `mode: 'war-room'`
- Batch dev-runner: verifier `git log -10 --oneline` + grep src/test avant d'ouvrir une nouvelle feature, pour eviter de reimplementer une priorite deja livree
- Batch validation: si les priorites SOUL apparaissent deja dans git log et que `npm test` est vert, preferer un batch zero-delta documente plutot qu'un faux commit cosmetique
- Validation Windows: conserver `node --test --test-concurrency=1 --test-isolation=none test/*.test.mjs` dans le script package pour garder les batches fiables en sandbox
- Batch zero-delta: si git log couvre deja les 5 priorites et que `npm test` est a 277 verts, clore le batch par une mise a jour ciblée de SOUL plutot que de forcer une implementation artificielle
- Batch audit prioritaire: lire d'abord `CLAUDE.md`, `SOUL.md`, `git log -10 --oneline`, puis lancer `npm test`; si tout confirme l'etat cible, limiter le commit a la doc de memoire operative
- Batch zero-delta recurrent: ignorer les fichiers workspace non suivis et ne committer que `SOUL.md` avec un message `docs: refresh soul after zero-delta validation batch`
- Audit prioritaire robuste: si le top-10 ne montre que 4 feats SOUL, confirmer la 5e via `git log --grep="simulate" -n 5` puis conserver un batch documentaire si `npm test` reste a 277 verts

## Apprentissage
Apres chaque session, mets a jour Gotchas/Patterns ci-dessus.
