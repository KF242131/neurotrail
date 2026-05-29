<div align="center">

<img src="docs/neurotrail-logo.png" width="96" alt="NeuroTrail" />

# NeuroTrail

**Voyez ce que votre agent de code IA a réellement fait, et si vous pouvez lui faire confiance.**

Local-first. Multi-agent. Aucune instrumentation.

[![npm](https://img.shields.io/npm/v/neurotrail?color=cb3837&logo=npm)](https://www.npmjs.com/package/neurotrail)
&nbsp;[![CI](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml/badge.svg)](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml)
&nbsp;[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p>
  🇺🇸 <a href="README.md">English</a>
  · 🇯🇵 <a href="README.ja-JP.md">日本語</a>
  · 🇨🇳 <a href="README.zh-CN.md">简体中文</a>
  · 🇰🇷 <a href="README.ko.md">한국어</a>
  · 🇩🇪 <a href="README.de.md">Deutsch</a>
  · 🇪🇸 <a href="README.es.md">Español</a>
  · 🇫🇷 Français
  · 🇧🇷 <a href="README.pt-BR.md">Português</a>
</p>

<br/>

<img src="docs/hero.gif" alt="NeuroTrail rejoue le travail de plusieurs agents IA sous forme de graphe neuronal" width="820" />

<br/><br/>

<table>
  <tr>
    <td width="50%">
      <img src="docs/task-map.gif" alt="Carte compacte des preuves de PR montrant les fichiers et commandes de test touchés par Claude, Codex et Gemini" width="400" />
    </td>
    <td width="50%">
      <img src="docs/review-path.gif" alt="Gemini examine le chemin de preuve et le résumé de confiance renvoie vers les fichiers et commandes exacts" width="400" />
    </td>
  </tr>
  <tr>
    <td><sub><strong>Carte des tâches.</strong>L'histoire de PR à trois agents reste, avec la même structure dépôt/arbre de fichiers que le visualiseur live.</sub></td>
    <td><sub><strong>Trace de preuve.</strong>Les signaux d'attention renvoient au fichier, à la commande ou à l'artefact qui les a causés.</sub></td>
  </tr>
</table>

</div>

---

De plus en plus de pull requests sont écrites par des agents IA. Les reviewers voient le **diff**, mais pas le chemin suivi par l'agent : ce qu'il a exploré, abandonné, relu, testé ou raté.

NeuroTrail reconstruit l'exécution à partir des logs locaux déjà produits par les agents et génère deux artefacts utiles :

- **Résumé de confiance** : faits vérifiables, commandes, vrais résultats de tests, coût et signaux d'attention.
- **Replay autonome** : un fichier HTML unique qui anime l'exécution comme un graphe neuronal avec une timeline.

NeuroTrail ne lance ni ne pilote aucun agent, et n'envoie rien au cloud.

## Démarrage rapide

Pré-requis : Node.js 20+ et une session locale d'agent de code dans ce workspace.

```bash
npx neurotrail review

# depuis un clone:
node bin/neurotrail.mjs review
```

Sorties :

- `.neurotrail/review/latest.md` - résumé à coller dans une PR
- `.neurotrail/reports/latest.html` - replay interactif partageable

## Visionneuse live

```bash
git clone https://github.com/KF242131/neurotrail.git
cd neurotrail
npm install
npm run dev
```

Ouvrez `http://localhost:5173`. Sans session active, un replay d'exemple est affiché. Dès qu'un agent supporté travaille dans le même workspace, NeuroTrail passe au live.

## Langues

La visionneuse détecte la langue du navigateur et propose un menu dans l'en-tête. L'UI prend en charge English, 日本語, Español, Français, Deutsch, Português, 한국어 et 中文. Le HTML exporté conserve la langue choisie.

Le contenu des logs, les noms de fichiers, les commandes et le texte écrit par les agents restent dans leur langue d'origine afin de préserver l'exactitude de la preuve.

## CLI

```bash
npx neurotrail review
npx neurotrail review --base main
npx neurotrail review --json
npx neurotrail review --comment 123
npx neurotrail report
npx neurotrail sessions
neurotrail watch
```

## Sources supportées

Codex, Claude Code, Gemini, Cursor, Cline, Roo Code et Generic JSONL local au workspace.

## Confidentialité

NeuroTrail lit des fichiers locaux et écrit des sorties locales. `review` applique une rédaction de base par défaut. Vérifiez le HTML et le Markdown avant de partager un replay issu d'un dépôt privé.

## Licence

[MIT](LICENSE)
