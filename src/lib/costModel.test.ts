import { describe, expect, it } from "vitest";
import {
  computeRunSummary,
  estimateAgentCostUsd,
  type WasteReason,
} from "./costModel";
import type {
  AgentTelemetry,
  AgentTokenUsage,
  NeuroEdgeData,
  NeuroSignal,
  PositionedNeuroNode,
} from "../types";

function signal(
  id: string,
  time: number,
  action: NeuroSignal["action"],
  target = "file:src/App.tsx"
): NeuroSignal {
  return {
    id,
    time,
    action,
    target,
    intensity: 0.7,
    reason: `${action} ${target}`,
  };
}

function node(id: string, filePath: string): PositionedNeuroNode {
  return {
    id,
    label: filePath.split("/").at(-1) ?? filePath,
    path: filePath,
    type: "file",
    activation: 0,
    visitCount: 0,
    position: { x: 0, y: 0 },
  };
}

function agent(usage: AgentTokenUsage): AgentTelemetry {
  return {
    id: "agent:codex",
    name: "Codex",
    adapter: "codex",
    model: "sonnet",
    role: "coding",
    status: "ready",
    tokenBudget: usage.totalTokens,
    tokensUsed: usage.totalTokens,
    accent: "#fff",
    tokenUsage: { total: usage },
  };
}

function reasonSteps(summary: ReturnType<typeof computeRunSummary>, reason: WasteReason) {
  return summary.wasteBreakdown.find((entry) => entry.reason === reason)?.steps ?? 0;
}

describe("computeRunSummary waste estimate", () => {
  const nodes = [node("file:src/App.tsx", "src/App.tsx")];

  it("marks an unused single read as a dead trail", () => {
    const summary = computeRunSummary(
      [signal("read", 0, "read_file")],
      [],
      nodes
    );

    expect(summary.wastedSteps).toBe(1);
    expect(reasonSteps(summary, "dead_trail")).toBe(1);
    expect(summary.deadTrails).toEqual(["src/App.tsx"]);
  });

  it("does not mark a read that later contributes to an edit as waste", () => {
    const summary = computeRunSummary(
      [signal("read", 0, "read_file"), signal("edit", 10, "edit_file")],
      [],
      nodes
    );

    expect(summary.wastedSteps).toBe(0);
    expect(summary.wasteBreakdown).toEqual([]);
  });

  it("does not count a second read as thrash", () => {
    const summary = computeRunSummary(
      [signal("read-1", 0, "read_file"), signal("read-2", 10, "read_file")],
      [],
      nodes
    );

    expect(summary.wastedSteps).toBe(1);
    expect(reasonSteps(summary, "dead_trail")).toBe(1);
    expect(reasonSteps(summary, "thrash")).toBe(0);
  });

  it("marks the third short-window read as thrash", () => {
    const summary = computeRunSummary(
      [
        signal("read-1", 0, "read_file"),
        signal("read-2", 10, "read_file"),
        signal("read-3", 20, "read_file"),
      ],
      [],
      nodes
    );

    expect(summary.wastedSteps).toBe(2);
    expect(reasonSteps(summary, "dead_trail")).toBe(1);
    expect(reasonSteps(summary, "thrash")).toBe(1);
  });

  it("does not mark rereads after progress actions as thrash", () => {
    const summary = computeRunSummary(
      [
        signal("read-1", 0, "read_file"),
        signal("test", 5, "test_passed", "cmd:npm-test"),
        signal("read-2", 10, "read_file"),
        signal("decision", 15, "decision", "decision:verified"),
        signal("read-3", 20, "read_file"),
      ],
      [],
      nodes
    );

    expect(reasonSteps(summary, "thrash")).toBe(0);
  });

  it("rescues reads related to edited files by graph relationship", () => {
    const relatedNodes = [
      node("file:src/App.tsx", "src/App.tsx"),
      node("file:src/types.ts", "src/types.ts"),
    ];
    const edges: NeuroEdgeData[] = [
      {
        id: "types-to-app",
        source: "file:src/types.ts",
        target: "file:src/App.tsx",
        type: "imports",
        weight: 1,
      },
    ];
    const summary = computeRunSummary(
      [
        signal("read-types", 0, "read_file", "file:src/types.ts"),
        signal("edit-app", 10, "edit_file", "file:src/App.tsx"),
      ],
      [],
      relatedNodes,
      edges
    );

    expect(summary.wastedSteps).toBe(0);
  });

  it("rescues same-directory context files for edited files", () => {
    const relatedNodes = [
      node("file:src/App.tsx", "src/App.tsx"),
      node("file:src/types.ts", "src/types.ts"),
    ];
    const summary = computeRunSummary(
      [
        signal("read-types", 0, "read_file", "file:src/types.ts"),
        signal("edit-app", 10, "edit_file", "file:src/App.tsx"),
      ],
      [],
      relatedNodes
    );

    expect(summary.wastedSteps).toBe(0);
  });
});

describe("estimateAgentCostUsd", () => {
  it("prices Claude cache creation, cache reads, and output separately", () => {
    const cost = estimateAgentCostUsd(
      agent({
        inputTokens: 1_000,
        cachedInputTokens: 5_000,
        cacheCreationInputTokens: 2_000,
        cacheReadInputTokens: 3_000,
        outputTokens: 4_000,
        totalTokens: 10_000,
      })
    );

    expect(cost).toBeCloseTo(0.0714, 6);
  });

  it("prefers provider-reported actual cost when available", () => {
    const cost = estimateAgentCostUsd(
      agent({
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 1_000_000,
        totalTokens: 2_000_000,
        actualCostUsd: 0.42,
        costSource: "actual",
      })
    );

    expect(cost).toBe(0.42);
  });
});
