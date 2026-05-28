import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_TRANSCRIPT_BYTES = 3_000_000;
const MAX_EVENTS = 64;
const ACTIVE_MS = 120_000;

type NeuroNodeType =
  | "directory"
  | "file"
  | "function"
  | "command"
  | "config"
  | "test"
  | "decision"
  | "agent"
  | "artifact";

type NeuroEdgeType =
  | "imports"
  | "calls"
  | "reads"
  | "tests"
  | "edits"
  | "runs"
  | "decides";

type SignalAction =
  | "think"
  | "search"
  | "read_file"
  | "open_symbol"
  | "edit_file"
  | "run_command"
  | "observe_output"
  | "test_failed"
  | "test_passed"
  | "decision"
  | "final_answer";

type PositionedNode = {
  id: string;
  label: string;
  type: NeuroNodeType;
  path?: string;
  description?: string;
  activation: number;
  visitCount: number;
  status?: "idle" | "active" | "error" | "edited" | "passed" | "decision";
  depth?: number;
  prominence?: "core" | "branch" | "micro";
  position: { x: number; y: number };
};

type NeuroEdgeData = {
  id: string;
  source: string;
  target: string;
  type: NeuroEdgeType;
  weight: number;
};

type NeuroSignal = {
  id: string;
  time: number;
  action: SignalAction;
  source?: string;
  target: string;
  intensity: number;
  confidence?: number;
  reason: string;
  evidence?: string[];
};

type ToolEvent = {
  id: string;
  toolUseId?: string;
  timestamp: number;
  action: SignalAction;
  target: string;
  label: string;
  path?: string;
  reason: string;
};

type ClaudeGraph = {
  id: string;
  name: string;
  source: "claude";
  nodes: PositionedNode[];
  edges: NeuroEdgeData[];
  signals: NeuroSignal[];
  totalDuration: number;
  fileCount: number;
  skippedCount: number;
  sessionId: string;
  lastUpdated: string;
  isActive: boolean;
};

const ROOT_ID = "dir:project-root";
const AGENT_ID = "agent:orchestrator";
const DECISION_ID = "decision:claude-live";
const TRANSCRIPT_ID = "file:.claude/transcript.jsonl";

function projectKey(cwd: string) {
  return cwd.replaceAll("/", "-");
}

function basename(input: string) {
  return input.split("/").filter(Boolean).at(-1) ?? input;
}

function dirId(input: string) {
  return input ? `dir:${input}` : ROOT_ID;
}

function fileId(input: string) {
  return `file:${input}`;
}

function commandId(input: string) {
  return `cmd:${input}`;
}

function nodeTypeFor(filePath: string): NeuroNodeType {
  const name = basename(filePath);
  const lower = filePath.toLowerCase();
  if (
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower.includes("/tests/") ||
    lower.includes("/test/")
  ) {
    return "test";
  }
  if (
    name.startsWith(".env") ||
    /(^|\.)(config|rc)\./i.test(name) ||
    /^(package|tsconfig|vite|eslint|tailwind|postcss)\./i.test(name) ||
    name === "AGENTS.md"
  ) {
    return "config";
  }
  if (/\.(md|jsonl|lock|png|jpe?g|svg|webp|pdf|csv)$/i.test(name)) {
    return "artifact";
  }
  return "file";
}

function isProbablyPath(value: string) {
  if (/^https?:\/\//i.test(value)) return false;
  if (value.startsWith("-")) return false;
  if (value.length < 3 || value.length > 260) return false;
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    /[A-Za-z0-9_. -]+\/[A-Za-z0-9_. -]+/.test(value) ||
    /\.[A-Za-z0-9]{1,8}$/.test(value)
  );
}

function normalizePathCandidate(value: string, cwd: string) {
  const cleaned = value
    .replace(/^['"`]+|['"`:,;)\]}]+$/g, "")
    .replace(/^\.\//, "")
    .trim();

  if (!isProbablyPath(cleaned)) return undefined;
  if (cleaned.includes("node_modules/") || cleaned.includes("/.git/")) {
    return undefined;
  }

  if (path.isAbsolute(cleaned)) {
    const relative = path.relative(cwd, cleaned).replaceAll(path.sep, "/");
    if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
    return relative || undefined;
  }

  if (cleaned.startsWith("../")) return undefined;
  return cleaned.replaceAll("\\", "/");
}

function collectStringValues(input: unknown, out: string[] = []) {
  if (typeof input === "string") {
    out.push(input);
    return out;
  }
  if (!input || typeof input !== "object") return out;
  if (Array.isArray(input)) {
    for (const item of input) collectStringValues(item, out);
    return out;
  }
  for (const value of Object.values(input as Record<string, unknown>)) {
    collectStringValues(value, out);
  }
  return out;
}

function pathsFromInput(input: unknown, cwd: string) {
  const values = collectStringValues(input);
  const paths = new Set<string>();

  for (const value of values) {
    const direct = normalizePathCandidate(value, cwd);
    if (direct) paths.add(direct);

    for (const match of value.matchAll(
      /(?:["'`])?((?:\/Users\/[^\s"'`]+)|(?:\.\/|\b)[A-Za-z0-9_.@ -]+\/[A-Za-z0-9_.@/ -]+\.[A-Za-z0-9]{1,8})(?:["'`])?/g
    )) {
      const candidate = normalizePathCandidate(match[1], cwd);
      if (candidate) paths.add(candidate);
    }
  }

  return [...paths].slice(0, 5);
}

function labelForTool(toolName: string, input: Record<string, unknown>) {
  if (typeof input.description === "string" && input.description.trim()) {
    return input.description.trim().slice(0, 48);
  }
  if (typeof input.command === "string" && input.command.trim()) {
    return input.command.trim().split("\n")[0].slice(0, 48);
  }
  return toolName
    .replace(/^mcp__/, "")
    .replaceAll("__", " / ")
    .replaceAll("_", " ")
    .slice(0, 48);
}

function actionForTool(toolName: string, input: Record<string, unknown>) {
  const name = toolName.toLowerCase();
  if (name.includes("edit") || name.includes("write")) return "edit_file";
  if (name.includes("read")) return "read_file";
  if (name.includes("grep") || name.includes("glob") || name.includes("search")) {
    return "search";
  }
  if (name.includes("bash") || typeof input.command === "string") {
    const command = `${input.command ?? ""}`.toLowerCase();
    if (/\b(test|pytest|vitest|npm run test|pnpm test|yarn test)\b/.test(command)) {
      return "run_command";
    }
    return "run_command";
  }
  if (name.includes("todo")) return "decision";
  return "open_symbol";
}

function readToolUses(record: Record<string, unknown>) {
  const message = record.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (item): item is Record<string, unknown> =>
      !!item &&
      typeof item === "object" &&
      item.type === "tool_use" &&
      typeof item.name === "string"
  );
}

function readToolResultId(record: Record<string, unknown>) {
  const message = record.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return undefined;
  const result = content.find(
    (item): item is Record<string, unknown> =>
      !!item &&
      typeof item === "object" &&
      item.type === "tool_result" &&
      typeof item.tool_use_id === "string"
  );
  return result?.tool_use_id as string | undefined;
}

function parseLines(text: string) {
  const records: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") records.push(parsed);
    } catch {
      // The transcript can be appended while we read; ignore partial lines.
    }
  }
  return records;
}

async function readTail(filePath: string) {
  const stat = await fs.stat(filePath);
  const start = Math.max(0, stat.size - MAX_TRANSCRIPT_BYTES);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(stat.size - start);
    await handle.read(buffer, 0, buffer.length, start);
    let text = buffer.toString("utf8");
    if (start > 0) text = text.slice(text.indexOf("\n") + 1);
    return { text, stat };
  } finally {
    await handle.close();
  }
}

async function latestTranscript(cwd: string) {
  const dir = path.join(os.homedir(), ".claude", "projects", projectKey(cwd));
  const entries = await fs.readdir(dir).catch(() => []);
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".jsonl"))
      .map(async (entry) => {
        const filePath = path.join(dir, entry);
        const stat = await fs.stat(filePath);
        return { filePath, stat };
      })
  );
  candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return candidates[0];
}

function addNode(
  nodes: Map<string, PositionedNode>,
  id: string,
  label: string,
  type: NeuroNodeType,
  options: Partial<PositionedNode> = {}
) {
  if (nodes.has(id)) return;
  nodes.set(id, {
    id,
    label,
    type,
    activation: 0,
    visitCount: 0,
    status: "idle",
    depth: options.depth ?? 1,
    prominence: options.prominence ?? "branch",
    position: { x: 0, y: 0 },
    ...options,
  });
}

function addEdge(
  edges: Map<string, NeuroEdgeData>,
  source: string,
  target: string,
  type: NeuroEdgeType,
  weight = 0.42
) {
  const id = `${source}->${target}`;
  if (source === target || edges.has(id)) return;
  edges.set(id, { id, source, target, type, weight });
}

function addPathNodes(
  nodes: Map<string, PositionedNode>,
  edges: Map<string, NeuroEdgeData>,
  filePath: string
) {
  const parts = filePath.split("/").filter(Boolean);
  let current = "";
  for (let index = 0; index < parts.length - 1; index += 1) {
    const next = current ? `${current}/${parts[index]}` : parts[index];
    addNode(nodes, dirId(next), parts[index], "directory", {
      path: next,
      depth: index + 2,
      prominence: index <= 1 ? "branch" : "micro",
    });
    addEdge(edges, dirId(current), dirId(next), "imports", index <= 1 ? 0.72 : 0.36);
    current = next;
  }

  addNode(nodes, fileId(filePath), basename(filePath), nodeTypeFor(filePath), {
    path: filePath,
    depth: parts.length + 1,
    prominence: parts.length <= 2 ? "branch" : "micro",
  });
  addEdge(edges, dirId(current), fileId(filePath), "reads", 0.38);
}

function applyLayout(nodes: PositionedNode[]) {
  const agent = nodes.find((node) => node.id === AGENT_ID);
  const root = nodes.find((node) => node.id === ROOT_ID);
  const decision = nodes.find((node) => node.id === DECISION_ID);
  const transcript = nodes.find((node) => node.id === TRANSCRIPT_ID);
  if (agent) agent.position = { x: 0, y: 0 };
  if (root) root.position = { x: -245, y: 135 };
  if (decision) decision.position = { x: 265, y: 105 };
  if (transcript) transcript.position = { x: 20, y: 176 };

  const body = nodes.filter(
    (node) =>
      node.id !== AGENT_ID &&
      node.id !== ROOT_ID &&
      node.id !== DECISION_ID &&
      node.id !== TRANSCRIPT_ID
  );
  const byDepth = new Map<number, PositionedNode[]>();
  for (const node of body) {
    const bucket = byDepth.get(node.depth ?? 2) ?? [];
    bucket.push(node);
    byDepth.set(node.depth ?? 2, bucket);
  }

  let baseY = 290;
  for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
    const bucket = byDepth.get(depth) ?? [];
    const cols = Math.max(1, Math.ceil(Math.sqrt(bucket.length * 1.6)));
    const xGap = depth <= 3 ? 172 : 122;
    const yGap = depth <= 3 ? 74 : 54;
    bucket.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      node.position = {
        x: (col - (cols - 1) / 2) * xGap + Math.sin(index * 0.63) * 16,
        y: baseY + row * yGap + Math.cos(index * 0.5 + depth) * 10,
      };
    });
    baseY += Math.ceil(bucket.length / cols) * yGap + 112;
  }
}

function buildGraphFromRecords(
  records: Record<string, unknown>[],
  transcriptPath: string,
  mtimeMs: number,
  cwd: string
): ClaudeGraph | undefined {
  const events: ToolEvent[] = [];
  const toolTargets = new Map<string, string>();
  const sessionId =
    (records.find((record) => typeof record.sessionId === "string")?.sessionId as
      | string
      | undefined) ?? basename(transcriptPath).replace(/\.jsonl$/, "");

  for (const record of records) {
    const timestamp = Date.parse(`${record.timestamp ?? ""}`);
    if (!Number.isFinite(timestamp)) continue;

    for (const toolUse of readToolUses(record)) {
      const toolName = toolUse.name as string;
      const toolUseId = toolUse.id as string | undefined;
      const input =
        toolUse.input && typeof toolUse.input === "object"
          ? (toolUse.input as Record<string, unknown>)
          : {};
      const paths = pathsFromInput(input, cwd);
      const action = actionForTool(toolName, input);
      const primaryPath = paths[0];
      const target = primaryPath
        ? fileId(primaryPath)
        : commandId(toolUseId ?? `${toolName}-${events.length}`);

      if (toolUseId) toolTargets.set(toolUseId, target);
      events.push({
        id: `${toolUseId ?? "tool"}-${events.length}`,
        toolUseId,
        timestamp,
        action,
        target,
        label: primaryPath ? basename(primaryPath) : labelForTool(toolName, input),
        path: primaryPath,
        reason: primaryPath
          ? `${toolName} touched ${primaryPath}`
          : `${toolName}: ${labelForTool(toolName, input)}`,
      });

      for (const filePath of paths.slice(1)) {
        events.push({
          id: `${toolUseId ?? "path"}-${events.length}`,
          toolUseId,
          timestamp: timestamp + 150,
          action: action === "edit_file" ? "edit_file" : "read_file",
          target: fileId(filePath),
          label: basename(filePath),
          path: filePath,
          reason: `${toolName} referenced ${filePath}`,
        });
      }
    }

    const resultId = readToolResultId(record);
    if (resultId && toolTargets.has(resultId)) {
      const target = toolTargets.get(resultId)!;
      const failed =
        JSON.stringify(record.toolUseResult ?? "").includes('"is_error":true') ||
        JSON.stringify(record.toolUseResult ?? "").includes('"isError":true');
      events.push({
        id: `${resultId}-result-${events.length}`,
        toolUseId: resultId,
        timestamp,
        action: failed ? "test_failed" : "observe_output",
        target,
        label: "output",
        reason: failed ? "Claude observed a tool error." : "Claude observed tool output.",
      });
    }
  }

  const selectedEvents = events
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_EVENTS);
  if (selectedEvents.length === 0) return undefined;

  const firstTime = selectedEvents[0].timestamp;
  const now = Date.now();
  const totalDuration = Math.max(
    4,
    (Math.max(now, selectedEvents.at(-1)!.timestamp) - firstTime) / 1000
  );

  const nodes = new Map<string, PositionedNode>();
  const edges = new Map<string, NeuroEdgeData>();
  addNode(nodes, AGENT_ID, "Claude", "agent", {
    description: "Live Claude Code session",
    depth: 0,
    prominence: "core",
  });
  addNode(nodes, ROOT_ID, basename(cwd), "directory", {
    path: ".",
    description: "Current Claude workspace",
    depth: 1,
    prominence: "core",
  });
  addNode(nodes, DECISION_ID, "Live session", "decision", {
    description: "Latest Claude transcript activity",
    depth: 1,
    prominence: "core",
  });
  addNode(nodes, TRANSCRIPT_ID, "transcript", "artifact", {
    path: path.relative(cwd, transcriptPath).replaceAll(path.sep, "/"),
    description: "Claude JSONL transcript",
    depth: 2,
    prominence: "branch",
  });
  addEdge(edges, AGENT_ID, ROOT_ID, "decides", 1);
  addEdge(edges, AGENT_ID, DECISION_ID, "decides", 0.86);
  addEdge(edges, ROOT_ID, TRANSCRIPT_ID, "reads", 0.48);

  for (const event of selectedEvents) {
    if (event.path) {
      addPathNodes(nodes, edges, event.path);
    } else {
      addNode(nodes, event.target, event.label, "command", {
        description: event.reason,
        depth: 2,
        prominence: "branch",
      });
      addEdge(edges, ROOT_ID, event.target, "runs", 0.46);
    }
  }

  let previous = AGENT_ID;
  const signals: NeuroSignal[] = selectedEvents.map((event, index) => {
    const source = index === 0 ? AGENT_ID : previous;
    previous = event.target;
    const edgeType: NeuroEdgeType =
      event.action === "edit_file"
        ? "edits"
        : event.action === "run_command"
          ? "runs"
          : event.action === "decision"
            ? "decides"
            : "reads";
    addEdge(edges, source, event.target, edgeType, index > selectedEvents.length - 8 ? 0.72 : 0.38);
    return {
      id: event.id,
      time: Math.max(0, (event.timestamp - firstTime) / 1000),
      action: event.action,
      source,
      target: event.target,
      intensity: Math.min(1, 0.68 + index * 0.006),
      reason: event.reason,
    };
  });

  const evidence = [
    AGENT_ID,
    ROOT_ID,
    TRANSCRIPT_ID,
    ...selectedEvents
      .filter((event) => nodes.has(event.target))
      .slice(-10)
      .map((event) => event.target),
    DECISION_ID,
  ];
  signals.push({
    id: "claude-live-summary",
    time: Math.max(0, totalDuration - 0.2),
    action: "decision",
    source: previous,
    target: DECISION_ID,
    intensity: 0.88,
    confidence: 0.92,
    reason: "Claude transcript is connected and updating.",
    evidence,
  });

  const nodeList = [...nodes.values()];
  applyLayout(nodeList);

  return {
    id: `claude:${sessionId}`,
    name: "Claude live",
    source: "claude",
    nodes: nodeList,
    edges: [...edges.values()],
    signals,
    totalDuration,
    fileCount: nodeList.filter((node) => node.type === "file" || node.type === "test").length,
    skippedCount: 0,
    sessionId,
    lastUpdated: new Date(mtimeMs).toISOString(),
    isActive: now - mtimeMs < ACTIVE_MS,
  };
}

async function loadClaudeGraph(cwd: string) {
  const latest = await latestTranscript(cwd);
  if (!latest) return undefined;
  const { text, stat } = await readTail(latest.filePath);
  return buildGraphFromRecords(parseLines(text), latest.filePath, stat.mtimeMs, cwd);
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export async function handleClaudeLiveRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cwd: string
) {
  if (!req.url?.startsWith("/api/claude/live")) return false;

  try {
    const graph = await loadClaudeGraph(cwd);
    sendJson(res, graph ? 200 : 404, graph ?? { error: "No Claude transcript found" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to read Claude transcript",
    });
  }
  return true;
}
