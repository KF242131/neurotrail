<div align="center">

<img src="docs/neurotrail-logo.png" width="96" alt="NeuroTrail" />

# NeuroTrail

**See what your AI agent actually did — and whether to trust it.**

The review layer for agent-written code. Local-first. Cross-agent. Zero instrumentation.

[![npm](https://img.shields.io/npm/v/neurotrail?color=cb3837&logo=npm)](https://www.npmjs.com/package/neurotrail)
&nbsp;[![CI](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml/badge.svg)](https://github.com/KF242131/neurotrail/actions/workflows/ci.yml)
&nbsp;[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

<p>
  <a href="https://github.com/KF242131/neurotrail">GitHub</a>
  · <a href="https://www.npmjs.com/package/neurotrail">npm</a>
  · <a href="docs/LAUNCH.md">launch notes</a>
</p>

<p>
  🇺🇸 English
  · 🇯🇵 <a href="README.ja-JP.md">日本語</a>
  · 🇨🇳 <a href="README.zh-CN.md">简体中文</a>
  · 🇰🇷 <a href="README.ko.md">한국어</a>
  · 🇩🇪 <a href="README.de.md">Deutsch</a>
  · 🇪🇸 <a href="README.es.md">Español</a>
  · 🇫🇷 <a href="README.fr.md">Français</a>
  · 🇧🇷 <a href="README.pt-BR.md">Português</a>
</p>

<br/>

<img src="docs/hero.gif" alt="Claude, Codex and Gemini collaborating on one pull request, replayed as a color-coded neural graph" width="820" />

<sub>Three AI agents — Claude, Codex, Gemini — shipping one PR in the full reviewer dashboard: live map, current step, evidence trail, cost, tokens, and per-agent activity. <code>npx neurotrail review</code> turns any agent session into a replay like this.</sub>

<br/><br/>

<table>
  <tr>
    <td width="50%">
      <img src="docs/task-map.gif" alt="A compact pull request evidence map showing Claude, Codex and Gemini around the exact files and test command they touched" width="400" />
    </td>
    <td width="50%">
      <img src="docs/review-path.gif" alt="Gemini reviewing the evidence path and NeuroTrail linking the trust summary back to exact files and commands" width="400" />
    </td>
  </tr>
  <tr>
    <td><sub><strong>Task map.</strong> The left/right panels and bottom metrics stay visible while the graph shows the live viewer's repository/file-tree structure.</sub></td>
    <td><sub><strong>Evidence trail.</strong> Review flags link back to the exact file, command, or artifact, with cost and agent context still in frame.</sub></td>
  </tr>
</table>

</div>

---

In 2026 a growing share of pull requests are written by AI agents. Reviewers get
the **diff** — but the diff doesn't tell you *how* the agent got there: what it
explored and abandoned, what it re-read six times, whether it actually ran the
tests, or where it thrashed. **Everyone reviews the output. Nobody reviews the
process — and trust lives in the process.**

NeuroTrail reconstructs an agent's run from the logs it already writes to your
disk (Claude Code, Codex, Gemini, Cursor, Cline, Roo) and turns it into two
things you can hand to a reviewer or the next agent:

- **A trust summary** — the defensible facts (files changed, commands run, real
  test pass/fail, cost) followed by confidence-banded *attention flags*, each
  deep-linked to the exact moment in the replay so a human can verify it.
- **A self-contained replay** — a single HTML file that animates the run as a
  neural graph with a video scrubber. No server, opens anywhere, attach it to a PR.

It does **not** start or drive any agent, and it sends **nothing** to the cloud.

## Why this is different

Tools like `ccusage` and `agenttrace` already measure agent cost and waste in
your terminal — and they're good at it. NeuroTrail is not another usage meter.
It's the **visual, shareable, PR-attached** layer those tools structurally
can't be: it answers *"what did this agent do, and should I trust this change?"*
for a **human reviewer**, with the replay as the evidence.

## Status

`v0.1.0-alpha`. The `review` / `report` / `sessions` CLI is pure-Node and ships
ready for the zero-install `npx neurotrail` workflow once published to npm. Until
then, run it from a clone with `node bin/neurotrail.mjs review`. The live viewer
(`watch`) needs a clone plus `npm install`.

## Quickstart

Requirements: Node.js 20+, and a local AI coding session for this workspace (or
the built-in sample replay).

Generate a trust report for the latest agent session in the current repo — no
clone, no install (once published):

```bash
npx neurotrail review
# from a clone today:
node bin/neurotrail.mjs review
```

This writes:

- `.neurotrail/review/latest.md` — the trust summary (paste into a PR comment)
- `.neurotrail/reports/latest.html` — the self-contained interactive replay

Open the HTML in any browser. Click any **attention flag** to jump the replay to
that exact moment.

### What the trust summary looks like

```markdown
# NeuroTrail trust summary — Claude wrote this change

> Reviewing the process, not just the diff — reconstructed from local agent logs.

## What the agent did
- Files changed: 6 — App.tsx, costModel.ts, trustSummary.js +3 more
- Commands run: 11
- Tests: ran and passed
- Est. cost: $0.42 · 312k tokens
- Steps: 84 · Duration: 7:41

## Attention flags (heuristic — for human review)
- Edited one file many times with no passing checkpoint · 66% · `costModel.ts` · 4× · first at 3:12 in the replay
- Read a file that did not inform any later edit · 58% · `legacy/auth.ts` · at 1:05 in the replay

_Attention flags are heuristic signals for human review, not defects. Open the
replay to verify each one._
```

The numbers above the line are facts pulled straight from the transcript
(provider-reported cost when available, observed test results). The flags below
are heuristics — NeuroTrail surfaces the evidence and links it; **you** make the
call.

## The live viewer

For watching a run unfold in real time, clone the repo and run the dev viewer:

```bash
git clone https://github.com/KF242131/neurotrail.git
cd neurotrail
npm install
npm run dev
```

Open `http://localhost:5173`. With no active session it plays a **sample agent
PR replay**; the moment a supported agent starts working in the same workspace,
it upgrades to the live run. Press `c` for cinematic mode.

## Languages

The live viewer now detects the browser language and includes a header language
menu. UI chrome supports English, 日本語, Español, Français, Deutsch, Português,
한국어, and 中文; shareable replay HTML inherits the selected language. Transcript
content, file names, commands, and agent-written text remain in their original
language so the replay stays faithful to the source logs.

Localized READMEs are available for:
[日本語](README.ja-JP.md), [简体中文](README.zh-CN.md),
[한국어](README.ko.md), [Deutsch](README.de.md), [Español](README.es.md),
[Français](README.fr.md), and [Português](README.pt-BR.md).

## CLI

```bash
npx neurotrail review                 # trust report for the latest session
npx neurotrail review --base main     # scope changed files to this branch vs main
npx neurotrail review --json          # machine-readable output (CI / scripting)
npx neurotrail review --comment 123   # post the trust summary to PR #123 (via gh)
npx neurotrail report                 # next-agent handoff packet + replay
npx neurotrail sessions               # list local agent sessions for this workspace
neurotrail watch                      # live dev viewer (requires a clone + npm install)
```

| Command | What it does |
| --- | --- |
| `review` | Trust report for a reviewer: replay HTML + `review/latest.md`. Redacts by default. |
| `report` | Next-agent handoff: replay HTML + `handoff/latest.md`. |
| `sessions` | Lists recent supported local agent sessions for this workspace. |
| `watch` | Starts the live viewer. Requires a clone with dev dependencies. |

| Option | Applies to | Description |
| --- | --- | --- |
| `--base <ref>` | `review` | Git base to diff for the changed-files list. Default `main`. |
| `--json` | `review` | Print machine-readable JSON (facts, flags, artifact paths). |
| `--comment <pr>` | `review` | Post the trust summary to a GitHub PR via the `gh` CLI. |
| `--fail-on-flags <n>` | `review` | Exit 1 if any attention flag's confidence ≥ `n` (0–1). For CI gates. |
| `--no-redact` | `review` | Disable redaction (on by default for shared artifacts). |
| `--target codex\|claude\|cursor` | `report` | Tailors the handoff instruction for the next agent. |
| `--redact` | `report` | Apply basic redaction to the exported report and handoff. |

### Posting a review to a PR

Because NeuroTrail is local-first, the agent transcripts live on your machine,
not on CI — so the simplest flow runs where the logs are (your laptop):

```bash
neurotrail review --comment        # auto-detects the current branch's PR (needs gh)
neurotrail review --comment 123    # or target a PR explicitly
```

This posts the trust summary as a PR comment. For teams that run agents in CI or
on self-hosted runners (where the logs are present), the example workflow at
[`.github/workflows/neurotrail-review.yml`](.github/workflows/neurotrail-review.yml)
does the same automatically and uploads the replay HTML as a build artifact — and
skips cleanly on hosted runners that can't see local logs.

## Supported sources

NeuroTrail reads local transcript formats from:

| Agent/source | Notes |
| --- | --- |
| Codex | Reads session logs under `~/.codex/sessions`. Full token/cost + tool results. |
| Claude Code | Reads project transcripts under `~/.claude/projects`. Full token/cost + tool results. |
| Gemini | Reads recent local Gemini chat and artifact records where available. |
| Cursor | Reads recent Cursor agent transcripts for this workspace. |
| Cline | Reads recent Cline task transcripts from VS Code/Cursor storage or local `.cline`. |
| Roo Code | Reads recent Roo task transcripts from VS Code/Cursor storage or local `.roo`. |
| Generic JSONL | Reads workspace-local `.agent`, `.agents`, `.ai`, and `.neurotrail/sessions` records. |

## Privacy and redaction

NeuroTrail reads local files and writes local outputs only. `review` redacts by
default (pass `--no-redact` to disable); `report` redacts with `--redact`.
Redaction masks bearer tokens, GitHub/Slack-style tokens, emails, home paths,
and long secret-like strings.

Redaction is best-effort. **Review exported HTML and markdown before posting a
replay from a private repository.**

## How it works

1. Discover the most recent supported session(s) for the current workspace.
2. Normalize tool calls, edits, commands, and tool *results* into a timeline,
   correlating each command with its observed pass/fail.
3. Classify per-step "attention" signals (`src/lib/wasteCore.js`) and render the
   reviewer trust summary (`src/lib/trustSummary.js`).
4. Emit a self-contained replay (`src/replay/replayDocument.js`).

Useful paths:

| Path | Purpose |
| --- | --- |
| `bin/neurotrail.mjs` | CLI: `review`, `report`, `sessions`, `watch`. |
| `src/lib/trustSummary.js` | Shared reviewer trust-summary renderer. |
| `src/lib/wasteCore.js` | Shared per-step attention/waste classifier. |
| `src/replay/replayDocument.js` | Self-contained replay document builder. |
| `server/` | Live graph endpoints used by the dev viewer. |
| `src/App.tsx` | Live viewer shell. |

```bash
npm install
npm run dev      # live viewer
npm run build    # tsc -b && vite build
npm run lint
npm run test
```

## Limitations

- **Attention flags are heuristics, not verdicts.** They are confidence-banded
  and calibrated against a small fixture set; the replay is the evidence and the
  human reviewer decides. Cost and observed test results are the defensible
  numbers — lead with those.
- Cost is exact when the provider reports it in the transcript, otherwise an
  estimate from token counts.
- `--base` file scoping needs a git repo; outside one it falls back to files
  inferred from the session log.
- Generic transcript support is intentionally conservative and may miss custom
  agent formats until an adapter is added.

## Roadmap

- Publish to npm so `npx neurotrail` runs without a clone (the CLI is already pure-Node)
- Hosted replay links with shareable `#t=` deep-links
- Larger labeled eval set + confidence calibration; optional LLM audit
- Cross-run history ("this agent's flag rate over time")
- Deeper adapters for Windsurf, OpenHands, and more

## License

[MIT](LICENSE)
