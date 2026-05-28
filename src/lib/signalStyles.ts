import type {
  NeuroEdgeType,
  NeuroNodeStatus,
  NeuroNodeType,
  SignalAction,
} from "../types";

// Quiet memory palette: ink, ivory, graphite, blue-gray evidence, soft red.
// Never neon. Differences are felt, not announced.
export const COLORS = {
  bone: "#ECE6D7",
  warm: "#F4EFE4",
  evidence: "#8E9AA0",
  clay: "#B9786D",
  mist: "#8A867E",
  dim: "#625F58",
  idle: "#34322E",
} as const;

export function actionColor(action: SignalAction): string {
  switch (action) {
    case "read_file":
    case "open_symbol":
      return COLORS.evidence;
    case "search":
    case "think":
      return COLORS.mist;
    case "edit_file":
    case "write_text":
      return COLORS.warm;
    case "run_command":
    case "observe_output":
      return COLORS.bone;
    case "test_failed":
      return COLORS.clay;
    case "test_passed":
      return COLORS.bone;
    case "decision":
    case "final_answer":
      return COLORS.warm;
  }
}

export function statusColor(status?: NeuroNodeStatus): string {
  switch (status) {
    case "error":
      return COLORS.clay;
    case "edited":
      return COLORS.warm;
    case "passed":
      return COLORS.bone;
    case "decision":
      return COLORS.warm;
    case "active":
      return COLORS.evidence;
    default:
      return COLORS.dim;
  }
}

// Type colors are all in the same muted family — type differentiation
// happens through size/icon, not loud color.
export function nodeBaseColor(type: NeuroNodeType): string {
  switch (type) {
    case "agent":
      return COLORS.bone;
    case "decision":
      return COLORS.warm;
    case "test":
      return COLORS.dim;
    case "directory":
    case "file":
    case "function":
    case "config":
    case "command":
    case "artifact":
      return COLORS.dim;
  }
}

export function edgeBaseColor(type: NeuroEdgeType): string {
  switch (type) {
    case "edits":
      return COLORS.warm;
    case "decides":
      return COLORS.warm;
    case "tests":
      return COLORS.evidence;
    case "imports":
    case "calls":
    case "reads":
    case "runs":
      return COLORS.bone;
  }
}

export const ACTION_LABEL: Record<SignalAction, string> = {
  think: "thinking",
  search: "searching",
  read_file: "reading",
  open_symbol: "opening",
  edit_file: "editing",
  write_text: "writing",
  run_command: "running",
  observe_output: "observing",
  test_failed: "test failed",
  test_passed: "test passed",
  decision: "deciding",
  final_answer: "answered",
};

export const LEGEND_ITEMS: Array<{ action: SignalAction; label: string }> = [
  { action: "read_file", label: "signal" },
  { action: "decision", label: "decision" },
  { action: "test_failed", label: "error" },
];
