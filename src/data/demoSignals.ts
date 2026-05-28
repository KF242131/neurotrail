import type { NeuroSignal, SignalAction } from "../types";

export const TOTAL_DURATION = 33.5;

const branchNames = ["routes", "state", "ui", "adapters", "signals"] as const;

function layer(level: number) {
  return level.toString().padStart(2, "0");
}

function deepTargetForLevel(level: number) {
  const id = layer(level);
  if (level % 3 === 0) {
    const branchName = branchNames[(level - 1) % branchNames.length];
    return `file:demo-depth/layer-${id}/${branchName}-${id}/probe-${id}.ts`;
  }
  if (level % 5 === 0) {
    return `file:demo-depth/layer-${id}/notes-${id}.md`;
  }
  return `file:demo-depth/layer-${id}/empty-${id}.ts`;
}

const deepScanSignals: NeuroSignal[] = Array.from({ length: 30 }, (_, i) => {
  const level = i + 1;
  const id = layer(level);
  const action: SignalAction =
    level % 6 === 0 ? "search" : level % 9 === 0 ? "open_symbol" : "read_file";

  return {
    id: `deep-${id}`,
    time: 3.2 + i * 0.86,
    action,
    source: level === 1 ? "dir:demo-depth" : deepTargetForLevel(level - 1),
    target: deepTargetForLevel(level),
    intensity: Math.min(1, 0.68 + level * 0.008),
    reason: `Reading demo-depth layer ${id}; the active nerve path should light the local branch center before moving deeper.`,
  };
});

export const demoSignals: NeuroSignal[] = [
  {
    id: "s0",
    time: 0,
    action: "think",
    target: "agent:orchestrator",
    intensity: 1.0,
    reason:
      "Permission is granted, so the monitoring conductor starts the local demo-depth scan.",
  },
  {
    id: "s1",
    time: 0.8,
    action: "read_file",
    source: "agent:orchestrator",
    target: "file:src/App.tsx",
    intensity: 0.78,
    reason:
      "The monitor reads App.tsx to anchor the live NeuroTrail self-demo.",
  },
  {
    id: "s2",
    time: 1.7,
    action: "search",
    source: "file:src/App.tsx",
    target: "file:src/data/demoGraph.ts",
    intensity: 0.82,
    reason:
      "The graph source is inspected before expanding into the synthetic project depth.",
  },
  {
    id: "s3",
    time: 2.55,
    action: "open_symbol",
    source: "file:src/data/demoGraph.ts",
    target: "dir:demo-depth",
    intensity: 0.86,
    reason:
      "The scan enters demo-depth, where each layer acts as a local neural branch point.",
  },
  ...deepScanSignals,
  {
    id: "s4",
    time: 29.4,
    action: "decision",
    source: deepTargetForLevel(30),
    target: "decision:orchestration-core",
    intensity: 0.94,
    confidence: 0.88,
    reason:
      "The monitor confirms that the deep project island can be traversed from the root branch to the lowest layer.",
    evidence: [
      "agent:orchestrator",
      "dir:project-root",
      "dir:demo-depth",
      "dir:demo-depth/layer-01",
      "dir:demo-depth/layer-10",
      "dir:demo-depth/layer-20",
      "dir:demo-depth/layer-30",
      deepTargetForLevel(30),
      "decision:orchestration-core",
    ],
  },
  {
    id: "s5",
    time: 31.4,
    action: "final_answer",
    source: "decision:orchestration-core",
    target: "decision:orchestration-core",
    intensity: 1.0,
    reason:
      "The demo-depth scan finishes with a short-lived light trail across the traversed neural branches.",
    evidence: [
      "agent:orchestrator",
      "dir:project-root",
      "dir:demo-depth",
      "dir:demo-depth/layer-01",
      "file:demo-depth/layer-01/empty-01.ts",
      "dir:demo-depth/layer-15",
      deepTargetForLevel(15),
      "dir:demo-depth/layer-30",
      deepTargetForLevel(30),
      "decision:orchestration-core",
    ],
  },
];
