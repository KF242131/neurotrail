import type {
  AgentTelemetry,
  NeuroSignal,
  PositionedNeuroNode,
} from "../types";

// Rough public list prices in USD per 1M tokens. These are deliberately
// approximate — NeuroTrail shows an *estimate* so a run's relative cost and
// waste are legible, not an invoice. Adjust freely.
export type ModelPrice = {
  input: number;
  cachedInput: number;
  output: number;
};

const MODEL_PRICES: Array<{ match: RegExp; price: ModelPrice }> = [
  { match: /opus/i, price: { input: 15, cachedInput: 1.5, output: 75 } },
  { match: /sonnet/i, price: { input: 3, cachedInput: 0.3, output: 15 } },
  { match: /haiku/i, price: { input: 0.8, cachedInput: 0.08, output: 4 } },
  { match: /gpt-?5|o[34]|codex/i, price: { input: 1.25, cachedInput: 0.125, output: 10 } },
  { match: /gemini/i, price: { input: 1.25, cachedInput: 0.3125, output: 5 } },
];

const DEFAULT_PRICE: ModelPrice = { input: 3, cachedInput: 0.3, output: 15 };
const BLENDED_PER_TOKEN = 6 / 1_000_000; // fallback when only a token count is known

export function priceForModel(model: string | undefined): ModelPrice {
  if (!model) return DEFAULT_PRICE;
  for (const entry of MODEL_PRICES) {
    if (entry.match.test(model)) return entry.price;
  }
  return DEFAULT_PRICE;
}

export function estimateAgentCostUsd(agent: AgentTelemetry): number {
  const usage = agent.tokenUsage?.total;
  if (!usage || usage.totalTokens <= 0) {
    return Math.max(0, agent.tokensUsed) * BLENDED_PER_TOKEN;
  }
  const price = priceForModel(agent.model || agent.adapter);
  const cached = Math.max(0, usage.cachedInputTokens ?? 0);
  const freshInput = Math.max(0, (usage.inputTokens ?? 0) - cached);
  const output = Math.max(0, usage.outputTokens ?? 0) + Math.max(0, usage.reasoningOutputTokens ?? 0);
  return (
    (freshInput * price.input +
      cached * price.cachedInput +
      output * price.output) /
    1_000_000
  );
}

export type RunSummary = {
  totalTokens: number;
  estimatedCostUsd: number;
  steps: number;
  filesTouched: number;
  wastedSteps: number;
  wastePct: number;
  deadTrails: string[];
};

function isLiveSummarySignal(signal: NeuroSignal) {
  return signal.id.endsWith("-live-summary");
}

function labelForNode(nodes: PositionedNeuroNode[], id: string) {
  const node = nodes.find((item) => item.id === id);
  if (node?.path && node.path !== ".") return node.path;
  return node?.label ?? id.replace(/^(file|dir|cmd|decision|agent):/, "");
}

const READ_ACTIONS = new Set(["read_file", "open_symbol", "search"]);

/**
 * Aggregate a run into headline numbers + a waste estimate.
 *
 * "Waste" reuses the signal data already captured rather than inventing new
 * state: explicit `waste`-category steps, files read but never edited or used
 * as evidence (dead trails), and repeated re-reads of the same node (thrash).
 */
export function computeRunSummary(
  signals: NeuroSignal[],
  agents: AgentTelemetry[],
  nodes: PositionedNeuroNode[]
): RunSummary {
  const realSignals = signals.filter((signal) => !isLiveSummarySignal(signal));
  const totalTokens = agents.reduce(
    (sum, agent) => sum + (agent.tokenUsage?.total.totalTokens ?? agent.tokensUsed ?? 0),
    0
  );
  const estimatedCostUsd = agents.reduce(
    (sum, agent) => sum + estimateAgentCostUsd(agent),
    0
  );

  const editedTargets = new Set<string>();
  const usefulTargets = new Set<string>();
  for (const signal of realSignals) {
    if (signal.action === "edit_file" || signal.action === "write_text") {
      editedTargets.add(signal.target);
      usefulTargets.add(signal.target);
    }
    if (signal.action === "decision" || signal.action === "final_answer") {
      for (const id of signal.evidence ?? []) usefulTargets.add(id);
    }
    if (signal.category === "evidence" || signal.category === "handoff") {
      usefulTargets.add(signal.target);
    }
  }

  const readCounts = new Map<string, number>();
  let wastedSteps = 0;
  const deadTrailIds = new Set<string>();

  for (const signal of realSignals) {
    if (signal.category === "waste") {
      wastedSteps += 1;
      continue;
    }
    if (!READ_ACTIONS.has(signal.action)) continue;
    const prior = readCounts.get(signal.target) ?? 0;
    readCounts.set(signal.target, prior + 1);

    const neverUsed = !editedTargets.has(signal.target) && !usefulTargets.has(signal.target);
    if (neverUsed) {
      wastedSteps += 1;
      deadTrailIds.add(signal.target);
    } else if (prior >= 1) {
      // a re-read of a node we already visited = thrash
      wastedSteps += 1;
    }
  }

  const steps = realSignals.length;
  const wastePct = steps > 0 ? Math.min(1, wastedSteps / steps) : 0;
  const deadTrails = [...deadTrailIds]
    .slice(0, 6)
    .map((id) => labelForNode(nodes, id));

  return {
    totalTokens,
    estimatedCostUsd,
    steps,
    filesTouched: editedTargets.size,
    wastedSteps,
    wastePct,
    deadTrails,
  };
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

export function formatCostUsd(value: number): string {
  if (value <= 0) return "$0";
  if (value < 0.01) return "<$0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  if (value < 100) return `$${value.toFixed(2)}`;
  return `$${Math.round(value)}`;
}

export function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
