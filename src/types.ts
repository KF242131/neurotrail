export type NeuroNodeType =
  | "directory"
  | "file"
  | "function"
  | "command"
  | "config"
  | "test"
  | "decision"
  | "agent"
  | "artifact";

export type GraphVisualMode = "minimal" | "cinematic";

export type GraphSource =
  | "demo"
  | "local"
  | "claude"
  | "codex"
  | "gemini"
  | "cursor"
  | "cline"
  | "roo"
  | "unknown"
  | "multi-agent";

export type NeuroNodeKind = "project" | "agent" | "memory";

export type NeuroEdgeKind =
  | "structure"
  | "trail"
  | "memory"
  | "recommendation";

export type GraphProjection =
  | "focus"
  | "trail"
  | "waste"
  | "handoff"
  | "context";

export type AgentRole =
  | "orchestrator"
  | "research"
  | "coding"
  | "writing"
  | "verification"
  | "review";

export type GraphFilters = {
  depth: number;
  nodeLimit: number;
  showFileNodes: boolean;
  showFunctionNodes: boolean;
  showCommandNodes: boolean;
  evidenceOnly: boolean;
};

export type NeuroNodeProminence = "core" | "branch" | "micro";

export type NeuroNodeStatus =
  | "idle"
  | "active"
  | "error"
  | "edited"
  | "passed"
  | "decision";

export type NeuroNodeData = {
  id: string;
  label: string;
  type: NeuroNodeType;
  kind?: NeuroNodeKind;
  agentId?: string;
  sessionId?: string;
  category?: NeuroSignalCategory;
  roles?: AgentRole[];
  path?: string;
  description?: string;
  activation: number;
  visitCount: number;
  status?: NeuroNodeStatus;
  isCurrent?: boolean;
  glowColor?: string;
  lastAction?: SignalAction;
  visualMode?: GraphVisualMode;
  depth?: number;
  prominence?: NeuroNodeProminence;
  showLabel?: boolean;
  isSelected?: boolean;
  isDimmed?: boolean;
  /** A descendant file inside this directory is currently being touched. */
  hasActiveChild?: boolean;
  /** Action being performed on a descendant (tints the cluster halo). */
  childAction?: SignalAction;
};

export type PositionedNeuroNode = NeuroNodeData & {
  position: { x: number; y: number };
};

export type NeuroEdgeType =
  | "imports"
  | "calls"
  | "reads"
  | "tests"
  | "edits"
  | "runs"
  | "decides";

export type NeuroEdgeData = {
  id: string;
  source: string;
  target: string;
  type: NeuroEdgeType;
  kind?: NeuroEdgeKind;
  agentId?: string;
  sessionId?: string;
  timestamp?: string;
  eventCount?: number;
  category?: NeuroSignalCategory;
  role?: AgentRole;
  weight: number;
  active?: boolean;
  glowColor?: string;
};

export type SignalAction =
  | "think"
  | "search"
  | "read_file"
  | "open_symbol"
  | "edit_file"
  | "write_text"
  | "run_command"
  | "observe_output"
  | "test_failed"
  | "test_passed"
  | "decision"
  | "final_answer";

export type NeuroSignalCategory =
  | "trail"
  | "evidence"
  | "handoff"
  | "waste"
  | "context";

export type NeuroSignal = {
  id: string;
  time: number;
  action: SignalAction;
  laneId?: string;
  agentId?: string;
  sessionId?: string;
  timestamp?: string;
  source?: string;
  target: string;
  intensity: number;
  confidence?: number;
  reason: string;
  topic?: string;
  category?: NeuroSignalCategory;
  role?: AgentRole;
  evidence?: string[];
};

export type AgentTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  totalTokens: number;
};

export type AgentTokenLane = {
  id: string;
  label: string;
  tokenCount?: number;
  startedAt?: string;
  endedAt?: string;
};

export type AgentTokenRun = {
  id: string;
  label: string;
  timestamp?: string;
  laneCount: number;
  usage?: AgentTokenUsage;
  lanes: AgentTokenLane[];
};

export type AgentTokenTelemetry = {
  total: AgentTokenUsage;
  last?: AgentTokenUsage;
  contextWindow?: number;
};

export type NodeRuntimeState = {
  status: NeuroNodeStatus;
  activation: number;
  visitCount: number;
  lastAction?: SignalAction;
  isCurrent: boolean;
  /** A descendant (file inside this dir) is currently being touched. */
  hasActiveChild?: boolean;
  /** The action being performed on a descendant (used to tint the cluster halo). */
  childAction?: SignalAction;
};

export type EdgeRuntimeState = {
  active: boolean;
  age: number;
  glowColor?: string;
  visited?: boolean;
  role?: AgentRole;
  action?: SignalAction;
};

export type AgentTelemetry = {
  id: string;
  name: string;
  adapter: string;
  model: string;
  role: string;
  status: "active" | "ready" | "planned";
  tokenBudget: number;
  tokensUsed: number;
  accent: string;
  currentFocus?: string;
  currentRole?: AgentRole;
  roleCounts?: Partial<Record<AgentRole, number>>;
  tokenUsage?: AgentTokenTelemetry;
  tokenRuns?: AgentTokenRun[];
  touchedCount?: number;
  evidenceCount?: number;
};
