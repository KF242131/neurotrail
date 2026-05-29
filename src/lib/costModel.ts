import type {
  AgentTokenUsage,
  AgentTelemetry,
  NeuroEdgeData,
  NeuroSignal,
  PositionedNeuroNode,
} from "../types";
import {
  classifyWasteSignals,
  isLiveSummarySignal,
  labelForNode,
  WASTE_LABELS,
} from "./wasteCore.js";
import type { WasteReason } from "./wasteCore.js";

// The waste-classification core lives in a dependency-free JS module shared
// with the Node CLI (bin/neurotrail.mjs) so the live viewer and exported
// reports score waste identically. Re-export its public surface so existing
// importers (App, exportHtml, eval/) keep importing from costModel.
export {
  classifyWasteSignals,
  segmentEpisodes,
  LOW_CONFIDENCE_BAND,
} from "./wasteCore.js";
export type {
  AuditVerdict,
  Episode,
  SignalVerdict,
  WasteReason,
} from "./wasteCore.js";

// Rough public list prices in USD per 1M tokens. These are deliberately
// approximate: NeuroTrail shows an estimate so a run's relative cost and
// waste are legible, not an invoice. Adjust freely.
export type ModelPrice = {
  input: number;
  cacheCreationInput: number;
  cacheReadInput: number;
  output: number;
};

const MODEL_PRICES: Array<{ match: RegExp; price: ModelPrice }> = [
  { match: /opus/i, price: { input: 15, cacheCreationInput: 18.75, cacheReadInput: 1.5, output: 75 } },
  { match: /sonnet/i, price: { input: 3, cacheCreationInput: 3.75, cacheReadInput: 0.3, output: 15 } },
  { match: /haiku/i, price: { input: 0.8, cacheCreationInput: 1, cacheReadInput: 0.08, output: 4 } },
  { match: /gpt-?5|o[34]|codex/i, price: { input: 1.25, cacheCreationInput: 1.25, cacheReadInput: 0.125, output: 10 } },
  { match: /gemini/i, price: { input: 1.25, cacheCreationInput: 0.3125, cacheReadInput: 0.3125, output: 5 } },
];

const DEFAULT_PRICE: ModelPrice = { input: 3, cacheCreationInput: 3.75, cacheReadInput: 0.3, output: 15 };
const BLENDED_PER_TOKEN = 6 / 1_000_000; // fallback when only a token count is known

export function priceForModel(model: string | undefined): ModelPrice {
  if (!model) return DEFAULT_PRICE;
  for (const entry of MODEL_PRICES) {
    if (entry.match.test(model)) return entry.price;
  }
  return DEFAULT_PRICE;
}

function finiteNonNegative(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function estimateUsageCostUsd(usage: AgentTokenUsage, price: ModelPrice) {
  const actualCostUsd = finiteNonNegative(usage.actualCostUsd);
  if (actualCostUsd !== undefined) return actualCostUsd;

  const input = Math.max(0, usage.inputTokens ?? 0);
  const hasExplicitCache =
    usage.cacheCreationInputTokens !== undefined ||
    usage.cacheReadInputTokens !== undefined;
  const legacyCachedInput = hasExplicitCache
    ? 0
    : Math.max(0, usage.cachedInputTokens ?? 0);
  const cacheCreation = Math.max(0, usage.cacheCreationInputTokens ?? 0);
  const cacheRead = Math.max(
    0,
    usage.cacheReadInputTokens ?? legacyCachedInput
  );
  const freshInput = Math.max(
    0,
    hasExplicitCache ? input : input - legacyCachedInput
  );
  const output =
    Math.max(0, usage.outputTokens ?? 0) +
    Math.max(0, usage.reasoningOutputTokens ?? 0);

  return (
    (freshInput * price.input +
      cacheCreation * price.cacheCreationInput +
      cacheRead * price.cacheReadInput +
      output * price.output) /
    1_000_000
  );
}

export function estimateAgentCostUsd(agent: AgentTelemetry): number {
  const usage = agent.tokenUsage?.total;
  if (!usage || usage.totalTokens <= 0) {
    return Math.max(0, agent.tokensUsed) * BLENDED_PER_TOKEN;
  }
  const price = priceForModel(agent.model || agent.adapter);
  return estimateUsageCostUsd(usage, price);
}

export type WasteBreakdownEntry = {
  reason: WasteReason;
  label: string;
  steps: number;
  tokensEstimate: number;
  costEstimateUsd: number;
  confidence: number;
  targets: string[];
};

export type RunSummary = {
  totalTokens: number;
  estimatedCostUsd: number;
  steps: number;
  filesTouched: number;
  wastedSteps: number;
  wastePct: number;
  wasteCostPct: number;
  wastedTokensEstimate: number;
  wastedCostEstimateUsd: number;
  wasteConfidence: number;
  wasteBreakdown: WasteBreakdownEntry[];
  deadTrails: string[];
};

/**
 * Aggregate a run into headline numbers + a waste estimate.
 *
 * Waste classification comes from the shared classifyWasteSignals core; this
 * function adds the token/cost weighting (per agent / lane) on top of those
 * per-signal verdicts.
 */
export function computeRunSummary(
  signals: NeuroSignal[],
  agents: AgentTelemetry[],
  nodes: PositionedNeuroNode[],
  edges: NeuroEdgeData[] = []
): RunSummary {
  const realSignals = signals
    .filter((signal) => !isLiveSummarySignal(signal))
    .slice()
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  const totalTokens = agents.reduce(
    (sum, agent) => sum + (agent.tokenUsage?.total.totalTokens ?? agent.tokensUsed ?? 0),
    0
  );
  const estimatedCostUsd = agents.reduce(
    (sum, agent) => sum + estimateAgentCostUsd(agent),
    0
  );
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const agentCosts = new Map(
    agents.map((agent) => [agent.id, estimateAgentCostUsd(agent)])
  );
  const agentSignalCounts = new Map<string, number>();
  const laneSignalCounts = new Map<string, number>();
  for (const signal of realSignals) {
    const agentKey = signal.agentId && agentById.has(signal.agentId)
      ? signal.agentId
      : "__unassigned";
    agentSignalCounts.set(agentKey, (agentSignalCounts.get(agentKey) ?? 0) + 1);
    if (signal.laneId) {
      const laneKey = `${agentKey}:${signal.laneId}`;
      laneSignalCounts.set(laneKey, (laneSignalCounts.get(laneKey) ?? 0) + 1);
    }
  }
  const laneTokens = new Map<string, number>();
  for (const agent of agents) {
    for (const run of agent.tokenRuns ?? []) {
      for (const lane of run.lanes) {
        if (lane.tokenCount && lane.tokenCount > 0) {
          laneTokens.set(`${agent.id}:${lane.id}`, lane.tokenCount);
        }
      }
    }
  }

  const editedTargets = new Set<string>();
  for (const signal of realSignals) {
    if (signal.action === "edit_file" || signal.action === "write_text") {
      editedTargets.add(signal.target);
    }
  }

  let wastedSteps = 0;
  let wastedTokensEstimate = 0;
  let wastedCostEstimateUsd = 0;
  let confidenceTotal = 0;
  const deadTrailIds = new Set<string>();
  const breakdown = new Map<
    WasteReason,
    {
      steps: number;
      tokensEstimate: number;
      costEstimateUsd: number;
      confidenceTotal: number;
      targets: Set<string>;
    }
  >();

  function signalWeight(signal: NeuroSignal) {
    const agentKey = signal.agentId && agentById.has(signal.agentId)
      ? signal.agentId
      : "__unassigned";
    const agent = agentById.get(agentKey);
    const agentTokenTotal =
      agent?.tokenUsage?.total.totalTokens ?? agent?.tokensUsed ?? totalTokens;
    const agentCostTotal =
      agentKey === "__unassigned"
        ? estimatedCostUsd
        : agentCosts.get(agentKey) ?? 0;
    const agentCount =
      agentSignalCounts.get(agentKey) || Math.max(1, realSignals.length);

    let tokensEstimate = agentTokenTotal / agentCount;
    if (signal.laneId) {
      const laneKey = `${agentKey}:${signal.laneId}`;
      const tokenCount = laneTokens.get(laneKey);
      if (tokenCount) {
        tokensEstimate = tokenCount / Math.max(1, laneSignalCounts.get(laneKey) ?? 1);
      }
    }
    const costPerToken =
      agentTokenTotal > 0 ? agentCostTotal / agentTokenTotal : 0;
    return {
      tokensEstimate,
      costEstimateUsd: tokensEstimate * costPerToken,
    };
  }

  function addWaste(signal: NeuroSignal, reason: WasteReason, confidence: number) {
    const weight = signalWeight(signal);
    wastedSteps += 1;
    wastedTokensEstimate += weight.tokensEstimate;
    wastedCostEstimateUsd += weight.costEstimateUsd;
    confidenceTotal += confidence;
    const entry =
      breakdown.get(reason) ?? {
        steps: 0,
        tokensEstimate: 0,
        costEstimateUsd: 0,
        confidenceTotal: 0,
        targets: new Set<string>(),
      };
    entry.steps += 1;
    entry.tokensEstimate += weight.tokensEstimate;
    entry.costEstimateUsd += weight.costEstimateUsd;
    entry.confidenceTotal += confidence;
    entry.targets.add(labelForNode(nodes, signal.target));
    breakdown.set(reason, entry);
    if (reason === "dead_trail") deadTrailIds.add(signal.target);
  }

  const verdicts = classifyWasteSignals(realSignals, nodes, edges);
  const verdictById = new Map(
    verdicts.map((verdict) => [verdict.signalId, verdict] as const)
  );
  for (const signal of realSignals) {
    const verdict = verdictById.get(signal.id);
    if (verdict?.wasted && verdict.reason) {
      addWaste(signal, verdict.reason, verdict.confidence);
    }
  }

  const steps = realSignals.length;
  const wastePct = steps > 0 ? Math.min(1, wastedSteps / steps) : 0;
  const wasteCostPct =
    estimatedCostUsd > 0
      ? Math.min(1, wastedCostEstimateUsd / estimatedCostUsd)
      : wastePct;
  const wasteConfidence = wastedSteps > 0 ? confidenceTotal / wastedSteps : 0;
  const wasteBreakdown = ([
    "tool_error",
    "failed_iteration",
    "redundant_retry",
    "churn",
    "loop",
    "thrash",
    "dead_trail",
    "explicit_waste",
  ] as WasteReason[])
    .map((reason) => {
      const entry = breakdown.get(reason);
      if (!entry) return undefined;
      return {
        reason,
        label: WASTE_LABELS[reason],
        steps: entry.steps,
        tokensEstimate: entry.tokensEstimate,
        costEstimateUsd: entry.costEstimateUsd,
        confidence: entry.confidenceTotal / entry.steps,
        targets: [...entry.targets].slice(0, 6),
      };
    })
    .filter((entry): entry is WasteBreakdownEntry => !!entry);
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
    wasteCostPct,
    wastedTokensEstimate,
    wastedCostEstimateUsd,
    wasteConfidence,
    wasteBreakdown,
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
