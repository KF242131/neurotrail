import type {
  NeuroEdgeData,
  NeuroNodeType,
  PositionedNeuroNode,
} from "../types";

const LAYOUT_SCALE = 0.78;

const node = (
  id: string,
  label: string,
  type: NeuroNodeType,
  x: number,
  y: number,
  options: Partial<PositionedNeuroNode> = {}
): PositionedNeuroNode => ({
  id,
  label,
  type,
  activation: 0,
  visitCount: 0,
  status: "idle",
  position: { x: x * LAYOUT_SCALE, y: y * LAYOUT_SCALE },
  prominence: "branch",
  ...options,
});

const actualFileNodes: PositionedNeuroNode[] = [
  node("file:src/App.tsx", "App.tsx", "file", -260, -290, {
    path: "src/App.tsx",
    description: "Application shell and replay orchestration",
    depth: 2,
    prominence: "core",
  }),
  node("file:src/components/GraphCanvas.tsx", "GraphCanvas.tsx", "file", 500, -555, {
    path: "src/components/GraphCanvas.tsx",
    description: "React Flow brain map renderer",
    depth: 3,
    prominence: "core",
  }),
  node("file:src/lib/activation.ts", "activation.ts", "file", -110, -625, {
    path: "src/lib/activation.ts",
    description: "Signal timing, memory, and active path state",
    depth: 3,
    prominence: "core",
  }),
  node("file:src/types.ts", "types.ts", "file", 260, -290, {
    path: "src/types.ts",
    description: "Universal graph, signal, and telemetry types",
    depth: 2,
    prominence: "core",
  }),
  node("decision:orchestration-core", "Orchestration core", "decision", 355, 108, {
    description: "Central conductor keeps graph, replay, and roles aligned",
    depth: 1,
    prominence: "core",
  }),

  node("file:src/data/demoGraph.ts", "demoGraph.ts", "file", -680, -540, {
    path: "src/data/demoGraph.ts",
    description: "Actual NeuroTrail file graph used by this demo",
    depth: 3,
    prominence: "branch",
  }),
  node("file:src/data/demoSignals.ts", "demoSignals.ts", "file", -500, -635, {
    path: "src/data/demoSignals.ts",
    description: "Scripted NeuroTrail replay events",
    depth: 3,
    prominence: "branch",
  }),
  node("file:src/data/demoAgents.ts", "demoAgents.ts", "file", -320, -540, {
    path: "src/data/demoAgents.ts",
    description: "Role-based token telemetry demo data",
    depth: 3,
    prominence: "branch",
  }),
  node("file:src/components/NeuroNode.tsx", "NeuroNode.tsx", "file", 340, -710, {
    path: "src/components/NeuroNode.tsx",
    description: "Node visuals, labels, and active glow",
    depth: 4,
    prominence: "branch",
  }),
  node("file:src/components/SynapseEdge.tsx", "SynapseEdge.tsx", "file", 660, -710, {
    path: "src/components/SynapseEdge.tsx",
    description: "Signal path edge and pulse rendering",
    depth: 4,
    prominence: "branch",
  }),
  node("file:src/components/GraphControls.tsx", "GraphControls.tsx", "file", 235, -520, {
    path: "src/components/GraphControls.tsx",
    description: "Project scope, depth, node limit, and mode controls",
    depth: 4,
    prominence: "branch",
  }),
  node("file:src/components/AgentTelemetryPanel.tsx", "AgentTelemetryPanel.tsx", "file", 765, -520, {
    path: "src/components/AgentTelemetryPanel.tsx",
    description: "Role token usage and adapter readiness",
    depth: 4,
    prominence: "branch",
  }),
  node("file:src/components/EvidencePanel.tsx", "EvidencePanel.tsx", "file", 830, -680, {
    path: "src/components/EvidencePanel.tsx",
    description: "Evidence trail and signal legend",
    depth: 5,
    prominence: "branch",
  }),
  node("file:src/components/AgentFocusPanel.tsx", "AgentFocusPanel.tsx", "file", 170, -680, {
    path: "src/components/AgentFocusPanel.tsx",
    description: "Current signal, reason, and path focus",
    depth: 5,
    prominence: "branch",
  }),
  node("file:src/components/BackgroundParticles.tsx", "BackgroundParticles.tsx", "file", 930, -555, {
    path: "src/components/BackgroundParticles.tsx",
    description: "Subtle spatial particle field",
    depth: 5,
    prominence: "branch",
  }),
  node("file:src/components/Header.tsx", "Header.tsx", "file", 265, -865, {
    path: "src/components/Header.tsx",
    description: "Product header and app identity",
    depth: 5,
    prominence: "branch",
  }),
  node("file:src/components/NeuroTrailLogo.tsx", "NeuroTrailLogo.tsx", "file", 370, -1000, {
    path: "src/components/NeuroTrailLogo.tsx",
    description: "Central-node neural mark",
    depth: 6,
    prominence: "branch",
  }),
  node("file:src/components/ModeToggle.tsx", "ModeToggle.tsx", "file", 630, -1000, {
    path: "src/components/ModeToggle.tsx",
    description: "Minimal and cinematic visual modes",
    depth: 6,
    prominence: "branch",
  }),
  node("file:src/lib/signalStyles.ts", "signalStyles.ts", "file", 110, -625, {
    path: "src/lib/signalStyles.ts",
    description: "Signal colors, labels, and legend items",
    depth: 3,
    prominence: "branch",
  }),
  node("file:src/index.css", "index.css", "file", 115, -330, {
    path: "src/index.css",
    description: "Global theme, range controls, and React Flow reset",
    depth: 3,
    prominence: "branch",
  }),
  node("file:src/main.tsx", "main.tsx", "file", -115, -330, {
    path: "src/main.tsx",
    description: "React entry point",
    depth: 2,
    prominence: "branch",
  }),
  node("file:tailwind.config.js", "tailwind.config.js", "config", -565, 300, {
    path: "tailwind.config.js",
    description: "Design tokens, colors, and animation keyframes",
    depth: 2,
    prominence: "branch",
  }),
  node("file:package.json", "package.json", "config", -385, 330, {
    path: "package.json",
    description: "Vite, React, Tailwind, and React Flow dependencies",
    depth: 2,
    prominence: "branch",
  }),
  node("file:README.md", "README.md", "artifact", -200, 300, {
    path: "README.md",
    description: "Product story and roadmap",
    depth: 2,
    prominence: "branch",
  }),
  node("cmd:npm-build", "npm run build", "command", 0, 275, {
    description: "TypeScript and Vite production build",
    depth: 1,
    prominence: "core",
  }),
];

const directoryNodes: PositionedNeuroNode[] = [
  node("dir:src", "src", "directory", 0, -180, {
    path: "src",
    description: "Primary application source directory",
    depth: 1,
    prominence: "core",
  }),
  node("dir:src/components", "components", "directory", 500, -360, {
    path: "src/components",
    description: "Monitoring panels and graph rendering components",
    depth: 2,
    prominence: "core",
  }),
  node("dir:src/data", "data", "directory", -500, -360, {
    path: "src/data",
    description: "Demo graph, signal, and role telemetry data",
    depth: 2,
    prominence: "core",
  }),
  node("dir:src/lib", "lib", "directory", 0, -430, {
    path: "src/lib",
    description: "Runtime activation and signal styling logic",
    depth: 2,
    prominence: "branch",
  }),
  node("dir:project-root", "project root", "directory", -410, 115, {
    path: ".",
    description: "Root configuration and documentation files",
    depth: 1,
    prominence: "branch",
  }),
  node("dir:public", "public", "directory", -740, 455, {
    path: "public",
    description: "Static app assets",
    depth: 3,
    prominence: "branch",
  }),
];

const peripheralFiles: Array<{
  id: string;
  path: string;
  type: NeuroNodeType;
}> = [
  { id: "file:vite.config.ts", path: "vite.config.ts", type: "config" },
  { id: "file:eslint.config.js", path: "eslint.config.js", type: "config" },
  { id: "file:postcss.config.js", path: "postcss.config.js", type: "config" },
  { id: "file:tsconfig.json", path: "tsconfig.json", type: "config" },
  { id: "file:tsconfig.app.json", path: "tsconfig.app.json", type: "config" },
  { id: "file:tsconfig.node.json", path: "tsconfig.node.json", type: "config" },
  { id: "file:index.html", path: "index.html", type: "file" },
  { id: "file:package-lock.json", path: "package-lock.json", type: "artifact" },
  { id: "file:AGENTS.md", path: "AGENTS.md", type: "artifact" },
  { id: "file:public/favicon.svg", path: "public/favicon.svg", type: "artifact" },
  { id: "file:public/icons.svg", path: "public/icons.svg", type: "artifact" },
  { id: "file:dist/index.html", path: "dist/index.html", type: "artifact" },
];

const peripheralLayout = [
  { x: -710, y: 290, depth: 3 },
  { x: -575, y: 435, depth: 4 },
  { x: -430, y: 505, depth: 4 },
  { x: -275, y: 455, depth: 4 },
  { x: -135, y: 410, depth: 4 },
  { x: -20, y: 520, depth: 5 },
  { x: -855, y: 350, depth: 4 },
  { x: -175, y: 565, depth: 5 },
  { x: -850, y: 555, depth: 5 },
  { x: -895, y: 710, depth: 6 },
  { x: -725, y: 750, depth: 6 },
  { x: -555, y: 710, depth: 6 },
] satisfies Array<{ x: number; y: number; depth: number }>;

const peripheralNodes: PositionedNeuroNode[] = peripheralFiles.map((file, i) => {
  const layout = peripheralLayout[i];

  return node(file.id, "", file.type, layout.x, layout.y, {
    path: file.path,
    description: "Peripheral NeuroTrail project file",
    depth: layout.depth,
    prominence: "micro",
  });
});

const DEMO_DEPTH_X = -315;
const DEMO_DEPTH_ROOT_Y = 560;

const demoDepthRootNode = node("dir:demo-depth", "demo-depth", "directory", DEMO_DEPTH_X, DEMO_DEPTH_ROOT_Y, {
  path: "demo-depth",
  description: "Synthetic layered project scope for permission-gated monitoring demos",
  depth: 2,
  prominence: "core",
});

const branchNames = ["routes", "state", "ui", "adapters", "signals"] as const;

const deepDemoDirectories: PositionedNeuroNode[] = Array.from({ length: 30 }, (_, i) => {
  const level = i + 1;
  const layer = level.toString().padStart(2, "0");
  const trunkDrift = Math.sin(level * 0.68) * 86 + ((level % 5) - 2) * 10;
  const trunkX = DEMO_DEPTH_X + trunkDrift;
  return node(
    `dir:demo-depth/layer-${layer}`,
    `L${layer}`,
    "directory",
    trunkX,
    DEMO_DEPTH_ROOT_Y + 92 + level * 82,
    {
      path: `demo-depth/layer-${layer}`,
      description: "Synthetic near-empty project layer for deep orchestration demos",
      depth: level + 2,
      prominence: level <= 10 ? "branch" : "micro",
    }
  );
});

const deepDemoPrimaryFiles: PositionedNeuroNode[] = deepDemoDirectories.map((directory, i) => {
  const level = i + 1;
  const layer = level.toString().padStart(2, "0");
  const rawX = directory.position.x / LAYOUT_SCALE;
  const rawY = directory.position.y / LAYOUT_SCALE;
  const side = level % 2 === 0 ? 1 : -1;
  return node(
    `file:demo-depth/layer-${layer}/empty-${layer}.ts`,
    level <= 8 ? `empty-${layer}.ts` : "",
    "file",
    rawX + side * 158,
    rawY + 30,
    {
      path: `demo-depth/layer-${layer}/empty-${layer}.ts`,
      description: "Near-empty demo file representing a deep project layer",
      depth: level + 3,
      prominence: level <= 8 ? "branch" : "micro",
    }
  );
});

const deepDemoBranchDirectories: PositionedNeuroNode[] = deepDemoDirectories.map((directory, i) => {
  const level = i + 1;
  const layer = level.toString().padStart(2, "0");
  const branchName = branchNames[i % branchNames.length];
  const rawX = directory.position.x / LAYOUT_SCALE;
  const rawY = directory.position.y / LAYOUT_SCALE;
  const side = level % 2 === 0 ? -1 : 1;

  return node(
    `dir:demo-depth/layer-${layer}/${branchName}-${layer}`,
    level <= 6 ? branchName : "",
    "directory",
    rawX + side * (190 + (level % 3) * 22),
    rawY + 72,
    {
      path: `demo-depth/layer-${layer}/${branchName}-${layer}`,
      description: "Small nested demo folder used to show branching read paths",
      depth: level + 3,
      prominence: level <= 7 ? "branch" : "micro",
    }
  );
});

const deepDemoBranchFiles: PositionedNeuroNode[] = deepDemoBranchDirectories.map((directory, i) => {
  const level = i + 1;
  const layer = level.toString().padStart(2, "0");
  const branchName = branchNames[i % branchNames.length];
  const rawX = directory.position.x / LAYOUT_SCALE;
  const rawY = directory.position.y / LAYOUT_SCALE;
  const side = level % 2 === 0 ? -1 : 1;

  return node(
    `file:demo-depth/layer-${layer}/${branchName}-${layer}/probe-${layer}.ts`,
    level <= 5 ? `probe-${layer}.ts` : "",
    "file",
    rawX + side * 104,
    rawY + 54,
    {
      path: `demo-depth/layer-${layer}/${branchName}-${layer}/probe-${layer}.ts`,
      description: "Near-empty nested probe file for deep scan demos",
      depth: level + 4,
      prominence: level <= 5 ? "branch" : "micro",
    }
  );
});

const deepDemoLeafFiles: PositionedNeuroNode[] = deepDemoDirectories.map((directory, i) => {
  const level = i + 1;
  const layer = level.toString().padStart(2, "0");
  const rawX = directory.position.x / LAYOUT_SCALE;
  const rawY = directory.position.y / LAYOUT_SCALE;
  const side = level % 2 === 0 ? 1 : -1;

  return node(
    `file:demo-depth/layer-${layer}/notes-${layer}.md`,
    "",
    "artifact",
    rawX + side * 96,
    rawY + 128,
    {
      path: `demo-depth/layer-${layer}/notes-${layer}.md`,
      description: "Zero-content note artifact for realistic demo fan-out",
      depth: level + 4,
      prominence: "micro",
    }
  );
});

export const demoNodes: PositionedNeuroNode[] = [
  node("agent:orchestrator", "Orchestrator", "agent", 0, 0, {
    description: "Central conductor for NeuroTrail signal orchestration",
    depth: 0,
    prominence: "core",
  }),
  ...directoryNodes,
  ...actualFileNodes,
  demoDepthRootNode,
  ...deepDemoDirectories,
  ...deepDemoPrimaryFiles,
  ...deepDemoBranchDirectories,
  ...deepDemoBranchFiles,
  ...deepDemoLeafFiles,
  ...peripheralNodes,
];

const edge = (
  id: string,
  source: string,
  target: string,
  type: NeuroEdgeData["type"],
  weight = 0.42
): NeuroEdgeData => ({ id, source, target, type, weight });

const peripheralAnchors = [
  "file:src/components/GraphCanvas.tsx",
  "file:src/components/NeuroNode.tsx",
  "file:src/components/SynapseEdge.tsx",
  "file:src/data/demoGraph.ts",
  "file:src/lib/activation.ts",
  "file:src/types.ts",
  "decision:orchestration-core",
];

const peripheralEdges: NeuroEdgeData[] = peripheralNodes.flatMap((micro, i) => {
  const edges: NeuroEdgeData[] = [
    edge(`p-anchor-${i}`, peripheralAnchors[i % peripheralAnchors.length], micro.id, "calls", 0.28),
  ];

  if (i > 0) {
    edges.push(edge(`p-chain-${i}`, peripheralNodes[i - 1].id, micro.id, "imports", 0.2));
  }
  if (i % 6 === 0 && i > 6) {
    edges.push(edge(`p-cross-${i}`, peripheralNodes[i - 6].id, micro.id, "reads", 0.2));
  }

  return edges;
});

const deepDemoEdges: NeuroEdgeData[] = deepDemoDirectories.flatMap(
  (directory, i) => {
    const previous = i === 0 ? "dir:demo-depth" : deepDemoDirectories[i - 1].id;
    const branchDirectory = deepDemoBranchDirectories[i];
    return [
      edge(
        `deep-chain-${i + 1}`,
        previous,
        directory.id,
        "imports",
        i === 0 ? 0.7 : 0.74
      ),
      edge(
        `deep-file-${i + 1}`,
        directory.id,
        deepDemoPrimaryFiles[i].id,
        "reads",
        0.34
      ),
      edge(
        `deep-branch-${i + 1}`,
        directory.id,
        branchDirectory.id,
        "imports",
        0.3
      ),
      edge(
        `deep-probe-${i + 1}`,
        branchDirectory.id,
        deepDemoBranchFiles[i].id,
        "reads",
        0.24
      ),
      edge(
        `deep-note-${i + 1}`,
        directory.id,
        deepDemoLeafFiles[i].id,
        "reads",
        0.18
      ),
    ];
  }
);

export const demoEdges: NeuroEdgeData[] = [
  edge("root-src", "agent:orchestrator", "dir:src", "decides", 1.15),
  edge("root-project", "agent:orchestrator", "dir:project-root", "decides", 0.9),
  edge("root-decision", "agent:orchestrator", "decision:orchestration-core", "decides", 0.8),
  edge("root-build", "agent:orchestrator", "cmd:npm-build", "runs", 0.85),
  edge("project-demo-depth", "dir:project-root", "dir:demo-depth", "imports", 0.88),
  edge("src-components", "dir:src", "dir:src/components", "imports", 0.95),
  edge("src-data", "dir:src", "dir:src/data", "imports", 0.95),
  edge("src-lib", "dir:src", "dir:src/lib", "imports", 0.88),
  edge("project-public", "dir:project-root", "dir:public", "imports", 0.72),
  edge("jump-data-components", "dir:src/data", "dir:src/components", "calls", 0.58),
  edge("jump-components-lib", "dir:src/components", "dir:src/lib", "reads", 0.54),
  edge("jump-data-lib", "dir:src/data", "dir:src/lib", "reads", 0.5),
  edge("jump-components-root", "dir:src/components", "dir:project-root", "calls", 0.46),

  edge("dir-app", "dir:src", "file:src/App.tsx", "reads"),
  edge("dir-types", "dir:src", "file:src/types.ts", "reads"),
  edge("dir-main", "dir:src", "file:src/main.tsx", "reads"),
  edge("dir-graphcanvas", "dir:src/components", "file:src/components/GraphCanvas.tsx", "reads"),
  edge("dir-neuronode", "dir:src/components", "file:src/components/NeuroNode.tsx", "reads"),
  edge("dir-synapse", "dir:src/components", "file:src/components/SynapseEdge.tsx", "reads"),
  edge("dir-controls", "dir:src/components", "file:src/components/GraphControls.tsx", "reads"),
  edge("dir-telemetry", "dir:src/components", "file:src/components/AgentTelemetryPanel.tsx", "reads"),
  edge("dir-focus", "dir:src/components", "file:src/components/AgentFocusPanel.tsx", "reads"),
  edge("dir-evidence", "dir:src/components", "file:src/components/EvidencePanel.tsx", "reads"),
  edge("dir-header", "dir:src/components", "file:src/components/Header.tsx", "reads"),
  edge("dir-logo", "dir:src/components", "file:src/components/NeuroTrailLogo.tsx", "reads"),
  edge("dir-mode", "dir:src/components", "file:src/components/ModeToggle.tsx", "reads"),
  edge("dir-particles", "dir:src/components", "file:src/components/BackgroundParticles.tsx", "reads"),
  edge("dir-demograph", "dir:src/data", "file:src/data/demoGraph.ts", "reads"),
  edge("dir-demosignals", "dir:src/data", "file:src/data/demoSignals.ts", "reads"),
  edge("dir-demoagents", "dir:src/data", "file:src/data/demoAgents.ts", "reads"),
  edge("dir-activation", "dir:src/lib", "file:src/lib/activation.ts", "reads"),
  edge("dir-styles", "dir:src/lib", "file:src/lib/signalStyles.ts", "reads"),
  edge("dir-css", "dir:src", "file:src/index.css", "reads"),
  edge("dir-tailwind", "dir:project-root", "file:tailwind.config.js", "reads"),
  edge("dir-package", "dir:project-root", "file:package.json", "reads"),
  edge("dir-readme", "dir:project-root", "file:README.md", "reads"),

  edge("core-app", "agent:orchestrator", "file:src/App.tsx", "reads", 0.2),
  edge("core-graph", "agent:orchestrator", "file:src/components/GraphCanvas.tsx", "reads", 0.18),
  edge("core-activation", "agent:orchestrator", "file:src/lib/activation.ts", "reads", 0.18),
  edge("core-types", "agent:orchestrator", "file:src/types.ts", "reads", 0.2),

  edge("app-controls", "file:src/App.tsx", "file:src/components/GraphControls.tsx", "calls"),
  edge("app-focus", "file:src/App.tsx", "file:src/components/AgentFocusPanel.tsx", "calls"),
  edge("app-telemetry", "file:src/App.tsx", "file:src/components/AgentTelemetryPanel.tsx", "calls"),
  edge("app-evidence", "file:src/App.tsx", "file:src/components/EvidencePanel.tsx", "calls"),
  edge("app-signals", "file:src/App.tsx", "file:src/data/demoSignals.ts", "reads"),
  edge("app-agents", "file:src/App.tsx", "file:src/data/demoAgents.ts", "reads"),

  edge("graph-data", "file:src/components/GraphCanvas.tsx", "file:src/data/demoGraph.ts", "reads"),
  edge("graph-node", "file:src/components/GraphCanvas.tsx", "file:src/components/NeuroNode.tsx", "calls"),
  edge("graph-edge", "file:src/components/GraphCanvas.tsx", "file:src/components/SynapseEdge.tsx", "calls"),
  edge("graph-styles", "file:src/components/GraphCanvas.tsx", "file:src/lib/signalStyles.ts", "reads"),
  edge("activation-signals", "file:src/lib/activation.ts", "file:src/data/demoSignals.ts", "reads"),
  edge("types-data", "file:src/types.ts", "file:src/data/demoGraph.ts", "imports"),
  edge("types-agents", "file:src/types.ts", "file:src/data/demoAgents.ts", "imports"),

  edge("controls-mode", "file:src/components/GraphControls.tsx", "file:src/components/ModeToggle.tsx", "calls"),
  edge("header-logo", "file:src/components/Header.tsx", "file:src/components/NeuroTrailLogo.tsx", "calls"),
  edge("node-styles", "file:src/components/NeuroNode.tsx", "file:src/lib/signalStyles.ts", "reads"),
  edge("edge-styles", "file:src/components/SynapseEdge.tsx", "file:src/lib/signalStyles.ts", "reads"),
  edge("css-tailwind", "file:src/index.css", "file:tailwind.config.js", "imports"),
  edge("main-app", "file:src/main.tsx", "file:src/App.tsx", "calls"),
  edge("build-package", "cmd:npm-build", "file:package.json", "runs"),
  edge("build-app", "cmd:npm-build", "file:src/App.tsx", "tests"),
  edge("readme-core", "file:README.md", "decision:orchestration-core", "decides"),

  edge("decision-agents", "decision:orchestration-core", "file:src/data/demoAgents.ts", "edits"),
  edge("decision-graph", "decision:orchestration-core", "file:src/data/demoGraph.ts", "edits"),
  edge("decision-canvas", "decision:orchestration-core", "file:src/components/GraphCanvas.tsx", "edits"),

  ...deepDemoEdges,
  ...peripheralEdges,
];
