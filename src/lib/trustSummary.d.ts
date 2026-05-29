import type {
  NeuroEdgeData,
  NeuroSignal,
  PositionedNeuroNode,
} from "../types";
import type { WasteReason } from "./wasteCore";

export type TrustFact = { label: string; value: string };

export type TrustFlag = {
  reason: WasteReason;
  label: string;
  confidence: number;
  /** Earliest occurrence (seconds) — the replay deep-link target. */
  timeSec: number;
  target: string;
  /** How many times this (reason, target) pattern occurred. */
  count: number;
};

export type TestOutcome = "passed" | "failed" | "unknown";

export type TrustSummary = {
  headline: string;
  facts: TrustFact[];
  flags: TrustFlag[];
  flagCount: number;
  truncated: number;
  tests: TestOutcome;
  durationSec: number;
  disclaimer: string;
  markdown: string;
};

/** Structural subset of costModel's RunSummary that this renderer reads. */
export type RunSummaryLike = {
  totalTokens?: number;
  estimatedCostUsd?: number;
  steps?: number;
  filesTouched?: number;
};

export declare const REVIEW_HINT_LABELS: Record<WasteReason, string>;

export declare function renderTrustSummary(input: {
  summary?: RunSummaryLike;
  signals?: NeuroSignal[];
  nodes?: PositionedNeuroNode[];
  edges?: NeuroEdgeData[];
  agentLabel?: string;
  filesFromGit?: string[];
  maxFlags?: number;
}): TrustSummary;
