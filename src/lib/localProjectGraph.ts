import type {
  AgentTelemetry,
  NeuroEdgeData,
  GraphSource,
  NeuroNodeType,
  NeuroSignal,
  PositionedNeuroNode,
  SignalAction,
} from "../types";

export type ProjectGraph = {
  id: string;
  name: string;
  source: GraphSource;
  nodes: PositionedNeuroNode[];
  edges: NeuroEdgeData[];
  signals: NeuroSignal[];
  totalDuration: number;
  fileCount: number;
  skippedCount: number;
  sessionId?: string;
  lastUpdated?: string;
  isActive?: boolean;
  agents?: AgentTelemetry[];
};

const MAX_FILES = 240;
const IGNORED_SEGMENTS = new Set([
  ".codegraph",
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const CODE_EXTENSIONS = new Set([
  ".c",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".swift",
  ".ts",
  ".tsx",
  ".vue",
]);

const CONFIG_NAMES = new Set([
  ".env",
  ".eslintrc",
  ".gitignore",
  "AGENTS.md",
  "Dockerfile",
  "eslint.config.js",
  "package.json",
  "postcss.config.js",
  "tailwind.config.js",
  "tsconfig.json",
  "vite.config.ts",
]);

const ARTIFACT_EXTENSIONS = new Set([
  ".gif",
  ".jpeg",
  ".jpg",
  ".json",
  ".lock",
  ".md",
  ".pdf",
  ".png",
  ".svg",
  ".webp",
  ".yaml",
  ".yml",
]);

type LocalFile = {
  file: File;
  rootName: string;
  relativePath: string;
  depth: number;
  score: number;
  type: NeuroNodeType;
};

const ROOT_DIR_ID = "dir:project-root";
const DECISION_ID = "decision:scan-summary";
const COMMAND_ID = "cmd:local-folder-scan";

function extensionFor(path: string) {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

function basename(path: string) {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function parentPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function dirId(path: string) {
  return path ? `dir:${path}` : ROOT_DIR_ID;
}

function fileId(path: string) {
  return `file:${path}`;
}

function edge(
  id: string,
  source: string,
  target: string,
  type: NeuroEdgeData["type"],
  weight = 0.42
): NeuroEdgeData {
  const kind =
    type === "runs" || type === "edits"
      ? "trail"
      : type === "decides"
      ? "memory"
      : "structure";

  return {
    id,
    source,
    target,
    type,
    kind,
    weight,
  };
}

function node(
  id: string,
  label: string,
  type: NeuroNodeType,
  depth: number,
  options: Partial<PositionedNeuroNode> = {}
): PositionedNeuroNode {
  return {
    id,
    label,
    type,
    kind: type === "agent" ? "agent" : type === "decision" ? "memory" : "project",
    activation: 0,
    visitCount: 0,
    status: "idle",
    position: { x: 0, y: 0 },
    depth,
    prominence: depth <= 2 ? "core" : depth <= 4 ? "branch" : "micro",
    ...options,
  };
}

function nodeTypeFor(path: string): NeuroNodeType {
  const name = basename(path);
  const lower = path.toLowerCase();
  const ext = extensionFor(path);

  if (
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower.includes("/test/") ||
    lower.includes("/tests/")
  ) {
    return "test";
  }
  if (CONFIG_NAMES.has(name) || name.startsWith(".env")) return "config";
  if (CODE_EXTENSIONS.has(ext)) return "file";
  if (ARTIFACT_EXTENSIONS.has(ext)) return "artifact";
  return "file";
}

function scoreFile(path: string, type: NeuroNodeType) {
  const name = basename(path);
  const lower = path.toLowerCase();
  const depth = path.split("/").filter(Boolean).length;
  let score = depth * 4 + path.length / 200;

  if (lower.startsWith("src/") || lower.startsWith("app/")) score -= 22;
  if (/^(app|index|main|server|client)\./i.test(name)) score -= 12;
  if (CONFIG_NAMES.has(name)) score -= 10;
  if (type === "test") score -= 3;
  if (type === "artifact") score += 14;
  if (/\.(png|jpe?g|gif|webp|pdf)$/i.test(name)) score += 28;
  return score;
}

function normalizeFile(file: File): LocalFile | undefined {
  const pathFromPicker =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name;
  const cleanPath = pathFromPicker.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = cleanPath.split("/").filter(Boolean);
  if (parts.length === 0) return undefined;

  const hasFolderPrefix = parts.length > 1;
  const rootName = hasFolderPrefix ? parts[0] : "selected folder";
  const relativePath = (hasFolderPrefix ? parts.slice(1) : parts).join("/");
  if (!relativePath) return undefined;

  const relativeParts = relativePath.split("/").filter(Boolean);
  if (relativeParts.some((segment) => IGNORED_SEGMENTS.has(segment))) {
    return undefined;
  }

  const type = nodeTypeFor(relativePath);
  return {
    file,
    rootName,
    relativePath,
    depth: relativeParts.length + 1,
    score: scoreFile(relativePath, type),
    type,
  };
}

function collectDirectoryPaths(files: LocalFile[]) {
  const dirs = new Set<string>();
  for (const entry of files) {
    const parts = entry.relativePath.split("/").filter(Boolean);
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      dirs.add(current);
    }
  }
  return [...dirs].sort((a, b) => {
    const depthA = a.split("/").length;
    const depthB = b.split("/").length;
    return depthA - depthB || a.localeCompare(b);
  });
}

function applyTierLayout(nodes: PositionedNeuroNode[]) {
  const byDepth = new Map<number, PositionedNeuroNode[]>();
  for (const item of nodes) {
    if (
      item.id === "agent:orchestrator" ||
      item.id === ROOT_DIR_ID ||
      item.id === DECISION_ID ||
      item.id === COMMAND_ID
    ) {
      continue;
    }
    const depth = item.depth ?? 1;
    const bucket = byDepth.get(depth) ?? [];
    bucket.push(item);
    byDepth.set(depth, bucket);
  }

  let baseY = 290;
  for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
    const bucket = byDepth.get(depth) ?? [];
    const columns = Math.max(1, Math.ceil(Math.sqrt(bucket.length * 1.55)));
    const rows = Math.ceil(bucket.length / columns);
    const xGap = depth <= 3 ? 170 : 118;
    const yGap = depth <= 3 ? 72 : 52;

    bucket.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const centerOffset = (columns - 1) / 2;
      item.position = {
        x: (col - centerOffset) * xGap + Math.sin(index * 0.72) * 14,
        y: baseY + row * yGap + Math.cos((index + depth) * 0.5) * 10,
      };
    });

    baseY += rows * yGap + 116;
  }

  const agent = nodes.find((item) => item.id === "agent:orchestrator");
  const root = nodes.find((item) => item.id === ROOT_DIR_ID);
  const command = nodes.find((item) => item.id === COMMAND_ID);
  const decision = nodes.find((item) => item.id === DECISION_ID);

  if (agent) agent.position = { x: 0, y: 0 };
  if (root) root.position = { x: -210, y: 135 };
  if (command) command.position = { x: 115, y: 150 };
  if (decision) decision.position = { x: 310, y: 86 };
}

function signalActionFor(file: LocalFile, index: number): SignalAction {
  if (file.type === "test") return index % 2 === 0 ? "search" : "read_file";
  if (file.type === "config") return "open_symbol";
  if (index % 6 === 0) return "search";
  if (index % 5 === 0) return "open_symbol";
  return "read_file";
}

export function buildLocalProjectGraph(inputFiles: File[]): ProjectGraph {
  const normalized = inputFiles.flatMap((file) => {
    const entry = normalizeFile(file);
    return entry ? [entry] : [];
  });
  const sorted = normalized.sort(
    (a, b) => a.score - b.score || a.relativePath.localeCompare(b.relativePath)
  );
  const selectedFiles = sorted.slice(0, MAX_FILES);
  const rootName = selectedFiles[0]?.rootName ?? "selected folder";
  const directoryPaths = collectDirectoryPaths(selectedFiles);
  const nodes: PositionedNeuroNode[] = [
    node("agent:orchestrator", "Orchestrator", "agent", 0, {
      description: "Local monitor coordinating the selected folder scan",
      prominence: "core",
    }),
    node(ROOT_DIR_ID, rootName, "directory", 1, {
      path: ".",
      description: "Selected local folder",
      prominence: "core",
    }),
    node(COMMAND_ID, "folder scan", "command", 1, {
      description: "Browser-only path scan from the selected folder",
      prominence: "branch",
    }),
    node(DECISION_ID, "Scan summary", "decision", 1, {
      description: "Local graph traversal summary",
      prominence: "core",
    }),
  ];

  for (const path of directoryPaths) {
    const depth = path.split("/").length + 1;
    nodes.push(
      node(dirId(path), basename(path), "directory", depth, {
        path,
        description: `Directory in ${rootName}`,
        prominence: depth <= 3 ? "branch" : "micro",
      })
    );
  }

  for (const entry of selectedFiles) {
    nodes.push(
      node(fileId(entry.relativePath), basename(entry.relativePath), entry.type, entry.depth, {
        path: entry.relativePath,
        description: `Local file in ${rootName}`,
        prominence: entry.score <= 10 || entry.depth <= 3 ? "branch" : "micro",
      })
    );
  }

  applyTierLayout(nodes);

  const edges: NeuroEdgeData[] = [
    edge("root-project", "agent:orchestrator", ROOT_DIR_ID, "decides", 1),
    edge("root-command", "agent:orchestrator", COMMAND_ID, "runs", 0.82),
    edge("root-decision", "agent:orchestrator", DECISION_ID, "decides", 0.76),
  ];

  for (const path of directoryPaths) {
    const parent = parentPath(path);
    const depth = path.split("/").length + 1;
    edges.push(
      edge(`dir-${path}`, dirId(parent), dirId(path), "imports", depth <= 3 ? 0.74 : 0.46)
    );
  }

  for (const entry of selectedFiles) {
    edges.push(
      edge(
        `file-${entry.relativePath}`,
        dirId(parentPath(entry.relativePath)),
        fileId(entry.relativePath),
        "reads",
        entry.score <= 12 ? 0.5 : 0.28
      )
    );
  }

  const scanFiles = selectedFiles.slice(0, 34);
  const signals: NeuroSignal[] = [
    {
      id: "local-0",
      time: 0,
      action: "think",
      target: "agent:orchestrator",
      intensity: 0.95,
      reason: `Local folder selected: ${rootName}.`,
    },
    {
      id: "local-1",
      time: 0.7,
      action: "run_command",
      source: "agent:orchestrator",
      target: COMMAND_ID,
      intensity: 0.84,
      reason: "The browser enumerates folder paths and builds the local graph.",
    },
    {
      id: "local-2",
      time: 1.45,
      action: "search",
      source: COMMAND_ID,
      target: ROOT_DIR_ID,
      intensity: 0.78,
      reason: "The scan anchors the selected folder before walking files.",
    },
  ];

  let source = ROOT_DIR_ID;
  scanFiles.forEach((entry, index) => {
    const target = fileId(entry.relativePath);
    const action = signalActionFor(entry, index);
    signals.push({
      id: `local-file-${index}`,
      time: 2.25 + index * 0.72,
      action,
      source,
      target,
      intensity: Math.min(1, 0.68 + index * 0.008),
      reason: `Scanning ${entry.relativePath}`,
    });
    source = target;
  });

  const evidence = [
    "agent:orchestrator",
    ROOT_DIR_ID,
    COMMAND_ID,
    ...directoryPaths.slice(0, 5).map(dirId),
    ...scanFiles.slice(0, 8).map((entry) => fileId(entry.relativePath)),
    DECISION_ID,
  ];
  const decisionTime = 2.8 + scanFiles.length * 0.72;
  signals.push(
    {
      id: "local-decision",
      time: decisionTime,
      action: "decision",
      source,
      target: DECISION_ID,
      intensity: 0.92,
      confidence: selectedFiles.length > 0 ? 0.9 : 0.58,
      reason: `${selectedFiles.length.toLocaleString()} visible files mapped from ${rootName}.`,
      evidence,
    },
    {
      id: "local-final",
      time: decisionTime + 1.8,
      action: "final_answer",
      source: DECISION_ID,
      target: DECISION_ID,
      intensity: 1,
      reason: "The local folder replay is ready to inspect and replay.",
      evidence,
    }
  );

  return {
    id: `local-${rootName}-${inputFiles.length}-${Date.now()}`,
    name: rootName,
    source: "local",
    nodes,
    edges,
    signals,
    totalDuration: decisionTime + 3.2,
    fileCount: selectedFiles.length,
    skippedCount: inputFiles.length - selectedFiles.length,
  };
}
