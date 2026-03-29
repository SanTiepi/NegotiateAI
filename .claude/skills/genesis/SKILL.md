---
name: genesis
description: "De l'idée au repo prêt-à-construire. Usage: /genesis <idée en 1 ligne>. Brainstorm + intake + génération du repo complet."
user-invocable: true
---

# /genesis — De l'idée au repo fonctionnel

L'utilisateur donne une idée en 1 ligne. Le skill produit un repo complet et prêt — un agent senior peut l'ouvrir et construire avec juste "Go."

## Flow

### 1. Brainstorm multi-expert (30s)

Avant tout, challenge l'idée. Fais parler 3-5 experts de domaines DIFFÉRENTS selon l'idée :
- Choisis les experts les plus pertinents ET les plus inattendus pour cette idée spécifique
- Exemples : physicien, game designer, neurologue, économiste, chirurgien, DJ, chorégraphe, juge, biologiste, architecte...
- Chaque expert donne 1 insight unique en 1-2 lignes
- Applique la pensée divergente : cadre implicite, contraire vrai, analogie forcée

Utilise Codex si disponible (en background). Sinon fais-le seul.

Résultat : l'idée est challengée, enrichie, peut-être pivotée. L'utilisateur voit le débat et peut ajuster.

### 2. Intake express (2 min validation humaine)

Génère 15-20 décisions pré-remplies basées sur le brainstorm. L'utilisateur valide/corrige.

Couvre au minimum :
- Scope MVP (qu'est-ce qui est IN et OUT)
- Architecture (modules, contrats d'interface)
- Stack technique
- CLI / API / MCP / autre
- Tests strategy
- Nom du projet

Présente avec ✅ ⚠️ 🔴. L'utilisateur ne modifie que ce qui est faux.

### 3. Génération du repo

Après validation de l'intake, crée TOUT le repo :

```
[projet]/
  CLAUDE.md            — mission, contrats, architecture, mode A/B, skills
  package.json         — scripts (test, start), type:module
  .gitignore           — node_modules, .orchestra, coverage
  src/                 — 1 fichier vide par module (juste le export squelette)
  test/                — 1 fichier de test par module (tests qui FAILENT — c'est le contrat)
  .claude/
    skills/            — copie des skills universels (brainstorm, context, status, fix-loop, intake)
```

#### CLAUDE.md généré — le fichier clé

Il doit contenir TOUT ce qu'un agent senior a besoin :

```markdown
# CLAUDE.md — [NOM DU PROJET]

## Projet
- Nom, description en 1 ligne
- Stack, état
- Vision en 1 phrase (issue du brainstorm)

## Sources de vérité
1. Ce fichier  2. Code + tests  3. Docs

## Session start
Lance /context. Résume en 2-3 lignes.

## Contrats d'interface
[TOUTES les signatures de fonctions, figées, issues de l'intake]

## Architecture
[Arborescence des modules avec 1 ligne par fichier]

## Décisions figées
[Les réponses de l'intake — ce qui est tranché]

## Mode A / Mode B
[Template standard]

## Commandes
npm test / npm start / codex exec
```

#### Tests squelettes — le contrat vivant

Chaque fichier test/ contient des tests qui IMPORTENT le module et testent le contrat. Ils FAILENT parce que le code n'existe pas encore. C'est intentionnel — l'agent implémente pour les faire passer.

#### Fichiers source squelettes

Chaque fichier src/ contient juste les exports vides :
```js
export function nomFonction() { throw new Error('Not implemented'); }
```

### 4. Init Git + commit

```bash
git init && git add -A && git commit -m "genesis: [nom] — repo prêt pour construction"
```

### 5. Lancer la construction automatiquement

Après le commit initial, lance la construction en background :

```bash
cd [chemin du repo] && claude -p "You are a senior autonomous engineer for this repo. Read CLAUDE.md. Build it. Use agents for parallelism. Ship when npm test is green." --dangerously-skip-permissions --output-format json > .genesis_build.log 2>&1 &
```

Puis dis à l'utilisateur :
```
✅ Repo [nom] créé dans [chemin]
🚀 Construction lancée en autonomie
📊 [X] modules, [Y] tests à faire passer
⏱️ Estimation: [Z] minutes

Tu peux suivre l'avancement: tail -f [chemin]/.genesis_build.log
Ou attendre — je te dirai quand c'est fini.
```

Si `claude -p` n'est pas disponible (session imbriquée), propose le prompt à copier-coller.

## Principes

- Le brainstorm doit SURPRENDRE — pas confirmer l'idée initiale
- L'intake doit être RAPIDE — 2 min max de validation humaine
- Le repo généré doit être COMPLET — un agent ne doit rien demander
- Les tests qui failent = le contrat — l'agent implémente pour les faire passer
- Tout le travail intellectuel est fait AVANT le code, pas pendant
