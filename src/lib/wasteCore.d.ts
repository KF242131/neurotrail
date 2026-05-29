import type {
  NeuroEdgeData,
  NeuroSignal,
  PositionedNeuroNode,
} from "../types";

export type WasteReason =
  | "dead_trail"
  | "thrash"
  | "tool_error"
  | "failed_iteration"
  | "explicit_waste"
  | "churn"
  | "loop"
  | "redundant_retry";

export type Episode = {
  id: string;
  agentKey: string;
  signalIds: string[];
  startTime: number;
  endTime: number;
};

export type SignalVerdict = {
  signalId: string;
  wasted: boolean;
  reason: WasteReason | null;
  confidence: number;
  episodeId: string;
};

export type AuditVerdict = {
  episodeId: string;
  verdict: "wasted" | "useful" | "uncertain";
  confidence: number;
  rationale: string;
};

export declare const WASTE_LABELS: Record<WasteReason, string>;
export declare const WASTE_CONFIDENCE: Record<WasteReason, number>;
export declare const LOW_CONFIDENCE_BAND: [number, number];

export declare function isLiveSummarySignal(signal: NeuroSignal): boolean;
export declare function labelForNode(
  nodes: PositionedNeuroNode[],
  id: string
): string;
export declare function segmentEpisodes(signals: NeuroSignal[]): Episode[];
export declare function classifyWasteSignals(
  signals: NeuroSignal[],
  nodes: PositionedNeuroNode[],
  edges?: NeuroEdgeData[],
  audit?: AuditVerdict[]
): SignalVerdict[];
