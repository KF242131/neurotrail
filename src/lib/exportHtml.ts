import { computeRunSummary } from "./costModel";
import { buildReplayHtml, type ReplayPayload } from "../replay/replayDocument.js";
import type { HandoffPacket } from "./handoffPacket";
import type {
  AgentTelemetry,
  NeuroEdgeData,
  NeuroSignal,
  PositionedNeuroNode,
} from "../types";

type ReplayHtmlInput = {
  title: string;
  timestamp?: string;
  agents?: AgentTelemetry[];
  nodes: PositionedNeuroNode[];
  edges: NeuroEdgeData[];
  signals: NeuroSignal[];
  handoff: HandoffPacket;
  redactionNotice?: string;
};

/**
 * Generate a single self-contained, no-server replay document: the agent's run
 * animates on a canvas with a video-player scrubber and a webm recorder. This
 * is NeuroTrail's shareable artifact. Rendering lives in
 * src/replay/replayDocument.js (shared with the CLI).
 */
export function generateReplayHtmlReport(input: ReplayHtmlInput): string {
  const summary = computeRunSummary(input.signals, input.agents ?? [], input.nodes);
  const payload: ReplayPayload = {
    version: "2",
    exportedAt: input.timestamp ?? new Date().toISOString(),
    title: input.title,
    agents: input.agents,
    nodes: input.nodes,
    edges: input.edges,
    signals: input.signals,
    handoff: input.handoff,
    summary,
    redactionNotice: input.redactionNotice,
  };
  return buildReplayHtml(payload);
}
