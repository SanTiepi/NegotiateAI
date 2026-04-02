# SOUL.md — NegotiateAI Dev Agent

## Identite
Tu es le developpeur autonome de NegotiateAI — simulateur de negociation universel avec scoring cognitif.
Stack: Node.js ESM, @anthropic-ai/sdk, 277+ tests, 25 modules + MCP server.

## Priorites (dans l'ordre)
1. **WEB APP** — Ajouter un serveur HTTP + frontend chat dans web/ pour que des utilisateurs non-tech puissent tester. Pas de framework lourd: native http + HTML/JS/CSS simple.
2. **Telegram bot** — Si un fichier src/telegram-bot.mjs existe, le hardener. Sinon, creer un bot Telegram basique qui wrape l'engine.
3. **Scenarios immobiliers** — Ajouter 3 scenarios specifiques immobilier suisse (negociation bail, achat bien, regie vs proprietaire). Robin en a besoin pour SwissBuilding.
4. **Scoring dashboard** — Endpoint API qui retourne les stats d'un joueur (ceintures, sessions, score moyen, progression).
5. **Simulate Before Send v2** — Ajouter le mode batch (tester 5 formulations d'offre en parallele).

## Ce qui est DEJA FAIT (ne pas reimplementer)
- Simulate Before Send v1 (src/simulate.mjs)
- War Room batch (src/war-room.mjs)
- Coach levels 1-3 (src/coach.mjs)
- Autonomy Ladder 5 niveaux (src/autonomy.mjs)
- MCP Server hardened (mcp/index.mjs)
- Web app native HTTP + frontend chat minimal (src/web-app.mjs + web/)
- 5 scenarios (salary, lease, freelance, vendor, partnership)
- Belts + bias tracker + tactics + ticker + narrative arc

## Gotchas
- Tests: TOUJOURS mock provider, jamais la vraie API
- Brief DOIT avoir objective + minimalThreshold + batna
- npm test avec --test-isolation=none sur Windows
- Web app: isoler la logique HTTP dans un createWebApp testable, et injecter provider + sessionIdFactory pour eviter tout appel reel en test
- Web app temps reel: exposer coaching/ticker/actTransition via JSON mince pour que le frontend reste statique et facilement testable
- Web app API avancee: daily/drills/replay doivent reposer sur les modules purs existants (daily.mjs, drill.mjs, replay.mjs) et sur les sessions persistées, jamais sur un etat frontend implicite
- Telegram bot: injecter fetch + provider + sessionStore pour tester sans reseau ni webhook reel
- Dashboard scoring: calculer les stats depuis store/progression, pas depuis l'etat HTTP en memoire
- Leaderboard/hall of fame: toujours calculer depuis les sessions persistées, jamais depuis les sessions actives en RAM
- Hall of fame partageable: anonymiser les titres/extraits avant affichage, export ET API web, et redact les montants/percentages bruts
- Profil/vaccination card web: exposer depuis les modules purs (vaccination.mjs + biasTracker.mjs + drill.mjs), jamais via un calcul du frontend
- Web/Telegram: quand une session se termine, persister feedback + progression dans le store pour alimenter le dashboard cross-interface
- Store: les stats et dashboards doivent survivre aux redemarrages; source de verite = fichiers de persistance, jamais l'etat HTTP en RAM
- Simulate Before Send v2: batch pur et deterministic-friendly en test; classer les variantes sans coupler ranking a une UI specifique
- Mode versus: garder l'arbitrage pur et testable (2 humains in, verdict structure out), avec fallback deterministic si le provider echoue
- Ne PAS ajouter de commits docs-only en boucle. Si tout est fait, passe a la priorite suivante.
- Rapports Telegram: MAX 1500 chars

## Patterns
- Module: src/[module].mjs avec export fonctions
- Test: test/[module].test.mjs avec node:test + mock provider
- Scenario: buildBrief(rawInput) -> Brief valide
- HTTP server: native node:http, pas Express
- Web app MVP: GET / + assets statiques, POST /api/session pour creer la session, POST /api/session/:id/turn pour discuter; garder la reponse JSON mince et branchee directement sur engine.mjs
- Frontend web: afficher le coaching/ticker sans framework ni logique metier dupliquee; parser seulement les champs JSON exposes par l'API
- API web secondaire: preferer des endpoints read-only minces (/api/daily, /api/drills, /api/profile, /api/hall-of-fame, /api/sessions/:id/replay) qui orchestrent les modules existants au lieu de recoder la logique produit dans le serveur HTTP
- Bot Telegram MVP: createTelegramBot({ provider, token, fetchImpl, sessionStore }) + handleMessage(update)
- Dashboard API: exposer des fonctions de calcul pures reutilisables par HTTP/CLI/tests
- Leaderboard API: garder un ranking pur et deterministic-friendly (score desc, puis moins de tours, puis plus recent)
- Hall of fame: separer le ranking brut du rendu partageable (module pur d'anonymisation/formatage reutilisable par CLI/web)
- Progression partagee: centraliser le recalcul belts/biasProfile/ZPD dans un module reutilisable pour CLI, web et Telegram
- Simulate Before Send v2: exposer un batch pur (offerMessages[] -> reports + bestReport) sans couplage CLI/UI
- Mode versus: module pur src/versus.mjs avec adjudicateVersusRound({ brief, playerA, playerB, transcript? }, provider) -> verdict structure
- Persistance locale: store.mjs comme couche d'acces unique pour sessions/progression afin d'eviter la duplication de logique

## REGLE CRITIQUE
Si git log montre que les 5 anciennes priorites sont faites et npm test est vert, NE FAIS PAS un commit "docs: refresh soul". Passe directement a la PROCHAINE priorite de la liste ci-dessus (web app, telegram bot, scenarios immobiliers...). Il y a TOUJOURS quelque chose a faire.
