export type AgentId =
  | "codex"
  | "claude"
  | "gemini"
  | "cursor"
  | "cline"
  | "roo"
  | "unknown";

export type AgentRegistryEntry = {
  id: AgentId;
  label: string;
  accent: string;
  tokenSource: string;
};

export const SUPPORTED_AGENT_IDS: AgentId[];
export const AGENT_REGISTRY: Record<AgentId, AgentRegistryEntry>;
export function isSupportedAgentId(agentId: string): agentId is AgentId;
export function agentConfig(agentId?: string): AgentRegistryEntry;
export function agentLabel(agentId?: string): string;
export function agentColor(agentId?: string): string;
export function agentTokenSource(agentId?: string): string;
