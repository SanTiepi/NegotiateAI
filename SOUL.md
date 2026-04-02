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
- Batch cron nocturne fiable : si `git log -10` ne montre que 4 feats SOUL mais `git log --grep="simulate" -n 5` retrouve Simulate Before Send et que `npm test` reste a 277 verts, traiter le run comme zero-delta documentaire
- En batch dev-runner cron, si `git log -10` montre surtout des commits docs mais que les feats `autonomy ladder` et `mcp hardening` sont presentes et `git log --grep="simulate" -n 5` retrouve Simulate Before Send, traiter la session comme zero-delta si `npm test` reste a 277 verts
- Audit zero-delta robuste: si le top-10 est quasi full docs avec seulement `feat: harden mcp session handling`, verifier aussi `git log --grep="war room|war-room"`, `git log --grep="coach|coaching"`, `git log --grep="autonomy ladder"` et `git log --grep="simulate"`; si les 5 priorites SOUL reapparaissent et `npm test` reste a 277 verts, ne rien reouvrir cote feature
- Batch cron aube fiable: si `git log -10` est 100% documentaire mais que les greps `simulate`, `war room`, `coach` et `autonomy ladder` retrouvent les feats, considerer le lot comme zero-delta des que `npm test` confirme 277 verts
- Audit docs-only confirme: si le top-10 git est entierement compose de `docs: refresh soul after zero-delta validation batch`, utiliser les greps cibles (`simulate`, `war room`, `coach`, `autonomy ladder`, `mcp`) + `npm test` avant toute reouverture de feature

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
- Batch cron zero-delta: apres validation `git log -10` + grep simulate + `npm test`, ne toucher qu'a `SOUL.md` puis committer `docs: refresh soul after zero-delta validation batch`
- Audit cron express: quand le top-10 est domine par des commits docs, verifier explicitement `git log --grep="simulate" -n 5` avant de conclure qu'une priorite SOUL manque encore
- Audit prioritaire complet: si `git log -10` est masque par une pile de commits docs, completer avec des greps ciblés (`simulate`, `war room`, `coach`, `autonomy ladder`) avant de declarer un batch zero-delta
- Batch aube zero-delta: en cron, lancer `git log -10 --oneline`, les greps de couverture SOUL puis `npm test`; si tout est vert, limiter le commit a `SOUL.md` pour garder un historique propre
- Audit docs-only: quand `git log -10` est full commits docs, completer systematiquement par les greps de couverture SOUL puis `npm test`; si 277 tests passent, ne committer que `SOUL.md`

## Apprentissage
Apres chaque session, mets a jour Gotchas/Patterns ci-dessus.
