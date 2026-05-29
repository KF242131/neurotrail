import { inferAgentRole } from "./agentRoles";
import {
  createTranslator,
  resolveLocale,
  roleLabel,
  type LocaleId,
  type Translator,
} from "./i18n";
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
  locale?: LocaleId | string;
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

function targetInstruction(targetAgent: NextAgentTarget, t: Translator) {
  switch (targetAgent) {
    case "claude":
      return t("handoff.targetClaude");
    case "cursor":
      return t("handoff.targetCursor");
    case "codex":
    default:
      return t("handoff.targetCodex");
  }
}

function renderSection(title: string, items: string[], t: Translator) {
  if (items.length === 0) return [`## ${title}`, `- ${t("common.noneCaptured")}`].join("\n");
  return [`## ${title}`, ...items.map((item) => `- ${item}`)].join("\n");
}

export function renderHandoffPrompt(
  packet: Omit<HandoffPacket, "promptForNextAgent">,
  targetAgent: NextAgentTarget,
  locale: LocaleId | string = "en"
) {
  const t = createTranslator(resolveLocale(locale));
  const sections = [
    `# ${t("handoff.title", { target: targetAgent })}`,
    packet.summary,
    "",
    renderSection(t("handoff.researchDone"), packet.researchDone, t),
    "",
    renderSection(t("handoff.codingDone"), packet.codingDone, t),
    "",
    renderSection(t("handoff.verification"), packet.verification, t),
    "",
    renderSection(t("handoff.reviewWaste"), [...packet.reviewNeeded, ...packet.deadTrails], t),
    "",
    renderSection(t("handoff.evidence"), packet.evidence, t),
    "",
    renderSection(t("handoff.recommendedFiles"), packet.nextRecommendedFiles, t),
    "",
    `## ${t("handoff.nextRole")}`,
    `- ${roleLabel(t, packet.nextRecommendedRole)}`,
    "",
    `## ${t("handoff.instruction")}`,
    `- ${targetInstruction(targetAgent, t)}`,
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
  const locale = resolveLocale(input.locale);
  const t = createTranslator(locale);

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
  const summary = t("handoff.summary", {
    agents:
      activeAgents.length > 0
        ? t("handoff.summaryAgents", { agents: activeAgents.join(", ") })
        : "",
    files:
      filesTouched.length > 0
        ? t("handoff.summaryFiles", { count: filesTouched.length })
        : "",
    role: roleLabel(t, nextRole),
  });

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
    promptForNextAgent: renderHandoffPrompt(packetWithoutPrompt, targetAgent, locale),
  };
}
