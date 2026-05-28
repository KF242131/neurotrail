import type { ProjectGraph } from "./localProjectGraph";

export async function fetchLiveAgentGraph(signal?: AbortSignal) {
  const response = await fetch("/api/agents/live", {
    signal,
    cache: "no-store",
  });

  if (!response.ok) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return fetchNewestAgentGraph(signal);
  try {
    return (await response.json()) as ProjectGraph;
  } catch {
    return fetchNewestAgentGraph(signal);
  }
}

async function fetchNewestAgentGraph(signal?: AbortSignal) {
  const response = await fetch("/api/agent/live", {
    signal,
    cache: "no-store",
  });

  if (!response.ok) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return undefined;
  try {
    const graph = (await response.json()) as ProjectGraph;
    return graph.isActive ? graph : undefined;
  } catch {
    return undefined;
  }
}
