import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Header } from "./components/Header";
import { BackgroundParticles } from "./components/BackgroundParticles";
import { GraphCanvas } from "./components/GraphCanvas";
import { AgentFocusPanel } from "./components/AgentFocusPanel";
import { EvidencePanel } from "./components/EvidencePanel";
import {
  DetailDrawer,
  type DetailSelection,
} from "./components/DetailDrawer";
import { GraphControls } from "./components/GraphControls";
import { AgentBar } from "./components/AgentBar";
import {
  buildLocalProjectGraph,
  type ProjectGraph,
} from "./lib/localProjectGraph";
import { demoNodes, demoEdges } from "./data/demoGraph";
import { demoSignals, TOTAL_DURATION } from "./data/demoSignals";
import { getAgentTelemetry } from "./data/demoAgents";
import { fetchLiveAgentGraph } from "./lib/claudeLive";
import { AGENT_ROLES, ROLE_LABELS, inferAgentRole, roleColor } from "./lib/agentRoles";
import {
  computeRunSummary,
  formatCostUsd,
  formatPct,
  formatTokens,
  type RunSummary,
} from "./lib/costModel";
import {
  ACTIVE_WINDOW,
  computeEdgeStates,
  computeNodeStates,
  findActiveSignal,
  findLastPastSignal,
  getEvidence,
} from "./lib/activation";
import type {
  AgentTelemetry,
  AgentRole,
  GraphFilters,
  GraphProjection,
  GraphVisualMode,
  NeuroSignal,
} from "./types";

const WAITING_TIME = -0.35;

type MonitorState = "idle" | "pending" | "running" | "complete";

// First-run experience: a self-contained sample replay so cloning the repo and
// running `npm run dev` never shows a blank screen. The live poll below upgrades
// this to a real session the moment one is detected in the workspace.
const DEMO_PROJECT_GRAPH: ProjectGraph = {
  id: "demo-agent-pr-replay",
  name: "Sample agent PR replay",
  source: "demo",
  nodes: demoNodes,
  edges: demoEdges,
  signals: demoSignals,
  totalDuration: TOTAL_DURATION,
  fileCount: demoNodes.filter((node) => node.type === "file").length,
  skippedCount: 0,
  isActive: false,
  agents: getAgentTelemetry(TOTAL_DURATION),
};

function computeMaxDepth(
  rootId: string,
  nodes: ProjectGraph["nodes"],
  edges: ProjectGraph["edges"]
) {
  const adjacency = new Map<string, string[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }
  const distances = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    const distance = distances.get(current) ?? 0;
    for (const next of adjacency.get(current) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, distance + 1);
      queue.push(next);
    }
  }
  return Math.max(...distances.values(), ...nodes.map((n) => n.depth ?? 1));
}

const VISUAL_MODE: GraphVisualMode = "minimal";
const GRAPH_PROJECTIONS: Array<{ id: GraphProjection; label: string }> = [
  { id: "focus", label: "Focus" },
  { id: "trail", label: "Trail" },
  { id: "waste", label: "Waste" },
  { id: "handoff", label: "Handoff" },
  { id: "context", label: "Context" },
];

const ROLE_FILTERS: Array<{ id?: AgentRole; label: string }> = [
  { label: "All" },
  ...AGENT_ROLES.map((role) => ({ id: role, label: ROLE_LABELS[role] })),
];

function isLiveAgentSource(source: ProjectGraph["source"]) {
  return (
    source === "codex" ||
    source === "claude" ||
    source === "gemini" ||
    source === "cursor" ||
    source === "cline" ||
    source === "roo" ||
    source === "unknown" ||
    source === "multi-agent"
  );
}

function isLiveAgentGraph(graph: ProjectGraph) {
  return isLiveAgentSource(graph.source);
}

function getLiveAgentTelemetry(graph: ProjectGraph): AgentTelemetry[] {
  if (graph.agents?.length) {
    if (graph.source === "multi-agent" && graph.isActive) {
      const activeAgents = graph.agents.filter((agent) => agent.status === "active");
      if (activeAgents.length > 0) return activeAgents;
    }
    return graph.agents;
  }
  const name = graph.source === "codex" ? "Codex" : "Claude Code";
  return [
    {
      id: `${graph.source}-live`,
      name,
      adapter: "Local session log",
      model: "live",
      role: graph.isActive ? "Watching session" : "Session idle",
      status: graph.isActive ? "active" : "ready",
      tokenBudget: Math.max(1, graph.signals.length),
      tokensUsed: graph.signals.length,
      accent: "#ECE6D7",
    },
  ];
}

function signalMatchesProjection(signal: NeuroSignal, projection: GraphProjection) {
  if (projection === "focus" || projection === "trail") {
    return projection === "focus" ? signal.category !== "waste" : true;
  }
  if (projection === "waste") return signal.category === "waste";
  if (projection === "handoff") {
    return (
      signal.category === "handoff" ||
      signal.action === "decision" ||
      signal.action === "final_answer"
    );
  }
  return (
    signal.category === "context" ||
    signal.category === "evidence" ||
    signal.category === "handoff" ||
    signal.action === "edit_file" ||
    signal.action === "test_failed" ||
    signal.action === "test_passed"
  );
}

function isLiveSummarySignal(signal: NeuroSignal) {
  return signal.id.endsWith("-live-summary");
}

function projectGraphForView(
  graph: ProjectGraph,
  projection: GraphProjection,
  selectedAgentId?: string
): ProjectGraph {
  const agentSignals = selectedAgentId
    ? graph.signals.filter((signal) => signal.agentId === selectedAgentId)
    : graph.signals;
  const signals = agentSignals.filter((signal) =>
    signalMatchesProjection(signal, projection)
  );
  const scopedSignals = signals.length > 0 ? signals : agentSignals;

  const edgeVisible = (edge: ProjectGraph["edges"][number]) => {
    if (edge.kind === "structure") return true;
    if (selectedAgentId && edge.agentId && edge.agentId !== selectedAgentId) {
      return false;
    }
    if (projection === "waste") return edge.category === "waste";
    if (projection === "handoff") {
      return edge.kind === "memory" || edge.category === "handoff";
    }
    if (projection === "context") {
      return (
        edge.kind === "recommendation" ||
        edge.kind === "memory" ||
        edge.category === "evidence" ||
        edge.category === "handoff"
      );
    }
    return true;
  };

  const edges = graph.edges.filter(edgeVisible);
  const signalNodeIds = new Set<string>();
  for (const signal of scopedSignals) {
    signalNodeIds.add(signal.target);
    if (signal.source) signalNodeIds.add(signal.source);
    for (const id of signal.evidence ?? []) signalNodeIds.add(id);
  }
  for (const edge of edges) {
    signalNodeIds.add(edge.source);
    signalNodeIds.add(edge.target);
  }

  const nodes = graph.nodes.filter((node) => {
    if (node.type === "agent") {
      return !selectedAgentId || node.agentId === selectedAgentId || node.id === `agent:${selectedAgentId}`;
    }
    if (projection === "focus" || projection === "trail") return signalNodeIds.has(node.id);
    return signalNodeIds.has(node.id) || node.type === "directory";
  });

  return {
    ...graph,
    nodes: nodes.length > 0 ? nodes : graph.nodes,
    edges,
    signals: scopedSignals,
  };
}

export default function App() {
  const [projectGraph, setProjectGraph] =
    useState<ProjectGraph>(DEMO_PROJECT_GRAPH);
  const [currentTime, setCurrentTime] = useState(WAITING_TIME);
  const [monitorState, setMonitorState] = useState<MonitorState>("running");
  const [projection, setProjection] = useState<GraphProjection>("focus");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>();
  const [selectedRole, setSelectedRole] = useState<AgentRole | undefined>();
  const [selectedDetail, setSelectedDetail] = useState<DetailSelection | undefined>();
  const [selectedSignalId, setSelectedSignalId] = useState<string | undefined>();
  const [paused, setPaused] = useState(false);
  const [cinematic, setCinematic] = useState(false);

  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const showLiveAgentGraph = useCallback(async () => {
    const nextGraph = await fetchLiveAgentGraph();
    if (!nextGraph) return false;
    setProjectGraph(nextGraph);
    setCurrentTime(nextGraph.totalDuration);
    setMonitorState("running");
    setProjection("focus");
    setSelectedAgentId(undefined);
    setSelectedRole(undefined);
    setSelectedDetail(undefined);
    setSelectedSignalId(undefined);
    return true;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const poll = async () => {
      try {
        const nextGraph = await fetchLiveAgentGraph(controller.signal);
        if (!nextGraph || cancelled) return;
        const shouldShow =
          isLiveAgentGraph(nextGraph) &&
          nextGraph.isActive &&
          (isLiveAgentSource(projectGraph.source) ||
            projectGraph.source === "demo" ||
            monitorState === "idle");
        if (!shouldShow) return;
        setProjectGraph(nextGraph);
        if (!selectedSignalId) setCurrentTime(nextGraph.totalDuration);
        setMonitorState("running");
      } catch {
        // Live agent logs are optional; the demo and folder modes still work.
      }
    };

    void poll();
    const interval = window.setInterval(poll, 1800);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [monitorState, projectGraph.source, selectedSignalId]);

  useEffect(() => {
    if (monitorState !== "running") return undefined;
    if (isLiveAgentSource(projectGraph.source)) return undefined;
    const tick = (t: number) => {
      const last = lastTickRef.current;
      const dt = last == null ? 0 : (t - last) / 1000;
      lastTickRef.current = t;
      if (!pausedRef.current) {
        setCurrentTime((prev) => {
          const next = prev + dt;
          if (next >= projectGraph.totalDuration) {
            setMonitorState("complete");
            return projectGraph.totalDuration;
          }
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    lastTickRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [monitorState, projectGraph.source, projectGraph.totalDuration]);

  const agents = useMemo(
    () =>
      isLiveAgentGraph(projectGraph)
        ? getLiveAgentTelemetry(projectGraph)
        : projectGraph.source === "demo"
          ? projectGraph.agents ?? []
          : [],
    [projectGraph]
  );
  const effectiveSelectedAgentId =
    selectedAgentId && agents.some((agent) => agent.id === selectedAgentId)
      ? selectedAgentId
      : undefined;

  const viewGraph = useMemo(
    () => projectGraphForView(projectGraph, projection, effectiveSelectedAgentId),
    [projectGraph, projection, effectiveSelectedAgentId]
  );
  const effectiveSelectedRole = selectedRole;
  const roleScopedSignals = useMemo(() => {
    if (!effectiveSelectedRole) return viewGraph.signals;
    return viewGraph.signals.filter((signal) => {
      const role = signal.role ?? inferAgentRole(signal);
      return role === effectiveSelectedRole;
    });
  }, [effectiveSelectedRole, viewGraph.signals]);
  const runtimeRoleScopedSignals = useMemo(
    () => roleScopedSignals.filter((signal) => !isLiveSummarySignal(signal)),
    [roleScopedSignals]
  );
  const selectedSignal = useMemo(
    () =>
      selectedSignalId
        ? roleScopedSignals.find((signal) => signal.id === selectedSignalId)
        : undefined,
    [roleScopedSignals, selectedSignalId]
  );
  const reviewTime = selectedSignal
    ? selectedSignal.time + 0.05
    : currentTime;

  const graphFilters = useMemo<GraphFilters>(() => {
    const maxDepth = computeMaxDepth(
      viewGraph.nodes.find((node) => node.type === "agent")?.id ??
        "agent:orchestrator",
      viewGraph.nodes,
      viewGraph.edges
    );
    return {
      depth: maxDepth,
      nodeLimit: viewGraph.nodes.length,
      showFileNodes: true,
      showFunctionNodes: true,
      showCommandNodes: true,
      evidenceOnly: false,
    };
  }, [viewGraph]);

  const nodeIds = useMemo(
    () => viewGraph.nodes.map((n) => n.id),
    [viewGraph]
  );
  const nodeStates = useMemo(
    () => computeNodeStates(nodeIds, runtimeRoleScopedSignals, reviewTime),
    [nodeIds, runtimeRoleScopedSignals, reviewTime]
  );
  const edgeStates = useMemo(
    () => computeEdgeStates(viewGraph.edges, runtimeRoleScopedSignals, reviewTime),
    [viewGraph.edges, runtimeRoleScopedSignals, reviewTime]
  );

  const activeSignal = useMemo(
    () => findActiveSignal(runtimeRoleScopedSignals, reviewTime),
    [runtimeRoleScopedSignals, reviewTime]
  );
  const fallbackSignal = useMemo(
    () => findLastPastSignal(runtimeRoleScopedSignals, reviewTime),
    [runtimeRoleScopedSignals, reviewTime]
  );
  const displaySignal = selectedSignal ?? activeSignal ?? fallbackSignal;
  const currentRole =
    activeSignal?.role ??
    fallbackSignal?.role ??
    agents.find((agent) => agent.status === "active")?.currentRole;

  const evidence = useMemo(
    () => getEvidence(roleScopedSignals, reviewTime),
    [roleScopedSignals, reviewTime]
  );
  const finalAnswerActive =
    !!fallbackSignal &&
    fallbackSignal.action === "final_answer" &&
    reviewTime - fallbackSignal.time < ACTIVE_WINDOW;

  const liveGraph = isLiveAgentGraph(projectGraph);
  const runSummary = useMemo(
    () => computeRunSummary(projectGraph.signals, agents, projectGraph.nodes, projectGraph.edges),
    [agents, projectGraph.edges, projectGraph.nodes, projectGraph.signals]
  );

  const seekTo = (time: number) => {
    setSelectedSignalId(undefined);
    setSelectedDetail(undefined);
    setPaused(true);
    setCurrentTime(Math.max(0, Math.min(projectGraph.totalDuration, time)));
  };
  const togglePlay = () => {
    if (monitorState === "complete") {
      setCurrentTime(0);
      setPaused(false);
      setMonitorState("running");
      return;
    }
    setPaused((value) => !value);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCinematic(false);
      if (
        (event.key === "c" || event.key === "C") &&
        !event.metaKey &&
        !event.ctrlKey &&
        (monitorState === "running" || monitorState === "complete")
      ) {
        setCinematic((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [monitorState]);

  const selectStep = (signalId: string) => {
    setSelectedSignalId(signalId);
    setSelectedDetail({ kind: "signal", id: signalId });
    setProjection("focus");
  };

  const resumeLive = () => {
    setSelectedSignalId(undefined);
    setSelectedDetail(undefined);
    setCurrentTime(
      isLiveAgentGraph(projectGraph) ? projectGraph.totalDuration : currentTime
    );
  };

  const headerStatus =
    isLiveAgentGraph(projectGraph)
      ? projectGraph.isActive
        ? "live"
        : "stale"
      : monitorState === "idle"
      ? "idle"
      : monitorState === "pending"
        ? "ready"
        : monitorState === "running"
          ? "running"
          : "done";

  const headerDim = monitorState === "idle";
  const showGraph = monitorState !== "idle" && viewGraph.nodes.length > 0;
  const showBottomBar =
    !cinematic &&
    ((monitorState === "running" || monitorState === "complete") ||
      agents.length > 0);

  return (
    <div className="relative w-full h-full flex flex-col bg-nt-bg overflow-hidden">
      <div className="absolute inset-0">
        <BackgroundParticles mode={VISUAL_MODE} />
      </div>

      <div className="relative z-10 flex flex-col h-full">
        <Header status={headerStatus} statusDim={headerDim} />

        <div className="flex-1 flex min-h-0 relative">
          <aside className="absolute left-0 top-0 z-20 w-[300px] pointer-events-none">
            <div className="pointer-events-auto">
              {(monitorState === "running" || monitorState === "complete") && !cinematic ? (
                <AgentFocusPanel
                  nodes={projectGraph.nodes}
                  signal={displaySignal}
                  isCurrent={!!activeSignal}
                  evidenceCount={evidence.length}
                />
              ) : null}
            </div>
          </aside>

          <main className="flex-1 relative min-w-0">
            {showGraph ? (
              <ReactFlowProvider key={projectGraph.id}>
                <GraphCanvas
                  nodes={viewGraph.nodes}
                  edges={viewGraph.edges}
                  nodeStates={nodeStates}
                  edgeStates={edgeStates}
                  filters={graphFilters}
                  visualMode={VISUAL_MODE}
                  focusNodeId={displaySignal?.target}
                  focusSourceId={displaySignal?.source}
                  evidenceIds={evidence}
                  autoFit={monitorState === "running" || monitorState === "complete"}
                  projection={projection}
                  selectedAgentId={effectiveSelectedAgentId}
                  selectedRole={effectiveSelectedRole}
                  selectedNodeId={
                    selectedDetail?.kind === "node" ? selectedDetail.id : undefined
                  }
                  selectedEdgeId={
                    selectedDetail?.kind === "edge" ? selectedDetail.id : undefined
                  }
                  onNodeSelected={(nodeId) => {
                    setSelectedSignalId(undefined);
                    setSelectedDetail(nodeId ? { kind: "node", id: nodeId } : undefined);
                  }}
                  onEdgeSelected={(edgeId) => {
                    setSelectedSignalId(undefined);
                    setSelectedDetail({ kind: "edge", id: edgeId });
                  }}
                />
              </ReactFlowProvider>
            ) : (
              <EmptyLiveState />
            )}

            {(monitorState === "running" || monitorState === "complete") && !cinematic && (
              <div className="absolute top-8 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
                <div className="flex items-center gap-3">
                  {GRAPH_PROJECTIONS.map((item) => {
                    const active = projection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setProjection(item.id)}
                        className={`text-[10.5px] uppercase tracking-[0.16em] transition-colors ${
                          active
                            ? "text-nt-bright"
                            : "text-nt-dim hover:text-nt-mid"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                <RoleFilter
                  selectedRole={effectiveSelectedRole}
                  currentRole={currentRole}
                  onRoleSelected={setSelectedRole}
                />
                <LineLegend />
              </div>
            )}

            {finalAnswerActive && (
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none animate-final-flash"
                style={{
                  background:
                    "radial-gradient(circle at 50% 55%, rgba(244,239,228,0.08), transparent 60%)",
                }}
              />
            )}

            <GraphControls
              monitorState={monitorState}
              graphName={projectGraph.name}
              isLocalGraph={projectGraph.source === "local"}
              fileCount={projectGraph.fileCount}
              isLiveGraph={isLiveAgentGraph(projectGraph)}
              onFolderSelected={(files) => {
                const nextGraph = buildLocalProjectGraph(files);
                setProjectGraph(nextGraph);
                setCurrentTime(WAITING_TIME);
                setMonitorState("pending");
                setProjection("focus");
                setSelectedAgentId(undefined);
                setSelectedRole(undefined);
                setSelectedDetail(undefined);
                setSelectedSignalId(undefined);
              }}
              onWatchAgent={() => {
                void showLiveAgentGraph();
              }}
              onConfirmLoad={() => {
                setCurrentTime(
                  isLiveAgentGraph(projectGraph) ? projectGraph.totalDuration : 0
                );
                setMonitorState("running");
              }}
              onReplay={() => {
                setCurrentTime(
                  isLiveAgentGraph(projectGraph) ? projectGraph.totalDuration : 0
                );
                setMonitorState("running");
              }}
            />

            {cinematic && (
              <button
                type="button"
                onClick={() => setCinematic(false)}
                className="absolute top-6 right-6 z-30 text-[10px] uppercase tracking-[0.16em] text-nt-dim transition-colors hover:text-nt-bright"
              >
                Exit · Esc
              </button>
            )}
          </main>

          <aside className="absolute right-0 top-0 z-20 w-[300px] pointer-events-none">
            <div className="pointer-events-auto">
              {(monitorState === "running" || monitorState === "complete") && !cinematic ? (
                <EvidencePanel
                  nodes={viewGraph.nodes}
                  edges={viewGraph.edges}
                  evidence={evidence}
                  finalAnswer={finalAnswerActive}
                  signals={roleScopedSignals}
                  agents={agents}
                  graphName={projectGraph.name}
                  selectedAgentId={effectiveSelectedAgentId}
                  selectedRole={selectedRole}
                  selectedSignalId={selectedSignalId}
                  reviewMode={!!selectedSignalId}
                  onStepSelected={selectStep}
                  onResumeLive={resumeLive}
                  currentTime={reviewTime}
                  sessionId={projectGraph.sessionId ?? projectGraph.id}
                />
              ) : null}
              <DetailDrawer
                selection={selectedDetail}
                nodes={viewGraph.nodes}
                edges={viewGraph.edges}
                signals={roleScopedSignals}
                agents={agents}
                onClose={() => {
                  setSelectedDetail(undefined);
                  setSelectedSignalId(undefined);
                }}
              />
            </div>
          </aside>
        </div>

        {showBottomBar && (
          <div className="nt-bottom-readability shrink-0 border-t border-nt-bright/[0.1]">
            {(monitorState === "running" || monitorState === "complete") && (
              <ReplayTransport
                summary={runSummary}
                showScrubber={!liveGraph}
                isLive={liveGraph}
                paused={paused}
                isComplete={monitorState === "complete"}
                currentTime={Math.max(0, currentTime)}
                totalDuration={projectGraph.totalDuration}
                signals={projectGraph.signals}
                onTogglePlay={togglePlay}
                onSeek={seekTo}
                onCinematic={() => setCinematic(true)}
              />
            )}
            {agents.length > 0 && (
              <AgentBar
                agents={agents}
                selectedAgentId={effectiveSelectedAgentId}
                onAgentSelected={setSelectedAgentId}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyLiveState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="max-w-[320px] text-center">
        <div className="mx-auto mb-5 h-1.5 w-1.5 rounded-full bg-nt-mid/70 shadow-[0_0_18px_rgba(236,230,215,0.45)]" />
        <div className="text-[10px] uppercase tracking-[0.24em] text-nt-dim">
          Waiting for agent activity
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-nt-mid">
          Start working in Codex, Claude, Gemini, Cursor, Cline, or Roo Code.
          NeuroTrail will appear when a live local session is detected.
        </p>
      </div>
    </div>
  );
}

function formatClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" + r : r}`;
}

function SummaryStat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col leading-none">
      <span
        className={`nt-mono-num text-[13px] ${muted ? "text-nt-dim" : "text-nt-bright"}`}
      >
        {value}
      </span>
      <span className="mt-1 text-[8.5px] uppercase tracking-[0.14em] text-nt-faint">
        {label}
      </span>
    </div>
  );
}

function ReplayTransport({
  summary,
  showScrubber,
  isLive,
  paused,
  isComplete,
  currentTime,
  totalDuration,
  signals,
  onTogglePlay,
  onSeek,
  onCinematic,
}: {
  summary: RunSummary;
  showScrubber: boolean;
  isLive: boolean;
  paused: boolean;
  isComplete: boolean;
  currentTime: number;
  totalDuration: number;
  signals: NeuroSignal[];
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onCinematic: () => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const progress = totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;
  const ticks = useMemo(
    () =>
      signals
        .filter((signal) => !signal.id.endsWith("-live-summary"))
        .map((signal) => ({
          id: signal.id,
          left:
            totalDuration > 0
              ? Math.min(100, (signal.time / totalDuration) * 100)
              : 0,
          color: roleColor(signal.role),
        })),
    [signals, totalDuration]
  );

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeek(ratio * totalDuration);
  };

  const playLabel = isComplete ? "Replay" : paused ? "Play" : "Pause";

  return (
    <div className="flex items-center gap-5 px-5 pt-3 pb-0.5">
      <div className="flex items-center gap-4 shrink-0">
        <SummaryStat label="est. cost" value={formatCostUsd(summary.estimatedCostUsd)} />
        <SummaryStat label="tokens" value={formatTokens(summary.totalTokens)} />
        <SummaryStat label="steps" value={String(summary.steps)} />
        <SummaryStat label="files" value={String(summary.filesTouched)} />
        <SummaryStat
          label="est. waste"
          value={formatPct(summary.wasteCostPct ?? summary.wastePct)}
          muted={(summary.wasteCostPct ?? summary.wastePct) < 0.005}
        />
      </div>

      {showScrubber ? (
        <>
          <button
            type="button"
            onClick={onTogglePlay}
            className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-nt-mid transition-colors hover:text-nt-bright"
          >
            {playLabel}
          </button>
          <div
            ref={trackRef}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              seekFromClientX(event.clientX);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) seekFromClientX(event.clientX);
            }}
            className="relative flex-1 h-5 flex items-center cursor-pointer"
          >
            <div className="absolute inset-x-0 h-px rounded bg-nt-bright/15" />
            {ticks.map((tick) => (
              <span
                key={tick.id}
                aria-hidden
                className="absolute top-1/2 h-[6px] w-px -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${tick.left}%`, background: tick.color, opacity: 0.45 }}
              />
            ))}
            <div
              className="absolute h-px rounded"
              style={{ width: `${progress * 100}%`, background: "rgba(244,239,228,0.85)" }}
            />
            <span
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${progress * 100}%`,
                background: "#F4EFE4",
                boxShadow: "0 0 8px rgba(244,239,228,0.6)",
              }}
            />
          </div>
          <span className="nt-mono-num shrink-0 whitespace-nowrap text-[10.5px] text-nt-dim">
            {formatClock(currentTime)} / {formatClock(totalDuration)}
          </span>
        </>
      ) : (
        <div className="flex flex-1 items-center gap-2 text-[10.5px] text-nt-dim">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: isLive ? "#9FB89A" : "#9B9284" }}
          />
          {isLive ? "following live session" : "replay"}
        </div>
      )}

      <button
        type="button"
        onClick={onCinematic}
        className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-nt-dim transition-colors hover:text-nt-bright"
      >
        Cinematic
      </button>
    </div>
  );
}

function LineLegend() {
  return (
    <div className="flex items-center gap-3 text-[9px] uppercase tracking-[0.13em] text-nt-dim">
      <span>Lines</span>
      <LineLegendItem label="Structure" kind="structure" />
      <LineLegendItem label="Agent trail" kind="trail" />
      <LineLegendItem label="Waste memory" kind="compressed" />
    </div>
  );
}

function LineLegendItem({
  label,
  kind,
}: {
  label: string;
  kind: "structure" | "trail" | "compressed";
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg
        aria-hidden
        width="26"
        height="8"
        viewBox="0 0 26 8"
        className="overflow-visible"
      >
        <line
          x1="1"
          y1="4"
          x2="25"
          y2="4"
          stroke={kind === "structure" ? "rgba(111,123,130,0.55)" : "rgba(236,230,215,0.52)"}
          strokeWidth={kind === "trail" ? 1.35 : 1}
          strokeLinecap="round"
          strokeDasharray={kind === "compressed" ? "2 5" : undefined}
        />
        {kind === "trail" && (
          <circle cx="17" cy="4" r="2.1" fill="rgba(244,239,228,0.95)" />
        )}
      </svg>
      <span>{label}</span>
    </span>
  );
}

function RoleFilter({
  selectedRole,
  currentRole,
  onRoleSelected,
}: {
  selectedRole?: AgentRole;
  currentRole?: AgentRole;
  onRoleSelected: (role: AgentRole | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-[9.5px] uppercase tracking-[0.14em]">
      <span className="text-nt-dim">Roles</span>
      {ROLE_FILTERS.map((item) => {
        const active = selectedRole === item.id;
        const isCurrentRole = !!item.id && item.id === currentRole;
        const color = roleColor(item.id);
        return (
          <button
            key={item.id ?? "all"}
            type="button"
            onClick={() => onRoleSelected(item.id)}
            className={`flex items-center gap-1.5 transition-colors ${
              active || (!selectedRole && !item.id)
                ? "text-nt-bright"
                : "text-nt-dim hover:text-nt-mid"
            }`}
          >
            {item.id && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: active || isCurrentRole ? color : "rgba(236,230,215,0.42)",
                  boxShadow: active || isCurrentRole ? `0 0 6px ${color}` : "none",
                }}
              />
            )}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
