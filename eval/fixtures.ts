import type {
  NeuroEdgeData,
  NeuroSignal,
  NeuroSignalCategory,
  PositionedNeuroNode,
  SignalAction,
} from "../src/types";

/**
 * Hand-labeled ground truth for the waste classifier. Each fixture is a small,
 * realistic micro-session; `labels` is the human verdict per signal id. Signals
 * absent from `labels` are ignored when scoring (e.g. pure "think" steps).
 *
 * Labels reflect what a human reviewer thinks, NOT what the classifier outputs —
 * the point is to expose the gap. Known misclassifications are kept on purpose
 * so the measured precision/recall honestly show remaining headroom.
 */
export type WasteLabel = "wasted" | "useful";

export type WasteFixture = {
  name: string;
  signals: NeuroSignal[];
  nodes: PositionedNeuroNode[];
  edges: NeuroEdgeData[];
  labels: Record<string, WasteLabel>;
};

function fileNode(path: string): PositionedNeuroNode {
  return {
    id: `file:${path}`,
    label: path.split("/").pop() ?? path,
    type: "file",
    path,
    activation: 0,
    visitCount: 0,
    position: { x: 0, y: 0 },
  };
}

function cmdNode(name: string): PositionedNeuroNode {
  return {
    id: `cmd:${name}`,
    label: name,
    type: "command",
    activation: 0,
    visitCount: 0,
    position: { x: 0, y: 0 },
  };
}

type SigInit = {
  id: string;
  time: number;
  action: SignalAction;
  target: string;
  agentId: string;
  category?: NeuroSignalCategory;
  evidence?: string[];
};

function sig(init: SigInit): NeuroSignal {
  return { intensity: 0.5, reason: init.action, ...init };
}

// Fixture A — context reads, read->edit causality, TDD loop, verification.
const readEditTdd: WasteFixture = {
  name: "read-edit-tdd",
  nodes: [
    fileNode("src/auth.ts"),
    fileNode("src/legacy.ts"),
    fileNode("docs/architecture.md"),
    fileNode("src/notes.md"),
    cmdNode("test"),
  ],
  edges: [],
  signals: [
    sig({ id: "s1", time: 0, action: "read_file", target: "file:src/auth.ts", agentId: "a1" }),
    sig({ id: "s10", time: 1, action: "read_file", target: "file:docs/architecture.md", agentId: "a1" }),
    sig({ id: "s2", time: 2, action: "read_file", target: "file:src/legacy.ts", agentId: "a1" }),
    sig({ id: "s3", time: 4, action: "edit_file", target: "file:src/auth.ts", agentId: "a1" }),
    sig({ id: "s4", time: 6, action: "run_command", target: "cmd:test", agentId: "a1" }),
    sig({ id: "s5", time: 8, action: "test_failed", target: "cmd:test", agentId: "a1" }),
    sig({ id: "s6", time: 10, action: "edit_file", target: "file:src/auth.ts", agentId: "a1" }),
    sig({ id: "s7", time: 12, action: "test_passed", target: "cmd:test", agentId: "a1" }),
    sig({ id: "s8", time: 14, action: "read_file", target: "file:src/auth.ts", agentId: "a1" }),
    sig({ id: "s9", time: 200, action: "read_file", target: "file:src/notes.md", agentId: "a1" }),
  ],
  labels: {
    s1: "useful", // read that informs the later auth.ts edit
    s10: "useful", // context read; classifier currently over-flags this (a known FP)
    s2: "wasted", // dead trail: read, never used
    s3: "useful",
    s4: "useful",
    s5: "useful", // failure is productive — a pass follows in the same episode
    s6: "useful",
    s7: "useful",
    s8: "useful", // verification re-read shortly after the edit
    s9: "wasted", // dead trail in a later episode
  },
};

// Fixture B — observe_output downstream rescue, redundant retry, thrash.
const observeRetryThrash: WasteFixture = {
  name: "observe-retry-thrash",
  nodes: [cmdNode("term"), cmdNode("build"), cmdNode("lint"), fileNode("src/x.ts"), fileNode("src/y.ts")],
  edges: [],
  signals: [
    sig({ id: "e1", time: 0, action: "observe_output", target: "cmd:term", agentId: "a2", category: "waste" }),
    sig({ id: "e2", time: 50, action: "observe_output", target: "cmd:build", agentId: "a2", category: "waste" }),
    sig({ id: "e3", time: 52, action: "edit_file", target: "file:src/x.ts", agentId: "a2" }),
    sig({ id: "e4", time: 54, action: "run_command", target: "cmd:lint", agentId: "a2" }),
    sig({ id: "e5", time: 56, action: "run_command", target: "cmd:lint", agentId: "a2" }),
    sig({ id: "e6", time: 100, action: "read_file", target: "file:src/y.ts", agentId: "a2" }),
    sig({ id: "e7", time: 101, action: "read_file", target: "file:src/y.ts", agentId: "a2" }),
    sig({ id: "e8", time: 102, action: "read_file", target: "file:src/y.ts", agentId: "a2" }),
  ],
  labels: {
    e1: "wasted", // inspected output that fed nothing downstream
    e2: "useful", // inspected build output, then fixed x.ts
    e3: "useful",
    e4: "useful",
    e5: "wasted", // re-ran lint with no change in between
    e6: "wasted", // reading an irrelevant file repeatedly...
    e7: "wasted", // ...the middle read is a known FN (classifier calls it fine)
    e8: "wasted", // thrash: third read in the window
  },
};

// Fixture C — churn (repeated edits without an intervening pass/decision).
const churn: WasteFixture = {
  name: "churn",
  nodes: [fileNode("src/z.ts")],
  edges: [],
  signals: [
    sig({ id: "c1", time: 0, action: "edit_file", target: "file:src/z.ts", agentId: "a3" }),
    sig({ id: "c2", time: 1, action: "edit_file", target: "file:src/z.ts", agentId: "a3" }),
    sig({ id: "c3", time: 2, action: "edit_file", target: "file:src/z.ts", agentId: "a3" }),
    sig({ id: "c4", time: 3, action: "edit_file", target: "file:src/z.ts", agentId: "a3" }),
    sig({ id: "c5", time: 4, action: "edit_file", target: "file:src/z.ts", agentId: "a3" }),
  ],
  labels: {
    c1: "useful",
    c2: "useful",
    c3: "useful",
    c4: "wasted", // 4th+ edit with no pass/decision between = churn
    c5: "wasted",
  },
};

// Fixture D — a clean, healthy feature session. Nothing is wasted; the classifier
// must NOT cry wolf on tidy work (the "good PR" case a trust tool has to get right).
const cleanFeature: WasteFixture = {
  name: "clean-feature",
  nodes: [fileNode("src/feature.ts"), fileNode("src/feature.test.ts"), cmdNode("test")],
  edges: [],
  signals: [
    sig({ id: "d1", time: 0, action: "read_file", target: "file:src/feature.ts", agentId: "d" }),
    sig({ id: "d2", time: 1, action: "read_file", target: "file:src/feature.test.ts", agentId: "d" }),
    sig({ id: "d3", time: 3, action: "edit_file", target: "file:src/feature.ts", agentId: "d" }),
    sig({ id: "d4", time: 5, action: "edit_file", target: "file:src/feature.test.ts", agentId: "d" }),
    sig({ id: "d5", time: 7, action: "run_command", target: "cmd:test", agentId: "d" }),
    sig({ id: "d6", time: 9, action: "test_passed", target: "cmd:test", agentId: "d" }),
  ],
  labels: { d1: "useful", d2: "useful", d3: "useful", d4: "useful", d5: "useful", d6: "useful" },
};

// Fixture E — retry discipline. Re-running after an edit is useful; re-running with
// nothing changed in between is a redundant retry.
const retryDiscipline: WasteFixture = {
  name: "retry-discipline",
  nodes: [cmdNode("build"), fileNode("src/a.ts")],
  edges: [],
  signals: [
    sig({ id: "e1b", time: 0, action: "run_command", target: "cmd:build", agentId: "e2" }),
    sig({ id: "e2b", time: 2, action: "edit_file", target: "file:src/a.ts", agentId: "e2" }),
    sig({ id: "e3b", time: 4, action: "run_command", target: "cmd:build", agentId: "e2" }),
    sig({ id: "e4b", time: 6, action: "run_command", target: "cmd:build", agentId: "e2" }),
  ],
  labels: { e1b: "useful", e2b: "useful", e3b: "useful", e4b: "wasted" },
};

// Fixture F — a test left red. A failing run with no passing run after it in the
// same episode is an unresolved failure worth a reviewer's attention.
const leftRed: WasteFixture = {
  name: "left-red",
  nodes: [fileNode("src/b.ts"), cmdNode("test")],
  edges: [],
  signals: [
    sig({ id: "f1", time: 0, action: "edit_file", target: "file:src/b.ts", agentId: "f" }),
    sig({ id: "f2", time: 2, action: "run_command", target: "cmd:test", agentId: "f" }),
    sig({ id: "f3", time: 4, action: "test_failed", target: "cmd:test", agentId: "f" }),
  ],
  labels: { f1: "useful", f2: "useful", f3: "wasted" },
};

// Fixture G — an errored/idle output inspection with no follow-up is waste; the same
// inspection that immediately drives a fix is rescued (the feedback loop is the point).
const erroredOutputRescue: WasteFixture = {
  name: "errored-output-rescue",
  nodes: [cmdNode("term"), fileNode("src/c.ts")],
  edges: [],
  signals: [
    sig({ id: "g1", time: 0, action: "observe_output", target: "cmd:term", agentId: "g", category: "waste" }),
    sig({ id: "g2", time: 50, action: "observe_output", target: "cmd:term", agentId: "g", category: "waste" }),
    sig({ id: "g3", time: 52, action: "edit_file", target: "file:src/c.ts", agentId: "g" }),
  ],
  labels: { g1: "wasted", g2: "useful", g3: "useful" },
};

// Fixture H — a legit cross-file refactor: the agent reads two files it then edits,
// bouncing between them. The loop heuristic must NOT flag necessary-context reads.
const refactorBounce: WasteFixture = {
  name: "refactor-bounce",
  nodes: [fileNode("src/m.ts"), fileNode("src/n.ts")],
  edges: [],
  signals: [
    sig({ id: "h1", time: 0, action: "read_file", target: "file:src/m.ts", agentId: "h" }),
    sig({ id: "h2", time: 1, action: "read_file", target: "file:src/n.ts", agentId: "h" }),
    sig({ id: "h3", time: 2, action: "read_file", target: "file:src/m.ts", agentId: "h" }),
    sig({ id: "h4", time: 3, action: "read_file", target: "file:src/n.ts", agentId: "h" }),
    sig({ id: "h5", time: 4, action: "read_file", target: "file:src/m.ts", agentId: "h" }),
    sig({ id: "h6", time: 5, action: "read_file", target: "file:src/n.ts", agentId: "h" }),
    sig({ id: "h7", time: 6, action: "edit_file", target: "file:src/m.ts", agentId: "h" }),
    sig({ id: "h8", time: 7, action: "edit_file", target: "file:src/n.ts", agentId: "h" }),
  ],
  labels: {
    h1: "useful", h2: "useful", h3: "useful", h4: "useful",
    h5: "useful", h6: "useful", h7: "useful", h8: "useful",
  },
};

// Fixture I — a genuine loop: bouncing between two files the agent never edits.
// This SHOULD be flagged; kept to guard that the loop fix above didn't disable
// real loop/thrash detection. (i3 is a known FN — the 2nd read before the window
// fills — kept honest.)
const trueLoop: WasteFixture = {
  name: "true-loop",
  nodes: [fileNode("src/p.ts"), fileNode("src/q.ts")],
  edges: [],
  signals: [
    sig({ id: "i1", time: 0, action: "read_file", target: "file:src/p.ts", agentId: "i" }),
    sig({ id: "i2", time: 1, action: "read_file", target: "file:src/q.ts", agentId: "i" }),
    sig({ id: "i3", time: 2, action: "read_file", target: "file:src/p.ts", agentId: "i" }),
    sig({ id: "i4", time: 3, action: "read_file", target: "file:src/q.ts", agentId: "i" }),
    sig({ id: "i5", time: 4, action: "read_file", target: "file:src/p.ts", agentId: "i" }),
    sig({ id: "i6", time: 5, action: "read_file", target: "file:src/q.ts", agentId: "i" }),
  ],
  labels: {
    i1: "wasted", i2: "wasted", i3: "wasted",
    i4: "wasted", i5: "wasted", i6: "wasted",
  },
};

export const fixtures: WasteFixture[] = [
  readEditTdd,
  observeRetryThrash,
  churn,
  cleanFeature,
  retryDiscipline,
  leftRed,
  erroredOutputRescue,
  refactorBounce,
  trueLoop,
];
