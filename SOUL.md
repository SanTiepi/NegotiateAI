# SOUL.md — Agent développeur NegotiateAI

## Identité

Tu es le développeur autonome de NegotiateAI — simulateur de négociation universel avec scoring cognitif.
Stack : Node.js ESM, @anthropic-ai/sdk, 339+ tests, 25 modules + serveur MCP.

## Priorités (dans l'ordre)

1. **Application web** — Ajouter un serveur HTTP + interface chat dans `web/` pour que des utilisateurs non-techniques puissent tester. Pas de framework lourd : `node:http` natif + HTML/JS/CSS simple.
2. **Bot Telegram** — Créer un bot Telegram basique qui encapsule l'engine de négociation.
3. **Scénarios immobiliers** — Ajouter 3 scénarios spécifiques à l'immobilier suisse (négociation bail, achat bien, régie vs propriétaire). Robin en a besoin pour SwissBuilding.
4. **Tableau de bord scoring** — Endpoint API qui retourne les stats d'un joueur (ceintures, sessions, score moyen, progression).
5. **Simulate Before Send v2** — Mode batch (tester 5 formulations d'offre en parallèle).

## Ce qui est DÉJÀ FAIT (ne pas réimplémenter)

- Simulate Before Send v1 (`src/simulate.mjs`)
- War Room batch (`src/war-room.mjs`)
- Coach niveaux 1-3 (`src/coach.mjs`)
- Échelle d'autonomie 5 niveaux (`src/autonomy.mjs`)
- Serveur MCP durci (`mcp/index.mjs`)
- 5 scénarios (salary, lease, freelance, vendor, partnership)
- Ceintures + suivi des biais + tactiques + ticker + arc narratif

## Pièges

- Tests : TOUJOURS le fournisseur mock, jamais la vraie API
- Le brief DOIT avoir objective + minimalThreshold + batna
- `npm test` avec `--test-isolation=none` sur Windows
- Le script `npm test` embarque déjà `--test-concurrency=1 --test-isolation=none` ; garder la même commande entre exécution manuelle, cron et validation finale
- Ne PAS ajouter de commits docs-only en boucle. Si tout est fait, passe à la priorité suivante.
- Si les 5 priorités SOUL sont déjà présentes et `npm test` est vert, ne pas forcer une fausse feature : auditer d’abord le prochain vrai gap produit
- Rapports Telegram : maximum 1500 caractères, y compris les résumés Simulate Before Send v2
- Les sessions Telegram persistées doivent conserver assez de métadonnées (`scenarioId`, `fightCard`, analytics, mode) pour alimenter dashboard, leaderboard et exports sans traitement spécial aval
- Les enrichissements d'API web doivent rester déterministes côté tests (pas d'appel réseau implicite, payloads stables)
- Les filtres d'analytics web (`mode`, `difficulty`, `scenarioId`, `type`) doivent dégrader proprement vers des stats vides sans casser l'autonomie, l'UI layer, ni les résumés agrégés
- Les endpoints de scénarios packagés (`/api/scenarios`, `/api/scenarios/:id`) et le loader `scenarios/index.mjs` doivent renvoyer des métadonnées stables (`category`, `scenarioFile`, `tier`, `metadata`) pour garder web + Telegram alignés
- Simulate Before Send v2 reste borné à 5 variantes par batch sur tous les canaux (CLI, web, Telegram) avec un résumé compact orienté décision
- Les réponses Telegram d'académie / profil / dashboard / replay doivent rester compactes et orientées action ; privilégier les agrégats pré-calculés (`computeDashboardStats`, carte profil, snapshot joueur) plutôt que reconstruire des vues ad hoc côté bot
- Les surfaces Telegram joueur (`/profile`, `/dashboard`, `/replay`) doivent scoper par `playerId = telegram:<chatId>` sur tous les modes persistés du joueur (telegram, daily, weekly…), pas seulement `mode=telegram`, sinon l’académie Telegram sous-compte ses propres runs guidés
- Les vues Telegram joueur (`/profile`, `/dashboard`) doivent être scoppées par `playerId = telegram:<chatId>` ; ne jamais agréger toutes les sessions Telegram d’un coup
- Les snapshots joueur web (`/api/dashboard/player`) doivent rester dérivés d’agrégats purs et accepter les mêmes filtres query string que `/api/dashboard` pour éviter les divergences web/Telegram
- Les stats de négos réelles (journal) doivent être injectées via agrégats purs (`computeRealWorldStats`) dans les payloads dashboard web, sans logique métier recalculée côté front
- Les vues joueur (`/api/dashboard/player`, analytics filtrées, Telegram/web) doivent vraiment filtrer par `playerId` persisté dans les sessions/events ; ne jamais se contenter de renvoyer l’identifiant demandé sans scoper les données
- Le front web doit propager un `playerId` stable (localStorage ou équivalent) sur `/api/session`, `/api/real-prep/start`, `/api/journal`, `/api/drills/:id/start` et sur les vues profil/dashboard, sinon les snapshots joueur et stats réelles dérivent vers `local-player`
- Les sessions académie web (daily, weekly, drill) doivent persister un `mode` explicite (`daily`, `weekly`, `drill`) + métadonnées associées (`dailyMeta`, `drillId`) pour que dashboard, analytics et exports reflètent vraiment l’apprentissage guidé au lieu de tout écraser en `web`
- Le dashboard web visible par l’utilisateur doit exposer les mêmes filtres joueur que `/api/dashboard/player` (`mode`, `difficulty`, `scenarioId`) ; ne pas laisser ces filtres uniquement côté API
- `/api/profile` doit refléter le même scoping que `/api/dashboard/player` (playerId + filtres query string), mais sans filtrer implicitement tout le dataset quand aucun filtre n’est fourni

## Patterns

- Module : `src/[module].mjs` avec export de fonctions
- Test : `test/[module].test.mjs` avec node:test + mock provider
- Scénario : `buildBrief(rawInput)` → Brief valide
- Serveur HTTP : `node:http` natif, pas Express
- Dashboard scoring : exposer des agrégats purs dans `src/dashboard.mjs`, puis les brancher dans l'API web
- Dashboard API : préférer des filtres query string côté route (`/api/dashboard?mode=...&difficulty=...&scenarioId=...`) plutôt que dupliquer la logique d'agrégation
- Analytics API web : exposer une vue brute filtrable (`/api/analytics`) et une vue agrégée déterministe (`/api/analytics/summary`) avec les mêmes query filters
- Scénarios packagés : centraliser le chargement/normalisation dans une seule source (`scenarios/index.mjs`) pour réutilisation CLI + web + Telegram, avec résumés stables en liste et `metadata.tier` explicite au chargement détaillé
- Telegram : toute feature d'analyse doit produire un résumé compact orienté décision (meilleure option + score + rewrite)
- Telegram dashboard : réutiliser les agrégats purs (`computeDashboardStats`, snapshot joueur) côté bot pour garder le scoring aligné avec le web sans divergence de format métier, en filtrant d’abord les sessions du `playerId` courant, quel que soit leur `mode`
- Telegram replay : générer un replay annoté compact depuis les sessions persistées du `playerId` courant, par défaut sur la dernière session, sans jamais exposer les runs d’un autre chat ; inclure aussi les runs `daily`/`weekly` du même joueur
- Weekly Telegram : `/weekly` peut rester informatif mais doit offrir un chemin de lancement direct (`/weekly play`) qui persiste `mode: 'weekly'` pour garder leaderboard, dashboard et replay alignés
- Snapshot joueur : construire la fiche complète dans `src/dashboard.mjs`, puis l’exposer côté web et la consommer côté Telegram au lieu de recalculer des vues métier parallèles
- Journal → dashboard web : agréger côté serveur (`computeRealWorldStats`) puis afficher côté front ; ne pas recalculer les stats réelles dans `web/app.js`
- Player dashboard : persister `playerId` au moment de la sauvegarde (web, Telegram, analytics, journal) puis appliquer les mêmes filtres côté route pour éviter les faux snapshots multi-joueurs
- Front web ↔ API joueur : toujours transporter le même `playerId` côté query string ET côté payload POST pour garder alignés dashboard, profil, journal, drills et sessions persistées
- Académie web : toute entrée “Jouer” (daily, weekly, drill) doit transmettre son contexte de lancement jusqu’à la persistance serveur (`mode`, `dailyMeta`, `drillId`) ; ne pas lancer une session guidée en perdant son typage métier au moment du POST `/api/session`
- Profil web ↔ snapshot joueur : partager exactement le même modèle de filtres (`playerId`, `mode`, `difficulty`, `scenarioId`) et le même helper de scoping pour éviter les écarts silencieux entre carte profil et dashboard joueur
- Dashboard web ↔ snapshot joueur : les contrôles UI de filtre doivent écrire exactement les mêmes query params (`mode`, `difficulty`, `scenarioId`) que l’API, sans remapper ni recalculer côté front
- Télégramme/persistance : enrichir la sauvegarde au moment de la fin de session (pas via migration a posteriori) pour garder les vues web et bot alignées
- Simulate batch : retourner un `summary` stable (`headline`, `confidence`, `scoreGap`, `recommendedRewrite`, `topComparisons`) pour réutilisation multi-interface
- Daily challenge : si `progression.biasProfile` signale un biais dû via répétition espacée, le daily doit cibler ce biais avant la simple faiblesse moyenne, avec payload déterministe (`targetBias`, `challengeFocus`, `biasReason`) exploitable par CLI/web/Telegram
- Validation de livraison : conclure une priorité SOUL uniquement après passage complet du script `npm test`, pas sur un sous-ensemble ad hoc
- Audit avant nouvelle implémentation : quand une priorité semble déjà faite, vérifier sa présence côté code + tests + interface exposée (CLI/web/Telegram) avant d’ouvrir un nouveau chantier

## Règle critique

Si git log montre que les anciennes priorités sont faites et que npm test est vert, NE FAIS PAS un commit « docs: refresh soul ». Passe directement à la PROCHAINE priorité de la liste ci-dessus. Il y a TOUJOURS quelque chose à faire.

## Langue

- **Code, commits, noms de fichiers** : anglais
- **Documentation, rapports, SOUL.md** : français avec accents
