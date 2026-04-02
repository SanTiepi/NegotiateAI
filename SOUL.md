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
- Rapports Telegram : maximum 1500 caractères
- Les enrichissements d'API web doivent rester déterministes côté tests (pas d'appel réseau implicite, payloads stables)

## Patterns

- Module : `src/[module].mjs` avec export de fonctions
- Test : `test/[module].test.mjs` avec node:test + mock provider
- Scénario : `buildBrief(rawInput)` → Brief valide
- Serveur HTTP : `node:http` natif, pas Express
- Dashboard scoring : exposer des agrégats purs dans `src/dashboard.mjs`, puis les brancher dans l'API web

## Règle critique

Si git log montre que les anciennes priorités sont faites et que npm test est vert, NE FAIS PAS un commit « docs: refresh soul ». Passe directement à la PROCHAINE priorité de la liste ci-dessus. Il y a TOUJOURS quelque chose à faire.

## Langue

- **Code, commits, noms de fichiers** : anglais
- **Documentation, rapports, SOUL.md** : français avec accents
