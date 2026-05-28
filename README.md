# NeuroTrail

> **Asciinema for AI coding agents.** Replay and share what your agent actually did as a living map of your codebase.

NeuroTrail turns local AI coding-session logs into an interactive replay. It
reads supported agent transcripts from your machine, normalizes the steps into a
timeline, and renders the run as a neural graph: agents, files, commands, edits,
and verification steps connected by animated signals.

It is built for the two questions engineers ask after an agent run:

- **What happened?** Scrub through the exact path the agent took across files,
  commands, edits, and decisions.
- **What should the next agent know?** Export a handoff packet with touched
  files, dead trails, verification notes, token usage, and a next-session prompt.

NeuroTrail is local-first. It does not start Codex, Claude, Cursor, or any other
agent, and it does not send session data to a remote service.

## Status

`v0.1.0-alpha.0` is a clone-first alpha. The live viewer and report exporter are
usable today, but the zero-install `npx neurotrail` workflow is still on the
roadmap.

## Quickstart

Requirements:

- Node.js 20+
- A local AI coding session for this workspace, or the built-in demo data

```bash
git clone <repo-url>
cd NeuroTrail
npm install
npm run dev
```

Open `http://localhost:5173` while an agent session is running in the same
workspace. NeuroTrail will detect recent supported sessions and merge them into
one live graph. Press `c` in the app for cinematic mode.

## Export a shareable replay

```bash
node bin/neurotrail.mjs sessions
node bin/neurotrail.mjs report --target codex --redact
```

The report command writes:

- `.neurotrail/reports/latest.html` - self-contained interactive replay
- `.neurotrail/handoff/latest.md` - copy-paste handoff for the next agent

Open the HTML file in any browser. No server is required. The replay includes a
video-style scrubber, run summary, token/cost estimate, waste estimate, handoff
packet, and a Record button for capturing the animation as `.webm`.

## CLI

From a clone, use `node bin/neurotrail.mjs ...`.

```bash
node bin/neurotrail.mjs sessions
node bin/neurotrail.mjs report
node bin/neurotrail.mjs report --target claude
node bin/neurotrail.mjs report --redact
node bin/neurotrail.mjs watch --port 5174 --no-open
```

If you want the `neurotrail` command locally while developing:

```bash
npm link
neurotrail sessions
```

Commands:

| Command | What it does |
| --- | --- |
| `sessions` | Lists recent supported local agent sessions for the current workspace. |
| `report` | Exports the latest replay HTML and handoff markdown. |
| `watch` | Starts the local Vite viewer for the current workspace. Requires dev dependencies. |

Options:

| Option | Applies to | Description |
| --- | --- | --- |
| `--target codex\|claude\|cursor` | `report` | Tailors the handoff instruction for the next agent. |
| `--redact` | `report` | Applies basic masking for secrets, emails, home paths, and long tokens. |
| `--port <number>` | `watch` | Runs the viewer on a custom port. |
| `--no-open` | `watch` | Prints the URL without opening a browser. |

## Supported Sources

NeuroTrail currently reads local transcript formats from:

| Agent/source | Notes |
| --- | --- |
| Codex | Reads session logs under `~/.codex/sessions`. |
| Claude Code | Reads project transcripts under `~/.claude/projects`. |
| Gemini | Reads recent local Gemini chat and artifact records where available. |
| Cursor | Reads recent Cursor agent transcripts for this workspace. |
| Cline | Reads recent Cline task transcripts from VS Code/Cursor storage or local `.cline`. |
| Roo Code | Reads recent Roo task transcripts from VS Code/Cursor storage or local `.roo`. |
| Generic JSONL | Reads workspace-local `.agent`, `.agents`, `.ai`, and `.neurotrail/sessions` records. |

Session discovery is workspace-aware where the source exposes enough metadata.
When metadata is missing, NeuroTrail looks for recent transcripts that reference
the current workspace path.

## What a Replay Shows

- Animated agent/file graph with signals for reads, edits, commands, tests, and
  written reasoning.
- Timeline scrubber with play, pause, seek, and speed controls.
- Run summary with steps, files touched, estimated token usage, estimated cost,
  and waste percentage.
- Handoff packet with recommended next files and a prompt for the next session.
- Dead trails: files inspected by the agent that were not later edited.

## Privacy and Redaction

NeuroTrail reads local files and writes local outputs only. Report export can
mask common sensitive values with `--redact`, including bearer tokens, GitHub and
Slack-style tokens, email addresses, home paths, and long secret-like strings.

Redaction is best-effort. Review exported HTML and markdown before publishing a
replay from a private repository or sensitive agent session.

## Local Development

```bash
npm install
npm run dev
npm run build
npm run lint
```

Useful paths:

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Main live viewer shell. |
| `src/components/` | Graph, timeline, controls, and panels. |
| `src/lib/` | Session normalization, cost model, redaction, and graph helpers. |
| `server/` | Live graph endpoints used by the Vite dev server. |
| `bin/neurotrail.mjs` | CLI entrypoint for `sessions`, `report`, and `watch`. |
| `src/replay/` | Self-contained replay document builder. |

## Limitations

- Cost estimates are approximate and depend on token usage fields available in
  the source transcript.
- `report` needs at least one supported session associated with the current
  workspace.
- `watch` currently expects a clone with installed dependencies.
- Generic transcript support is intentionally conservative and may miss custom
  agent formats until an adapter is added.

## Roadmap

- Published zero-install `npx neurotrail` workflow
- GIF export in addition to interactive HTML and `.webm` recording
- Stronger redaction policies and review presets
- Deeper adapters for Windsurf, OpenHands, and other coding agents
- Sample replay gallery
- Static-analysis project graph enrichment

## License

[MIT](LICENSE)
