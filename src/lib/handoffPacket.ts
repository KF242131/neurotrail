import { ROLE_LABELS, inferAgentRole } from "./agentRoles";
import type {
  AgentRole,
  AgentTelemetry,
  NeuroEdgeData,
  NeuroSignal,
  PositionedNeuroNode,
} from "../types";

export type NextAgentTarget = "claude" | "codex" | "cursor";

export type HandoffPacket = {
  summary: string;
  researchDone: string[];
  codingDone: string[];
  verification: string[];
  reviewNeeded: string[];
  evidence: string[];
  filesTouched: string[];
  deadTrails: string[];
  nextRecommendedFiles: string[];
  nextRecommendedRole: AgentRole;
  promptForNextAgent: string;
};

type HandoffInput = {
  nodes: PositionedNeuroNode[];
  edges: NeuroEdgeData[];
  signals: NeuroSignal[];
  agents?: AgentTelemetry[];
  selectedAgentId?: string;
  selectedRole?: AgentRole;
  targetAgent?: NextAgentTarget;
};

function signalRole(signal: NeuroSignal) {
  return signal.role ?? inferAgentRole(signal);
}

function cleanText(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").replace(/\.$/, "").trim();
}

function nodeLabel(nodes: PositionedNeuroNode[], id: string) {
  const node = nodes.find((item) => item.id === id);
  return node?.label ?? id.replace(/^(file|dir|cmd|decision):/, "");
}

function pathForNode(nodes: PositionedNeuroNode[], id: string) {
  const node = nodes.find((item) => item.id === id);
  if (node?.path && node.path !== ".") return node.path;
  if (id.startsWith("file:")) return id.slice(5);
  return undefined;
}

function unique(items: Array<string | undefined>, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const clean = cleanText(item);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
    if (result.length >= limit) break;
  }
  return result;
}

function latestByRole(signals: NeuroSignal[], role: AgentRole) {
  return [...signals].reverse().find((signal) => signalRole(signal) === role);
}

function nextRecommendedRole(signals: NeuroSignal[]): AgentRole {
  const latestVerification = latestByRole(signals, "verification");
  if (latestVerification?.action === "test_failed") return "coding";

  const latestCoding = latestByRole(signals, "coding");
  if (
    latestCoding &&
    (!latestVerification || latestVerification.time < latestCoding.time)
  ) {
    return "verification";
  }

  if (latestVerification?.action === "test_passed") {
    const latestReview = latestByRole(signals, "review");
    if (!latestReview || latestReview.time < latestVerification.time) {
      return "review";
    }
  }

  const roles = new Set(signals.map(signalRole));
  if (
    roles.has("research") &&
    !roles.has("coding") &&
    !roles.has("verification") &&
    !roles.has("review")
  ) {
    return "coding";
  }
  return "research";
}

function linesForRole(
  signals: NeuroSignal[],
  role: AgentRole,
  nodes: PositionedNeuroNode[],
  limit = 5
) {
  return unique(
    [...signals]
      .reverse()
      .filter((signal) => signalRole(signal) === role)
      .map((signal) => {
        const target = nodeLabel(nodes, signal.target);
        const text = cleanText(signal.topic ?? signal.reason);
        return target && text ? `${text} (${target})` : text || target;
      }),
    limit
  );
}

function targetInstruction(targetAgent: NextAgentTarget) {
  switch (targetAgent) {
    case "claude":
      return "Use this as Claude context. Preserve the reasoning trail, then continue with the recommended next role.";
    case "cursor":
      return "Use this as Cursor working context. Open the recommended files first, then continue with the recommended next role.";
    case "codex":
    default:
      return "Use this as Codex working context. Inspect only the recommended context first, then continue with the recommended next role.";
  }
}

function renderSection(title: string, items: string[]) {
  if (items.length === 0) return [`## ${title}`, "- None captured yet."].join("\n");
  return [`## ${title}`, ...items.map((item) => `- ${item}`)].join("\n");
}

export function renderHandoffPrompt(
  packet: Omit<HandoffPacket, "promptForNextAgent">,
  targetAgent: NextAgentTarget
) {
  const sections = [
    `# NeuroTrail Handoff for ${targetAgent}`,
    packet.summary,
    "",
    renderSection("Research done", packet.researchDone),
    "",
    renderSection("Coding done", packet.codingDone),
    "",
    renderSection("Verification", packet.verification),
    "",
    renderSection("Review / waste", [...packet.reviewNeeded, ...packet.deadTrails]),
    "",
    renderSection("Evidence", packet.evidence),
    "",
    renderSection("Recommended files", packet.nextRecommendedFiles),
    "",
    `## Next role`,
    `- ${ROLE_LABELS[packet.nextRecommendedRole]}`,
    "",
    `## Instruction`,
    `- ${targetInstruction(targetAgent)}`,
  ];
  return sections.join("\n");
}

export function generateHandoffPacket(input: HandoffInput): HandoffPacket {
  const scopedSignals = input.signals.filter((signal) => {
    if (input.selectedAgentId && signal.agentId !== input.selectedAgentId) return false;
    if (input.selectedRole && signalRole(signal) !== input.selectedRole) return false;
    return true;
  });
  const signals = scopedSignals.length > 0 ? scopedSignals : input.signals;
  const targetAgent = input.targetAgent ?? "codex";

  const filesTouched = unique(
    signals
      .filter((signal) => signal.action === "edit_file")
      .map((signal) => pathForNode(input.nodes, signal.target)),
    8
  );
  const inspectedFiles = unique(
    signals
      .filter((signal) => signal.action === "read_file" || signal.action === "open_symbol")
      .map((signal) => pathForNode(input.nodes, signal.target)),
    8
  );
  const evidence = unique(
    signals
      .filter(
        (signal) =>
          signal.category === "evidence" ||
          signal.category === "handoff" ||
          signal.action === "decision" ||
          signal.action === "final_answer"
      )
      .flatMap((signal) => [
        cleanText(signal.topic ?? signal.reason),
        ...(signal.evidence ?? []).map((id) => nodeLabel(input.nodes, id)),
      ]),
    8
  );
  const deadTrails = unique(
    signals
      .filter((signal) => signal.category === "waste")
      .map((signal) => cleanText(signal.topic ?? signal.reason)),
    6
  );
  const nextRecommendedFiles = unique(
    [
      ...filesTouched,
      ...inspectedFiles,
      ...input.edges
        .filter((edge) => edge.kind === "recommendation")
        .map((edge) => pathForNode(input.nodes, edge.target)),
    ],
    6
  );
  const nextRole = nextRecommendedRole(signals);
  const activeAgents = (input.agents ?? [])
    .filter((agent) => agent.status === "active")
    .map((agent) => agent.name);
  const summary = [
    "NeuroTrail captured a local-first working trail",
    activeAgents.length > 0 ? `from ${activeAgents.join(", ")}` : undefined,
    filesTouched.length > 0 ? `with ${filesTouched.length} edited file(s)` : undefined,
    `next role: ${ROLE_LABELS[nextRole]}.`,
  ]
    .filter(Boolean)
    .join(" ");

  const packetWithoutPrompt = {
    summary,
    researchDone: linesForRole(signals, "research", input.nodes),
    codingDone: linesForRole(signals, "coding", input.nodes),
    verification: linesForRole(signals, "verification", input.nodes),
    reviewNeeded: linesForRole(signals, "review", input.nodes),
    evidence,
    filesTouched,
    deadTrails,
    nextRecommendedFiles,
    nextRecommendedRole: nextRole,
  };

  return {
    ...packetWithoutPrompt,
    promptForNextAgent: renderHandoffPrompt(packetWithoutPrompt, targetAgent),
  };
}
