<div align="center">

<img src="docs/neurotrail-logo.png" width="96" alt="NeuroTrail" />

# NeuroTrail

**Sieh, was dein AI-Coding-Agent wirklich getan hat und ob du der Änderung vertrauen kannst.**

Local-first. Agent-übergreifend. Keine Instrumentierung nötig.

[![npm](https://img.shields.io/npm/v/neurotrail?color=cb3837&logo=npm)](https://www.npmjs.com/package/neurotrail)
&nbsp;[![CI](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml/badge.svg)](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml)
&nbsp;[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p>
  🇺🇸 <a href="README.md">English</a>
  · 🇯🇵 <a href="README.ja-JP.md">日本語</a>
  · 🇨🇳 <a href="README.zh-CN.md">简体中文</a>
  · 🇰🇷 <a href="README.ko.md">한국어</a>
  · 🇩🇪 Deutsch
  · 🇪🇸 <a href="README.es.md">Español</a>
  · 🇫🇷 <a href="README.fr.md">Français</a>
  · 🇧🇷 <a href="README.pt-BR.md">Português</a>
</p>

<br/>

<img src="docs/hero.gif" alt="NeuroTrail spielt die Arbeit mehrerer AI-Agenten als neuronalen Graphen ab" width="820" />

</div>

---

Immer mehr Pull Requests werden von AI-Agenten geschrieben. Reviewer sehen meistens nur den **Diff**. Der Diff zeigt aber nicht, wie der Agent dorthin kam: was er geprüft, verworfen, mehrfach gelesen oder tatsächlich getestet hat.

NeuroTrail rekonstruiert den Lauf eines Agenten aus lokalen Logs und erzeugt zwei Artefakte für Reviewer oder den nächsten Agenten:

- **Trust Summary**: Fakten wie geänderte Dateien, ausgeführte Befehle, echte Testergebnisse und Kosten, plus Aufmerksamkeitssignale für menschliche Prüfung.
- **Self-contained Replay**: Eine einzelne HTML-Datei, die den Lauf als neuronalen Graphen mit Scrubber animiert.

NeuroTrail startet oder steuert keinen Agenten und sendet nichts in die Cloud.

## Schnellstart

Voraussetzungen: Node.js 20+ und eine lokale AI-Coding-Session in diesem Workspace.

```bash
npx neurotrail review

# aus einem Clone:
node bin/neurotrail.mjs review
```

Ausgabe:

- `.neurotrail/review/latest.md` - Trust Summary für PR-Kommentare
- `.neurotrail/reports/latest.html` - teilbares interaktives Replay

## Live Viewer

```bash
git clone https://github.com/KF242131/neurotrail.git
cd neurotrail
npm install
npm run dev
```

Öffne `http://localhost:5173`. Ohne aktive Session läuft ein Beispiel-Replay; sobald ein unterstützter Agent im selben Workspace arbeitet, wechselt NeuroTrail zur Live-Ansicht.

## Sprachen

Der Live Viewer erkennt die Browsersprache und bietet im Header ein Sprachmenü. Die UI unterstützt English, 日本語, Español, Français, Deutsch, Português, 한국어 und 中文. Exportierte Replay-HTMLs übernehmen die gewählte Sprache.

Logtexte, Dateinamen, Befehle und Agententexte bleiben in der Originalsprache, damit die Evidenz unverändert bleibt.

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

## Unterstützte Quellen

Codex, Claude Code, Gemini, Cursor, Cline, Roo Code und workspace-lokales Generic JSONL.

## Datenschutz

NeuroTrail liest lokale Dateien und schreibt lokale Ausgaben. `review` redigiert standardmäßig einfache Geheimnisse. Prüfe HTML und Markdown, bevor du ein Replay aus einem privaten Repository teilst.

## Lizenz

[MIT](LICENSE)
