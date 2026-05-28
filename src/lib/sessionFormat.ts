import { AGENT_ROLES, inferAgentRole } from "./agentRoles";
import type {
  AgentRole,
  NeuroSignal,
  NeuroSignalCategory,
  SignalAction,
} from "../types";

export type NeuroTrailSessionEvent = {
  version: "1";
  timestamp: string;
  sessionId: string;
  agentId: string;
  agentName?: string;
  role?: AgentRole;
  action: string;
  target?: string;
  source?: string;
  summary?: string;
  path?: string;
  metadata?: Record<string, unknown>;
};

const SIGNAL_ACTIONS: ReadonlySet<string> = new Set<SignalAction>([
  "think",
  "search",
  "read_file",
  "open_symbol",
  "edit_file",
  "write_text",
  "run_command",
  "observe_output",
  "test_failed",
  "test_passed",
  "decision",
  "final_answer",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === "string" && AGENT_ROLES.includes(value as AgentRole);
}

function validTimestamp(value: unknown) {
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function coerceAction(action: string): SignalAction {
  return SIGNAL_ACTIONS.has(action) ? (action as SignalAction) : "think";
}

export function signalToSessionEvent(
  signal: NeuroSignal,
  options: {
    sessionId?: string;
    agentId?: string;
    agentName?: string;
    path?: string;
  } = {}
): NeuroTrailSessionEvent {
  const timestamp =
    signal.timestamp ??
    new Date(Math.max(0, signal.time) * 1000).toISOString();
  const metadata: Record<string, unknown> = {
    category: signal.category,
    confidence: signal.confidence,
    evidence: signal.evidence,
    topic: signal.topic,
  };

  return {
    version: "1",
    timestamp,
    sessionId: signal.sessionId ?? options.sessionId ?? "local-session",
    agentId: signal.agentId ?? options.agentId ?? "agent",
    agentName: options.agentName,
    role: signal.role ?? inferAgentRole(signal),
    action: signal.action,
    source: signal.source,
    target: signal.target,
    summary: signal.reason,
    path: options.path,
    metadata,
  };
}

export function sessionEventToSignal(
  event: NeuroTrailSessionEvent,
  index = 0,
  firstTimestamp?: string
): NeuroSignal {
  const firstTime = firstTimestamp ? Date.parse(firstTimestamp) : Date.parse(event.timestamp);
  const eventTime = Date.parse(event.timestamp);
  const role = event.role ?? inferAgentRole(event);
  return {
    id: `${event.sessionId}:${index}:${event.action}:${event.target ?? "event"}`,
    time: Math.max(0, (eventTime - firstTime) / 1000),
    action: coerceAction(event.action),
    agentId: event.agentId,
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    source: event.source,
    target: event.target ?? event.source ?? `agent:${event.agentId}`,
    intensity: 0.74,
    reason: event.summary ?? `${event.agentId} ${event.action}`,
    topic:
      typeof event.metadata?.topic === "string"
        ? event.metadata.topic
        : event.path,
    category:
      typeof event.metadata?.category === "string"
        ? (event.metadata.category as NeuroSignalCategory)
        : "trail",
    confidence:
      typeof event.metadata?.confidence === "number"
        ? event.metadata.confidence
        : undefined,
    evidence: Array.isArray(event.metadata?.evidence)
      ? event.metadata.evidence.filter((item): item is string => typeof item === "string")
      : undefined,
    role,
  };
}

export function normalizeSessionEvents(
  events: unknown[]
): NeuroTrailSessionEvent[] {
  return events
    .map((event): NeuroTrailSessionEvent | undefined => {
      if (!isRecord(event)) return undefined;
      if (event.version !== "1") return undefined;
      const timestamp = validTimestamp(event.timestamp);
      if (!timestamp) return undefined;
      if (typeof event.sessionId !== "string") return undefined;
      if (typeof event.agentId !== "string") return undefined;
      if (typeof event.action !== "string") return undefined;

      const normalized: NeuroTrailSessionEvent = {
        version: "1",
        timestamp,
        sessionId: event.sessionId,
        agentId: event.agentId,
        agentName:
          typeof event.agentName === "string" ? event.agentName : undefined,
        role: isAgentRole(event.role) ? event.role : undefined,
        action: event.action,
        target: typeof event.target === "string" ? event.target : undefined,
        source: typeof event.source === "string" ? event.source : undefined,
        summary:
          typeof event.summary === "string" ? event.summary : undefined,
        path: typeof event.path === "string" ? event.path : undefined,
        metadata: isRecord(event.metadata) ? event.metadata : undefined,
      };
      normalized.role = normalized.role ?? inferAgentRole(normalized);
      return normalized;
    })
    .filter((event): event is NeuroTrailSessionEvent => !!event)
    .sort(
      (a, b) =>
        Date.parse(a.timestamp) - Date.parse(b.timestamp) ||
        a.agentId.localeCompare(b.agentId) ||
        a.action.localeCompare(b.action)
    );
}
