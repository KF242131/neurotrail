// Reviewer-facing "trust summary" renderer. Pure and dependency-free (mirrors
// the wasteCore.js pattern) so the Node CLI (bin/neurotrail.mjs), the Vite app,
// and the server export all produce identical output and never drift.
//
// NeuroTrail's thesis: people review an agent's OUTPUT (the diff) but never its
// PROCESS (the trajectory). This module reframes the per-signal waste verdicts
// from wasteCore.js as confidence-banded "attention flags" aimed at a human
// reviewing agent-written code — each flag deep-linked to its moment in the
// replay (#t=<seconds>) so the reviewer can see the evidence, not just trust a
// classifier. The defensible facts (files, commands, real test pass/fail, cost)
// lead; the heuristic flags follow with an explicit disclaimer.
//
// Types live in trustSummary.d.ts.

import { classifyWasteSignals, labelForNode } from "./wasteCore.js";

// Waste reasons recast into plain review language. Keep in sync with
// WASTE_LABELS in wasteCore.js (same keys, reviewer-facing phrasing).
export const REVIEW_HINT_LABELS = {
  dead_trail: "Read a file that did not inform any later edit",
  thrash: "Re-read the same file several times in quick succession",
  tool_error: "A command or tool returned an error",
  failed_iteration: "A test failed with no passing run afterward",
  explicit_waste: "Step the session itself flagged as off-track",
  churn: "Edited one file many times with no passing checkpoint",
  loop: "Bounced between the same files repeatedly",
  redundant_retry: "Re-ran a command without changing anything in between",
};

const DISCLAIMER =
  "Attention flags are heuristic signals for human review, not defects. " +
  "Confidence is calibrated against a small fixture set — open the replay to verify each one.";

function basename(value) {
  return String(value).split("/").filter(Boolean).at(-1) ?? String(value);
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" + r : r}`;
}

function fmtCost(value) {
  if (!value || value <= 0) return "$0";
  if (value < 0.01) return "<$0.01";
  if (value < 100) return "$" + value.toFixed(2);
  return "$" + Math.round(value);
}

function fmtTokens(value) {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1000) return (value / 1000).toFixed(1) + "k";
  return String(Math.round(value || 0));
}

/**
 * Derive an observed test outcome for the whole run. "failed" wins over
 * "passed" (any unresolved failure is worth a reviewer's attention); "unknown"
 * means no test/build command produced an observed result — we never claim a
 * run was green without evidence.
 */
function testOutcome(signals) {
  let failed = false;
  let passed = false;
  for (const signal of signals) {
    if (signal.action === "test_failed") failed = true;
    else if (signal.action === "test_passed") passed = true;
  }
  if (failed) return "failed";
  if (passed) return "passed";
  return "unknown";
}

/**
 * Build the reviewer trust summary from a run's signals/nodes/edges and the
 * already-computed run summary. Returns both a markdown blob (for the .md
 * artifact / PR comment) and structured facts+flags (for the HTML replay panel,
 * which renders the flags as clickable #t= deep-links).
 */
export function renderTrustSummary({
  summary,
  signals = [],
  nodes = [],
  edges = [],
  agentLabel = "The agent",
  filesFromGit,
  maxFlags = 12,
} = {}) {
  const real = signals.filter((s) => !String(s.id).endsWith("-live-summary"));
  const verdicts = classifyWasteSignals(real, nodes, edges);
  const timeById = new Map(real.map((s) => [s.id, s.time]));
  const targetById = new Map(real.map((s) => [s.id, s.target]));

  const rawFlags = verdicts
    .filter((v) => v.wasted && v.reason)
    // Only surface flags tied to a concrete file/command. Steps that resolve to
    // an agent node (assistant prose with no file target) are not actionable
    // evidence for a reviewer and would read as misleading "edited a file" noise.
    .filter((v) => !String(targetById.get(v.signalId) ?? "").startsWith("agent:"))
    .map((v) => ({
      reason: v.reason,
      confidence: v.confidence,
      timeSec: timeById.get(v.signalId) ?? 0,
      target: labelForNode(nodes, targetById.get(v.signalId) ?? ""),
    }));

  // Group repeated (reason, target) occurrences into one flag with a count and
  // the earliest timestamp (the deep-link target), so the summary reads as a
  // few distinct issues rather than dozens of near-identical lines.
  const grouped = new Map();
  for (const flag of rawFlags) {
    const key = `${flag.reason}|${flag.target}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.timeSec = Math.min(existing.timeSec, flag.timeSec);
      existing.confidence = Math.max(existing.confidence, flag.confidence);
    } else {
      grouped.set(key, {
        reason: flag.reason,
        label: REVIEW_HINT_LABELS[flag.reason] || flag.reason,
        confidence: flag.confidence,
        timeSec: flag.timeSec,
        target: flag.target,
        count: 1,
      });
    }
  }
  const allFlags = [...grouped.values()].sort(
    (a, b) => b.confidence - a.confidence || b.count - a.count || a.timeSec - b.timeSec
  );

  const flagCount = allFlags.length;
  const truncated = Math.max(0, flagCount - maxFlags);
  const flags = truncated > 0 ? allFlags.slice(0, maxFlags) : allFlags;

  const gitFiles =
    Array.isArray(filesFromGit) && filesFromGit.length ? filesFromGit : null;
  const filesCount = gitFiles ? gitFiles.length : summary?.filesTouched ?? 0;
  const commandsRun = real.filter(
    (s) =>
      s.action === "run_command" ||
      s.action === "test_passed" ||
      s.action === "test_failed"
  ).length;
  const tests = testOutcome(real);
  const testsLabel =
    tests === "passed"
      ? "ran and passed"
      : tests === "failed"
        ? "ran and FAILED"
        : "not observed";
  const durationSec = real.reduce((m, s) => Math.max(m, s.time || 0), 0);
  const cost = summary?.estimatedCostUsd ?? 0;
  const tokens = summary?.totalTokens ?? 0;
  const steps = summary?.steps ?? real.length;

  const filesValue = gitFiles
    ? `${filesCount}${
        gitFiles.length
          ? " — " +
            gitFiles.slice(0, 6).map(basename).join(", ") +
            (gitFiles.length > 6 ? ` +${gitFiles.length - 6} more` : "")
          : ""
      }`
    : String(filesCount);

  const facts = [
    { label: "Files changed", value: filesValue },
    { label: "Commands run", value: String(commandsRun) },
    { label: "Tests", value: testsLabel },
    { label: "Est. cost", value: `${fmtCost(cost)} · ${fmtTokens(tokens)} tokens` },
    { label: "Steps", value: String(steps) },
    { label: "Duration", value: fmtClock(durationSec) },
  ];

  const headline = `${agentLabel} wrote this change`;

  const lines = [];
  lines.push(`# NeuroTrail trust summary — ${headline}`);
  lines.push("");
  lines.push(
    "> Reviewing the **process**, not just the diff — reconstructed from local agent logs."
  );
  lines.push("");
  lines.push("## What the agent did");
  for (const fact of facts) lines.push(`- **${fact.label}:** ${fact.value}`);
  lines.push("");
  lines.push("## Attention flags (heuristic — for human review)");
  if (flags.length === 0) {
    lines.push("- None — no notable detours detected.");
  } else {
    for (const flag of flags) {
      const when =
        flag.count > 1
          ? `${flag.count}× · first at ${fmtClock(flag.timeSec)}`
          : `at ${fmtClock(flag.timeSec)}`;
      lines.push(
        `- ${flag.label} · ${Math.round(flag.confidence * 100)}% · \`${flag.target}\` · ${when} in the replay`
      );
    }
    if (truncated > 0) {
      lines.push(`- …and ${truncated} more pattern(s) (open the replay).`);
    }
  }
  lines.push("");
  lines.push(`_${DISCLAIMER}_`);
  lines.push("");
  const markdown = lines.join("\n");

  return {
    headline,
    facts,
    flags,
    flagCount,
    truncated,
    tests,
    durationSec,
    disclaimer: DISCLAIMER,
    markdown,
  };
}
