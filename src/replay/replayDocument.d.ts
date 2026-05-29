import type {
  AgentTelemetry,
  NeuroEdgeData,
  NeuroSignal,
  PositionedNeuroNode,
} from "../types";
import type { HandoffPacket } from "../lib/handoffPacket";
import type { RunSummary } from "../lib/costModel";

export type ReplayPayload = {
  version?: string;
  exportedAt?: string;
  title: string;
  durationSec?: number;
  agents?: AgentTelemetry[];
  nodes: PositionedNeuroNode[];
  edges: NeuroEdgeData[];
  signals: NeuroSignal[];
  handoff: HandoffPacket;
  summary?: RunSummary;
  redactionNotice?: string;
  locale?: string;
  replayLabels?: Record<string, string>;
};

export function buildReplayHtml(payload: ReplayPayload): string;
