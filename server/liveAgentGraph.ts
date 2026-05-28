import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import {
  addRoleCount,
  inferAgentRole,
  sortRoles,
} from "../src/lib/agentRoles";
import {
  SUPPORTED_AGENT_IDS,
  agentColor,
  agentLabel,
  isSupportedAgentId,
} from "../src/lib/agentRegistry.js";
import type { RoleCounts } from "../src/lib/agentRoles";
import type { AgentId } from "../src/lib/agentRegistry.js";
import type { AgentRole } from "../src/types";

const MAX_TRANSCRIPT_BYTES = 3_000_000;
const MAX_EVENTS = 80;
const ACTIVE_MS = 120_000;
const MAX_CODEX_SESSIONS = 4;
const MAX_GEMINI_ARTIFACTS = 6;
const MAX_GENERIC_AGENT_SESSIONS = 3;
const DISCOVERY_CACHE_MS = 5_000;

type AgentKind = AgentId;
type GraphSource = AgentKind | "multi-agent";

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
  | "write_text"
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
  kind?: "project" | "agent" | "memory";
  agentId?: string;
  sessionId?: string;
  category?: ToolEvent["category"] | "context";
  roles?: AgentRole[];
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
  kind?: "structure" | "trail" | "memory" | "recommendation";
  agentId?: string;
  sessionId?: string;
  timestamp?: string;
  eventCount?: number;
  category?: ToolEvent["category"] | "context";
  role?: AgentRole;
  weight: number;
};

type NeuroSignal = {
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
  category?: "trail" | "evidence" | "handoff" | "waste";
  role?: AgentRole;
  evidence?: string[];
};

type ToolEvent = {
  id: string;
  toolUseId?: string;
  laneId?: string;
  timestamp: number;
  action: SignalAction;
  target: string;
  label: string;
  path?: string;
  topic: string;
  reason: string;
  category: "trail" | "evidence" | "handoff" | "waste";
  role: AgentRole;
  visibleNode: boolean;
};

type ToolSemantics = {
  action: SignalAction;
  summary: string;
  topic: string;
  label: string;
  category: ToolEvent["category"];
  visibleNode: boolean;
};

type LiveAgentGraph = {
  id: string;
  name: string;
  source: GraphSource;
  nodes: PositionedNode[];
  edges: NeuroEdgeData[];
  signals: NeuroSignal[];
  totalDuration: number;
  fileCount: number;
  skippedCount: number;
  sessionId: string;
  lastUpdated: string;
  isActive: boolean;
  agents?: AgentTelemetry[];
};

type AgentTelemetry = {
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
  roleCounts?: RoleCounts;
  tokenUsage?: AgentTokenTelemetry;
  tokenRuns?: AgentTokenRun[];
  touchedCount?: number;
  evidenceCount?: number;
};

type AgentTokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  totalTokens: number;
};

type AgentTokenLane = {
  id: string;
  label: string;
  tokenCount?: number;
  startedAt?: string;
  endedAt?: string;
};

type AgentTokenRun = {
  id: string;
  label: string;
  timestamp?: string;
  laneCount: number;
  usage?: AgentTokenUsage;
  lanes: AgentTokenLane[];
};

type AgentTokenTelemetry = {
  total: AgentTokenUsage;
  last?: AgentTokenUsage;
  contextWindow?: number;
};

type TranscriptCandidate = {
  filePath: string;
  mtimeMs: number;
  workspaceVerified?: boolean;
};

const ROOT_ID = "dir:project-root";
const PATH_EXTENSIONS = new Set([
  "astro",
  "c",
  "cpp",
  "cs",
  "css",
  "csv",
  "env",
  "eslintrc",
  "go",
  "gitignore",
  "html",
  "java",
  "js",
  "json",
  "jsonl",
  "jsx",
  "lock",
  "md",
  "mjs",
  "png",
  "py",
  "rs",
  "scss",
  "svg",
  "ts",
  "tsx",
  "txt",
  "vue",
  "yaml",
  "yml",
]);
const STANDALONE_ARTIFACT_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "png", "webp"]);
const ROOT_STANDALONE_FILES = new Set([
  ".env",
  ".eslintrc",
  ".gitignore",
  "AGENTS.md",
  "README.md",
  "eslint.config.js",
  "package.json",
  "postcss.config.js",
  "tailwind.config.js",
  "tsconfig.json",
  "vite.config.ts",
]);

const discoveryCache = new Map<
  string,
  { expiresAt: number; value: Promise<unknown> | unknown }
>();
const transcriptGraphCache = new Map<
  string,
  { mtimeMs: number; graph: LiveAgentGraph | undefined }
>();

async function cachedDiscovery<T>(key: string, loader: () => Promise<T>) {
  const now = Date.now();
  const cached = discoveryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T | Promise<T>;
  }
  const value = loader();
  discoveryCache.set(key, { expiresAt: now + DISCOVERY_CACHE_MS, value });
  try {
    const resolved = await value;
    discoveryCache.set(key, {
      expiresAt: Date.now() + DISCOVERY_CACHE_MS,
      value: resolved,
    });
    return resolved;
  } catch (error) {
    discoveryCache.delete(key);
    throw error;
  }
}

function cacheKey(...parts: string[]) {
  return parts.join("\u0000");
}

function agentNodeId(agent: AgentKind) {
  return `agent:${agent}`;
}

function agentIds(agent: AgentKind) {
  return {
    decision: `decision:${agent}-live`,
    transcript:
      agent === "codex"
        ? "file:.codex/session.jsonl"
        : agent === "claude"
          ? "file:.claude/transcript.jsonl"
          : agent === "gemini"
            ? "file:.gemini/antigravity/session-artifacts"
            : `file:.${agent}/session-log`,
  };
}

function safeId(input: string) {
  return input.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48) || "session";
}

function sessionNodeId(agent: AgentKind, sessionId: string) {
  return `decision:${agent}-prompt-${safeId(sessionId)}`;
}

function sessionLabel(sessionId: string) {
  const compact = safeId(sessionId).slice(-6);
  return compact ? `prompt ${compact}` : "prompt lane";
}

function projectKey(cwd: string) {
  return cwd.replaceAll("/", "-");
}

function isActiveMtime(mtimeMs: number) {
  return Date.now() - mtimeMs < ACTIVE_MS;
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
    /[A-Za-z0-9_.@ -]+\/[A-Za-z0-9_.@/ -]+/.test(value) ||
    /\.[A-Za-z0-9]{1,8}$/.test(value)
  );
}

function normalizePathCandidate(value: string, cwd: string) {
  const cleaned = value
    .replace(/^['"`]+|['"`:,;)\]}]+$/g, "")
    .replace(/:\d+(?::\d+)?$/, "")
    .replace(/^\.\//, "")
    .trim();

  if (!isProbablyPath(cleaned)) return undefined;
  const extension = cleaned.includes(".")
    ? cleaned.split(".").at(-1)?.toLowerCase()
    : undefined;
  if (extension && !PATH_EXTENSIONS.has(extension)) return undefined;
  const hasSeparator = cleaned.includes("/") || cleaned.includes("\\");
  if (!hasSeparator && extension && STANDALONE_ARTIFACT_EXTENSIONS.has(extension)) {
    return undefined;
  }
  if (!hasSeparator && extension && !ROOT_STANDALONE_FILES.has(cleaned)) {
    return undefined;
  }
  if (cleaned.startsWith("/tmp/") || cleaned.startsWith("tmp/")) return undefined;
  if (/^https?:\/\//i.test(cleaned) || cleaned.includes("://")) return undefined;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(cleaned)) return undefined;
  if (/[|()]/.test(cleaned)) return undefined;
  if (/^(npm|pnpm|yarn|curl|find|sed|rg|jq|tail|head|git|ls|cat)\s/.test(cleaned)) {
    return undefined;
  }
  if (/\s/.test(cleaned) && !path.isAbsolute(cleaned)) return undefined;
  if (
    cleaned.includes("node_modules/") ||
    cleaned.includes("/.git/") ||
    cleaned.includes(".codex/")
  ) {
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

function pathsFromText(value: string, cwd: string) {
  const paths = new Set<string>();
  const direct = normalizePathCandidate(value, cwd);
  if (direct) paths.add(direct);

  for (const match of value.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) {
    const candidate = normalizePathCandidate(match[1], cwd);
    if (candidate) paths.add(candidate);
  }

  for (const match of value.matchAll(
    /(?:["'`])?((?:[A-Za-z]:[/\\]Users[/\\][^\s"'`]+)|(?:\/Users\/[^\s"'`]+)|(?:\/home\/[^\s"'`]+)|(?:\.\/|\b)[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)*\.[A-Za-z0-9]{1,8})(?:["'`])?/gi
  )) {
    const candidate = normalizePathCandidate(match[1], cwd);
    if (candidate) paths.add(candidate);
  }

  return paths;
}

function pathsFromInput(input: unknown, cwd: string) {
  const paths = new Set<string>();
  for (const value of collectStringValues(input)) {
    for (const filePath of pathsFromText(value, cwd)) {
      paths.add(filePath);
    }
  }
  return [...paths].slice(0, 8);
}

function labelForTool(toolName: string, input: Record<string, unknown>) {
  if (typeof input.description === "string" && input.description.trim()) {
    return input.description.trim().slice(0, 48);
  }
  if (typeof input.cmd === "string" && input.cmd.trim()) {
    return input.cmd.trim().split("\n")[0].slice(0, 48);
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
  if (
    name.includes("edit") ||
    name.includes("write") ||
    name.includes("apply_patch")
  ) {
    return "edit_file";
  }
  if (name.includes("read") || name.includes("cat") || name.includes("sed")) {
    return "read_file";
  }
  if (
    name.includes("grep") ||
    name.includes("glob") ||
    name.includes("search") ||
    name.includes("rg")
  ) {
    return "search";
  }
  if (
    name.includes("bash") ||
    name.includes("exec_command") ||
    typeof input.command === "string" ||
    typeof input.cmd === "string"
  ) {
    return "run_command";
  }
  if (name.includes("todo") || name.includes("plan")) return "decision";
  return "open_symbol";
}

function sentence(value: string) {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function shortPathTopic(filePath: string) {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 2) return basename(filePath);
  return `${parts.at(-2)}/${parts.at(-1)}`;
}

function commandText(input: Record<string, unknown>) {
  const value =
    typeof input.command === "string"
      ? input.command
      : typeof input.cmd === "string"
        ? input.cmd
        : "";
  return value.trim().split("\n")[0] ?? "";
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function commandSemantics(command: string, failed = false): ToolSemantics {
  const lower = command.toLowerCase();
  if (/npm run build|vite build|tsc\b/.test(lower)) {
    return {
      action: failed ? "test_failed" : "test_passed",
      summary: failed ? "build failed" : "verified build",
      topic: "Build verification",
      label: failed ? "build failed" : "build passed",
      category: "evidence" as const,
      visibleNode: true,
    };
  }
  if (/npm run lint|eslint\b/.test(lower)) {
    return {
      action: failed ? "test_failed" : "test_passed",
      summary: failed ? "lint failed" : "lint passed",
      topic: "Code quality check",
      label: failed ? "lint failed" : "lint passed",
      category: "evidence" as const,
      visibleNode: true,
    };
  }
  if (/\bnpm test\b|\bvitest\b|\bjest\b|\bpytest\b/.test(lower)) {
    return {
      action: failed ? "test_failed" : "test_passed",
      summary: failed ? "tests failed" : "tests passed",
      topic: "Test verification",
      label: failed ? "tests failed" : "tests passed",
      category: "evidence" as const,
      visibleNode: true,
    };
  }
  if (/npm run dev|vite --host|vite dev/.test(lower)) {
    return {
      action: "run_command" as const,
      summary: "started live app",
      topic: "Running NeuroTrail",
      label: "live app",
      category: "trail" as const,
      visibleNode: true,
    };
  }
  if (/npm run preview|vite preview/.test(lower)) {
    return {
      action: "run_command" as const,
      summary: "checked preview app",
      topic: "Preview verification",
      label: "preview app",
      category: "trail" as const,
      visibleNode: true,
    };
  }
  if (/curl\b/.test(lower) && /\/api\/.*live/.test(lower)) {
    return {
      action: failed ? "test_failed" : "test_passed",
      summary: failed ? "live API failed" : "checked live API",
      topic: "Live graph endpoint",
      label: failed ? "API failed" : "live API",
      category: "evidence" as const,
      visibleNode: true,
    };
  }
  if (/\brg\b|grep|find\s/.test(lower)) {
    return {
      action: "search" as const,
      summary: "searched code",
      topic: "Code discovery",
      label: "code search",
      category: "trail" as const,
      visibleNode: false,
    };
  }
  if (/\bsed\b|\bcat\b|\bnl\b|\btail\b|\bhead\b/.test(lower)) {
    return {
      action: "read_file" as const,
      summary: "inspected source",
      topic: "Code reading",
      label: "source read",
      category: "trail" as const,
      visibleNode: false,
    };
  }
  return {
    action: "run_command" as const,
    summary: "ran a verification step",
    topic: "Command check",
    label: "verification",
    category: "trail" as const,
    visibleNode: false,
  };
}

function toolSemantics(
  toolName: string,
  input: Record<string, unknown>,
  action: SignalAction,
  primaryPath?: string
): ToolSemantics {
  const lower = toolName.toLowerCase();
  const command = commandText(input);

  if (command) return commandSemantics(command);

  if (primaryPath) {
    if (action === "edit_file") {
      return {
        action,
        summary: `updated ${shortPathTopic(primaryPath)}`,
        topic: shortPathTopic(primaryPath),
        label: basename(primaryPath),
        category: "trail" as const,
        visibleNode: true,
      };
    }
    return {
      action,
      summary:
        action === "search"
          ? `searched around ${shortPathTopic(primaryPath)}`
          : `inspected ${shortPathTopic(primaryPath)}`,
      topic: shortPathTopic(primaryPath),
      label: basename(primaryPath),
      category: "trail" as const,
      visibleNode: true,
    };
  }

  if (lower.includes("apply_patch")) {
    return {
      action: "edit_file" as const,
      summary: "updated code",
      topic: "Implementation change",
      label: "code update",
      category: "trail" as const,
      visibleNode: false,
    };
  }
  if (lower.includes("update_plan")) {
    return {
      action: "decision" as const,
      summary: "set implementation plan",
      topic: "Work plan",
      label: "plan",
      category: "handoff" as const,
      visibleNode: false,
    };
  }
  if (lower.includes("node_repl") || lower.includes("browser")) {
    const text = JSON.stringify(input).toLowerCase();
    if (text.includes("screenshot") || text.includes("emitimage")) {
      return {
        action: "observe_output" as const,
        summary: "checked graph view",
        topic: "Browser verification",
        label: "graph view",
        category: "evidence" as const,
        visibleNode: false,
      };
    }
    if (text.includes("goto") || text.includes("127.0.0.1")) {
      return {
        action: "open_symbol" as const,
        summary: "opened NeuroTrail",
        topic: "Browser verification",
        label: "browser check",
        category: "evidence" as const,
        visibleNode: false,
      };
    }
    return {
      action: "observe_output" as const,
      summary: "inspected app state",
      topic: "Browser verification",
      label: "app state",
      category: "evidence" as const,
      visibleNode: false,
    };
  }
  if (lower.includes("write_stdin")) {
    return {
      action: "observe_output" as const,
      summary: "inspected terminal output",
      topic: "Terminal evidence",
      label: "terminal output",
      category: "waste" as const,
      visibleNode: false,
    };
  }

  const label = labelForTool(toolName, input);
  return {
    action,
    summary: sentence(label),
    topic: "Agent step",
    label,
    category: action === "observe_output" ? ("waste" as const) : ("trail" as const),
    visibleNode: action === "run_command",
  };
}

function outputText(record: Record<string, unknown>) {
  return JSON.stringify(record);
}

function outputSemantics(
  record: Record<string, unknown>,
  failed: boolean,
  fallbackTopic: string
): ToolSemantics {
  const text = outputText(record).toLowerCase();
  if (
    text.includes("npm run build") ||
    (text.includes("vite") && text.includes("built in"))
  ) {
    return commandSemantics("npm run build", failed);
  }
  if (text.includes("npm run lint") || text.includes("eslint .")) {
    return commandSemantics("npm run lint", failed);
  }
  if (text.includes("http/1.1 200 ok") && text.includes("/api")) {
    return commandSemantics("curl /api/agent/live", failed);
  }
  if (text.includes("screenshot") || text.includes("browser verification")) {
    return {
      action: "observe_output" as const,
      summary: "checked graph view",
      topic: "Browser verification",
      label: "graph view",
      category: "evidence" as const,
      visibleNode: false,
    };
  }
  return {
    action: failed ? ("test_failed" as const) : ("observe_output" as const),
    summary: failed ? "step failed" : "inspected output",
    topic: fallbackTopic,
    label: failed ? "failed step" : "output",
    category: failed ? ("evidence" as const) : ("waste" as const),
    visibleNode: false,
  };
}

function roleForSemantic(
  semantic: ToolSemantics,
  options: {
    path?: string;
    target?: string;
    toolName?: string;
    command?: string;
  } = {}
) {
  return inferAgentRole({
    action: semantic.action,
    reason: semantic.summary,
    topic: semantic.topic,
    label: semantic.label,
    category: semantic.category,
    path: options.path,
    target: options.target,
    toolName: options.toolName,
    command: options.command,
  });
}

function parseLines(text: string) {
  const whole = text.trim();
  if (whole.startsWith("{") || whole.startsWith("[")) {
    try {
      const parsed = JSON.parse(whole);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === "object"
        );
      }
      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        for (const key of ["messages", "records", "events", "items"]) {
          const value = record[key];
          if (Array.isArray(value)) {
            return value.filter(
              (item): item is Record<string, unknown> =>
                !!item && typeof item === "object"
            );
          }
        }
        return [record];
      }
    } catch {
      // Fall back to JSONL parsing below.
    }
  }
  const records: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") records.push(parsed);
    } catch {
      // Logs can be appended while we read; ignore partial lines.
    }
  }
  return records;
}

function recordsWithSyntheticTimestamps(
  records: Record<string, unknown>[],
  mtimeMs: number
) {
  const start = mtimeMs - Math.max(1, records.length) * 900;
  return records.map((record, index) => {
    if (typeof record.timestamp === "string" || typeof record.timestamp === "number") {
      return record;
    }
    return {
      ...record,
      timestamp: new Date(start + index * 900).toISOString(),
    };
  });
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

async function readFirstRecord(filePath: string) {
  const stat = await fs.stat(filePath);
  const size = Math.min(stat.size, 512_000);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(size);
    await handle.read(buffer, 0, size, 0);
    const firstLine = buffer.toString("utf8").split("\n")[0];
    if (!firstLine?.startsWith("{")) return undefined;
    return JSON.parse(firstLine) as Record<string, unknown>;
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}

async function latestClaudeTranscript(cwd: string) {
  return cachedDiscovery(cacheKey("claude", cwd), async () => {
    const dir = path.join(os.homedir(), ".claude", "projects", projectKey(cwd));
    const entries = await fs.readdir(dir).catch(() => []);
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".jsonl"))
        .map(async (entry) => {
          const filePath = path.join(dir, entry);
          const stat = await fs.stat(filePath);
          return { filePath, mtimeMs: Number(stat.mtimeMs), workspaceVerified: true };
        })
    );
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates[0];
  });
}

async function collectJsonlFiles(dir: string, depth = 0): Promise<TranscriptCandidate[]> {
  if (depth > 6) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectJsonlFiles(filePath, depth + 1);
      if (
        !entry.isFile() ||
        (!entry.name.endsWith(".jsonl") && !entry.name.endsWith(".json"))
      ) {
        return [];
      }
      const stat = await fs.stat(filePath);
      return [{ filePath, mtimeMs: Number(stat.mtimeMs) }];
    })
  );
  return nested.flat();
}

async function latestCodexTranscripts(cwd: string) {
  return cachedDiscovery(cacheKey("codex", cwd), async () => {
    const dir = path.join(os.homedir(), ".codex", "sessions");
    const candidates = (await collectJsonlFiles(dir)).sort(
      (a, b) => b.mtimeMs - a.mtimeMs
    );
    const matches: TranscriptCandidate[] = [];
    const now = Date.now();

    for (const candidate of candidates.slice(0, 100)) {
      const firstRecord = await readFirstRecord(candidate.filePath);
      const payload = firstRecord?.payload as Record<string, unknown> | undefined;
      if (firstRecord?.type === "session_meta" && payload?.cwd === cwd) {
        matches.push({ ...candidate, workspaceVerified: true });
        const activeCount = matches.filter(
          (match) => now - match.mtimeMs < ACTIVE_MS
        ).length;
        if (matches.length >= MAX_CODEX_SESSIONS && activeCount >= 2) break;
      }
    }
    const active = matches.filter((candidate) => now - candidate.mtimeMs < ACTIVE_MS);
    const merged = active;
    const seen = new Set<string>();
    return merged
      .filter((candidate) => {
        if (seen.has(candidate.filePath)) return false;
        seen.add(candidate.filePath);
        return true;
      })
      .slice(0, MAX_CODEX_SESSIONS);
  });
}

function cursorProjectKey(cwd: string) {
  return cwd.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-");
}

async function latestCursorTranscripts(cwd: string) {
  return cachedDiscovery(cacheKey("cursor", cwd), async () => {
    const dir = path.join(
      os.homedir(),
      ".cursor",
      "projects",
      cursorProjectKey(cwd),
      "agent-transcripts"
    );
    const candidates = (await collectJsonlFiles(dir)).sort(
      (a, b) => b.mtimeMs - a.mtimeMs
    );
    return candidates
      .filter((candidate) => isActiveMtime(candidate.mtimeMs))
      .map((candidate) => ({ ...candidate, workspaceVerified: true }))
      .slice(0, MAX_GENERIC_AGENT_SESSIONS);
  });
}

function appSupportDir(...parts: string[]) {
  const homedir = os.homedir();
  let base: string;
  switch (process.platform) {
    case "win32":
      base = process.env.APPDATA || path.join(homedir, "AppData", "Roaming");
      break;
    case "darwin":
      base = path.join(homedir, "Library", "Application Support");
      break;
    default: // Linux / POSIX fallback
      base = process.env.XDG_CONFIG_HOME || path.join(homedir, ".config");
      break;
  }
  return path.join(base, ...parts);
}

function isPathInside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function hasWorkspaceReference(text: string, cwd: string) {
  if (!text) return false;
  const normalized = cwd.replaceAll(path.sep, "/");
  const candidates = new Set([
    cwd,
    normalized,
    pathToFileURL(cwd).href,
    pathToFileURL(cwd + path.sep).href,
  ]);
  return [...candidates].some((candidate) => text.includes(candidate));
}

type GenericTranscriptRoot = {
  path: string;
  allowLocalWorkspace?: boolean;
};

async function activeGenericTranscripts(
  cwd: string,
  roots: GenericTranscriptRoot[]
): Promise<TranscriptCandidate[]> {
  const candidates = (
    await Promise.all(
      roots.map(async (root) => {
        const files = await collectJsonlFiles(root.path);
        return files.map((file) => ({
          ...file,
          workspaceVerified:
            !!root.allowLocalWorkspace && isPathInside(cwd, file.filePath),
        }));
      })
    )
  )
    .flat()
    .filter((candidate) => isActiveMtime(candidate.mtimeMs))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const matches: TranscriptCandidate[] = [];
  for (const candidate of candidates.slice(0, 60)) {
    if (candidate.workspaceVerified) {
      matches.push(candidate);
      if (matches.length >= MAX_GENERIC_AGENT_SESSIONS) break;
      continue;
    }
    const { text } = await readTail(candidate.filePath).catch(() => ({
      text: "",
    }));
    if (!hasWorkspaceReference(text, cwd)) continue;
    matches.push({ ...candidate, workspaceVerified: true });
      if (matches.length >= MAX_GENERIC_AGENT_SESSIONS) break;
  }
  return matches;
}

async function latestClineTranscripts(cwd: string) {
  return cachedDiscovery(cacheKey("cline", cwd), () =>
    activeGenericTranscripts(cwd, [
      { path: appSupportDir("Code", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks") },
      { path: appSupportDir("Cursor", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks") },
      { path: path.join(os.homedir(), ".cline") },
      { path: path.join(cwd, ".cline"), allowLocalWorkspace: true },
    ])
  );
}

async function latestRooTranscripts(cwd: string) {
  return cachedDiscovery(cacheKey("roo", cwd), () =>
    activeGenericTranscripts(cwd, [
      { path: appSupportDir("Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "tasks") },
      { path: appSupportDir("Code", "User", "globalStorage", "rooveterinaryinc.roo-code", "tasks") },
      { path: appSupportDir("Cursor", "User", "globalStorage", "rooveterinaryinc.roo-cline", "tasks") },
      { path: appSupportDir("Cursor", "User", "globalStorage", "rooveterinaryinc.roo-code", "tasks") },
      { path: path.join(os.homedir(), ".roo") },
      { path: path.join(cwd, ".roo"), allowLocalWorkspace: true },
    ])
  );
}

async function latestUnknownTranscripts(cwd: string) {
  return cachedDiscovery(cacheKey("unknown", cwd), () =>
    activeGenericTranscripts(cwd, [
      { path: path.join(cwd, ".agent"), allowLocalWorkspace: true },
      { path: path.join(cwd, ".agents"), allowLocalWorkspace: true },
      { path: path.join(cwd, ".ai"), allowLocalWorkspace: true },
      { path: path.join(cwd, ".neurotrail", "sessions"), allowLocalWorkspace: true },
    ])
  );
}

async function latestGeminiChatTranscripts(cwd: string) {
  return cachedDiscovery(cacheKey("gemini-chat", cwd), async () => {
    const tmpRoot = path.join(os.homedir(), ".gemini", "tmp");
    const users = await fs.readdir(tmpRoot, { withFileTypes: true }).catch(() => []);
    const roots = users
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ path: path.join(tmpRoot, entry.name, "chats") }));
    return activeGenericTranscripts(cwd, roots);
  });
}

async function readGeminiArtifactRecords(cwd: string) {
  return cachedDiscovery(cacheKey("gemini-artifacts", cwd), async () => {
    const roots = [
      path.join(os.homedir(), ".gemini", "antigravity", "brain"),
      path.join(os.homedir(), ".gemini", "antigravity-ide", "brain"),
      path.join(os.homedir(), ".gemini", "antigravity-backup", "brain"),
    ];
    // Scan Antigravity artifact metadata directly without walking the rest of
    // the Gemini browser profile.
  const metadataFiles: TranscriptCandidate[] = [];
  for (const root of roots) {
    const sessions = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const session of sessions) {
      if (!session.isDirectory()) continue;
      const dir = path.join(root, session.name);
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".metadata.json")) continue;
        const filePath = path.join(dir, entry.name);
        const stat = await fs.stat(filePath);
        metadataFiles.push({ filePath, mtimeMs: Number(stat.mtimeMs) });
      }
    }
  }

  const byArtifact = new Map<string, Record<string, unknown>>();
  for (const candidate of metadataFiles.sort((a, b) => b.mtimeMs - a.mtimeMs)) {
    const metadataText = await fs.readFile(candidate.filePath, "utf8").catch(() => "");
    if (!metadataText) continue;
    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(metadataText);
    } catch {
      continue;
    }
    const artifactPath = candidate.filePath.replace(/\.metadata\.json$/, "");
    const content = await fs.readFile(artifactPath, "utf8").catch(() => "");
    const summary = typeof metadata.summary === "string" ? metadata.summary : "";
    const haystack = `${summary}\n${content}`;
    if (
      !hasWorkspaceReference(haystack, cwd) &&
      pathsFromText(content, cwd).size < 2
    ) {
      continue;
    }
    const updatedAt =
      typeof metadata.updatedAt === "string"
        ? metadata.updatedAt
        : new Date(candidate.mtimeMs).toISOString();
    const sessionId = basename(path.dirname(candidate.filePath));
    const record = {
      type: "gemini_artifact",
      timestamp: updatedAt,
      sessionId,
      artifactType: metadata.artifactType,
      summary,
      content,
      artifactPath,
      label: basename(artifactPath),
    };
    byArtifact.set(`${sessionId}:${basename(artifactPath)}`, record);
    if (byArtifact.size >= MAX_GEMINI_ARTIFACTS) break;
  }
  return [...byArtifact.values()].sort(
    (a, b) =>
      Date.parse(`${a.timestamp ?? ""}`) - Date.parse(`${b.timestamp ?? ""}`)
  );
  });
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

function edgeKindFor(type: NeuroEdgeType) {
  return type === "imports" || type === "calls" || type === "tests"
    ? "structure"
    : "trail";
}

function addEdge(
  edges: Map<string, NeuroEdgeData>,
  source: string,
  target: string,
  type: NeuroEdgeType,
  weight = 0.42,
  options: Partial<NeuroEdgeData> = {}
) {
  const kind = options.kind ?? edgeKindFor(type);
  const prefix = options.agentId ? `${options.agentId}:` : `${kind}:`;
  const id = options.id ?? `${prefix}${source}->${target}`;
  if (source === target || edges.has(id)) return;
  edges.set(id, {
    id,
    source,
    target,
    type,
    kind,
    weight,
    ...options,
  });
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
      kind: "project",
      path: next,
      depth: index + 2,
      prominence: index <= 1 ? "branch" : "micro",
    });
    addEdge(edges, dirId(current), dirId(next), "imports", index <= 1 ? 0.72 : 0.36, {
      kind: "structure",
    });
    current = next;
  }

  addNode(nodes, fileId(filePath), basename(filePath), nodeTypeFor(filePath), {
    kind: "project",
    path: filePath,
    depth: parts.length + 1,
    prominence: parts.length <= 2 ? "branch" : "micro",
  });
  addEdge(edges, dirId(current), fileId(filePath), "reads", 0.38, {
    kind: "structure",
  });
}

function directoryIdsForTarget(target: string) {
  if (!target.startsWith("file:")) return [];
  const parts = target.slice(5).split("/").filter(Boolean);
  const ids = [ROOT_ID];
  let current = "";
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = current ? `${current}/${parts[index]}` : parts[index];
    ids.push(dirId(current));
  }
  return ids;
}

function applyEventRoles(
  nodes: Map<string, PositionedNode>,
  events: ToolEvent[],
  agentNode: string,
  decisionNode: string
) {
  const rolesByNode = new Map<string, Set<AgentRole>>();
  const track = (id: string, role: AgentRole) => {
    if (!nodes.has(id)) return;
    const roles = rolesByNode.get(id) ?? new Set<AgentRole>();
    roles.add(role);
    rolesByNode.set(id, roles);
  };

  for (const event of events) {
    track(agentNode, event.role);
    track(event.target, event.role);
    for (const dir of directoryIdsForTarget(event.target)) track(dir, event.role);
    if (event.category === "handoff") track(decisionNode, "orchestrator");
  }

  for (const [id, roles] of rolesByNode) {
    const node = nodes.get(id);
    if (!node) continue;
    node.roles = sortRoles(roles);
  }
}

const TAU = Math.PI * 2;

function orbitPoint(radius: number, angle: number) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function radialSort(a: PositionedNode, b: PositionedNode) {
  const depth = (a.depth ?? 2) - (b.depth ?? 2);
  if (depth !== 0) return depth;
  const type = a.type.localeCompare(b.type);
  if (type !== 0) return type;
  return (a.path ?? a.label ?? a.id).localeCompare(b.path ?? b.label ?? b.id);
}

function ringForNode(node: PositionedNode) {
  const depth = node.depth ?? 2;
  if (node.kind === "memory" && node.id.includes("-prompt-")) return 0;
  if (node.type === "directory") return Math.max(0, Math.min(2, depth - 1));
  if (node.type === "command") return 1;
  if (node.type === "artifact" || node.type === "config") return Math.min(3, depth);
  return Math.max(1, Math.min(4, depth - 1));
}

function placeOrbit(
  node: PositionedNode | undefined,
  radius: number,
  angle: number
) {
  if (!node) return;
  node.position = orbitPoint(radius, angle);
}

function applyLayout(
  nodes: PositionedNode[],
  specials: Array<ReturnType<typeof agentIds>>,
  agents: AgentKind[]
) {
  const root = nodes.find((node) => node.id === ROOT_ID);

  specials.forEach((ids, index) => {
    const decision = nodes.find((node) => node.id === ids.decision);
    if (!decision) return;
    if (specials.length === 1) {
      decision.position = { x: 0, y: 0 };
      return;
    }
    const angle = -Math.PI * 0.5 + (TAU * index) / specials.length;
    decision.position = orbitPoint(54, angle);
  });

  agents.forEach((agent, index) => {
    const node = nodes.find((item) => item.id === agentNodeId(agent));
    if (!node) return;
    if (agents.length === 1) {
      node.position = orbitPoint(132, -Math.PI * 0.82);
      return;
    }
    const angle = -Math.PI * 0.92 + (TAU * index) / agents.length;
    node.position = orbitPoint(132, angle);
  });

  if (root) root.position = orbitPoint(205, Math.PI * 0.88);

  specials.forEach((ids, index) => {
    const transcript = nodes.find((node) => node.id === ids.transcript);
    const step = specials.length > 1 ? index / specials.length : 0;
    placeOrbit(transcript, 205, Math.PI * 0.34 + step * TAU);
  });

  const specialIds = new Set([
    ROOT_ID,
    ...agents.map(agentNodeId),
    ...specials.flatMap((ids) => [ids.decision, ids.transcript]),
  ]);
  const body = nodes.filter((node) => !specialIds.has(node.id));
  const byRing = new Map<number, PositionedNode[]>();
  for (const node of body) {
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

function parseArguments(input: unknown): Record<string, unknown> {
  if (!input) return {};
  if (typeof input === "object") return input as Record<string, unknown>;
  if (typeof input !== "string") return { value: input };
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Freeform tools such as apply_patch may store raw text arguments.
  }
  return { value: input };
}

function readClaudeToolUses(record: Record<string, unknown>) {
  const message = record.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content
    .filter(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item === "object" &&
        item.type === "tool_use" &&
        typeof item.name === "string"
    )
    .map((item) => ({
      toolName: item.name as string,
      toolUseId: item.id as string | undefined,
      input: parseArguments(item.input),
    }));
}

function readClaudeToolResultId(record: Record<string, unknown>) {
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

function textFromContentItems(content: unknown) {
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const value = item as Record<string, unknown>;
      if (
        (value.type === "output_text" ||
          value.type === "text" ||
          value.type === "input_text") &&
        typeof value.text === "string"
      ) {
        return value.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function readCodexAssistantText(record: Record<string, unknown>) {
  if (record.type !== "response_item") return undefined;
  const payload = record.payload as Record<string, unknown> | undefined;
  if (payload?.type !== "message" || payload.role !== "assistant") return undefined;
  const text = textFromContentItems(payload.content);
  if (!text) return undefined;
  return {
    text,
    phase: typeof payload.phase === "string" ? payload.phase : undefined,
  };
}

function readClaudeAssistantText(record: Record<string, unknown>) {
  if (record.type !== "assistant") return undefined;
  const message = record.message as Record<string, unknown> | undefined;
  if (message?.role !== "assistant") return undefined;
  const text = textFromContentItems(message.content);
  if (!text) return undefined;
  return { text };
}

function textSummary(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/\s+/g, " ")
    .slice(0, 86);
}

function readCodexToolUse(record: Record<string, unknown>) {
  if (record.type !== "response_item") return undefined;
  const payload = record.payload as Record<string, unknown> | undefined;
  if (
    payload?.type !== "function_call" &&
    payload?.type !== "custom_tool_call"
  ) {
    return undefined;
  }
  if (typeof payload.name !== "string") {
    return undefined;
  }
  const namespace =
    typeof payload.namespace === "string" ? `${payload.namespace}.` : "";
  return {
    toolName: `${namespace}${payload.name}`,
    toolUseId: payload.call_id as string | undefined,
    input: parseArguments(payload.arguments),
  };
}

function readCodexToolResultId(record: Record<string, unknown>) {
  if (record.type !== "response_item") return undefined;
  const payload = record.payload as Record<string, unknown> | undefined;
  if (
    payload?.type !== "function_call_output" &&
    payload?.type !== "custom_tool_call_output"
  ) {
    return undefined;
  }
  return payload.call_id as string | undefined;
}

function readCodexToolOutput(record: Record<string, unknown>) {
  if (record.type !== "response_item") return undefined;
  const payload = record.payload as Record<string, unknown> | undefined;
  if (
    payload?.type !== "function_call_output" &&
    payload?.type !== "custom_tool_call_output"
  ) {
    return undefined;
  }
  return typeof payload.output === "string" ? payload.output : undefined;
}

function readGeminiAssistantText(record: Record<string, unknown>) {
  if (record.type !== "gemini") return undefined;
  const content = typeof record.content === "string" ? record.content.trim() : "";
  if (!content) return undefined;
  return { text: content };
}

function readGeminiToolUses(record: Record<string, unknown>) {
  if (record.type !== "gemini" || !Array.isArray(record.toolCalls)) return [];
  return record.toolCalls
    .filter(
      (item): item is Record<string, unknown> =>
        !!item &&
        typeof item === "object" &&
        typeof item.name === "string"
    )
    .map((item, index) => ({
      toolName: item.name as string,
      toolUseId:
        typeof item.id === "string" ? item.id : `gemini-tool-${index}`,
      input: parseArguments(item.args),
      timestamp:
        typeof item.timestamp === "string" ? item.timestamp : undefined,
      status: typeof item.status === "string" ? item.status : undefined,
      result: item.result,
    }));
}

function readGeminiArtifactRecord(record: Record<string, unknown>) {
  if (record.type !== "gemini_artifact") return undefined;
  const summary = typeof record.summary === "string" ? record.summary : "";
  const content = typeof record.content === "string" ? record.content : "";
  const artifactPath =
    typeof record.artifactPath === "string" ? record.artifactPath : undefined;
  const artifactType =
    typeof record.artifactType === "string" ? record.artifactType : undefined;
  const label =
    typeof record.label === "string"
      ? record.label
      : artifactPath
        ? basename(artifactPath)
        : "Gemini artifact";
  return {
    summary,
    content,
    artifactPath,
    artifactType,
    label,
  };
}

function readGenericAssistantText(record: Record<string, unknown>) {
  const role =
    typeof record.role === "string"
      ? record.role
      : typeof (record.message as Record<string, unknown> | undefined)?.role === "string"
        ? ((record.message as Record<string, unknown>).role as string)
        : undefined;
  if (role !== "assistant" && role !== "gemini" && role !== "model") {
    return undefined;
  }
  const message = record.message as Record<string, unknown> | undefined;
  const text =
    textFromContentItems(message?.content) ||
    textFromContentItems(record.content) ||
    (typeof record.content === "string" ? record.content.trim() : "");
  if (!text) return undefined;
  return { text };
}

function readOpenAiStyleToolUses(record: Record<string, unknown>) {
  const calls = Array.isArray(record.tool_calls)
    ? record.tool_calls
    : Array.isArray((record.message as Record<string, unknown> | undefined)?.tool_calls)
      ? ((record.message as Record<string, unknown>).tool_calls as unknown[])
      : [];
  return calls
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, index) => {
      const fn = item.function as Record<string, unknown> | undefined;
      const name =
        typeof item.name === "string"
          ? item.name
          : typeof fn?.name === "string"
            ? fn.name
            : "tool_call";
      return {
        toolName: name,
        toolUseId:
          typeof item.id === "string" ? item.id : `openai-tool-${index}`,
        input: parseArguments(fn?.arguments ?? item.args ?? item.input),
      };
    });
}

function readGenericToolUses(record: Record<string, unknown>) {
  return [
    ...readClaudeToolUses(record),
    ...readGeminiToolUses(record),
    ...readOpenAiStyleToolUses(record),
  ];
}

function numericField(input: Record<string, unknown> | undefined, key: string) {
  const value = input?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function codexUsageFrom(input: unknown): AgentTokenUsage | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const inputTokens = numericField(value, "input_tokens");
  const cachedInputTokens = numericField(value, "cached_input_tokens");
  const outputTokens = numericField(value, "output_tokens");
  const reasoningOutputTokens = numericField(value, "reasoning_output_tokens");
  const totalTokens =
    numericField(value, "total_tokens") || inputTokens + outputTokens;
  if (totalTokens <= 0) return undefined;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    ...(reasoningOutputTokens > 0 ? { reasoningOutputTokens } : {}),
    totalTokens,
  };
}

function claudeUsageFrom(input: unknown): AgentTokenUsage | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const inputTokens = numericField(value, "input_tokens");
  const cachedInputTokens =
    numericField(value, "cache_creation_input_tokens") +
    numericField(value, "cache_read_input_tokens");
  const outputTokens = numericField(value, "output_tokens");
  const totalTokens = inputTokens + cachedInputTokens + outputTokens;
  if (totalTokens <= 0) return undefined;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
  };
}

function geminiUsageFrom(input: unknown): AgentTokenUsage | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  const inputTokens = numericField(value, "input");
  const cachedInputTokens = numericField(value, "cached");
  const outputTokens = numericField(value, "output");
  const reasoningOutputTokens = numericField(value, "thoughts");
  const toolTokens = numericField(value, "tool");
  const totalTokens =
    numericField(value, "total") ||
    inputTokens + cachedInputTokens + outputTokens + reasoningOutputTokens + toolTokens;
  if (totalTokens <= 0) return undefined;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens: outputTokens + toolTokens,
    ...(reasoningOutputTokens > 0 ? { reasoningOutputTokens } : {}),
    totalTokens,
  };
}

function addUsage(a: AgentTokenUsage, b: AgentTokenUsage): AgentTokenUsage {
  const reasoning =
    (a.reasoningOutputTokens ?? 0) + (b.reasoningOutputTokens ?? 0);
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    ...(reasoning > 0 ? { reasoningOutputTokens: reasoning } : {}),
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

function emptyUsage(): AgentTokenUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function readCodexTokenInfo(record: Record<string, unknown>) {
  if (record.type !== "event_msg") return undefined;
  const payload = record.payload as Record<string, unknown> | undefined;
  if (payload?.type !== "token_count") return undefined;
  const info = payload.info as Record<string, unknown> | undefined;
  const total = codexUsageFrom(info?.total_token_usage);
  const last = codexUsageFrom(info?.last_token_usage);
  if (!total && !last) return undefined;
  const contextWindow = numericField(info, "model_context_window") || undefined;
  return { total, last, contextWindow };
}

function tokenCountFromOutput(output: string | undefined) {
  if (!output) return undefined;
  const match = output.match(/Original token count:\s*([\d,]+)/i);
  if (!match) return undefined;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function toolLaneLabel(toolName: string, input: Record<string, unknown>) {
  const label = labelForTool(toolName, input);
  return label.length > 34 ? `${label.slice(0, 31)}...` : label;
}

function codexTokenRunsFromRecords(records: Record<string, unknown>[]) {
  const runs: AgentTokenRun[] = [];
  const pendingById = new Map<string, AgentTokenLane>();
  let pending: AgentTokenLane[] = [];

  for (const record of records) {
    const timestamp = Date.parse(`${record.timestamp ?? ""}`);
    const iso = Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : undefined;

    const toolUse = readCodexToolUse(record);
    if (toolUse) {
      const id = toolUse.toolUseId ?? `codex-call-${runs.length}-${pending.length}`;
      const lane: AgentTokenLane = {
        id,
        label: toolLaneLabel(toolUse.toolName, toolUse.input),
        startedAt: iso,
      };
      pendingById.set(id, lane);
      pending.push(lane);
    }

    const resultId = readCodexToolResultId(record);
    if (resultId) {
      const lane = pendingById.get(resultId);
      if (lane) {
        lane.endedAt = iso;
        lane.tokenCount = tokenCountFromOutput(readCodexToolOutput(record));
      }
    }

    const tokenInfo = readCodexTokenInfo(record);
    if (!tokenInfo) continue;
    const lanes = pending;
    const laneCount = Math.max(1, lanes.length);
    const label =
      lanes.length > 1
        ? `${lanes.length} parallel calls`
        : lanes[0]?.label ?? "model turn";
    runs.push({
      id: `codex-token-run-${runs.length}`,
      label,
      timestamp: iso,
      laneCount,
      usage: tokenInfo.last,
      lanes,
    });
    pending = [];
    pendingById.clear();
  }

  return runs.slice(-5).reverse();
}

function claudeTokenRunsFromRecords(records: Record<string, unknown>[]) {
  const byRequest = new Map<
    string,
    {
      timestamp?: string;
      usage?: AgentTokenUsage;
      lanes: Map<string, AgentTokenLane>;
    }
  >();

  for (const record of records) {
    const message = record.message as Record<string, unknown> | undefined;
    const usage = claudeUsageFrom(message?.usage);
    if (!usage) continue;

    const timestamp = Date.parse(`${record.timestamp ?? ""}`);
    const iso = Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : undefined;
    const key =
      typeof record.requestId === "string"
        ? record.requestId
        : typeof record.uuid === "string"
          ? record.uuid
          : `claude-request-${byRequest.size}`;
    const entry =
      byRequest.get(key) ?? { timestamp: iso, lanes: new Map<string, AgentTokenLane>() };

    entry.timestamp = iso ?? entry.timestamp;
    entry.usage = usage;
    for (const toolUse of readClaudeToolUses(record)) {
      const id = toolUse.toolUseId ?? `${key}-${entry.lanes.size}`;
      entry.lanes.set(id, {
        id,
        label: toolLaneLabel(toolUse.toolName, toolUse.input),
        startedAt: iso,
      });
    }
    byRequest.set(key, entry);
  }

  return [...byRequest.entries()]
    .map(([key, entry], index) => {
      const lanes = [...entry.lanes.values()];
      const laneCount = Math.max(1, lanes.length);
      const label =
        lanes.length > 1
          ? `${lanes.length} tool calls`
          : lanes[0]?.label ?? "assistant turn";
      return {
        id: `claude-token-run-${index}-${key}`,
        label,
        timestamp: entry.timestamp,
        laneCount,
        usage: entry.usage,
        lanes,
      };
    })
    .sort(
      (a, b) =>
        Date.parse(b.timestamp ?? "") - Date.parse(a.timestamp ?? "") ||
        a.id.localeCompare(b.id)
    )
    .slice(0, 5);
}

function geminiTokenRunsFromRecords(records: Record<string, unknown>[]) {
  return records
    .map((record, index) => {
      const usage = geminiUsageFrom(record.tokens);
      const timestamp = Date.parse(`${record.timestamp ?? ""}`);
      const iso = Number.isFinite(timestamp)
        ? new Date(timestamp).toISOString()
        : undefined;
      const lanes = readGeminiToolUses(record).map((toolUse) => ({
        id: toolUse.toolUseId ?? `gemini-lane-${index}`,
        label: toolLaneLabel(toolUse.toolName, toolUse.input),
        ...(toolUse.timestamp ?? iso
          ? { startedAt: toolUse.timestamp ?? iso }
          : {}),
      }));
      if (!usage && lanes.length === 0) return undefined;
      const run: AgentTokenRun = {
        id: `gemini-token-run-${index}`,
        label:
          lanes.length > 1
            ? `${lanes.length} tool calls`
            : lanes[0]?.label ?? "Gemini turn",
        laneCount: Math.max(1, lanes.length),
        lanes,
      };
      if (iso) run.timestamp = iso;
      if (usage) run.usage = usage;
      return run;
    })
    .filter((run): run is AgentTokenRun => run !== undefined)
    .sort(
      (a, b) =>
        Date.parse(b.timestamp ?? "") - Date.parse(a.timestamp ?? "") ||
        a.id.localeCompare(b.id)
    )
    .slice(0, 5);
}

function tokenTelemetryFromRecords(
  records: Record<string, unknown>[],
  agent: AgentKind
): { usage?: AgentTokenTelemetry; runs: AgentTokenRun[] } {
  if (agent === "codex") {
    let usage: AgentTokenTelemetry | undefined;
    for (const record of records) {
      const info = readCodexTokenInfo(record);
      if (!info) continue;
      usage = {
        total: info.total ?? info.last ?? emptyUsage(),
        last: info.last,
        contextWindow: info.contextWindow,
      };
    }
    return { usage, runs: codexTokenRunsFromRecords(records) };
  }

  if (agent === "gemini") {
    let total = emptyUsage();
    let last: AgentTokenUsage | undefined;
    let lastTimestamp = 0;
    for (const record of records) {
      const usage = geminiUsageFrom(record.tokens);
      if (!usage) continue;
      total = addUsage(total, usage);
      const timestamp = Date.parse(`${record.timestamp ?? ""}`);
      if (Number.isFinite(timestamp) && timestamp >= lastTimestamp) {
        lastTimestamp = timestamp;
        last = usage;
      }
    }
    return {
      usage: total.totalTokens > 0 ? { total, last } : undefined,
      runs: geminiTokenRunsFromRecords(records),
    };
  }

  const byRequest = new Map<string, { timestamp?: string; usage: AgentTokenUsage }>();
  for (const record of records) {
    const message = record.message as Record<string, unknown> | undefined;
    const usage = claudeUsageFrom(message?.usage);
    if (!usage) continue;
    const timestamp = Date.parse(`${record.timestamp ?? ""}`);
    const key =
      typeof record.requestId === "string"
        ? record.requestId
        : typeof record.uuid === "string"
          ? record.uuid
          : `claude-request-${byRequest.size}`;
    byRequest.set(key, {
      timestamp: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined,
      usage,
    });
  }

  let total = emptyUsage();
  let last: AgentTokenUsage | undefined;
  let lastTimestamp = 0;
  for (const item of byRequest.values()) {
    total = addUsage(total, item.usage);
    const timestamp = Date.parse(item.timestamp ?? "");
    if (Number.isFinite(timestamp) && timestamp >= lastTimestamp) {
      lastTimestamp = timestamp;
      last = item.usage;
    }
  }

  return {
    usage: total.totalTokens > 0 ? { total, last } : undefined,
    runs: claudeTokenRunsFromRecords(records),
  };
}

function outputFailed(record: Record<string, unknown>, agent: AgentKind) {
  const asText = JSON.stringify(record);
  if (asText.includes('"is_error":true') || asText.includes('"isError":true')) {
    return true;
  }
  if (agent === "codex") {
    return /Process exited with code [1-9]/.test(asText);
  }
  return false;
}

function eventsFromRecords(
  records: Record<string, unknown>[],
  cwd: string,
  agent: AgentKind
) {
  const events: ToolEvent[] = [];
  const toolTargets = new Map<string, string>();
  const toolTopics = new Map<string, string>();
  const ids = agentIds(agent);

  for (const record of records) {
    const timestamp = Date.parse(`${record.timestamp ?? ""}`);
    if (!Number.isFinite(timestamp)) continue;

    const geminiArtifact =
      agent === "gemini" ? readGeminiArtifactRecord(record) : undefined;
    if (geminiArtifact) {
      const summary =
        textSummary(geminiArtifact.summary) ??
        textSummary(geminiArtifact.content) ??
        "reviewed project artifact";
      const isReview =
        /review|audit|assessment|health|risk/i.test(
          `${geminiArtifact.label} ${geminiArtifact.artifactType ?? ""} ${summary}`
        );
      const artifactRole: AgentRole = isReview ? "review" : "writing";
      events.push({
        id: `gemini-artifact-${timestamp}-${events.length}`,
        timestamp,
        action: "write_text",
        target: ids.decision,
        label: geminiArtifact.label,
        topic: isReview ? "Gemini review artifact" : "Gemini artifact",
        reason: summary,
        category: "evidence",
        role: artifactRole,
        visibleNode: false,
      });

      const referencedPaths = [
        ...pathsFromText(geminiArtifact.summary, cwd),
        ...pathsFromText(geminiArtifact.content, cwd),
      ];
      const seenPaths = new Set<string>();
      for (const filePath of referencedPaths) {
        if (seenPaths.has(filePath)) continue;
        seenPaths.add(filePath);
        events.push({
          id: `gemini-artifact-path-${timestamp}-${events.length}`,
          timestamp: timestamp + 120 + seenPaths.size * 35,
          action: "read_file",
          target: fileId(filePath),
          label: basename(filePath),
          path: filePath,
          topic: shortPathTopic(filePath),
          reason: `Gemini review referenced ${shortPathTopic(filePath)}`,
          category: "trail",
          role: artifactRole,
          visibleNode: true,
        });
        if (seenPaths.size >= 18) break;
      }
      continue;
    }

    const assistantText =
      agent === "codex"
        ? readCodexAssistantText(record)
        : agent === "claude"
          ? readClaudeAssistantText(record)
          : agent === "gemini"
            ? readGeminiAssistantText(record)
            : readGenericAssistantText(record);
    if (assistantText) {
      const phase =
        "phase" in assistantText ? assistantText.phase : undefined;
      const isFinal = phase === "final_answer";
      const summary = textSummary(assistantText.text) ?? "wrote response";
      events.push({
        id: `message-${timestamp}-${events.length}`,
        timestamp,
        action: "write_text",
        target: ids.decision,
        label: isFinal ? "final answer" : "agent writing",
        topic: isFinal ? "Writing final answer" : "Writing response",
        reason: summary,
        category: isFinal ? "handoff" : "trail",
        role: "writing",
        visibleNode: false,
      });
    }

    const toolUses =
      agent === "codex"
        ? [readCodexToolUse(record)].filter(
            (item): item is NonNullable<ReturnType<typeof readCodexToolUse>> => !!item
          )
        : agent === "claude"
          ? readClaudeToolUses(record)
          : agent === "gemini"
            ? readGeminiToolUses(record)
            : readGenericToolUses(record);

    for (const toolUse of toolUses) {
      const paths = pathsFromInput(toolUse.input, cwd);
      const action = actionForTool(toolUse.toolName, toolUse.input);
      const primaryPath = action === "run_command" ? undefined : paths[0];
      const command = commandText(toolUse.input);
      const semantic = toolSemantics(
        toolUse.toolName,
        toolUse.input,
        action,
        primaryPath
      );
      const target = primaryPath
        ? fileId(primaryPath)
        : semantic.visibleNode
          ? commandId(slug(semantic.label || semantic.summary))
          : ids.decision;
      const role = roleForSemantic(semantic, {
        path: primaryPath,
        target,
        toolName: toolUse.toolName,
        command,
      });

      if (toolUse.toolUseId) {
        toolTargets.set(toolUse.toolUseId, target);
        toolTopics.set(toolUse.toolUseId, semantic.topic);
      }
      events.push({
        id: `${toolUse.toolUseId ?? "tool"}-${events.length}`,
        toolUseId: toolUse.toolUseId,
        laneId: toolUse.toolUseId,
        timestamp,
        action: semantic.action,
        target,
        label: semantic.label,
        path: primaryPath,
        topic: semantic.topic,
        reason: semantic.summary,
        category: semantic.category,
        role,
        visibleNode: semantic.visibleNode || !!primaryPath,
      });

      const referencedPaths = action === "run_command" ? paths : paths.slice(1);
      for (const filePath of referencedPaths) {
        const fileAction = action === "edit_file" ? "edit_file" : "read_file";
        const fileRole = inferAgentRole({
          action: fileAction,
          reason:
            fileAction === "edit_file"
              ? `updated ${shortPathTopic(filePath)}`
              : `inspected ${shortPathTopic(filePath)}`,
          topic: shortPathTopic(filePath),
          label: basename(filePath),
          path: filePath,
          category: "trail",
          toolName: toolUse.toolName,
          command,
        });
        events.push({
          id: `${toolUse.toolUseId ?? "path"}-${events.length}`,
          toolUseId: toolUse.toolUseId,
          laneId: toolUse.toolUseId,
          timestamp: timestamp + 150,
          action: fileAction,
          target: fileId(filePath),
          label: basename(filePath),
          path: filePath,
          topic: shortPathTopic(filePath),
          reason:
            fileAction === "edit_file"
              ? `updated ${shortPathTopic(filePath)}`
              : `inspected ${shortPathTopic(filePath)}`,
          category: "trail",
          role: fileRole,
          visibleNode: true,
        });
      }
    }

    const resultId =
      agent === "codex"
        ? readCodexToolResultId(record)
        : agent === "claude"
          ? readClaudeToolResultId(record)
          : undefined;
    if (resultId && toolTargets.has(resultId)) {
      const target = toolTargets.get(resultId)!;
      const failed = outputFailed(record, agent);
      const semantic = outputSemantics(
        record,
        failed,
        toolTopics.get(resultId) ?? "Tool output"
      );
      const role = roleForSemantic(semantic, { target });
      events.push({
        id: `${resultId}-result-${events.length}`,
        toolUseId: resultId,
        laneId: resultId,
        timestamp,
        action: semantic.action,
        target,
        label: semantic.label,
        topic: semantic.topic,
        reason: semantic.summary,
        category: semantic.category,
        role,
        visibleNode: semantic.visibleNode,
      });
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp).slice(-MAX_EVENTS);
}

function sessionIdFrom(records: Record<string, unknown>[], transcriptPath: string) {
  const sessionMeta = records.find((record) => record.type === "session_meta");
  const payload = sessionMeta?.payload as Record<string, unknown> | undefined;
  if (typeof payload?.id === "string") return payload.id;
  const claudeSession = records.find((record) => typeof record.sessionId === "string");
  if (typeof claudeSession?.sessionId === "string") return claudeSession.sessionId;
  const genericSession = records.find((record) => typeof record.session_id === "string");
  if (typeof genericSession?.session_id === "string") return genericSession.session_id;
  return basename(transcriptPath).replace(/\.jsonl$/, "");
}

function buildGraphFromRecords(
  records: Record<string, unknown>[],
  transcriptPath: string,
  mtimeMs: number,
  cwd: string,
  agent: AgentKind
): LiveAgentGraph | undefined {
  const selectedEvents = eventsFromRecords(records, cwd, agent);
  if (selectedEvents.length === 0) return undefined;

  const ids = agentIds(agent);
  const label = agentLabel(agent);
  const agentNode = agentNodeId(agent);
  const sessionId = sessionIdFrom(records, transcriptPath);
  const promptNode = sessionNodeId(agent, sessionId);
  const firstTime = selectedEvents[0].timestamp;
  const now = Date.now();
  const totalDuration = Math.max(
    4,
    (Math.max(now, selectedEvents.at(-1)!.timestamp) - firstTime) / 1000
  );

  const nodes = new Map<string, PositionedNode>();
  const edges = new Map<string, NeuroEdgeData>();
  addNode(nodes, agentNode, label, "agent", {
    kind: "agent",
    agentId: agent,
    sessionId,
    description: `Live ${label} session`,
    depth: 0,
    prominence: "core",
  });
  addNode(nodes, ROOT_ID, basename(cwd), "directory", {
    kind: "project",
    path: ".",
    description: `Current ${label} workspace`,
    depth: 1,
    prominence: "core",
  });
  addNode(nodes, ids.decision, "Live session", "decision", {
    kind: "memory",
    agentId: agent,
    sessionId,
    category: "handoff",
    description: `Latest ${label} activity`,
    depth: 1,
    prominence: "core",
  });
  addNode(nodes, promptNode, sessionLabel(sessionId), "decision", {
    kind: "memory",
    agentId: agent,
    sessionId,
    category: "context",
    roles: ["orchestrator"],
    description: `${label} prompt lane ${safeId(sessionId).slice(0, 10)}`,
    depth: 1,
    prominence: "branch",
  });
  addNode(nodes, ids.transcript, "session log", "artifact", {
    kind: "project",
    path:
      agent === "codex"
        ? ".codex/session.jsonl"
        : agent === "claude"
          ? ".claude/transcript.jsonl"
          : agent === "gemini"
            ? ".gemini/antigravity"
            : `.${agent}/session-log`,
    description: `${label} JSONL session log`,
    depth: 2,
    prominence: "branch",
  });
  addEdge(edges, agentNode, ROOT_ID, "decides", 1, {
    agentId: agent,
    sessionId,
    kind: "trail",
    category: "trail",
    role: "orchestrator",
  });
  addEdge(edges, agentNode, ids.decision, "decides", 0.86, {
    agentId: agent,
    sessionId,
    kind: "memory",
    category: "handoff",
    role: "orchestrator",
  });
  addEdge(edges, ids.decision, promptNode, "decides", 0.78, {
    agentId: agent,
    sessionId,
    kind: "memory",
    category: "context",
    role: "orchestrator",
  });
  addEdge(edges, promptNode, ids.transcript, "reads", 0.48, {
    agentId: agent,
    sessionId,
    kind: "structure",
    category: "context",
    role: "orchestrator",
  });
  addEdge(edges, ROOT_ID, ids.transcript, "reads", 0.48, {
    kind: "structure",
  });

  for (const event of selectedEvents) {
    if (event.path) {
      addPathNodes(nodes, edges, event.path);
    } else if (event.visibleNode) {
      addNode(nodes, event.target, event.label, "command", {
        kind: "project",
        description: event.reason,
        depth: 2,
        prominence: "branch",
      });
      addEdge(edges, ROOT_ID, event.target, "runs", 0.46, {
        agentId: agent,
        sessionId,
        kind: "trail",
        category: event.category,
        role: event.role,
      });
    }
  }

  applyEventRoles(nodes, selectedEvents, agentNode, ids.decision);

  let previous = promptNode;
  const signals: NeuroSignal[] = selectedEvents.map((event, index) => {
    const source = promptNode;
    previous = event.target;
    const edgeType: NeuroEdgeType =
      event.action === "edit_file"
        ? "edits"
        : event.action === "run_command"
          ? "runs"
          : event.action === "decision" || event.action === "write_text"
            ? "decides"
            : "reads";
    addEdge(edges, source, event.target, edgeType, index > selectedEvents.length - 8 ? 0.72 : 0.38, {
      agentId: agent,
      sessionId,
      timestamp: new Date(event.timestamp).toISOString(),
      eventCount: 1,
      category: event.category,
      role: event.role,
      kind: event.category === "handoff" ? "memory" : "trail",
    });
    return {
      id: event.id,
      time: Math.max(0, (event.timestamp - firstTime) / 1000),
      action: event.action,
      laneId: event.laneId,
      agentId: agent,
      sessionId,
      timestamp: new Date(event.timestamp).toISOString(),
      source,
      target: event.target,
      intensity: Math.min(1, 0.68 + index * 0.006),
      reason: event.reason,
      topic: event.topic,
      category: event.category,
      role: event.role,
    };
  });

  const evidence = [
    agentNode,
    promptNode,
    ROOT_ID,
    ids.transcript,
    ...selectedEvents
      .filter((event) => nodes.has(event.target))
      .slice(-10)
      .map((event) => event.target),
    ids.decision,
  ];
  const lastEventTime = Math.max(
    0,
    (selectedEvents.at(-1)!.timestamp - firstTime) / 1000
  );
  signals.push({
    id: `${agent}-live-summary`,
    time: Math.max(0, lastEventTime - 0.05),
    action: "decision",
    agentId: agent,
    sessionId,
    timestamp: new Date(mtimeMs).toISOString(),
    source: previous,
    target: ids.decision,
    intensity: 0.88,
    confidence: 0.92,
    reason: `${label} is building a quiet memory map from recent work.`,
    topic: "Live agent memory",
    category: "handoff",
    role: "orchestrator",
    evidence,
  });

  const nodeList = [...nodes.values()];
  applyLayout(nodeList, [ids], [agent]);

  const touchedTargets = new Set(
    selectedEvents
      .filter((event) => event.visibleNode && nodes.has(event.target))
      .map((event) => event.target)
  );
  const evidenceCount = signals.filter(
    (signal) => signal.category === "evidence" || signal.category === "handoff"
  ).length;
  const roleCounts = selectedEvents.reduce<RoleCounts>(
    (counts, event) => addRoleCount(counts, event.role),
    {}
  );
  const tokenTelemetry = tokenTelemetryFromRecords(records, agent);
  const lastTokenTotal =
    tokenTelemetry.usage?.last?.totalTokens ??
    tokenTelemetry.runs[0]?.usage?.totalTokens ??
    selectedEvents.length;
  const contextWindow =
    tokenTelemetry.usage?.contextWindow ?? Math.max(1, lastTokenTotal);

  return {
    id: `${agent}:${sessionId}`,
    name: `${label} live`,
    source: agent,
    nodes: nodeList,
    edges: [...edges.values()],
    signals,
    totalDuration,
    fileCount: nodeList.filter((node) => node.type === "file" || node.type === "test").length,
    skippedCount: 0,
    sessionId,
    lastUpdated: new Date(mtimeMs).toISOString(),
    isActive: now - mtimeMs < ACTIVE_MS,
    agents: [
      {
        id: agent,
        name: label,
        adapter: `${label} session log`,
        model: "live",
        role: selectedEvents.at(-1)?.topic ?? "Watching session",
        status: now - mtimeMs < ACTIVE_MS ? "active" : "ready",
        tokenBudget: contextWindow,
        tokensUsed: lastTokenTotal,
        accent: agentColor(agent),
        currentFocus: selectedEvents.at(-1)?.topic,
        currentRole: selectedEvents.at(-1)?.role,
        roleCounts,
        tokenUsage: tokenTelemetry.usage,
        tokenRuns: tokenTelemetry.runs,
        touchedCount: touchedTargets.size,
        evidenceCount,
      },
    ],
  };
}

async function buildCachedTranscriptGraph(
  cwd: string,
  agent: AgentKind,
  transcript: TranscriptCandidate,
  options: { syntheticTimestamps?: boolean } = {}
) {
  const key = cacheKey("graph", agent, cwd, transcript.filePath);
  const cached = transcriptGraphCache.get(key);
  if (cached && cached.mtimeMs === transcript.mtimeMs) return cached.graph;

  const { text, stat } = await readTail(transcript.filePath);
  const parsed = parseLines(text);
  const records = options.syntheticTimestamps
    ? recordsWithSyntheticTimestamps(parsed, stat.mtimeMs)
    : parsed;
  const graph = buildGraphFromRecords(
    records,
    transcript.filePath,
    stat.mtimeMs,
    cwd,
    agent
  );
  transcriptGraphCache.set(key, { mtimeMs: stat.mtimeMs, graph });
  return graph;
}

async function loadClaudeGraph(cwd: string) {
  const latest = await latestClaudeTranscript(cwd);
  if (!latest) return undefined;
  if (!isActiveMtime(latest.mtimeMs)) return undefined;
  return buildCachedTranscriptGraph(cwd, "claude", latest);
}

async function loadCodexGraph(cwd: string) {
  const transcripts = await latestCodexTranscripts(cwd);
  if (transcripts.length === 0) return undefined;
  const graphs = await Promise.all(
    transcripts.map((transcript) =>
      buildCachedTranscriptGraph(cwd, "codex", transcript)
    )
  );
  const available = graphs.filter((graph): graph is LiveAgentGraph => !!graph);
  if (available.length <= 1) return available[0];
  return mergeGraphs(available, {
    source: "codex",
    name: "Codex workspace memory",
  });
}

async function loadCursorGraph(cwd: string) {
  const transcripts = await latestCursorTranscripts(cwd);
  return loadTranscriptSet(cwd, "cursor", transcripts, "Cursor workspace memory");
}

async function loadClineGraph(cwd: string) {
  const transcripts = await latestClineTranscripts(cwd);
  return loadTranscriptSet(cwd, "cline", transcripts, "Cline workspace memory");
}

async function loadRooGraph(cwd: string) {
  const transcripts = await latestRooTranscripts(cwd);
  return loadTranscriptSet(cwd, "roo", transcripts, "Roo workspace memory");
}

async function loadUnknownAgentGraph(cwd: string) {
  const transcripts = await latestUnknownTranscripts(cwd);
  return loadTranscriptSet(cwd, "unknown", transcripts, "Unknown agent memory");
}

async function loadTranscriptSet(
  cwd: string,
  agent: AgentKind,
  transcripts: TranscriptCandidate[],
  name: string
) {
  if (transcripts.length === 0) return undefined;
  const graphs = await Promise.all(
    transcripts.map((transcript) =>
      buildCachedTranscriptGraph(cwd, agent, transcript, {
        syntheticTimestamps: true,
      })
    )
  );
  const available = graphs.filter((graph): graph is LiveAgentGraph => !!graph);
  if (available.length <= 1) return available[0];
  return mergeGraphs(available, {
    source: agent,
    name,
  });
}

async function loadGeminiGraph(cwd: string) {
  const artifactRecords = await readGeminiArtifactRecords(cwd);
  const chatTranscripts = await latestGeminiChatTranscripts(cwd);
  const chatRecordSets = await Promise.all(
    chatTranscripts.map(async (transcript) => {
      const { text, stat } = await readTail(transcript.filePath);
      return recordsWithSyntheticTimestamps(parseLines(text), stat.mtimeMs);
    })
  );
  const records = [...artifactRecords, ...chatRecordSets.flat()].sort(
    (a, b) =>
      Date.parse(`${a.timestamp ?? ""}`) - Date.parse(`${b.timestamp ?? ""}`)
  );
  if (records.length === 0) return undefined;
  const latestTimestamp = Math.max(
    ...records.map((record) => Date.parse(`${record.timestamp ?? ""}`))
  );
  const graph = buildGraphFromRecords(
    records,
    path.join(os.homedir(), ".gemini", "antigravity", "brain"),
    latestTimestamp,
    cwd,
    "gemini"
  );
  return graph?.isActive ? graph : undefined;
}

function newestGraph(graphs: Array<LiveAgentGraph | undefined>) {
  const available = graphs.filter((graph): graph is LiveAgentGraph => !!graph);
  available.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated);
  });
  return available[0];
}

function mergeRoleCounts(a: RoleCounts = {}, b: RoleCounts = {}) {
  const merged: RoleCounts = { ...a };
  for (const [role, count] of Object.entries(b) as Array<[AgentRole, number]>) {
    merged[role] = (merged[role] ?? 0) + count;
  }
  return merged;
}

function mergeGraphs(
  graphs: LiveAgentGraph[],
  options: { source?: GraphSource; name?: string } = {}
): LiveAgentGraph | undefined {
  const available = graphs
    .filter((graph) => graph.signals.length > 0)
    .sort((a, b) => Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated));
  if (available.length === 0) return undefined;

  const nodes = new Map<string, PositionedNode>();
  const edges = new Map<string, NeuroEdgeData>();
  const agents = new Map<string, AgentTelemetry>();

  for (const graph of available) {
    for (const node of graph.nodes) {
      const existing = nodes.get(node.id);
      if (!existing) {
        nodes.set(node.id, { ...node });
        continue;
      }
      existing.visitCount = Math.max(existing.visitCount, node.visitCount);
      existing.activation = Math.max(existing.activation, node.activation);
      existing.description = existing.description ?? node.description;
      existing.roles = sortRoles([...(existing.roles ?? []), ...(node.roles ?? [])]);
    }
    for (const edge of graph.edges) {
      const existing = edges.get(edge.id);
      if (!existing) {
        edges.set(edge.id, { ...edge });
        continue;
      }
      existing.weight = Math.max(existing.weight, edge.weight);
      existing.eventCount = (existing.eventCount ?? 1) + (edge.eventCount ?? 1);
    }
    for (const agent of graph.agents ?? []) {
      const existing = agents.get(agent.id);
      if (!existing) {
        agents.set(agent.id, { ...agent });
        continue;
      }
      existing.status =
        existing.status === "active" || agent.status === "active"
          ? "active"
          : existing.status;
      existing.tokenBudget = Math.max(existing.tokenBudget, agent.tokenBudget);
      existing.tokensUsed += agent.tokensUsed;
      existing.roleCounts = mergeRoleCounts(existing.roleCounts, agent.roleCounts);
      existing.touchedCount = (existing.touchedCount ?? 0) + (agent.touchedCount ?? 0);
      existing.evidenceCount =
        (existing.evidenceCount ?? 0) + (agent.evidenceCount ?? 0);
    }
  }

  const stampedSignals = available
    .flatMap((graph) => graph.signals)
    .filter((signal) => signal.timestamp)
    .sort(
      (a, b) =>
        Date.parse(a.timestamp ?? "") - Date.parse(b.timestamp ?? "") ||
        a.id.localeCompare(b.id)
    );
  if (stampedSignals.length === 0) return newestGraph(available);

  const firstTime = Date.parse(stampedSignals[0].timestamp ?? "");
  const lastTime = Math.max(
    Date.now(),
    ...stampedSignals.map((signal) => Date.parse(signal.timestamp ?? ""))
  );
  const signals = stampedSignals.map((signal) => ({
    ...signal,
    time: Math.max(0, (Date.parse(signal.timestamp ?? "") - firstTime) / 1000),
  }));

  const agentKinds = [...agents.keys()].filter(isSupportedAgentId);
  const specials = agentKinds.map(agentIds);
  const nodeList = [...nodes.values()];
  applyLayout(nodeList, specials, agentKinds);

  const lastUpdated = new Date(
    Math.max(...available.map((graph) => Date.parse(graph.lastUpdated)))
  ).toISOString();
  const sessionId = available.map((graph) => graph.sessionId).join("+");

  return {
    id: `multi:${sessionId}`,
    name: options.name ?? "Project memory graph",
    source: options.source ?? "multi-agent",
    nodes: nodeList,
    edges: [...edges.values()],
    signals,
    totalDuration: Math.max(4, (lastTime - firstTime) / 1000),
    fileCount: nodeList.filter((node) => node.type === "file" || node.type === "test")
      .length,
    skippedCount: available.reduce((sum, graph) => sum + graph.skippedCount, 0),
    sessionId,
    lastUpdated,
    isActive: available.some((graph) => graph.isActive),
    agents: [...agents.values()],
  };
}

async function loadMultiAgentGraph(cwd: string) {
  const graphs = await Promise.all(SUPPORTED_AGENT_IDS.map((agent) => loadAgentGraph(cwd, agent)));
  const available = graphs.filter((graph): graph is LiveAgentGraph => !!graph);
  const active = available.filter((graph) => graph.isActive);
  return mergeGraphs(active);
}

function loadAgentGraph(cwd: string, agent: AgentKind) {
  if (agent === "codex") return loadCodexGraph(cwd);
  if (agent === "claude") return loadClaudeGraph(cwd);
  if (agent === "gemini") return loadGeminiGraph(cwd);
  if (agent === "cursor") return loadCursorGraph(cwd);
  if (agent === "cline") return loadClineGraph(cwd);
  if (agent === "roo") return loadRooGraph(cwd);
  return loadUnknownAgentGraph(cwd);
}

function isLocalRequest(req: IncomingMessage) {
  const remote = req.socket.remoteAddress;
  return (
    !remote ||
    remote === "127.0.0.1" ||
    remote === "::1" ||
    remote === "::ffff:127.0.0.1"
  );
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export async function handleLiveAgentRequest(
  req: IncomingMessage,
  res: ServerResponse,
  cwd: string
) {
  const url = req.url ?? "";
  const wantsAgents = url.startsWith("/api/agents/live");
  const wantsAgent = url.startsWith("/api/agent/live");
  const wantsCodex = url.startsWith("/api/codex/live");
  const wantsClaude = url.startsWith("/api/claude/live");
  const wantsGemini = url.startsWith("/api/gemini/live");
  const wantsCursor = url.startsWith("/api/cursor/live");
  const wantsCline = url.startsWith("/api/cline/live");
  const wantsRoo = url.startsWith("/api/roo/live");
  const wantsUnknown = url.startsWith("/api/unknown-agent/live");
  if (
    !wantsAgents &&
    !wantsAgent &&
    !wantsCodex &&
    !wantsClaude &&
    !wantsGemini &&
    !wantsCursor &&
    !wantsCline &&
    !wantsRoo &&
    !wantsUnknown
  ) {
    return false;
  }

  if (!isLocalRequest(req)) {
    sendJson(res, 403, { error: "Live agent logs are only exposed to localhost." });
    return true;
  }

  try {
    const graph = wantsAgents
      ? await loadMultiAgentGraph(cwd)
      : wantsCodex
      ? await loadCodexGraph(cwd)
      : wantsClaude
        ? await loadClaudeGraph(cwd)
        : wantsGemini
          ? await loadGeminiGraph(cwd)
          : wantsCursor
            ? await loadCursorGraph(cwd)
            : wantsCline
              ? await loadClineGraph(cwd)
              : wantsRoo
                ? await loadRooGraph(cwd)
                : wantsUnknown
                  ? await loadUnknownAgentGraph(cwd)
                  : newestGraph(
                      await Promise.all(
                        SUPPORTED_AGENT_IDS.map((agent) => loadAgentGraph(cwd, agent))
                      )
                    );
    sendJson(res, graph ? 200 : 404, graph ?? { error: "No live agent session found" });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Failed to read live agent session",
    });
  }
  return true;
}
