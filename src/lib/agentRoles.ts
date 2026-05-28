import type {
  AgentRole,
  NeuroSignal,
  NeuroSignalCategory,
  SignalAction,
} from "../types";

export const AGENT_ROLES: AgentRole[] = [
  "orchestrator",
  "research",
  "coding",
  "writing",
  "verification",
  "review",
];

export const ROLE_LABELS: Record<AgentRole, string> = {
  orchestrator: "Orchestrate",
  research: "Research",
  coding: "Coding",
  writing: "Writing",
  verification: "Verify",
  review: "Review",
};

export const ROLE_SHORT_LABELS: Record<AgentRole, string> = {
  orchestrator: "orchestrate",
  research: "research",
  coding: "coding",
  writing: "writing",
  verification: "verify",
  review: "review",
};

export const ROLE_COLORS: Record<AgentRole, string> = {
  orchestrator: "#FFF8E8",
  research: "#A9BBC4",
  coding: "#9FEAFF",
  writing: "#F2D58D",
  verification: "#E0B764",
  review: "#CAB7FF",
};

export type RoleCounts = Partial<Record<AgentRole, number>>;

type RoleInferenceInput = {
  action?: SignalAction | string;
  reason?: string;
  topic?: string;
  label?: string;
  path?: string;
  target?: string;
  category?: NeuroSignalCategory | string;
  toolName?: string;
  command?: string;
};

const ROLE_PRIORITY: AgentRole[] = [
  "orchestrator",
  "verification",
  "coding",
  "writing",
  "review",
  "research",
];

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function inferenceText(input: RoleInferenceInput | NeuroSignal) {
  const item = input as RoleInferenceInput & NeuroSignal;
  const target =
    typeof item.target === "string" && !item.target.startsWith("decision:")
      ? item.target
      : undefined;
  return [
    item.action,
    item.reason,
    item.topic,
    item.label,
    item.path,
    target,
    item.category,
    item.toolName,
    item.command,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function inferAgentRole(input: RoleInferenceInput | NeuroSignal): AgentRole {
  const text = inferenceText(input);
  const action = `${input.action ?? ""}`;
  const candidates = new Set<AgentRole>();

  if (
    action === "decision" ||
    action === "final_answer" ||
    has(text, /\b(plan|handoff|orchestrate|orchestration|final answer|decision)\b/)
  ) {
    candidates.add("orchestrator");
  }
  if (
    action === "test_failed" ||
    action === "test_passed" ||
    action === "run_command" ||
    action === "observe_output" ||
    has(text, /\b(test|tests|lint|eslint|build|tsc|verify|verified|verification|terminal output|browser verification|command check)\b/)
  ) {
    candidates.add("verification");
  }
  if (
    action === "edit_file" ||
    has(text, /\b(edit|edits|edited|write|writes|written|patch|apply_patch|create_file|multiedit|updated|implementation change)\b/)
  ) {
    candidates.add("coding");
  }
  if (
    action === "write_text" ||
    has(text, /\b(readme|docs?|documentation|markdown|prompt|copy|handoff text)\b/) ||
    /\.(md|mdx|rst|txt)\b/.test(text)
  ) {
    candidates.add("writing");
  }
  if (
    input.category === "waste" ||
    has(text, /\b(diff|review|risk|waste|dead trail|low-value|low priority|context_roi|roi)\b/)
  ) {
    candidates.add("review");
  }
  if (
    action === "search" ||
    action === "read_file" ||
    action === "open_symbol" ||
    action === "think" ||
    has(text, /\b(search|grep|rg|glob|read|inspect|inspected|open_symbol|source read|code discovery|code reading)\b/)
  ) {
    candidates.add("research");
  }

  return ROLE_PRIORITY.find((role) => candidates.has(role)) ?? "research";
}

export function roleColor(role?: AgentRole) {
  return role ? ROLE_COLORS[role] : "#ECE6D7";
}

export function addRoleCount(counts: RoleCounts, role: AgentRole) {
  counts[role] = (counts[role] ?? 0) + 1;
  return counts;
}

export function topRoleEntries(counts: RoleCounts = {}, limit = 2) {
  return AGENT_ROLES
    .map((role) => [role, counts[role] ?? 0] as const)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || AGENT_ROLES.indexOf(a[0]) - AGENT_ROLES.indexOf(b[0]))
    .slice(0, limit);
}

export function sortRoles(roles: Iterable<AgentRole>) {
  const set = new Set(roles);
  return AGENT_ROLES.filter((role) => set.has(role));
}
