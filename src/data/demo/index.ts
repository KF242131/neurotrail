import type {
  AgentRole,
  AgentTelemetry,
  NeuroEdgeData,
  NeuroEdgeType,
  NeuroNodeKind,
  NeuroSignal,
  NeuroSignalCategory,
  PositionedNeuroNode,
  SignalAction,
} from "../../types";
import { agentColor } from "../../lib/agentRegistry.js";
import {
  BRANCH_ID,
  DEMO_AGENTS,
  DEMO_STEPS,
  DEMO_TARGETS,
  ROOT_ID,
  TOTAL_DURATION,
  TRANSCRIPT_ID,
  type DemoAgentId,
  type DemoTarget,
} from "./scenario";

export { TOTAL_DURATION };

type LayoutNode = PositionedNeuroNode;

const TAU = Math.PI * 2;

function sanitizeId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

function basename(path: string) {
  return path.split("/").filter(Boolean).pop() || path;
}

function dirId(path: string) {
  return path ? `dir:${path}` : ROOT_ID;
}

function parentPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function directoryPathsForFile(path: string) {
  const parts = path.split("/").filter(Boolean);
  const dirs: string[] = [];
  let current = "";
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current ? `${current}/${parts[index]}` : parts[index];
    dirs.push(current);
  }
  return dirs;
}

function orbitPoint(radius: number, angle: number) {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function edgeTypeFor(action: SignalAction): NeuroEdgeType {
  if (action === "edit_file" || action === "write_text") return "edits";
  if (action === "test_passed" || action === "test_failed") return "tests";
  if (action === "run_command") return "runs";
  if (action === "decision" || action === "final_answer") return "decides";
  return "reads";
}

function categoryFor(step: (typeof DEMO_STEPS)[number]): NeuroSignalCategory {
  return (
    step.category ??
    (step.action === "decision" || step.action === "final_answer"
      ? "handoff"
      : "trail")
  );
}

function ringForNode(node: LayoutNode) {
  const depth = node.depth ?? 2;
  if (node.id === TRANSCRIPT_ID) return 0;
  if (node.type === "directory") return Math.max(0, Math.min(2, depth - 1));
  if (node.type === "command") return 1;
  if (node.type === "artifact" || node.type === "config") return Math.min(3, depth);
  return Math.max(1, Math.min(4, depth - 1));
}

function radialSort(a: LayoutNode, b: LayoutNode) {
  const depth = (a.depth ?? 2) - (b.depth ?? 2);
  if (depth !== 0) return depth;
  const type = a.type.localeCompare(b.type);
  if (type !== 0) return type;
  return (a.path ?? a.label ?? a.id).localeCompare(b.path ?? b.label ?? b.id);
}

function placeOrbit(node: LayoutNode | undefined, radius: number, angle: number) {
  if (!node) return;
  node.position = orbitPoint(radius, angle);
}

function applyProductionLayout(nodes: LayoutNode[]) {
  const branch = nodes.find((node) => node.id === BRANCH_ID);
  const root = nodes.find((node) => node.id === ROOT_ID);
  const transcript = nodes.find((node) => node.id === TRANSCRIPT_ID);

  if (branch) branch.position = { x: 0, y: 0 };
  placeOrbit(root, 205, Math.PI * 0.88);
  placeOrbit(transcript, 205, Math.PI * 0.34);

  DEMO_AGENTS.forEach((agent, index) => {
    const node = nodes.find((item) => item.id === `agent:${agent.id}`);
    const angle = -Math.PI * 0.92 + (TAU * index) / DEMO_AGENTS.length;
    placeOrbit(node, 132, angle);
  });

  const specialIds = new Set([
    BRANCH_ID,
    ROOT_ID,
    TRANSCRIPT_ID,
    ...DEMO_AGENTS.map((agent) => `agent:${agent.id}`),
  ]);
  const byRing = new Map<number, LayoutNode[]>();
  for (const node of nodes) {
    if (specialIds.has(node.id)) continue;
    const ring = ringForNode(node);
    const bucket = byRing.get(ring) ?? [];
    bucket.push(node);
    byRing.set(ring, bucket);
  }

  const ringRadii = [285, 385, 500, 615, 730];
  for (const ring of [...byRing.keys()].sort((a, b) => a - b)) {
    const bucket = [...(byRing.get(ring) ?? [])].sort(radialSort);
    const radius = ringRadii[ring] ?? ringRadii.at(-1)! + ring * 82;
    const offset = -Math.PI * 0.72 + ring * 0.33;
    bucket.forEach((node, index) => {
      const angle = offset + (TAU * index) / Math.max(1, bucket.length);
      const breathingRoom = Math.sin(index * 1.7 + ring) * 18;
      node.position = orbitPoint(radius + breathingRoom, angle);
    });
  }
}

const targetMeta = new Map(DEMO_TARGETS.map((target) => [target.id, target]));
const rolesByTarget = new Map<string, Set<AgentRole>>();
for (const step of DEMO_STEPS) {
  const roles = rolesByTarget.get(step.target) ?? new Set<AgentRole>();
  roles.add(step.role);
  rolesByTarget.set(step.target, roles);
}

const directoryPaths = new Set<string>();
for (const target of DEMO_TARGETS) {
  if (!target.path) continue;
  for (const dir of directoryPathsForFile(target.path)) {
    directoryPaths.add(dir);
  }
}

function nodeFromTarget(target: DemoTarget): LayoutNode {
  const roles = rolesByTarget.get(target.id);
  return {
    id: target.id,
    label: target.label,
    path: target.path,
    type: target.type,
    kind: target.type === "artifact" || target.type === "decision" ? "memory" : "project",
    agentId: target.owner,
    activation: 0,
    visitCount: 0,
    status: "idle",
    position: { x: 0, y: 0 },
    depth: target.depth ?? (target.path ? target.path.split("/").filter(Boolean).length + 1 : 2),
    prominence:
      target.prominence ??
      (target.path && target.path.split("/").length <= 2 ? "branch" : "micro"),
    roles: roles ? [...roles] : undefined,
    description: target.description,
  };
}

function specialNode(
  id: string,
  label: string,
  kind: NeuroNodeKind,
  description: string
): LayoutNode {
  return {
    id,
    label,
    type: id === ROOT_ID ? "directory" : id === TRANSCRIPT_ID ? "artifact" : "decision",
    kind,
    activation: 0,
    visitCount: 0,
    status: "idle",
    path: id === ROOT_ID ? "." : id === TRANSCRIPT_ID ? ".agents/session.jsonl" : undefined,
    position: { x: 0, y: 0 },
    depth: 1,
    prominence: "core",
    roles: id === BRANCH_ID ? ["orchestrator"] : undefined,
    description,
  };
}

const demoNodeMap = new Map<string, LayoutNode>();
for (const agent of DEMO_AGENTS) {
  demoNodeMap.set(`agent:${agent.id}`, {
    id: `agent:${agent.id}`,
    label: agent.name,
    type: "agent",
    kind: "agent",
    agentId: agent.id,
    activation: 0,
    visitCount: 0,
    status: "idle",
    position: { x: 0, y: 0 },
    depth: 0,
    prominence: "core",
    description: agent.role,
  });
}
demoNodeMap.set(ROOT_ID, specialNode(ROOT_ID, "PR workspace", "project", "Rate-limit PR workspace"));
demoNodeMap.set(BRANCH_ID, specialNode(BRANCH_ID, "PR #428", "memory", "Central shared PR decision point"));
demoNodeMap.set(TRANSCRIPT_ID, specialNode(TRANSCRIPT_ID, "prompt ladder", "project", "Combined agent session log"));

for (const path of [...directoryPaths].sort()) {
  const depth = path.split("/").length + 1;
  demoNodeMap.set(dirId(path), {
    id: dirId(path),
    label: basename(path),
    type: "directory",
    kind: "project",
    path,
    activation: 0,
    visitCount: 0,
    status: "idle",
    position: { x: 0, y: 0 },
    depth,
    prominence: depth <= 3 ? "branch" : "micro",
    description: `Directory: ${path}`,
  });
}

for (const target of DEMO_TARGETS) {
  demoNodeMap.set(target.id, nodeFromTarget(target));
}

const layoutNodes = [...demoNodeMap.values()];
applyProductionLayout(layoutNodes);

export const demoNodes: PositionedNeuroNode[] = layoutNodes;

export const demoSignals: NeuroSignal[] = DEMO_STEPS.map((step, index) => ({
  id: `s${index}`,
  time: step.t,
  action: step.action,
  agentId: step.agent,
  source: BRANCH_ID,
  target: step.target,
  intensity: step.category === "waste" ? 0.58 : 0.84,
  reason: step.reason,
  role: step.role,
  category: categoryFor(step),
  evidence: step.evidence,
}));

const structureEdges: NeuroEdgeData[] = [
  {
    id: "transcript-branch",
    source: TRANSCRIPT_ID,
    target: BRANCH_ID,
    type: "reads",
    kind: "structure",
    weight: 0.42,
  },
  ...DEMO_AGENTS.map((agent) => ({
    id: `agent-branch-${agent.id}`,
    source: BRANCH_ID,
    target: `agent:${agent.id}`,
    type: "decides" as const,
    kind: "recommendation" as const,
    agentId: agent.id,
    weight: 0.5,
    category: "context" as const,
  })),
];

for (const path of [...directoryPaths].sort()) {
  structureEdges.push({
    id: `struct-dir-${sanitizeId(path)}`,
    source: dirId(parentPath(path)),
    target: dirId(path),
    type: "imports",
    kind: "structure",
    weight: path.split("/").length <= 2 ? 0.72 : 0.36,
  });
}

for (const target of DEMO_TARGETS) {
  if (!target.path) continue;
  structureEdges.push({
    id: `struct-file-${sanitizeId(target.path)}`,
    source: dirId(parentPath(target.path)),
    target: target.id,
    type: target.type === "test" ? "tests" : "reads",
    kind: "structure",
    weight: target.prominence === "branch" ? 0.5 : 0.32,
  });
}

const trailEdges: NeuroEdgeData[] = [];
const trailByPair = new Map<string, NeuroEdgeData>();
for (const step of DEMO_STEPS) {
  const key = `${BRANCH_ID}>${step.target}>${step.agent}`;
  const existing = trailByPair.get(key);
  if (existing) {
    existing.weight += 0.18;
    continue;
  }

  const edge: NeuroEdgeData = {
    id: `trail-${trailEdges.length}-${sanitizeId(key)}`,
    source: BRANCH_ID,
    target: step.target,
    type: edgeTypeFor(step.action),
    kind: step.category === "waste" ? "memory" : "trail",
    agentId: step.agent,
    weight: 1,
    category: categoryFor(step),
    role: step.role,
  };
  trailByPair.set(key, edge);
  trailEdges.push(edge);
}

export const demoEdges: NeuroEdgeData[] = [...structureEdges, ...trailEdges];

export function getAgentTelemetry(currentTime: number): AgentTelemetry[] {
  const progress = Math.max(0, Math.min(1, currentTime / TOTAL_DURATION));
  return DEMO_AGENTS.map((agent) => {
    const touched = DEMO_STEPS.filter(
      (step) => step.agent === agent.id && step.t <= currentTime
    );
    const roleCounts: Partial<Record<AgentRole, number>> = {};
    for (const step of touched) {
      roleCounts[step.role] = (roleCounts[step.role] ?? 0) + 1;
    }
    const latest = touched.at(-1);
    return {
      id: agent.id,
      name: agent.name,
      adapter: agent.adapter,
      model: agent.model,
      role: latest?.reason ?? agent.role,
      status: "active",
      tokenBudget: Math.round(agent.tokens * 1.34),
      tokensUsed: Math.round(agent.tokens * progress),
      accent: agentColor(agent.id as DemoAgentId),
      currentFocus: latest?.target ? targetMeta.get(latest.target)?.label : undefined,
      currentRole: latest?.role,
      roleCounts,
      touchedCount: new Set(touched.map((step) => step.target)).size,
      evidenceCount: touched.reduce(
        (total, step) => total + (step.evidence?.length ?? 0),
        0
      ),
    };
  });
}
