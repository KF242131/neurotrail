# NeuroTrail — launch & attraction playbook

The goal of every asset below is one feeling in 5 seconds: *"I want to point this
at my own agent."* We earn that with a contrarian idea + a visual you can't get
anywhere else (three AIs on one PR) + a number you can trust.

## The hook (use everywhere, verbatim)

> **You review the diff your AI wrote. You never review _how_ it got there.**
> NeuroTrail replays what Claude, Codex, Gemini, Cursor… actually did — the files
> they thrashed, the tests they ran, what each step cost — as one local, shareable
> trust report you attach to a PR.

One-liner: **"Flight recorder + trust report for AI coding agents. Local-first, cross-agent, `npx`."**

## Why people will care (the three levers)

1. **Novelty they can see** — the hero GIF shows *three different AIs* collaborating on one PR, color-coded. No other tool shows cross-agent behavior. Lead with the picture.
2. **A number with a spine** — cost + real test pass/fail are facts; "attention flags" are confidence-banded and link to the exact moment in the replay. Honest > hypey, and HN rewards honesty.
3. **Painless to try** — `npx neurotrail review`. No signup, no cloud, nothing leaves their machine. Say this loudly (privacy is a real objection for proprietary code).

## Assets checklist (before posting)

- [x] README hero GIF (3 agents, cinematic) — regenerate anytime with `npm run demo:capture`
- [ ] **A 45–60s narrative screencast** (the money shot — see shot list below)
- [ ] Push repo public; pin a "what is this" issue; enable Discussions
- [ ] `0.1.0-alpha.1` with the real repository URL baked in (npm page link)
- [ ] A real example trust-summary PR comment on the repo itself (dogfood — open a PR, run `neurotrail review --comment`, screenshot it)

## The screencast shot list (45–60s, no narration needed, captions only)

1. **0–8s** — A GitHub PR titled "add rate limiter", authored by an agent. Caption: *"An AI wrote this PR. Do you trust it?"*
2. **8–18s** — Terminal: `npx neurotrail review --comment`. Caption: *"One command, reads the local agent logs."*
3. **18–30s** — The trust summary posts as a PR comment: files, **tests ran and passed**, cost, attention flags. Caption: *"Facts first. Heuristic flags, evidence-linked."*
4. **30–45s** — Click a flag's "jump to 1:14" → the replay opens and seeks to that moment; the neural graph is mid-animation. Caption: *"See exactly where it thrashed."*
5. **45–55s** — Cut to the cinematic graph with Claude + Codex + Gemini lit up. Caption: *"Works across every agent you use. Local-first."*
6. End card: `npx neurotrail review` · github.com/KF242131/neurotrail

Record the replay parts with the in-app **Record** button (`.webm`) or screen capture; stitch with the hero GIF.

## Paste-ready copy

### Show HN
**Title:** `Show HN: NeuroTrail – Replay what your AI coding agent actually did (local-first)`

**First comment:**
> I kept merging PRs my coding agents wrote without really knowing *how* they got there — what they explored and abandoned, whether they actually ran the tests, how much the run cost. The diff doesn't tell you that; the process does.
>
> NeuroTrail reads the session logs your agents already write locally (Claude Code, Codex, Gemini, Cursor, Cline, Roo) and turns a run into two things: a **trust summary** (files changed, commands run, real test pass/fail, cost — then confidence-banded "attention flags" like re-reading a file 6× or editing-then-reverting, each deep-linked to the moment in a replay) and a **self-contained HTML replay** that animates the run as a neural graph. You attach it to a PR.
>
> It's local-first (nothing leaves your machine) and cross-agent (one tool, all of them). Try it: `npx neurotrail review` in any repo where you've run an agent.
>
> Honest limitations: the attention flags are heuristics calibrated on a small fixture set (the eval is in the repo, ~91% F1) — they're hints for a human, not verdicts. Cost and test results are the defensible numbers and I lead with those. Feedback very welcome.

### X / Bluesky thread
1. You review the diff your AI wrote. You never review *how* it got there.
   NeuroTrail replays what your coding agent actually did — and whether to trust it. Local-first, cross-agent. 🧵 [hero GIF]
2. Point it at any repo where you ran Claude Code / Codex / Gemini / Cursor:
   `npx neurotrail review`
   → a trust summary (files, commands, real test pass/fail, $ cost) + a shareable replay you attach to the PR.
3. The replay is a neural graph of the run. Click any "attention flag" — re-read the same file 6×, edited-then-reverted, a dead-end branch — and it jumps to that exact moment. Evidence, not vibes.
4. Nothing leaves your machine. It reads logs your agents already write to disk. MIT, alpha, feedback wanted: github.com/KF242131/neurotrail

### Reddit
- **r/ChatGPTCoding, r/ClaudeAI, r/LocalLLaMA**: lead with the GIF + "I built a local-first replay/trust tool for agent-written code — `npx neurotrail review`. Cross-agent, nothing leaves your machine." Then the honest-limitations paragraph.
- Title: *"I made a local tool that replays what your AI coding agent actually did (Claude/Codex/Gemini), so you can review the process, not just the diff"*

## Sequencing

1. Push public + dogfood a real PR comment + record the screencast.
2. Ship `alpha.1` (real repo URL on npm).
3. Post **Show HN Tue–Thu, ~8–10am ET**; cross-post X same morning; Reddit a day later.
4. Reply to every comment for the first 4 hours (HN ranking rewards engagement).

## Discipline (don't undermine trust)

- Never claim tests passed without evidence; never show a scary single % the engine can't back. The whole brand is "trustworthy."
- The waste/flag numbers are heuristics — always framed as "for human review." This honesty is a feature, not a hedge.
