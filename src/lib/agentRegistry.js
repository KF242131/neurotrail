export const SUPPORTED_AGENT_IDS = [
  "codex",
  "claude",
  "gemini",
  "cursor",
  "cline",
  "roo",
  "unknown",
];

export const AGENT_REGISTRY = {
  codex: {
    id: "codex",
    label: "Codex",
    accent: "#7DDCFF",
    tokenSource: "codex token_count",
  },
  claude: {
    id: "claude",
    label: "Claude",
    accent: "#C9B0FF",
    tokenSource: "claude message.usage",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    accent: "#9FE3B8",
    tokenSource: "gemini transcript",
  },
  cursor: {
    id: "cursor",
    label: "Cursor",
    accent: "#8FB7FF",
    tokenSource: "cursor transcript",
  },
  cline: {
    id: "cline",
    label: "Cline",
    accent: "#F0B879",
    tokenSource: "cline transcript",
  },
  roo: {
    id: "roo",
    label: "Roo Code",
    accent: "#F29BC2",
    tokenSource: "roo transcript",
  },
  unknown: {
    id: "unknown",
    label: "Unknown agent",
    accent: "#D8D2C4",
    tokenSource: "unknown transcript",
  },
};

export function isSupportedAgentId(agentId) {
  return SUPPORTED_AGENT_IDS.includes(agentId);
}

export function agentConfig(agentId) {
  return AGENT_REGISTRY[agentId] ?? AGENT_REGISTRY.unknown;
}

export function agentLabel(agentId) {
  return agentConfig(agentId).label;
}

export function agentColor(agentId) {
  return agentConfig(agentId).accent;
}

export function agentTokenSource(agentId) {
  return agentConfig(agentId).tokenSource;
}
