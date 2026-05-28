import type { AgentTelemetry } from "../types";

const ROLE_TOTALS = {
  orchestration: 6200,
  exploration: 4800,
  graphDesign: 7600,
  interfaceDesign: 5300,
  verification: 3100,
};

export function getAgentTelemetry(currentTime: number): AgentTelemetry[] {
  const progress = Math.max(0, Math.min(1, currentTime / 33.5));

  return [
    {
      id: "role:orchestration",
      name: "Orchestration",
      adapter: "Central conductor",
      model: "agent-agnostic",
      role: "Plans task flow and routes signals",
      status: "active",
      tokenBudget: 8000,
      tokensUsed: Math.max(720, Math.round(ROLE_TOTALS.orchestration * progress)),
      accent: "#8FE8F7",
    },
    {
      id: "role:exploration",
      name: "Code exploration",
      adapter: "File and symbol reader",
      model: "read/search role",
      role: "Maps real NeuroTrail files",
      status: "active",
      tokenBudget: 6500,
      tokensUsed: Math.round(ROLE_TOTALS.exploration * Math.min(1, progress * 0.92)),
      accent: "#8FE8F7",
    },
    {
      id: "role:graph-design",
      name: "Graph design",
      adapter: "Neural layout role",
      model: "spatial role",
      role: "Builds layers, nodes, and light paths",
      status: "active",
      tokenBudget: 9000,
      tokensUsed: Math.round(ROLE_TOTALS.graphDesign * Math.min(1, progress * 0.78)),
      accent: "#A7A3D9",
    },
    {
      id: "role:interface",
      name: "Interface polish",
      adapter: "Panel and hierarchy role",
      model: "visual role",
      role: "Balances controls, panels, and density",
      status: "ready",
      tokenBudget: 7000,
      tokensUsed: Math.round(ROLE_TOTALS.interfaceDesign * Math.min(1, progress * 0.58)),
      accent: "#B8BED0",
    },
    {
      id: "role:verification",
      name: "Verification",
      adapter: "Build and replay role",
      model: "quality role",
      role: "Checks build, replay, and console",
      status: "planned",
      tokenBudget: 5000,
      tokensUsed: Math.round(ROLE_TOTALS.verification * Math.min(1, progress * 0.44)),
      accent: "#9CB6D6",
    },
  ];
}
