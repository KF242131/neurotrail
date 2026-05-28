import type { NeuroEdgeData } from "../types";
import type {
  EdgeRuntimeState,
  NeuroSignal,
  NodeRuntimeState,
  SignalAction,
} from "../types";

export const ACTIVE_WINDOW = 1.5;
// How long a freshly-traversed edge keeps glowing before fully fading.
// Longer = the trail behind the moving dot stays visible longer.
export const TRAIL_WINDOW = 7.5;
export const MEMORY_RESIDUE = 0.18;

function directoryIdsForPath(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return ["dir:project-root"];

  const dirs = ["dir:project-root"];
  let current = "";
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current ? `${current}/${parts[index]}` : parts[index];
    dirs.push(`dir:${current}`);
  }
  return dirs;
}

function directoryIdsForNode(id: string): string[] {
  if (id.startsWith("file:")) return directoryIdsForPath(id.slice(5));
  if (!id.startsWith("dir:")) return [];

  const path = id.slice(4);
  if (path === "project-root") return [];

  const parts = path.split("/").filter(Boolean);
  const dirs = ["dir:project-root"];
  let current = "";
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current ? `${current}/${parts[index]}` : parts[index];
    dirs.push(`dir:${current}`);
  }
  return dirs;
}

function primaryDirectoryIdForNode(id: string): string | undefined {
  if (id.startsWith("dir:")) return id;

  const directories = directoryIdsForNode(id);
  return directories.at(-1);
}

function agentNodeIdForSignal(signal: NeuroSignal) {
  if (signal.agentId) return `agent:${signal.agentId}`;
  if (signal.source?.startsWith("agent:")) return signal.source;
  return "agent:orchestrator";
}

function branchPairsForNode(
  id: string,
  agentNodeId = "agent:orchestrator"
): Array<[string, string]> {
  const directories = directoryIdsForNode(id);
  if (directories.length === 0) return [];
  const pairs: Array<[string, string]> = [];
  pairs.push([agentNodeId, directories[0]]);
  for (let index = 1; index < directories.length; index += 1) {
    pairs.push([directories[index - 1], directories[index]]);
  }
  pairs.push([directories[directories.length - 1], id]);
  return pairs;
}

function jumpPairForSignal(signal: NeuroSignal): [string, string] | undefined {
  if (!signal.source) return undefined;

  const sourceDirectory = primaryDirectoryIdForNode(signal.source);
  const targetDirectory = primaryDirectoryIdForNode(signal.target);
  if (!sourceDirectory || !targetDirectory) return undefined;
  if (sourceDirectory === targetDirectory) return undefined;

  return [sourceDirectory, targetDirectory];
}

function statusFromAction(action: SignalAction): NodeRuntimeState["status"] {
  switch (action) {
    case "test_failed":
      return "error";
    case "test_passed":
      return "passed";
    case "edit_file":
      return "edited";
    case "write_text":
      return "active";
    case "decision":
    case "final_answer":
      return "decision";
    case "read_file":
    case "open_symbol":
    case "search":
    case "run_command":
    case "observe_output":
    case "think":
      return "active";
  }
}

export function findActiveSignal(
  signals: NeuroSignal[],
  currentTime: number
): NeuroSignal | undefined {
  let active: NeuroSignal | undefined;
  for (const s of signals) {
    if (s.time > currentTime + 0.001) break;
    if (currentTime - s.time <= ACTIVE_WINDOW) {
      active = s;
    }
  }
  return active;
}

export function findLastPastSignal(
  signals: NeuroSignal[],
  currentTime: number
): NeuroSignal | undefined {
  let last: NeuroSignal | undefined;
  for (const s of signals) {
    if (s.time > currentTime + 0.001) break;
    last = s;
  }
  return last;
}

const PERSISTENT_ACTIONS: ReadonlySet<SignalAction> = new Set<SignalAction>([
  "test_failed",
  "test_passed",
  "edit_file",
  "decision",
  "final_answer",
]);

function persistentStatusFor(
  action: SignalAction
): NodeRuntimeState["status"] {
  switch (action) {
    case "test_failed":
      return "error";
    case "test_passed":
      return "passed";
    case "edit_file":
      return "edited";
    case "decision":
    case "final_answer":
      return "decision";
    default:
      return "idle";
  }
}

export function computeNodeStates(
  nodeIds: string[],
  signals: NeuroSignal[],
  currentTime: number
): Map<string, NodeRuntimeState> {
  const states = new Map<string, NodeRuntimeState>();
  for (const id of nodeIds) {
    states.set(id, {
      status: "idle",
      activation: 0,
      visitCount: 0,
      isCurrent: false,
    });
  }

  // Last signal whose ACTION targeted this node (for transient/in-window visuals)
  const lastTargetingSignal = new Map<string, NeuroSignal>();
  // Persistent action — only updated by state-changing actions (test_failed/passed/edit/decision/final_answer)
  const persistentAction = new Map<string, SignalAction>();
  // For each directory id, the most recent signal that targeted a DESCENDANT file
  // (not the directory itself). Used for cluster-glow rendering.
  const lastDescendantSignal = new Map<string, NeuroSignal>();

  for (const s of signals) {
    if (s.time > currentTime + 0.001) break;
    const agentNodeId = agentNodeIdForSignal(s);
    const conductorSignal: NeuroSignal = {
      ...s,
      action: "think",
      target: agentNodeId,
      intensity: Math.max(0.72, (s.intensity ?? 0.7) * 0.86),
      reason: "Central orchestration is coordinating the active signal.",
    };
    lastTargetingSignal.set(agentNodeId, conductorSignal);

    if (s.action === "final_answer" && s.evidence) {
      for (const evId of s.evidence) {
        lastTargetingSignal.set(evId, s);
        const prev = persistentAction.get(evId);
        // Don't overwrite a "passed" or "error" status with the bloom
        if (prev !== "test_passed" && prev !== "test_failed") {
          persistentAction.set(evId, "final_answer");
        }
      }
    } else {
      lastTargetingSignal.set(s.target, s);
      if (s.source && s.source !== agentNodeId) {
        const sourceSignal: NeuroSignal = {
          ...s,
          action: "think",
          target: s.source,
          intensity: Math.max(0.42, (s.intensity ?? 0.7) * 0.62),
          reason: "Source node is handing the signal to the next target.",
        };
        lastTargetingSignal.set(s.source, sourceSignal);
        for (const dirId of directoryIdsForNode(s.source)) {
          lastTargetingSignal.set(dirId, sourceSignal);
          if (s.source.startsWith("file:")) {
            lastDescendantSignal.set(dirId, sourceSignal);
          }
        }
      }
      for (const dirId of directoryIdsForNode(s.target)) {
        lastTargetingSignal.set(dirId, s);
        // Only ancestors of an actual FILE node count as "cluster"
        if (s.target.startsWith("file:")) {
          lastDescendantSignal.set(dirId, s);
        }
      }
      if (PERSISTENT_ACTIONS.has(s.action)) {
        persistentAction.set(s.target, s.action);
      }
    }

    // Bump visit count
    const tgt = states.get(s.target);
    if (tgt) tgt.visitCount += 1;
    for (const dirId of directoryIdsForNode(s.target)) {
      const dir = states.get(dirId);
      if (dir) dir.visitCount += 1;
    }
    if (s.source) {
      const src = states.get(s.source);
      if (src) src.visitCount += 1;
    }
    const agent = states.get(agentNodeId);
    if (agent) agent.visitCount += 1;
  }

  for (const id of nodeIds) {
    const st = states.get(id);
    if (!st) continue;
    const last = lastTargetingSignal.get(id);
    if (!last) continue;

    const delta = currentTime - last.time;
    const inWindow = delta < ACTIVE_WINDOW;
    const persistent = persistentAction.get(id);

    if (inWindow) {
      // In-window: transient action visual unless a persistent state owns the node
      if (
        persistent === "test_failed" &&
        last.action !== "test_passed" &&
        last.action !== "edit_file"
      ) {
        st.status = "error";
      } else if (persistent === "test_passed") {
        st.status = "passed";
      } else {
        st.status = statusFromAction(last.action);
      }
    } else if (persistent) {
      st.status = persistentStatusFor(persistent);
    } else {
      st.status = "idle";
    }

    if (inWindow) {
      const factor = Math.max(0, 1 - delta / ACTIVE_WINDOW);
      st.activation = Math.min(
        1,
        factor * Math.max(0.6, last.intensity ?? 0.7)
      );
    } else if (st.visitCount > 0) {
      st.activation = MEMORY_RESIDUE;
    }

    st.lastAction = last.action;
    st.isCurrent = inWindow && last.target === id;

    // Cluster glow: directory has an active descendant file
    const descSignal = lastDescendantSignal.get(id);
    if (descSignal && currentTime - descSignal.time < ACTIVE_WINDOW) {
      st.hasActiveChild = true;
      st.childAction = descSignal.action;
    }
  }

  return states;
}

export function computeEdgeStates(
  edges: NeuroEdgeData[],
  signals: NeuroSignal[],
  currentTime: number
): Map<string, EdgeRuntimeState> {
  const states = new Map<string, EdgeRuntimeState>();
  for (const e of edges) {
    states.set(e.id, { active: false, age: Infinity, visited: false });
  }

  const edgeByPair = new Map<string, NeuroEdgeData>();
  const pairKey = (source: string, target: string, agentId?: string) =>
    `${agentId ?? "*"}:${source}->${target}`;
  for (const edge of edges) {
    edgeByPair.set(pairKey(edge.source, edge.target, edge.agentId), edge);
    if (!edge.agentId) {
      edgeByPair.set(pairKey(edge.source, edge.target), edge);
    }
  }

  const markEdge = (
    source: string,
    target: string,
    delta: number,
    signal?: NeuroSignal
  ) => {
    if (delta >= TRAIL_WINDOW) return;
    const match =
      edgeByPair.get(pairKey(source, target, signal?.agentId)) ??
      edgeByPair.get(pairKey(source, target));
    if (!match) return;
    const st = states.get(match.id);
    if (!st) return;
    const isNewestForEdge = delta <= st.age;
    st.visited = true;
    st.age = Math.min(st.age, delta);
    if (isNewestForEdge) {
      st.role = signal?.role;
      st.action = signal?.action;
    }
    if (delta < ACTIVE_WINDOW) {
      st.active = true;
    }
  };

  for (const s of signals) {
    if (s.time > currentTime + 0.001) break;
    const delta = currentTime - s.time;
    const agentNodeId = agentNodeIdForSignal(s);

    if (s.target !== agentNodeId) {
      markEdge(agentNodeId, s.target, delta, s);
    }
    if (s.source) {
      markEdge(s.source, s.target, delta, s);
      for (const [source, target] of branchPairsForNode(s.source, agentNodeId)) {
        markEdge(source, target, delta, s);
      }
    }
    for (const [source, target] of branchPairsForNode(s.target, agentNodeId)) {
      markEdge(source, target, delta, s);
    }
    const jumpPair = jumpPairForSignal(s);
    if (jumpPair) {
      markEdge(jumpPair[0], jumpPair[1], delta, s);
      markEdge(jumpPair[1], jumpPair[0], delta, s);
    }
  }

  // Final answer also highlights all evidence-path edges briefly
  const last = findLastPastSignal(signals, currentTime);
  if (
    last &&
    last.action === "final_answer" &&
    last.evidence &&
    currentTime - last.time < ACTIVE_WINDOW
  ) {
    const evSet = new Set(last.evidence);
    for (const e of edges) {
      if (evSet.has(e.source) && evSet.has(e.target)) {
        const st = states.get(e.id);
        if (st) {
          st.active = true;
          st.visited = true;
          st.age = currentTime - last.time;
        }
      }
    }
  }

  return states;
}

export function getEvidence(
  signals: NeuroSignal[],
  currentTime: number
): string[] {
  // Pull the most recent decision/final_answer evidence list (cumulative)
  let evidence: string[] = [];
  for (const s of signals) {
    if (s.time > currentTime + 0.001) break;
    if (
      (s.action === "decision" || s.action === "final_answer") &&
      s.evidence
    ) {
      evidence = s.evidence;
    }
  }
  return evidence;
}
