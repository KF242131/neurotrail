import type {
  AgentTelemetry,
  NeuroEdgeData,
  NeuroEdgeType,
  NeuroNodeType,
  NeuroSignal,
  NeuroSignalCategory,
  PositionedNeuroNode,
  SignalAction,
} from "../../types";
import { agentColor } from "../../lib/agentRegistry.js";
import { DEMO_AGENTS, DEMO_STEPS, TOTAL_DURATION } from "./scenario";

export { TOTAL_DURATION };

// Clean, deterministic layout: file/command nodes sit on a ring, the three agent
// nodes form a tight cluster at the center. No hand-placed coordinates — the
// shape stays balanced however the scenario changes.
function ring(index: number, count: number, radius: number, startDeg = -90) {
  const angle = ((startDeg + (360 / count) * index) * Math.PI) / 180;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

const pathOf = (id: string) => id.replace(/^(file|cmd):/, "");
const labelOf = (id: string) => {
  const p = pathOf(id);
  return p.split("/").pop() || p;
};
function nodeTypeFor(id: string): NeuroNodeType {
  if (id.startsWith("cmd:")) return "command";
  if (id.includes(".test.")) return "test";
  return "file";
}
function edgeTypeFor(action: SignalAction): NeuroEdgeType {
  if (action === "edit_file" || action === "write_text") return "edits";
  if (action === "run_command" || action === "test_passed" || action === "test_failed") return "runs";
  if (action === "decision" || action === "final_answer") return "decides";
  return "reads";
}

// Targets in first-appearance order so the ring layout is stable.
const targetOrder: string[] = [];
for (const step of DEMO_STEPS) {
  if (!targetOrder.includes(step.target)) targetOrder.push(step.target);
}

const fileNodes: PositionedNeuroNode[] = targetOrder.map((id, i) => ({
  id,
  label: labelOf(id),
  path: id.startsWith("file:") ? pathOf(id) : undefined,
  type: nodeTypeFor(id),
  activation: 0,
  visitCount: 0,
  position: ring(i, targetOrder.length, 300),
}));

const agentNodes: PositionedNeuroNode[] = DEMO_AGENTS.map((agent, i) => ({
  id: `agent:${agent.id}`,
  label: agent.name,
  type: "agent",
  kind: "agent",
  agentId: agent.id,
  activation: 0,
  visitCount: 0,
  position: ring(i, DEMO_AGENTS.length, 72),
}));

export const demoNodes: PositionedNeuroNode[] = [...agentNodes, ...fileNodes];

export const demoSignals: NeuroSignal[] = DEMO_STEPS.map((step, i) => {
  const category: NeuroSignalCategory =
    step.category ?? (step.action === "decision" || step.action === "final_answer" ? "handoff" : "trail");
  return {
    id: `s${i}`,
    time: step.t,
    action: step.action,
    agentId: step.agent,
    source: `agent:${step.agent}`,
    target: step.target,
    intensity: 0.82,
    reason: step.reason,
    role: step.role,
    category,
    evidence: step.evidence,
  };
});

// One structure edge per (agent → target), coloured by agentId so each AI's
// reach across the codebase is visible at a glance.
const seenEdge = new Set<string>();
export const demoEdges: NeuroEdgeData[] = [];
for (const step of DEMO_STEPS) {
  const source = `agent:${step.agent}`;
  const key = `${source}>${step.target}`;
  if (seenEdge.has(key)) continue;
  seenEdge.add(key);
  demoEdges.push({
    id: `e${demoEdges.length}`,
    source,
    target: step.target,
    type: edgeTypeFor(step.action),
    kind: "trail",
    agentId: step.agent,
    weight: 1,
  });
}

export function getAgentTelemetry(currentTime: number): AgentTelemetry[] {
  const progress = Math.max(0, Math.min(1, currentTime / TOTAL_DURATION));
  return DEMO_AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    adapter: agent.adapter,
    model: agent.model,
    role: agent.role,
    status: "active",
    tokenBudget: Math.round(agent.tokens * 1.4),
    tokensUsed: Math.round(agent.tokens * progress),
    accent: agentColor(agent.id),
  }));
}
