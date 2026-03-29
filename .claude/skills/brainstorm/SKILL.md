---
name: brainstorm
description: "Brainstorm adaptatif Codex↔Claude. Usage: /brainstorm <idée>. S'adapte au poids de la question."
user-invocable: true
---

# /brainstorm

L'utilisateur donne une idée. Tu brainstorms avec Codex. La profondeur s'adapte automatiquement.

## Classifie l'idée

- **Quick** — question technique, petit ajustement, oui/non
- **Standard** — nouvelle feature, changement d'architecture, pivot
- **Deep** — stratégie produit/business, changement fondamental, multi-systèmes

## Contexte

Lis CLAUDE.md ou README.md (premières lignes). Si `.claude/codex_context.md` existe, utilise-le au lieu de re-décrire le projet.

Sinon crée-le après ce brainstorm (5 lignes : nom, stack, état, contraintes, objectif).

## Quick — Claude seul, pas de Codex

Réponds toi-même en 3-5 lignes. Verdict + pourquoi + alternative si pertinent. C'est tout.

## Standard — Codex + Claude

Appelle Codex. Adapte le prompt à la question — pas de template rigide. Donne-lui :
- Le contexte projet (court)
- L'idée
- Dis-lui d'inspecter le code pertinent à la question
- Dis-lui de répondre en français, d'être brutal et honnête
- Demande : forces, faiblesses, risque, alternative, verdict (go/pivot/kill), effort, impact

Timeout 45s. Si Codex ne répond pas, tranche seul et ajoute un addendum quand il arrive.

Puis ajoute ton avis : ce que tu acceptes, ce que tu contestes, enrichissement technique basé sur le code.

Présente le résultat — la longueur s'adapte à la complexité de la question. Pas de format rigide. L'important c'est : verdict clair, raison, prochaine action.

## Deep — Codex obligatoire

Même flow que Standard mais :
- Dis à Codex d'inspecter le code en profondeur
- Demande aussi : angles inexplorés, meilleure version de l'idée, dépendances
- Timeout 90s
- Ton avis est plus développé : connexions avec l'existant, faisabilité détaillée, risques techniques
- Propose un plan si go/pivot

## Après chaque brainstorm

Ajoute une ligne dans `.claude/brainstorm_log.md` :
```
- [date] [quick/standard/deep] [verdict] [titre] — [1 ligne]
```

## Pensée divergente — OBLIGATOIRE sur Standard et Deep

AVANT de donner ton avis ou d'appeler Codex, fais systématiquement :

1. **Nomme le cadre implicite** — quelle hypothèse non-dite est dans l'idée ? Quel paradigme est pris pour acquis ? (1 ligne)
2. **Dis ce que ce cadre empêche de voir** — quelle solution est invisible à cause de ce cadre ? (1 ligne)
3. **Propose une idée HORS cadre** — quelque chose que l'utilisateur n'a PAS demandé mais qui résout peut-être mieux le vrai problème (1-2 lignes)

Intègre ça naturellement dans ton analyse, pas comme un bloc séparé.

Pour le mode Deep, ajoute aussi :
- **Contraire vrai** — "et si l'hypothèse opposée était correcte ?" Explore brièvement ce que ça implique.
- **Analogie forcée** — compare le problème à un domaine complètement différent. Qu'est-ce que ce domaine fait mieux ?

## Principes

- La longueur de la réponse est proportionnelle au poids de la question
- Le but c'est DÉCIDER et SURPRENDRE — pas juste confirmer ce que l'utilisateur pense déjà
- Si l'idée est bonne, dis comment la rendre RADICALEMENT meilleure, pas incrémentalement
- Si l'idée est mauvaise, propose une alternative qui change le problème, pas juste la solution
- Tu dois anticiper ce que l'utilisateur n'a pas encore pensé — c'est ta valeur ajoutée
- Pas de complaisance, pas de pessimisme gratuit, pas de réponse prévisible
