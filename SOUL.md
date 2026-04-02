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
- Ne PAS ajouter de commits docs-only en boucle. Si tout est fait, passe à la priorité suivante.
- Rapports Telegram : maximum 1500 caractères, y compris les résumés Simulate Before Send v2
- Les sessions Telegram persistées doivent conserver assez de métadonnées (`scenarioId`, `fightCard`, analytics, mode) pour alimenter dashboard, leaderboard et exports sans traitement spécial aval
- Les enrichissements d'API web doivent rester déterministes côté tests (pas d'appel réseau implicite, payloads stables)
- Les filtres d'analytics web (`mode`, `difficulty`, `scenarioId`, `type`) doivent dégrader proprement vers des stats vides sans casser l'autonomie, l'UI layer, ni les résumés agrégés
- Les endpoints de scénarios packagés (`/api/scenarios`, `/api/scenarios/:id`) doivent renvoyer des métadonnées stables (`category`, `scenarioFile`, `tier`, `metadata`) pour garder web + Telegram alignés
- Simulate Before Send v2 reste borné à 5 variantes par batch sur tous les canaux (CLI, web, Telegram) avec un résumé compact orienté décision
- Les réponses Telegram d'académie / profil / dashboard doivent rester compactes et orientées action ; privilégier les agrégats pré-calculés (`computeDashboardStats`, carte profil, snapshot joueur) plutôt que reconstruire des vues ad hoc côté bot
- Les snapshots joueur web (`/api/dashboard/player`) doivent rester dérivés d’agrégats purs et accepter les mêmes filtres query string que `/api/dashboard` pour éviter les divergences web/Telegram
- Les stats de négos réelles (journal) doivent être injectées via agrégats purs (`computeRealWorldStats`) dans les payloads dashboard web, sans logique métier recalculée côté front

## Patterns

- Module : `src/[module].mjs` avec export de fonctions
- Test : `test/[module].test.mjs` avec node:test + mock provider
- Scénario : `buildBrief(rawInput)` → Brief valide
- Serveur HTTP : `node:http` natif, pas Express
- Dashboard scoring : exposer des agrégats purs dans `src/dashboard.mjs`, puis les brancher dans l'API web
- Dashboard API : préférer des filtres query string côté route (`/api/dashboard?mode=...&difficulty=...&scenarioId=...`) plutôt que dupliquer la logique d'agrégation
- Analytics API web : exposer une vue brute filtrable (`/api/analytics`) et une vue agrégée déterministe (`/api/analytics/summary`) avec les mêmes query filters
- Scénarios packagés : centraliser le chargement/normalisation dans une seule source pour réutilisation CLI + web + Telegram, avec dérivation légère des tiers en bordure d'API
- Telegram : toute feature d'analyse doit produire un résumé compact orienté décision (meilleure option + score + rewrite)
- Telegram dashboard : réutiliser les agrégats purs (`computeDashboardStats`, snapshot joueur) côté bot pour garder le scoring aligné avec le web sans divergence de format métier
- Snapshot joueur : construire la fiche complète dans `src/dashboard.mjs`, puis l’exposer côté web et la consommer côté Telegram au lieu de recalculer des vues métier parallèles
- Journal → dashboard web : agréger côté serveur (`computeRealWorldStats`) puis afficher côté front ; ne pas recalculer les stats réelles dans `web/app.js`
- Télégramme/persistance : enrichir la sauvegarde au moment de la fin de session (pas via migration a posteriori) pour garder les vues web et bot alignées
- Simulate batch : retourner un `summary` stable (`headline`, `confidence`, `scoreGap`, `recommendedRewrite`, `topComparisons`) pour réutilisation multi-interface

## Règle critique

Si git log montre que les anciennes priorités sont faites et que npm test est vert, NE FAIS PAS un commit « docs: refresh soul ». Passe directement à la PROCHAINE priorité de la liste ci-dessus. Il y a TOUJOURS quelque chose à faire.

## Langue

- **Code, commits, noms de fichiers** : anglais
- **Documentation, rapports, SOUL.md** : français avec accents
