#!/usr/bin/env node
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildReplayHtml } from "../src/replay/replayDocument.js";
import {
  SUPPORTED_AGENT_IDS,
  agentColor,
  agentLabel,
} from "../src/lib/agentRegistry.js";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cwd = process.cwd();
const ACTIVE_MS = 120_000;

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("-") ? args[0] : "help";

function printHelp() {
  console.log(`NeuroTrail - AI coding session flight recorder

Usage:
  neurotrail watch
  neurotrail report [--target codex|claude|cursor] [--redact]
  neurotrail sessions

Commands:
  watch      Start the local NeuroTrail viewer for this workspace.
  report     Export .neurotrail/reports/latest.html and handoff/latest.md.
  sessions   List recent supported local agent sessions for this workspace.

Options:
  --target <agent>  Next-agent handoff target. Default: codex.
  --redact          Apply basic redaction to exported report and handoff.
  --no-open         Do not auto-open the browser on watch.
  --help            Show command help.`);
}

function optionValue(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] && !args[index + 1].startsWith("-")
    ? args[index + 1]
    : fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function projectKey(value) {
  return value.replaceAll("/", "-");
}

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectJsonlFiles(dir, agent = "unknown", depth = 0) {
  if (depth > 6) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectJsonlFiles(filePath, agent, depth + 1);
      if (
        !entry.isFile() ||
        (!entry.name.endsWith(".jsonl") && !entry.name.endsWith(".json"))
      ) {
        return [];
      }
      const stat = await fs.stat(filePath);
      return [{ filePath, agent, mtimeMs: Number(stat.mtimeMs) }];
    })
  );
  return nested.flat();
}

async function readFirstJsonLine(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  const firstLine = text.split("\n").find((line) => line.trim().startsWith("{"));
  if (!firstLine) return undefined;
  try {
    return JSON.parse(firstLine);
  } catch {
    return undefined;
  }
}

async function readJsonl(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const records = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // Session logs can be appended while reading; ignore partial tails.
    }
  }
  return records;
}

async function readRecordsForCandidate(candidate) {
  if (candidate.kind === "gemini_artifact") {
    const metadataText = await fs.readFile(candidate.filePath, "utf8").catch(() => "");
    let metadata = {};
    try {
      metadata = JSON.parse(metadataText);
    } catch {
      metadata = {};
    }
    const artifactPath = candidate.filePath.replace(/\.metadata\.json$/, "");
    const content = await fs.readFile(artifactPath, "utf8").catch(() => "");
    return [
      {
        type: "gemini_artifact",
        timestamp:
          typeof metadata.updatedAt === "string"
            ? metadata.updatedAt
            : new Date(candidate.mtimeMs).toISOString(),
        sessionId: path.basename(path.dirname(candidate.filePath)),
        artifactType: metadata.artifactType,
        summary: typeof metadata.summary === "string" ? metadata.summary : "",
        content,
        artifactPath,
        label: path.basename(artifactPath),
      },
    ];
  }
  return readJsonl(candidate.filePath);
}

async function codexCandidates() {
  const dir = path.join(os.homedir(), ".codex", "sessions");
  const files = (await collectJsonlFiles(dir, "codex")).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const matches = [];
  for (const candidate of files.slice(0, 80)) {
    const first = await readFirstJsonLine(candidate.filePath);
    if (first?.type === "session_meta" && first.payload?.cwd === cwd) {
      matches.push({ ...candidate, workspaceVerified: true });
    }
  }
  return matches;
}

async function claudeCandidates() {
  const dir = path.join(os.homedir(), ".claude", "projects", projectKey(cwd));
  const entries = await fs.readdir(dir).catch(() => []);
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".jsonl"))
      .map(async (entry) => {
        const filePath = path.join(dir, entry);
        const stat = await fs.stat(filePath);
        return { filePath, agent: "claude", mtimeMs: Number(stat.mtimeMs), workspaceVerified: true };
      })
  );
  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function cursorProjectKey(value) {
  return value.replace(/^\/+/, "").replace(/[^a-zA-Z0-9]+/g, "-");
}

function appSupportDir(...parts) {
  return path.join(os.homedir(), "Library", "Application Support", ...parts);
}

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function readTail(filePath) {
  const stat = await fs.stat(filePath);
  const start = Math.max(0, stat.size - 3_000_000);
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

function hasWorkspaceReference(text, workspace) {
  if (!text) return false;
  const normalized = workspace.replaceAll(path.sep, "/");
  const candidates = new Set([
    workspace,
    normalized,
    pathToFileURL(workspace).href,
    pathToFileURL(workspace + path.sep).href,
  ]);
  return [...candidates].some((candidate) => text.includes(candidate));
}

async function activeGenericCandidates(agent, roots) {
  const candidates = (
    await Promise.all(
      roots.map(async (root) => {
        const files = await collectJsonlFiles(root.path, agent);
        return files.map((file) => ({
          ...file,
          workspaceVerified:
            !!root.allowLocalWorkspace && isPathInside(cwd, file.filePath),
        }));
      })
    )
  )
    .flat()
    .filter((candidate) => Date.now() - candidate.mtimeMs < ACTIVE_MS)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const matches = [];
  for (const candidate of candidates.slice(0, 60)) {
    if (candidate.workspaceVerified) {
      matches.push(candidate);
    } else {
      const { text } = await readTail(candidate.filePath).catch(() => ({ text: "" }));
      if (hasWorkspaceReference(text, cwd)) {
        matches.push({ ...candidate, workspaceVerified: true });
      }
    }
    if (matches.length >= 3) break;
  }
  return matches;
}

async function cursorCandidates() {
  const dir = path.join(
    os.homedir(),
    ".cursor",
    "projects",
    cursorProjectKey(cwd),
    "agent-transcripts"
  );
  return (await collectJsonlFiles(dir, "cursor"))
    .filter((candidate) => Date.now() - candidate.mtimeMs < ACTIVE_MS)
    .map((candidate) => ({ ...candidate, workspaceVerified: true }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 3);
}

async function clineCandidates() {
  return activeGenericCandidates("cline", [
    { path: appSupportDir("Code", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks") },
    { path: appSupportDir("Cursor", "User", "globalStorage", "saoudrizwan.claude-dev", "tasks") },
    { path: path.join(os.homedir(), ".cline") },
    { path: path.join(cwd, ".cline"), allowLocalWorkspace: true },
  ]);
}

async function rooCandidates() {
  return activeGenericCandidates("roo", [
    { path: appSupportDir("Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "tasks") },
    { path: appSupportDir("Code", "User", "globalStorage", "rooveterinaryinc.roo-code", "tasks") },
    { path: appSupportDir("Cursor", "User", "globalStorage", "rooveterinaryinc.roo-cline", "tasks") },
    { path: appSupportDir("Cursor", "User", "globalStorage", "rooveterinaryinc.roo-code", "tasks") },
    { path: path.join(os.homedir(), ".roo") },
    { path: path.join(cwd, ".roo"), allowLocalWorkspace: true },
  ]);
}

async function unknownCandidates() {
  return activeGenericCandidates("unknown", [
    { path: path.join(cwd, ".agent"), allowLocalWorkspace: true },
    { path: path.join(cwd, ".agents"), allowLocalWorkspace: true },
    { path: path.join(cwd, ".ai"), allowLocalWorkspace: true },
    { path: path.join(cwd, ".neurotrail", "sessions"), allowLocalWorkspace: true },
  ]);
}

async function geminiChatCandidates() {
  const tmpRoot = path.join(os.homedir(), ".gemini", "tmp");
  const users = await fs.readdir(tmpRoot, { withFileTypes: true }).catch(() => []);
  const roots = users
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ path: path.join(tmpRoot, entry.name, "chats") }));
  return activeGenericCandidates("gemini", roots);
}

async function geminiArtifactCandidates() {
  const roots = [
    path.join(os.homedir(), ".gemini", "antigravity", "brain"),
    path.join(os.homedir(), ".gemini", "antigravity-ide", "brain"),
    path.join(os.homedir(), ".gemini", "antigravity-backup", "brain"),
  ];
  const metadata = [];
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
        metadata.push({ filePath, agent: "gemini", kind: "gemini_artifact", mtimeMs: Number(stat.mtimeMs) });
      }
    }
  }
  const matches = [];
  for (const candidate of metadata.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 20)) {
    const metadataText = await fs.readFile(candidate.filePath, "utf8").catch(() => "");
    const artifactPath = candidate.filePath.replace(/\.metadata\.json$/, "");
    const content = await fs.readFile(artifactPath, "utf8").catch(() => "");
    if (hasWorkspaceReference(`${metadataText}\n${content}`, cwd) || pathsFromInput(content).length >= 2) {
      matches.push({ ...candidate, workspaceVerified: true });
    }
    if (matches.length >= 3) break;
  }
  return matches;
}

async function geminiCandidates() {
  return [...(await geminiChatCandidates()), ...(await geminiArtifactCandidates())]
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 3);
}

async function allCandidates() {
  const byAgent = await Promise.all([
    codexCandidates(),
    claudeCandidates(),
    geminiCandidates(),
    cursorCandidates(),
    clineCandidates(),
    rooCandidates(),
    unknownCandidates(),
  ]);
  return byAgent.flat().sort(
    (a, b) => b.mtimeMs - a.mtimeMs
  );
}

function collectStrings(input, output = []) {
  if (typeof input === "string") {
    output.push(input);
    return output;
  }
  if (!input || typeof input !== "object") return output;
  if (Array.isArray(input)) {
    for (const item of input) collectStrings(item, output);
    return output;
  }
  for (const value of Object.values(input)) collectStrings(value, output);
  return output;
}

function normalizePathCandidate(value) {
  const clean = value
    .replace(/^['"`]+|['"`:,;)\]}]+$/g, "")
    .replace(/:\d+(?::\d+)?$/, "")
    .replace(/^\.\//, "")
    .trim();
  if (clean.length < 3 || clean.length > 260) return undefined;
  if (/^https?:\/\//i.test(clean) || clean.includes("node_modules/")) return undefined;
  if (!/[/.]/.test(clean)) return undefined;
  if (path.isAbsolute(clean)) {
    const relative = path.relative(cwd, clean).replaceAll(path.sep, "/");
    if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
    return relative;
  }
  if (clean.startsWith("../")) return undefined;
  return clean.replaceAll("\\", "/");
}

function pathsFromInput(input) {
  const paths = new Set();
  for (const value of collectStrings(input)) {
    for (const match of value.matchAll(
      /(?:["'`])?((?:\/Users\/[^\s"'`]+)|(?:\.\/|\b)[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)*\.[A-Za-z0-9]{1,8})(?:["'`])?/g
    )) {
      const candidate = normalizePathCandidate(match[1]);
      if (candidate) paths.add(candidate);
    }
  }
  return [...paths].slice(0, 8);
}

function parseArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return { value };
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : { value };
  } catch {
    return { value };
  }
}

function actionForTool(name, input) {
  const lower = name.toLowerCase();
  const command = input.command || input.cmd || "";
  if (lower.includes("patch") || lower.includes("edit") || lower.includes("write")) {
    return "edit_file";
  }
  if (/npm run build|npm run lint|\btest\b|\bvitest\b|\bjest\b|\bpytest\b/.test(command)) {
    return "test_passed";
  }
  if (command || lower.includes("exec_command") || lower.includes("bash")) {
    return "run_command";
  }
  if (lower.includes("read") || lower.includes("sed") || lower.includes("cat")) {
    return "read_file";
  }
  if (lower.includes("search") || lower.includes("grep") || lower.includes("rg")) {
    return "search";
  }
  return "open_symbol";
}

function inferRole(event) {
  const text = `${event.action} ${event.summary ?? ""} ${event.path ?? ""}`.toLowerCase();
  if (/\b(plan|handoff|decision|final)\b/.test(text)) return "orchestrator";
  if (/\b(test|lint|build|verify|run_command|passed|failed)\b/.test(text)) return "verification";
  if (/\b(edit|patch|write|updated|create)\b/.test(text)) return "coding";
  if (/\b(readme|docs?|markdown|prompt|writing|write_text)\b/.test(text)) return "writing";
  if (/\b(review|risk|waste|diff)\b/.test(text)) return "review";
  return "research";
}

function eventSummary(action, pathValue, toolName) {
  if (pathValue) {
    const name = path.basename(pathValue);
    if (action === "edit_file") return `edited ${name}`;
    if (action === "read_file" || action === "open_symbol") return `inspected ${name}`;
    if (action === "search") return `searched ${name}`;
  }
  return toolName.replace(/^mcp__/, "").replaceAll("_", " ").slice(0, 70);
}

function textFromContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => (typeof item?.text === "string" ? item.text : ""))
    .filter(Boolean)
    .join("\n");
}

function openAiStyleToolUses(record) {
  const calls = Array.isArray(record.tool_calls)
    ? record.tool_calls
    : Array.isArray(record.message?.tool_calls)
      ? record.message.tool_calls
      : [];
  return calls
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const fn = item.function || {};
      return {
        name: item.name || fn.name || "tool_call",
        id: item.id || `openai-tool-${index}`,
        input: parseArguments(fn.arguments ?? item.args ?? item.input),
      };
    });
}

function eventsFromRecords(records, agent) {
  const events = [];
  for (const record of records) {
    const timestamp = record.timestamp || new Date().toISOString();
    if (agent === "codex") {
      const payload = record.payload || {};
      if (record.type === "response_item" && payload.type === "message") {
        const text = textFromContent(payload.content);
        if (payload.role === "assistant" && text.trim()) {
          events.push({
            timestamp,
            agent,
            action: "write_text",
            role: "writing",
            summary: text.trim().split("\n")[0].slice(0, 100),
          });
        }
      }
      if (
        record.type === "response_item" &&
        (payload.type === "function_call" || payload.type === "custom_tool_call")
      ) {
        const input = parseArguments(payload.arguments ?? payload.input);
        const toolName = payload.namespace
          ? `${payload.namespace}.${payload.name}`
          : payload.name || "tool";
        const action = actionForTool(toolName, input);
        const paths = pathsFromInput(input);
        const pathValue = paths[0];
        const event = {
          timestamp,
          agent,
          action,
          path: pathValue,
          summary: eventSummary(action, pathValue, toolName),
          toolName,
        };
        events.push({ ...event, role: inferRole(event) });
      }
    } else if (agent === "gemini") {
      if (record.type === "gemini_artifact") {
        const summary = (record.summary || record.content || "Gemini artifact").toString();
        const role = /review|audit|risk|health/i.test(`${record.label ?? ""} ${record.artifactType ?? ""} ${summary}`)
          ? "review"
          : "writing";
        events.push({
          timestamp,
          agent,
          action: "write_text",
          role,
          summary: summary.trim().split("\n")[0].slice(0, 100),
        });
        for (const pathValue of pathsFromInput(`${record.summary ?? ""}\n${record.content ?? ""}`).slice(0, 12)) {
          const event = {
            timestamp,
            agent,
            action: "read_file",
            path: pathValue,
            summary: `referenced ${path.basename(pathValue)}`,
            toolName: "gemini_artifact",
          };
          events.push({ ...event, role });
        }
        continue;
      }
      if (record.type === "gemini" && typeof record.content === "string" && record.content.trim()) {
        events.push({
          timestamp,
          agent,
          action: "write_text",
          role: "writing",
          summary: record.content.trim().split("\n")[0].slice(0, 100),
        });
      }
      for (const item of Array.isArray(record.toolCalls) ? record.toolCalls : []) {
        if (!item?.name) continue;
        const input = parseArguments(item.args);
        const action = actionForTool(item.name, input);
        const paths = pathsFromInput(input);
        const pathValue = paths[0];
        const event = {
          timestamp: item.timestamp || timestamp,
          agent,
          action,
          path: pathValue,
          summary: eventSummary(action, pathValue, item.name),
          toolName: item.name,
        };
        events.push({ ...event, role: inferRole(event) });
      }
    } else {
      const message = record.message || {};
      const content = Array.isArray(message.content) ? message.content : [];
      const text = textFromContent(content);
      if (record.type === "assistant" && text.trim()) {
        events.push({
          timestamp,
          agent,
          action: "write_text",
          role: "writing",
          summary: text.trim().split("\n")[0].slice(0, 100),
        });
      }
      for (const item of content) {
        if (item?.type !== "tool_use" || !item.name) continue;
        const input = parseArguments(item.input);
        const action = actionForTool(item.name, input);
        const paths = pathsFromInput(input);
        const pathValue = paths[0];
        const event = {
          timestamp,
          agent,
          action,
          path: pathValue,
          summary: eventSummary(action, pathValue, item.name),
          toolName: item.name,
        };
        events.push({ ...event, role: inferRole(event) });
      }
      for (const item of openAiStyleToolUses(record)) {
        const action = actionForTool(item.name, item.input);
        const paths = pathsFromInput(item.input);
        const pathValue = paths[0];
        const event = {
          timestamp,
          agent,
          action,
          path: pathValue,
          summary: eventSummary(action, pathValue, item.name),
          toolName: item.name,
        };
        events.push({ ...event, role: inferRole(event) });
      }
    }
  }
  return events.slice(-120);
}

function tokenUsageFromRecords(records, agent) {
  if (agent === "codex") {
    let latest;
    for (const record of records) {
      if (record.type !== "event_msg" || record.payload?.type !== "token_count") continue;
      latest = record.payload.info;
    }
    return latest?.total_token_usage;
  }
  if (agent === "gemini") {
    const total = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
    for (const record of records) {
      const tokens = record.tokens;
      if (!tokens || typeof tokens !== "object") continue;
      total.input_tokens += tokens.input || 0;
      total.cached_input_tokens += tokens.cached || 0;
      total.output_tokens += (tokens.output || 0) + (tokens.tool || 0);
      total.reasoning_output_tokens += tokens.thoughts || 0;
    }
    const totalTokens =
      total.input_tokens +
      total.cached_input_tokens +
      total.output_tokens +
      total.reasoning_output_tokens;
    return totalTokens > 0 ? { ...total, total_tokens: totalTokens } : undefined;
  }
  let total = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
  for (const record of records) {
    const usage = record.message?.usage;
    if (!usage) continue;
    total.input_tokens += usage.input_tokens || 0;
    total.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
    total.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
    total.output_tokens += usage.output_tokens || 0;
  }
  const totalTokens =
    total.input_tokens +
    total.cache_creation_input_tokens +
    total.cache_read_input_tokens +
    total.output_tokens;
  return totalTokens > 0 ? { ...total, total_tokens: totalTokens } : undefined;
}

function redactText(input) {
  const patterns = [
    /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
    /\b(?:sk|pk|rk|ghp|github_pat|xox[baprs])_[A-Za-z0-9_:-]{16,}\b/g,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    /\/Users\/[^/\s"'<>]+/g,
    /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s<>]{8,}/gi,
    /^[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=.*$/gim,
    /\b[A-Za-z0-9+/=_-]{48,}\b/g,
  ];
  return patterns.reduce((text, pattern) => text.replace(pattern, "[redacted]"), input);
}

function unique(items, limit = 10) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function buildEventPayload({ events, sessions, handoff, filesTouched, inspected }) {
  const agentNames = [...new Set(events.map((e) => e.agent))];
  const agentNodes = agentNames.map((name, index) => ({
    id: "agent:" + name,
    label: agentLabel(name),
    type: "agent",
    kind: "agent",
    agentId: name,
    position: { x: index * 70 - ((agentNames.length - 1) * 70) / 2, y: 0 },
    activation: 0,
    visitCount: 0,
  }));
  const filePaths = [...new Set(events.map((e) => e.path).filter(Boolean))];
  const fileNodes = filePaths.map((p, index) => {
    const angle = (index / Math.max(1, filePaths.length)) * Math.PI * 2;
    const radius = 210 + (index % 6) * 34;
    return {
      id: "file:" + p,
      label: p.split("/").pop() || p,
      path: p,
      type: "file",
      position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
      activation: 0,
      visitCount: 0,
    };
  });
  const nodes = [...agentNodes, ...fileNodes];

  const base = events.length ? Date.parse(events[0].timestamp) : Date.now();
  let signals = events.map((e, index) => {
    const ms = Date.parse(e.timestamp);
    const time = Number.isFinite(ms) ? Math.max(0, (ms - base) / 1000) : index * 0.6;
    return {
      id: "sig-" + index,
      time,
      action: e.action || "think",
      agentId: e.agent,
      target: e.path ? "file:" + e.path : "agent:" + e.agent,
      source: "agent:" + e.agent,
      intensity: 0.72,
      reason: e.summary || e.action || "agent step",
      role: e.role,
    };
  });
  const maxTime = signals.reduce((m, s) => Math.max(m, s.time), 0);
  if (maxTime <= 0) signals = signals.map((s, i) => ({ ...s, time: i * 0.6 }));

  const edgeSeen = new Set();
  const edges = [];
  for (const s of signals) {
    const key = s.source + ">" + s.target;
    if (edgeSeen.has(key)) continue;
    edgeSeen.add(key);
    edges.push({
      id: "e-" + edges.length,
      source: s.source,
      target: s.target,
      type: "reads",
      kind: "trail",
      agentId: s.agentId,
      weight: 1,
    });
  }

  const totalTokens = sessions.reduce((sum, sx) => sum + (sx.tokenUsage?.total_tokens || 0), 0);
  // Tiered estimate (USD/1M): cache reads are an order of magnitude cheaper than
  // fresh input, so blending everything at one rate wildly overstates cost.
  const tiered = sessions.reduce(
    (acc, sx) => {
      const u = sx.tokenUsage || {};
      acc.input += u.input_tokens || 0;
      acc.cacheCreate += u.cache_creation_input_tokens || 0;
      acc.cacheRead += u.cache_read_input_tokens || u.cached_input_tokens || 0;
      acc.output += (u.output_tokens || 0) + (u.reasoning_output_tokens || 0);
      return acc;
    },
    { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 }
  );
  const estimatedCostUsd =
    (tiered.input * 3 + tiered.cacheCreate * 3.75 + tiered.cacheRead * 0.3 + tiered.output * 15) /
    1000000;
  const deadTrails = inspected.filter((f) => !filesTouched.includes(f));
  const wasted = events.filter((e) => e.path && e.action !== "edit_file" && deadTrails.includes(e.path)).length;
  const steps = events.length;

  return {
    version: "2",
    title: "NeuroTrail session",
    agents: agentNames.map((name) => {
      const sessionSet = sessions.filter((session) => session.agent === name);
      const total = sessionSet.reduce(
        (sum, session) => sum + (session.tokenUsage?.total_tokens || 0),
        0
      );
      return {
        id: name,
        name: agentLabel(name),
        adapter: `${agentLabel(name)} local session`,
        model: "local",
        role: "Report source",
        status: sessionSet.some((session) => Date.now() - session.mtimeMs < ACTIVE_MS)
          ? "active"
          : "ready",
        tokenBudget: Math.max(1, total),
        tokensUsed: total,
        accent: agentColor(name),
      };
    }),
    nodes,
    edges,
    signals,
    summary: {
      totalTokens,
      estimatedCostUsd,
      steps,
      filesTouched: filesTouched.length,
      wastedSteps: wasted,
      wastePct: steps > 0 ? Math.min(1, wasted / steps) : 0,
      deadTrails: deadTrails.slice(0, 6),
    },
    handoff: {
      summary:
        "NeuroTrail captured " + events.length + " agent steps from " +
        (sessions.map((s) => s.agent).join(", ") || "local sessions") + ".",
      researchDone: [],
      codingDone: [],
      verification: [],
      reviewNeeded: [],
      evidence: [],
      filesTouched,
      deadTrails: deadTrails.slice(0, 6),
      nextRecommendedFiles: unique([...filesTouched, ...inspected], 6),
      nextRecommendedRole: "research",
      promptForNextAgent: handoff,
    },
  };
}

function renderReport({ events, sessions, target, redacted }) {
  const filesTouched = unique(events.filter((e) => e.action === "edit_file").map((e) => e.path), 12);
  const inspected = unique(events.filter((e) => e.action !== "edit_file").map((e) => e.path), 12);
  const tokenLines = sessions
    .map((session) => {
      const total = session.tokenUsage?.total_tokens;
      return total ? `${session.agent}: ${total.toLocaleString()} tokens` : undefined;
    })
    .filter(Boolean);
  const handoff = renderHandoff({ events, filesTouched, inspected, target, tokenLines, redacted });
  const html = buildReplayHtml(
    buildEventPayload({ events, sessions, handoff, filesTouched, inspected })
  );
  return { html, handoff };
}

function renderHandoff({ events, filesTouched, inspected, target, tokenLines, redacted }) {
  const research = unique(events.filter((e) => e.role === "research").map((e) => e.summary), 8);
  const coding = unique(events.filter((e) => e.role === "coding").map((e) => e.summary), 8);
  const verification = unique(events.filter((e) => e.role === "verification").map((e) => e.summary), 8);
  return `# NeuroTrail Handoff for ${target}

NeuroTrail captured ${events.length} normalized agent steps. Basic redaction ${redacted ? "enabled" : "disabled"}.

## Research done
${research.map((item) => `- ${item}`).join("\n") || "- None captured yet."}

## Coding done
${coding.map((item) => `- ${item}`).join("\n") || "- None captured yet."}

## Verification
${verification.map((item) => `- ${item}`).join("\n") || "- None captured yet."}

## Files touched
${filesTouched.map((item) => `- ${item}`).join("\n") || "- None captured yet."}

## Recommended files
${unique([...filesTouched, ...inspected], 8).map((item) => `- ${item}`).join("\n") || "- None captured yet."}

## Token cost
${tokenLines.map((item) => `- ${item}`).join("\n") || "- No token usage captured."}

## Instruction
- Use this as ${target} working context. Inspect recommended files first, then continue from the latest verified state.
`;
}

async function exportReport({ target = "codex", redacted = false } = {}) {
  const candidates = await allCandidates();
  if (candidates.length === 0) {
    throw new Error("No supported local agent sessions found for this workspace.");
  }
  const selected = [];
  const seenAgents = new Set();
  for (const candidate of candidates) {
    if (seenAgents.has(candidate.agent)) continue;
    selected.push(candidate);
    seenAgents.add(candidate.agent);
    if (selected.length >= SUPPORTED_AGENT_IDS.length) break;
  }
  const sessions = [];
  const events = [];
  for (const candidate of selected) {
    const records = await readRecordsForCandidate(candidate);
    const sessionEvents = eventsFromRecords(records, candidate.agent);
    sessions.push({
      ...candidate,
      tokenUsage: tokenUsageFromRecords(records, candidate.agent),
      eventCount: sessionEvents.length,
    });
    events.push(...sessionEvents);
  }
  events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const rendered = renderReport({ events, sessions, target, redacted });
  const finalHtml = redacted ? redactText(rendered.html) : rendered.html;
  const finalHandoff = redacted ? redactText(rendered.handoff) : rendered.handoff;
  const root = path.join(cwd, ".neurotrail");
  const reportsDir = path.join(root, "reports");
  const handoffDir = path.join(root, "handoff");
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.mkdir(handoffDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const timestampedReport = path.join(reportsDir, `${timestamp}-neurotrail-report.html`);
  const latestReport = path.join(reportsDir, "latest.html");
  const latestHandoff = path.join(handoffDir, "latest.md");
  await Promise.all([
    fs.writeFile(timestampedReport, finalHtml, "utf8"),
    fs.writeFile(latestReport, finalHtml, "utf8"),
    fs.writeFile(latestHandoff, finalHandoff, "utf8"),
  ]);
  return { latestReport, timestampedReport, latestHandoff, sessions, events };
}

function openBrowser(url) {
  const opener =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
  } catch {
    // Opening the browser is best-effort; the URL is printed regardless.
  }
}

async function runWatch() {
  const port = optionValue("--port", "5173");
  const url = `http://localhost:${port}`;
  console.log(`Starting NeuroTrail viewer for ${cwd}`);
  console.log(`Open ${url}`);
  console.log("NeuroTrail will not start Claude, Codex, Cursor, or any external AI agent.");
  if (!hasFlag("--no-open")) {
    setTimeout(() => openBrowser(url), 1800);
  }
  const child = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", port],
    {
      cwd: packageRoot,
      stdio: "inherit",
      env: { ...process.env, NEUROTRAIL_WORKSPACE: cwd },
    }
  );
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function runSessions() {
  const candidates = await allCandidates();
  if (candidates.length === 0) {
    console.log("No supported local agent sessions found for this workspace.");
    return;
  }
  for (const candidate of candidates.slice(0, 12)) {
    const ageMs = Date.now() - candidate.mtimeMs;
    const status = ageMs < ACTIVE_MS ? "active" : "idle";
    console.log(
      `${candidate.agent.padEnd(7)} ${status.padEnd(6)} ${new Date(candidate.mtimeMs).toISOString()} ${candidate.filePath}`
    );
  }
}

async function runReport() {
  const target = optionValue("--target", "codex");
  const redacted = hasFlag("--redact");
  const result = await exportReport({ target, redacted });
  console.log(`Report:  ${result.latestReport}`);
  console.log(`Handoff: ${result.latestHandoff}`);
  console.log(`Events:  ${result.events.length}`);
  console.log(`Redact:  ${redacted ? "enabled" : "disabled"}`);
}

try {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  } else if (command === "watch") {
    await runWatch();
  } else if (command === "report") {
    await runReport();
  } else if (command === "sessions") {
    await runSessions();
  } else {
    printHelp();
    process.exit(command === "help" ? 0 : 1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
