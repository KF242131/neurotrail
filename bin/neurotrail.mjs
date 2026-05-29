#!/usr/bin/env node
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildReplayHtml } from "../src/replay/replayDocument.js";
import { classifyWasteSignals, WASTE_LABELS } from "../src/lib/wasteCore.js";
import { renderTrustSummary } from "../src/lib/trustSummary.js";
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
  console.log(`NeuroTrail - review what your AI agent actually did

Usage:
  neurotrail review [--base <ref>] [--json] [--comment [pr]] [--no-redact]
  neurotrail report [--target codex|claude|cursor] [--redact]
  neurotrail watch
  neurotrail sessions

Commands:
  review     Export a shareable trust report (replay HTML + review/latest.md)
             so a human can review the agent's process, not just its diff.
             Redacts by default.
  report     Export .neurotrail/reports/latest.html and handoff/latest.md.
  watch      Start the local NeuroTrail viewer for this workspace.
  sessions   List recent supported local agent sessions for this workspace.

Options:
  --base <ref>         review: git base to diff for changed files. Default: main.
  --json               review: print machine-readable JSON instead of a summary.
  --comment [pr]       review: post the trust summary to a PR (auto-detects the
                       current branch's PR if omitted; requires the gh CLI).
  --no-redact          review: do not redact the shared artifact (on by default).
  --fail-on-flags <n>  review: exit 1 if any attention flag confidence >= n (0-1).
  --target <agent>     report: next-agent handoff target. Default: codex.
  --redact             report: apply basic redaction to report and handoff.
  --no-open            watch: do not auto-open the browser.
  --help               Show command help.`);
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

const TEST_COMMAND_RE =
  /(?:^|\s|&&|\||;)(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)\b|\bvitest\b|\bjest\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+(?:test|build|check)\b|\btsc\b|\beslint\b|\bmocha\b|\bplaywright\b/i;

function commandText(input) {
  return String(input.command || input.cmd || "");
}

function isTestCommand(input) {
  return TEST_COMMAND_RE.test(commandText(input));
}

function actionForTool(name, input) {
  const lower = name.toLowerCase();
  const command = commandText(input);
  if (lower.includes("patch") || lower.includes("edit") || lower.includes("write")) {
    return "edit_file";
  }
  if (
    command ||
    lower.includes("exec") ||
    lower.includes("bash") ||
    lower.includes("shell") ||
    lower.includes("terminal")
  ) {
    return "run_command";
  }
  if (lower.includes("read") || lower.includes("sed") || lower.includes("cat")) {
    return "read_file";
  }
  if (
    lower.includes("search") ||
    lower.includes("grep") ||
    lower.includes("rg") ||
    lower.includes("glob")
  ) {
    return "search";
  }
  return "open_symbol";
}

// A test/build command is only a verification verdict when we actually observed
// its result. Without an observed pass/fail it stays a neutral run_command — a
// trust tool must never assert a run was green when it did not see it.
function refineCommandAction(action, input, outcome) {
  if (action !== "run_command" || !isTestCommand(input)) return action;
  if (outcome === "failed") return "test_failed";
  if (outcome === "passed") return "test_passed";
  return "run_command";
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

// Role derived from the already-classified action first (authoritative), so an
// edit is never mis-bucketed as research/verification by a fuzzy text match.
// Falls back to inferRole only for steps with no decisive action.
function roleForEvent(event) {
  switch (event.action) {
    case "edit_file":
    case "write_text":
      return /\.(md|mdx|markdown|txt|rst)$/i.test(event.path ?? "")
        ? "writing"
        : "coding";
    case "test_passed":
    case "test_failed":
    case "run_command":
      return "verification";
    case "read_file":
    case "open_symbol":
    case "search":
      return "research";
    default:
      return inferRole(event);
  }
}

function eventSummary(action, pathValue, toolName) {
  if (pathValue) {
    const name = path.basename(pathValue);
    if (action === "edit_file") return `edited ${name}`;
    if (action === "read_file" || action === "open_symbol") return `inspected ${name}`;
    if (action === "search") return `searched ${name}`;
  }
  // No usable path: describe by action so raw harness tool names ("Bash",
  // "write stdin") never leak into the handoff or trust summary.
  if (action === "edit_file") return "edited a file";
  if (action === "test_passed") return "ran tests (passed)";
  if (action === "test_failed") return "ran tests (failed)";
  if (action === "run_command") return "ran a command";
  if (action === "read_file" || action === "open_symbol") return "inspected a file";
  if (action === "search") return "searched the codebase";
  const cleaned = toolName.replace(/^mcp__/, "").replaceAll("_", " ").trim();
  return cleaned ? cleaned.slice(0, 70) : "agent step";
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

// Correlate each tool call with the result the agent saw afterward, so a
// test/build command can be classified as genuinely passed or failed rather
// than assumed green. Keyed by the provider's call/tool id.
function buildResultIndex(records, agent) {
  const index = new Map();
  if (agent === "codex") {
    for (const record of records) {
      const payload = record.payload || {};
      if (
        record.type === "response_item" &&
        payload.type === "function_call_output" &&
        payload.call_id
      ) {
        let text = "";
        let exitCode;
        const raw = payload.output;
        if (typeof raw === "string") {
          try {
            const parsed = JSON.parse(raw);
            text = typeof parsed.output === "string" ? parsed.output : raw;
            if (parsed?.metadata && typeof parsed.metadata.exit_code === "number") {
              exitCode = parsed.metadata.exit_code;
            }
          } catch {
            text = raw;
          }
        } else if (raw && typeof raw === "object") {
          text = typeof raw.output === "string" ? raw.output : JSON.stringify(raw);
          if (raw.metadata && typeof raw.metadata.exit_code === "number") {
            exitCode = raw.metadata.exit_code;
          }
        }
        index.set(payload.call_id, { text, exitCode });
      }
    }
  } else if (agent !== "gemini") {
    // Claude / OpenAI-style: tool_result items carry is_error + content text.
    for (const record of records) {
      const message = record.message || {};
      const content = Array.isArray(message.content) ? message.content : [];
      for (const item of content) {
        if (item?.type !== "tool_result" || !item.tool_use_id) continue;
        let text = "";
        if (typeof item.content === "string") text = item.content;
        else if (Array.isArray(item.content)) {
          text = item.content
            .map((c) => (typeof c?.text === "string" ? c.text : ""))
            .join("\n");
        }
        index.set(item.tool_use_id, { text, isError: item.is_error === true });
      }
    }
  }
  return index;
}

const STRONG_FAILURE_RE =
  /\b(?:tests?\s+failed|build\s+failed|compilation\s+failed|\d+\s+fail(?:ed|ing)|FAILED)\b|✗|✖|✘/;

// "passed" | "failed" | undefined. Authoritative signals (exit code, is_error)
// win; the text scan is a conservative last resort biased toward flagging
// failures for review rather than asserting an unverified pass.
function outcomeFromResult(entry) {
  if (!entry) return undefined;
  if (typeof entry.exitCode === "number") return entry.exitCode === 0 ? "passed" : "failed";
  if (entry.isError === true) return "failed";
  if (entry.isError === false) return "passed";
  if (STRONG_FAILURE_RE.test(entry.text || "")) return "failed";
  return undefined;
}

function eventsFromRecords(records, agent) {
  const events = [];
  const resultIndex = buildResultIndex(records, agent);
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
        const outcome = outcomeFromResult(resultIndex.get(payload.call_id));
        const action = refineCommandAction(
          actionForTool(toolName, input),
          input,
          outcome
        );
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
        events.push({ ...event, role: roleForEvent(event) });
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
        const status = String(item.status ?? "").toLowerCase();
        const outcome =
          status === "error" || status === "failed" || item.success === false
            ? "failed"
            : status === "success" || status === "completed" || item.success === true
              ? "passed"
              : undefined;
        const action = refineCommandAction(
          actionForTool(item.name, input),
          input,
          outcome
        );
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
        events.push({ ...event, role: roleForEvent(event) });
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
        const outcome = outcomeFromResult(resultIndex.get(item.id));
        const action = refineCommandAction(
          actionForTool(item.name, input),
          input,
          outcome
        );
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
        events.push({ ...event, role: roleForEvent(event) });
      }
      for (const item of openAiStyleToolUses(record)) {
        const action = refineCommandAction(
          actionForTool(item.name, item.input),
          item.input,
          undefined
        );
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
        events.push({ ...event, role: roleForEvent(event) });
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
    let actualCostUsd;
    for (const record of records) {
      const tokens = record.tokens;
      if (!tokens || typeof tokens !== "object") continue;
      total.input_tokens += tokens.input || 0;
      total.cached_input_tokens += tokens.cached || 0;
      total.output_tokens += (tokens.output || 0) + (tokens.tool || 0);
      total.reasoning_output_tokens += tokens.thoughts || 0;
      const cost = actualCostFromUsage(tokens);
      if (cost !== undefined) actualCostUsd = (actualCostUsd || 0) + cost;
    }
    const totalTokens =
      total.input_tokens +
      total.cached_input_tokens +
      total.output_tokens +
      total.reasoning_output_tokens;
    return totalTokens > 0
      ? {
          ...total,
          total_tokens: totalTokens,
          ...(actualCostUsd !== undefined ? { totalCostUsd: actualCostUsd } : {}),
        }
      : undefined;
  }
  let total = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
  let actualCostUsd;
  for (const record of records) {
    const usage = record.message?.usage;
    if (!usage) continue;
    total.input_tokens += usage.input_tokens || 0;
    total.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
    total.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
    total.output_tokens += usage.output_tokens || 0;
    const cost = actualCostFromUsage(usage) ?? actualCostFromUsage(record);
    if (cost !== undefined) actualCostUsd = (actualCostUsd || 0) + cost;
  }
  const totalTokens =
    total.input_tokens +
    total.cache_creation_input_tokens +
    total.cache_read_input_tokens +
    total.output_tokens;
  return totalTokens > 0
    ? {
        ...total,
        total_tokens: totalTokens,
        ...(actualCostUsd !== undefined ? { totalCostUsd: actualCostUsd } : {}),
      }
    : undefined;
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

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function actualCostFromUsage(usage) {
  for (const key of ["actualCostUsd", "totalCostUsd", "total_cost_usd", "cost_usd"]) {
    if (typeof usage?.[key] === "number" && Number.isFinite(usage[key]) && usage[key] >= 0) {
      return usage[key];
    }
  }
  return undefined;
}

function estimateUsageCostUsd(usage = {}) {
  const actualCostUsd = actualCostFromUsage(usage);
  if (actualCostUsd !== undefined) return actualCostUsd;
  const input = numeric(usage.input_tokens);
  const cacheCreate = numeric(usage.cache_creation_input_tokens);
  const cacheRead = numeric(usage.cache_read_input_tokens) || numeric(usage.cached_input_tokens);
  const output = numeric(usage.output_tokens) + numeric(usage.reasoning_output_tokens);
  return (input * 3 + cacheCreate * 3.75 + cacheRead * 0.3 + output * 15) / 1000000;
}

function nodeLabel(nodes, id) {
  const node = nodes.find((item) => item.id === id);
  return node?.path || node?.label || id.replace(/^(file|dir|cmd|decision|agent):/, "");
}

function computeReportSummary({ signals, nodes, edges, sessions }) {
  const realSignals = signals
    .filter((signal) => !signal.id.endsWith("-live-summary"))
    .slice()
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  const totalTokens = sessions.reduce((sum, sx) => sum + (sx.tokenUsage?.total_tokens || 0), 0);
  const estimatedCostUsd = sessions.reduce(
    (sum, sx) => sum + estimateUsageCostUsd(sx.tokenUsage),
    0
  );
  const editedTargets = new Set();
  for (const signal of realSignals) {
    if (signal.action === "edit_file" || signal.action === "write_text") {
      editedTargets.add(signal.target);
    }
  }

  const deadTrailIds = new Set();
  const breakdown = new Map();
  let wastedSteps = 0;
  let wastedTokensEstimate = 0;
  let wastedCostEstimateUsd = 0;
  let confidenceTotal = 0;

  function addWaste(signal, reason, confidence) {
    const tokensEstimate = realSignals.length > 0 ? totalTokens / realSignals.length : 0;
    const costEstimateUsd =
      totalTokens > 0 ? tokensEstimate * (estimatedCostUsd / totalTokens) : 0;
    wastedSteps += 1;
    wastedTokensEstimate += tokensEstimate;
    wastedCostEstimateUsd += costEstimateUsd;
    confidenceTotal += confidence;
    const entry =
      breakdown.get(reason) || {
        steps: 0,
        tokensEstimate: 0,
        costEstimateUsd: 0,
        confidenceTotal: 0,
        targets: new Set(),
      };
    entry.steps += 1;
    entry.tokensEstimate += tokensEstimate;
    entry.costEstimateUsd += costEstimateUsd;
    entry.confidenceTotal += confidence;
    entry.targets.add(nodeLabel(nodes, signal.target));
    breakdown.set(reason, entry);
    if (reason === "dead_trail") deadTrailIds.add(signal.target);
  }

  // Shared classifier (src/lib/wasteCore.js) keeps the CLI report and the live
  // viewer / HTML export scoring waste identically; the CLI just applies its
  // own session-based token weighting on top of these per-signal verdicts.
  const verdicts = classifyWasteSignals(realSignals, nodes, edges);
  const verdictById = new Map(verdicts.map((verdict) => [verdict.signalId, verdict]));
  for (const signal of realSignals) {
    const verdict = verdictById.get(signal.id);
    if (verdict?.wasted && verdict.reason) {
      addWaste(signal, verdict.reason, verdict.confidence);
    }
  }

  const steps = realSignals.length;
  const wastePct = steps > 0 ? Math.min(1, wastedSteps / steps) : 0;
  const wasteCostPct =
    estimatedCostUsd > 0 ? Math.min(1, wastedCostEstimateUsd / estimatedCostUsd) : wastePct;
  const wasteBreakdown = [
    "tool_error",
    "failed_iteration",
    "redundant_retry",
    "churn",
    "loop",
    "thrash",
    "dead_trail",
    "explicit_waste",
  ]
    .map((reason) => {
      const entry = breakdown.get(reason);
      if (!entry) return undefined;
      return {
        reason,
        label: WASTE_LABELS[reason],
        steps: entry.steps,
        tokensEstimate: entry.tokensEstimate,
        costEstimateUsd: entry.costEstimateUsd,
        confidence: entry.confidenceTotal / entry.steps,
        targets: [...entry.targets].slice(0, 6),
      };
    })
    .filter(Boolean);

  return {
    totalTokens,
    estimatedCostUsd,
    steps,
    filesTouched: editedTargets.size,
    wastedSteps,
    wastePct,
    wasteCostPct,
    wastedTokensEstimate,
    wastedCostEstimateUsd,
    wasteConfidence: wastedSteps > 0 ? confidenceTotal / wastedSteps : 0,
    wasteBreakdown,
    deadTrails: [...deadTrailIds].slice(0, 6).map((id) => nodeLabel(nodes, id)),
  };
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
  const summary = computeReportSummary({ signals, nodes, edges, sessions });

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
    summary,
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
      deadTrails: summary.deadTrails,
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

function runGit(gitArgs) {
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const child = spawn("git", gitArgs, { cwd, stdio: ["ignore", "pipe", "ignore"] });
      child.stdout.on("data", (buf) => {
        out += buf.toString("utf8");
      });
      child.on("error", () => finish(null));
      child.on("close", (code) => finish(code === 0 ? out : null));
    } catch {
      finish(null);
    }
  });
}

// Git-authoritative list of files changed on this branch vs. <base>. Returns
// undefined outside a git repo, on a bad ref, or with no diff — the trust
// summary then falls back to files inferred from the session log.
async function gitDiffFiles(base) {
  if (!base) return undefined;
  const out = await runGit(["diff", "--name-only", `${base}...HEAD`]);
  if (out == null) return undefined;
  const files = out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return files.length ? files : undefined;
}

function formatCostUsd(value) {
  if (!value || value <= 0) return "$0";
  if (value < 0.01) return "<$0.01";
  if (value < 100) return "$" + value.toFixed(2);
  return "$" + Math.round(value);
}

function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" + r : r}`;
}

async function runGhComment(pr, bodyFile) {
  return new Promise((resolve) => {
    try {
      const child = spawn("gh", ["pr", "comment", String(pr), "--body-file", bodyFile], {
        cwd,
        stdio: "ignore",
      });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

// Detect the open PR number for the current branch via the gh CLI. Returns ""
// when gh is missing/unauthenticated or the branch has no PR.
async function detectPrNumber() {
  return new Promise((resolve) => {
    try {
      let out = "";
      const child = spawn("gh", ["pr", "view", "--json", "number", "-q", ".number"], {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
      });
      child.stdout.on("data", (buf) => {
        out += buf.toString("utf8");
      });
      child.on("error", () => resolve(""));
      child.on("close", (code) => resolve(code === 0 ? out.trim() : ""));
    } catch {
      resolve("");
    }
  });
}

// Shared discovery/parse pipeline. `single: true` scopes to the one most-recent
// agent (a PR is written by one agent), which also gives the trust summary
// per-agent token isolation for free.
async function gatherSessionsAndEvents({ single = false } = {}) {
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
    if (single) break;
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
  return { sessions, events, primaryAgent: selected[0]?.agent };
}

async function exportReport({ target = "codex", redacted = false } = {}) {
  const { sessions, events } = await gatherSessionsAndEvents();
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
  const hasVite = await exists(path.join(packageRoot, "node_modules", "vite"));
  if (!hasVite) {
    console.log(
      "neurotrail watch needs the dev viewer. Clone the repo and run `npm install` first, then `npm run dev` — or use `neurotrail review` for a shareable report (no dev deps)."
    );
    return;
  }
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

async function runReview() {
  const target = optionValue("--target", "codex");
  const json = hasFlag("--json");
  const redacted = !hasFlag("--no-redact");
  const base = optionValue("--base", "main");
  const wantsComment = hasFlag("--comment");
  let commentTarget = optionValue("--comment", "");
  const failOnRaw = optionValue("--fail-on-flags", "");

  const { sessions, events, primaryAgent } = await gatherSessionsAndEvents({ single: true });
  const filesFromGit = await gitDiffFiles(base);
  const label = agentLabel(primaryAgent || "unknown");

  const filesTouched = unique(
    events.filter((e) => e.action === "edit_file").map((e) => e.path),
    12
  );
  const inspected = unique(
    events.filter((e) => e.action !== "edit_file").map((e) => e.path),
    12
  );
  const tokenLines = sessions
    .map((session) => {
      const total = session.tokenUsage?.total_tokens;
      return total ? `${session.agent}: ${total.toLocaleString()} tokens` : undefined;
    })
    .filter(Boolean);
  const handoffMarkdown = renderHandoff({
    events,
    filesTouched,
    inspected,
    target,
    tokenLines,
    redacted,
  });

  const payload = buildEventPayload({
    events,
    sessions,
    handoff: handoffMarkdown,
    filesTouched,
    inspected,
  });
  const trust = renderTrustSummary({
    summary: payload.summary,
    signals: payload.signals,
    nodes: payload.nodes,
    edges: payload.edges,
    agentLabel: label,
    filesFromGit,
  });
  payload.trustSummary = trust;
  payload.title = `${label} session review`;

  const html = buildReplayHtml(payload);
  const finalHtml = redacted ? redactText(html) : html;
  const reviewMarkdown = redacted ? redactText(trust.markdown) : trust.markdown;

  const root = path.join(cwd, ".neurotrail");
  const reportsDir = path.join(root, "reports");
  const reviewDir = path.join(root, "review");
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.mkdir(reviewDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const latestReport = path.join(reportsDir, "latest.html");
  const stampedReport = path.join(reportsDir, `${stamp}-neurotrail-review.html`);
  const latestReview = path.join(reviewDir, "latest.md");
  await Promise.all([
    fs.writeFile(latestReport, finalHtml, "utf8"),
    fs.writeFile(stampedReport, finalHtml, "utf8"),
    fs.writeFile(latestReview, reviewMarkdown, "utf8"),
  ]);

  const filesCount = filesFromGit?.length ?? payload.summary.filesTouched ?? 0;
  const durationSec = payload.signals.reduce((m, s) => Math.max(m, s.time || 0), 0);

  if (json) {
    const out = {
      agent: primaryAgent,
      facts: redacted
        ? trust.facts.map((f) => ({ label: f.label, value: redactText(f.value) }))
        : trust.facts,
      flags: trust.flags.map((f) => ({
        reason: f.reason,
        confidence: f.confidence,
        timeSec: f.timeSec,
        target: f.target,
      })),
      flagCount: trust.flagCount,
      tests: trust.tests,
      filesChanged: filesCount,
      estimatedCostUsd: payload.summary.estimatedCostUsd,
      artifacts: { report: latestReport, review: latestReview },
    };
    console.log(JSON.stringify(out, null, 2));
  } else {
    const testsWord =
      trust.tests === "passed"
        ? "tests passed"
        : trust.tests === "failed"
          ? "tests FAILED"
          : "tests not observed";
    console.log(
      `${label} · ${filesCount} files · ${trust.flagCount} attention flag(s) · ${testsWord} · ~${formatCostUsd(payload.summary.estimatedCostUsd)} · ${formatClock(durationSec)}`
    );
    console.log(`Review:  ${latestReview}`);
    console.log(`Replay:  ${latestReport}`);
  }

  if (wantsComment) {
    if (!commentTarget) {
      commentTarget = await detectPrNumber();
    }
    if (!commentTarget) {
      if (!json) {
        console.log(
          "Could not detect a PR for the current branch. Pass --comment <pr>, or check the gh CLI is installed and authenticated."
        );
      }
    } else {
      const ok = await runGhComment(commentTarget, latestReview);
      if (!json) {
        console.log(
          ok
            ? `Posted trust summary to PR ${commentTarget}.`
            : `Could not post to PR ${commentTarget} (is the gh CLI installed and authenticated?).`
        );
      }
    }
  }

  const failOn = parseFloat(failOnRaw);
  if (Number.isFinite(failOn) && trust.flags.some((f) => f.confidence >= failOn)) {
    process.exitCode = 1;
  }
}

try {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  } else if (command === "watch") {
    await runWatch();
  } else if (command === "report") {
    await runReport();
  } else if (command === "review") {
    await runReview();
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
