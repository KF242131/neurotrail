import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  type ReactFlowInstance,
  type Node,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NeuroNode } from "./NeuroNode";
import type {
  AgentRole,
  EdgeRuntimeState,
  GraphFilters,
  GraphProjection,
  GraphVisualMode,
  NeuroEdgeData,
  NeuroNodeData,
  NeuroNodeType,
  NodeRuntimeState,
  PositionedNeuroNode,
} from "../types";
import { roleColor } from "../lib/agentRoles";
import { agentColor } from "../lib/agentColors";
import { edgeBaseColor } from "../lib/signalStyles";

type Props = {
  nodes: PositionedNeuroNode[];
  edges: NeuroEdgeData[];
  nodeStates: Map<string, NodeRuntimeState>;
  edgeStates: Map<string, EdgeRuntimeState>;
  filters: GraphFilters;
  visualMode: GraphVisualMode;
  focusNodeId?: string;
  focusSourceId?: string;
  evidenceIds: string[];
  autoFit?: boolean;
  projection?: GraphProjection;
  selectedAgentId?: string;
  selectedRole?: AgentRole;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  onNodeSelected?: (nodeId: string | undefined) => void;
  onEdgeSelected?: (edgeId: string) => void;
};

const nodeTypes = { neuro: NeuroNode };

type OverlayEdge = {
  edge: NeuroEdgeData;
  state?: EdgeRuntimeState;
  color: string;
  pulseColor: string;
  isJump: boolean;
  isStructuralNerve: boolean;
  isDimmed: boolean;
  isRoleDimmed: boolean;
};

type RankedNode = {
  node: PositionedNeuroNode;
  index: number;
  distance: number;
  layer: number;
};

const FILE_NODE_TYPES = new Set<NeuroNodeType>([
  "directory",
  "file",
  "config",
  "test",
]);
const COMMAND_NODE_TYPES = new Set<NeuroNodeType>(["command", "artifact"]);

function typeVisible(type: NeuroNodeType, filters: GraphFilters) {
  if (FILE_NODE_TYPES.has(type)) return filters.showFileNodes;
  if (type === "function") return filters.showFunctionNodes;
  if (COMMAND_NODE_TYPES.has(type)) return filters.showCommandNodes;
  return true;
}

function visualSizeForNode(node: PositionedNeuroNode) {
  const prominence = node.prominence ?? "core";
  const size =
    prominence === "micro"
      ? 7
      : node.type === "agent"
        ? 44
        : node.type === "decision"
          ? 26
          : node.type === "directory"
            ? prominence === "core"
              ? 26
              : 20
            : prominence === "branch"
              ? 12
              : 9;
  const width = prominence === "micro" ? size : node.type === "agent" ? 180 : 140;
  return { width, height: size };
}

function reactFlowPositionForNode(node: PositionedNeuroNode) {
  const size = visualSizeForNode(node);
  return {
    x: node.position.x - size.width / 2,
    y: node.position.y - size.height / 2,
  };
}

function graphDistances(
  nodes: PositionedNeuroNode[],
  edges: NeuroEdgeData[],
  rootIds: string[]
) {
  const distances = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }

  const queue: string[] = [];
  for (const rootId of rootIds) {
    if (!adjacency.has(rootId)) continue;
    queue.push(rootId);
    distances.set(rootId, 0);
  }
  if (queue.length === 0) return distances;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const currentDistance = distances.get(current) ?? 0;
    for (const next of adjacency.get(current) ?? []) {
      if (distances.has(next)) continue;
      distances.set(next, currentDistance + 1);
      queue.push(next);
    }
  }

  return distances;
}

function centeredViewportForNodes(
  nodes: PositionedNeuroNode[],
  container: HTMLDivElement | null,
  visualMode: GraphVisualMode
) {
  if (nodes.length === 0 || !container) return undefined;

  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x);
    maxY = Math.max(maxY, node.position.y);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return undefined;

  const graphWidth = Math.max(180, maxX - minX);
  const graphHeight = Math.max(180, maxY - minY);
  const graphCenterX = (minX + maxX) / 2;
  const graphCenterY = (minY + maxY) / 2;
  const branchAnchor = nodes.find((node) => node.id.startsWith("branch:"));
  const anchorX = branchAnchor?.position.x ?? graphCenterX;
  const anchorY = branchAnchor?.position.y ?? graphCenterY;

  // The side panels are overlays, so ReactFlow's native fitView centers against
  // the whole pane and can leave the actual graph visually off-center. Fit into
  // the readable stage between panels and below the projection controls instead.
  const cinematic = visualMode === "cinematic";
  const sideInset = cinematic
    ? rect.width >= 920
      ? Math.min(96, rect.width * 0.08)
      : 24
    : rect.width >= 920
      ? Math.min(310, rect.width * 0.24)
      : 36;
  const topInset = cinematic ? (rect.height >= 520 ? 76 : 48) : rect.height >= 520 ? 118 : 64;
  const bottomInset = cinematic ? (rect.height >= 520 ? 40 : 24) : rect.height >= 520 ? 54 : 36;
  const stageLeft = sideInset;
  const stageRight = Math.max(stageLeft + 260, rect.width - sideInset);
  const stageTop = topInset;
  const stageBottom = Math.max(stageTop + 220, rect.height - bottomInset);
  const stageWidth = Math.max(260, stageRight - stageLeft);
  const stageHeight = Math.max(220, stageBottom - stageTop);

  const padding = cinematic ? 84 : 160;
  const zoom = Math.max(
    cinematic ? 0.46 : 0.34,
    Math.min(
      cinematic ? 1.14 : 1.04,
      Math.min(stageWidth / (graphWidth + padding), stageHeight / (graphHeight + padding))
    )
  );
  const centerX = (stageLeft + stageRight) / 2;
  const centerY = (stageTop + stageBottom) / 2;

  return {
    x: centerX - anchorX * zoom,
    y: centerY - anchorY * zoom,
    zoom,
  };
}

function inferEdgeRole(type: string): AgentRole {
  switch (type) {
    case "runs":
    case "tests":
      return "verification";
    case "edits":
      return "coding";
    case "decides":
      return "orchestrator";
    case "imports":
    case "calls":
    case "reads":
      return "research";
    default:
      return "research";
  }
}

export function GraphCanvas({
  nodes,
  edges,
  nodeStates,
  edgeStates,
  filters,
  visualMode,
  focusNodeId,
  focusSourceId,
  evidenceIds,
  autoFit = false,
  projection = "focus",
  selectedAgentId,
  selectedRole,
  selectedNodeId: controlledSelectedNodeId,
  selectedEdgeId,
  onNodeSelected,
  onEdgeSelected,
}: Props) {
  const { setCenter } = useReactFlow();
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<Node> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localSelectedNodeId, setLocalSelectedNodeId] = useState<string | undefined>();
  const [hoveredNodeId, setHoveredNodeId] = useState<string | undefined>();
  const [positionCache, setPositionCache] = useState(
    () => new Map<string, PositionedNeuroNode["position"]>()
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPositionCache((previous) => {
        let changed = false;
        const next = new Map(previous);
        for (const node of nodes) {
          const cached = next.get(node.id);
          if (
            cached &&
            cached.x === node.position.x &&
            cached.y === node.position.y
          ) {
            continue;
          }
          next.set(node.id, node.position);
          changed = true;
        }
        return changed ? next : previous;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [nodes]);

  const stableNodes = useMemo(() => {
    return nodes.map((node) => {
      const cached = positionCache.get(node.id);
      if (cached) return { ...node, position: cached };
      return node;
    });
  }, [nodes, positionCache]);

  const selectedNodeId = controlledSelectedNodeId ?? localSelectedNodeId;

  const selectNode = (nodeId: string | undefined) => {
    setLocalSelectedNodeId(nodeId);
    onNodeSelected?.(nodeId);
  };

  const visibleNodes = useMemo(() => {
    const rootIds = stableNodes
      .filter((node) => node.type === "agent")
      .map((node) => node.id);
    const distances = graphDistances(stableNodes, edges, rootIds);
    const evidenceSet = new Set(evidenceIds);
    const focusSet = new Set(
      [focusNodeId, focusSourceId].filter((id): id is string => !!id)
    );

    const ranked = stableNodes
      .map((node, index) => ({
        node,
        index,
        distance: distances.get(node.id) ?? Number.POSITIVE_INFINITY,
        layer: Math.max(
          distances.get(node.id) ?? Number.POSITIVE_INFINITY,
          node.depth ?? 1
        ),
      }))
      .filter(({ node, layer }) => {
        if (!typeVisible(node.type, filters)) return false;
        const isFocusNode = focusSet.has(node.id);
        if (
          filters.evidenceOnly &&
          !evidenceSet.has(node.id) &&
          !isFocusNode
        ) {
          return false;
        }
        return isFocusNode || layer <= filters.depth;
      })
      .sort((a, b) => {
        const score = (item: RankedNode) => {
          let value = item.layer * 12 + item.distance * 3 + item.index * 0.1;
          if (item.node.id === focusNodeId) value -= 80;
          if (item.node.id === focusSourceId) value -= 56;
          if (evidenceSet.has(item.node.id)) value -= 36;
          if (item.node.type === "agent") value -= 18;
          if (item.node.type === "agent") value -= 8;
          if (item.node.type === "decision") value -= 6;
          return value;
        };
        return score(a) - score(b);
      });

    const cappedIds = new Set(
      ranked.slice(0, filters.nodeLimit).map(({ node }) => node.id)
    );

    return ranked
      .filter(({ node }) => cappedIds.has(node.id))
      .sort((a, b) => a.index - b.index)
      .map(({ node }) => node);
  }, [edges, evidenceIds, filters, focusNodeId, focusSourceId, stableNodes]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((node) => node.id)),
    [visibleNodes]
  );

  const lastDimensionsRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    lastDimensionsRef.current = { width: 0, height: 0 };
  }, [nodes]);

  useEffect(() => {
    if (!autoFit || !flowInstance || nodes.length === 0 || !containerRef.current) {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;

      const viewport = centeredViewportForNodes(nodes, containerRef.current, visualMode);
      if (!viewport) return;

      const isFirstFit = lastDimensionsRef.current.width === 0;
      const sizeChanged =
        lastDimensionsRef.current.width !== width ||
        lastDimensionsRef.current.height !== height;

      if (isFirstFit || sizeChanged) {
        lastDimensionsRef.current = { width, height };
        // Smooth transition on first load, instant snapping on active window resizing
        void flowInstance.setViewport(viewport, { duration: isFirstFit ? 420 : 0 });
      }
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    };
  }, [autoFit, flowInstance, nodes, visualMode]);

  const activeContextIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of [focusNodeId, focusSourceId, ...evidenceIds.slice(-5)]) {
      if (id) ids.add(id);
    }
    return ids;
  }, [evidenceIds, focusNodeId, focusSourceId]);

  const interactionFocusId = selectedNodeId ?? hoveredNodeId;

  const roleTouchedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedRole) return ids;
    for (const node of stableNodes) {
      if (node.roles?.includes(selectedRole)) ids.add(node.id);
    }
    for (const edge of edges) {
      const eRole = edge.role ?? inferEdgeRole(edge.type);
      if (eRole !== selectedRole) continue;
      ids.add(edge.source);
      ids.add(edge.target);
    }
    for (const id of activeContextIds) ids.add(id);
    return ids;
  }, [activeContextIds, edges, stableNodes, selectedRole]);

  const neighborhoodIds = useMemo(() => {
    const ids = new Set(activeContextIds);
    if (!interactionFocusId) return ids;

    ids.add(interactionFocusId);
    for (const edge of edges) {
      if (edge.source === interactionFocusId) ids.add(edge.target);
      if (edge.target === interactionFocusId) ids.add(edge.source);
    }
    return ids;
  }, [activeContextIds, edges, interactionFocusId]);

  const labelVisibleIds = useMemo(() => {
    const ids = new Set(activeContextIds);
    const focusIds = interactionFocusId
      ? new Set([interactionFocusId])
      : activeContextIds;

    if (interactionFocusId) {
      for (const id of neighborhoodIds) ids.add(id);
    }
    for (const edge of edges) {
      if (focusIds.has(edge.source) || focusIds.has(edge.target)) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
    }

    return ids;
  }, [activeContextIds, edges, interactionFocusId, neighborhoodIds]);

  // Auto-pan disabled during replay — the whole graph stays visible so
  // parallel agent activity can be tracked at a glance. User can still
  // click a node to zoom in.

  const rfNodes = useMemo<Node[]>(
    () =>
      visibleNodes.map((n) => {
        const st = nodeStates.get(n.id);
        const roles =
          selectedRole && n.roles?.includes(selectedRole)
            ? [selectedRole, ...n.roles.filter((role) => role !== selectedRole)]
            : n.roles;
        const isRoleDimmed =
          !!selectedRole &&
          n.type !== "agent" &&
          !roleTouchedNodeIds.has(n.id);
        const data: NeuroNodeData = {
          id: n.id,
          label: n.label,
          type: n.type,
          kind: n.kind,
          agentId: n.agentId,
          sessionId: n.sessionId,
          category: n.category,
          roles,
          path: n.path,
          description: n.description,
          activation: st?.activation ?? 0,
          visitCount: st?.visitCount ?? 0,
          status: st?.status ?? "idle",
          isCurrent: st?.isCurrent,
          lastAction: st?.lastAction,
          visualMode,
          depth: n.depth,
          prominence:
            selectedNodeId === n.id && n.prominence === "micro"
              ? "branch"
              : n.prominence,
          showLabel:
            labelVisibleIds.has(n.id) ||
            !!st?.isCurrent ||
            !!st?.hasActiveChild,
          isSelected: selectedNodeId === n.id,
          isDimmed: !!interactionFocusId && !neighborhoodIds.has(n.id),
          hasActiveChild: st?.hasActiveChild,
          childAction: st?.childAction,
        };
        return {
          id: n.id,
          type: "neuro",
          position: reactFlowPositionForNode(n),
          data: data as unknown as Record<string, unknown>,
          draggable: false,
          selectable: false,
          style: {
            visibility: "visible",
            opacity: data.isDimmed ? 0.16 : isRoleDimmed ? 0.28 : 1,
            transition: "opacity 260ms ease",
          },
        };
      }),
    [
      interactionFocusId,
      labelVisibleIds,
      neighborhoodIds,
      nodeStates,
      roleTouchedNodeIds,
      selectedNodeId,
      selectedRole,
      visibleNodes,
      visualMode,
    ]
  );

  const overlayEdges = useMemo<OverlayEdge[]>(
    () =>
      edges
        .filter(
          (e: NeuroEdgeData) =>
            visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
        )
        .map((e: NeuroEdgeData) => {
          const st = edgeStates.get(e.id);
          const isStructuralNerve =
            e.kind === "structure" ||
            (!e.agentId &&
              (e.source.startsWith("dir:") ||
                e.target.startsWith("dir:") ||
                (e.source.startsWith("agent:") && e.target.startsWith("dir:"))));
          return {
            edge: e,
            state: st,
            color: nerveColorForEdge(
              e,
              edgeBaseColor(e.type),
              projection
            ),
            pulseColor: pulseColorForEdge(
              e,
              selectedAgentId,
              selectedRole,
              st?.role
            ),
            isJump: e.id.startsWith("jump-"),
            isStructuralNerve,
            isRoleDimmed:
              !!selectedRole &&
              !isStructuralNerve &&
              (e.role ?? inferEdgeRole(e.type)) !== selectedRole,
            isDimmed:
              !!interactionFocusId &&
              !(
                neighborhoodIds.has(e.source) &&
                neighborhoodIds.has(e.target)
              ),
          };
        }),
    [
      edgeStates,
      edges,
      interactionFocusId,
      neighborhoodIds,
      projection,
      selectedAgentId,
      selectedRole,
      visibleNodeIds,
    ]
  );

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      <NeuralEdgeOverlay
        nodes={visibleNodes}
        edges={overlayEdges}
        visualMode={visualMode}
        selectedEdgeId={selectedEdgeId}
        onEdgeSelected={onEdgeSelected}
      />
      <div className="relative z-10 h-full w-full">
        <ReactFlow
          nodes={rfNodes}
          edges={[]}
          nodeTypes={nodeTypes}
          nodeOrigin={[0, 0]}
          defaultViewport={
            autoFit
              ? { x: 430, y: 230, zoom: 0.42 }
              : { x: 720, y: 220, zoom: 0.54 }
          }
          onInit={setFlowInstance}
          proOptions={{ hideAttribution: true }}
          panOnDrag
          panOnScroll={false}
          zoomOnScroll
          zoomOnPinch
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          onPaneClick={() => {
            selectNode(undefined);
          }}
          onNodeClick={(event, node) => {
            event.stopPropagation();
            selectNode(node.id);
            setCenter(node.position.x, node.position.y, {
              zoom: node.id.includes("demo-depth") ? 0.98 : 1.02,
              duration: 520,
            });
          }}
          onNodeMouseEnter={(_event, node) => {
            setHoveredNodeId(node.id);
          }}
          onNodeMouseLeave={() => {
            setHoveredNodeId(undefined);
          }}
          minZoom={0.2}
          maxZoom={1.8}
        />
        {/* no dot-grid — let the dust motes carry the texture */}
      </div>
    </div>
  );
}

function nerveColorForEdge(
  edge: NeuroEdgeData,
  fallback: string,
  projection: GraphProjection
) {
  if (edge.kind === "structure") return "#6F7B82";
  if (edge.agentId) return agentColor(edge.agentId);
  if (projection === "waste") return "#8A867E";
  if (edge.id.startsWith("jump-")) return "#8A867E";
  return fallback === "#ECE6D7" ? fallback : "#ECE6D7";
}

function pulseColorForEdge(
  edge: NeuroEdgeData,
  selectedAgentId?: string,
  selectedRole?: AgentRole,
  activeRole?: AgentRole
) {
  if (edge.agentId) return agentColor(edge.agentId);
  if (activeRole) return roleColor(activeRole);
  const eRole = edge.role ?? inferEdgeRole(edge.type);
  if (selectedRole && eRole === selectedRole) return roleColor(selectedRole);
  if (selectedAgentId && edge.agentId === selectedAgentId) return agentColor(selectedAgentId);
  if (edge.type === "decides") return "#F4EFE4";
  return "#ECE6D7";
}

function lineDashForEdge(
  edge: NeuroEdgeData,
  isJump: boolean,
  active: boolean,
  visited: boolean
) {
  if (active || visited) return undefined;
  if (edge.kind === "memory" || edge.kind === "recommendation") return "2 7";
  if (edge.category === "waste") return "2 7";
  if (isJump) return "2 7";
  return undefined;
}

// Bezier control points are now computed inline in NeuralEdgeOverlay so the
// moving-dot interpolator can use the same numbers as the path.

function colorWithAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized,
    16
  );
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

const TRAIL_FADE_DURATION = 7.5;
const SIGNAL_TRAVEL_DURATION = 1.65;
const RECENT_SIGNAL_WINDOW = 1.25;

function NeuralEdgeOverlay({
  nodes,
  edges,
  selectedEdgeId,
  onEdgeSelected,
}: {
  nodes: PositionedNeuroNode[];
  edges: OverlayEdge[];
  visualMode: GraphVisualMode;
  selectedEdgeId?: string;
  onEdgeSelected?: (edgeId: string) => void;
}) {
  const viewport = useViewport();
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  );
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full overflow-hidden"
    >
      {edges.map(({ edge, state, color, pulseColor, isJump, isStructuralNerve, isDimmed, isRoleDimmed }) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return null;

        const active = !!state?.active;
        const visited = !!state?.visited;
        const weight = Math.max(0.16, Math.min(1.2, edge.weight ?? 0.42));
        const isTrunk = weight >= 0.72;
        const sourceX = source.position.x * viewport.zoom + viewport.x;
        const sourceY = source.position.y * viewport.zoom + viewport.y;
        const targetX = target.position.x * viewport.zoom + viewport.x;
        const targetY = target.position.y * viewport.zoom + viewport.y;
        const dx = targetX - sourceX;
        const dy = targetY - sourceY;
        const vertical = Math.abs(dy) >= Math.abs(dx);
        const curve = Math.min(180, Math.max(54, Math.hypot(dx, dy) * 0.38));

        // Resolve bezier control points so we can both draw the path AND
        // interpolate a moving dot along it.
        let cp1x: number, cp1y: number, cp2x: number, cp2y: number;
        if (isStructuralNerve && !isJump) {
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          const verticalDominance = absDy / (absDx + absDy + 0.0001);
          const reach = 0.45;
          cp1x = sourceX + dx * (1 - verticalDominance) * reach;
          cp1y = sourceY + dy * verticalDominance * reach;
          cp2x = targetX - dx * (1 - verticalDominance) * reach;
          cp2y = targetY - dy * verticalDominance * reach;
        } else if (vertical) {
          const ydir = Math.sign(dy || -1);
          cp1x = sourceX;
          cp1y = sourceY + ydir * curve;
          cp2x = targetX;
          cp2y = targetY - ydir * curve;
        } else {
          const xdir = Math.sign(dx || 1);
          cp1x = sourceX + xdir * curve;
          cp1y = sourceY;
          cp2x = targetX - xdir * curve;
          cp2y = targetY;
        }
        const path = `M ${sourceX} ${sourceY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`;

        const idleWidth = isTrunk
          ? 1.5
          : isStructuralNerve
            ? 0.9 + weight * 0.2
            : 0.36 + weight * 0.4;
        const activeWidth = isTrunk
          ? 2.0
          : isJump
            ? 1.4
            : 0.9 + weight * 0.6;

        // Trail fade — gradual over TRAIL_FADE_DURATION
        const age = state?.age ?? TRAIL_FADE_DURATION + 1;
        const trailLife = Math.max(0, 1 - age / TRAIL_FADE_DURATION);
        const trailEase = trailLife * trailLife; // accelerated fade-out

        // Dim resting state for edges that haven't been touched
        const restingOpacity = isTrunk
          ? 0.32
          : isStructuralNerve
            ? 0.16
            : isJump
              ? 0.1
              : 0.06;

        const trailStroke = visited
          ? colorWithAlpha(color, Math.max(restingOpacity, trailEase * 0.46))
          : colorWithAlpha(color, restingOpacity);

        const signalActive = active || (visited && age < RECENT_SIGNAL_WINDOW);
        const signalOpacity = active
          ? 1
          : visited
            ? Math.max(0.18, 1 - age / RECENT_SIGNAL_WINDOW)
            : 0.24;
        const signalDuration = Math.max(
          active ? 1.05 : 0.85,
          SIGNAL_TRAVEL_DURATION - Math.min(0.42, weight * 0.2)
        );

        return (
          <g
            key={edge.id}
            className="nt-neural-edge"
            data-edge-id={edge.id}
            opacity={selectedEdgeId === edge.id ? 1 : isDimmed ? 0.16 : isRoleDimmed ? 0.22 : 1}
            style={{ transition: "opacity 260ms ease" }}
          >
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              strokeLinecap="round"
              className="pointer-events-auto cursor-pointer"
              onClick={(event) => {
                event.stopPropagation();
                onEdgeSelected?.(edge.id);
              }}
            />
            {selectedEdgeId === edge.id && (
              <path
                d={path}
                fill="none"
                stroke={pulseColor}
                strokeWidth={activeWidth + 2.2}
                strokeOpacity={0.22}
                strokeLinecap="round"
                style={{ filter: "blur(2px)" }}
              />
            )}
            {/* Bloom layer for fresh trails — wider, blurred, fading */}
            {visited && trailEase > 0.05 && (
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={activeWidth + (isTrunk ? 2.5 : 1.6)}
                strokeOpacity={trailEase * 0.32}
                strokeLinecap="round"
                style={{ filter: "blur(2.5px)" }}
              />
            )}
            {/* Trail core stroke — fades from bright to invisible */}
            <path
              d={path}
              fill="none"
              stroke={trailStroke}
              strokeWidth={
                visited ? idleWidth + trailEase * 1.0 + 0.3 : idleWidth
              }
              strokeLinecap="round"
              strokeDasharray={lineDashForEdge(edge, isJump, active, visited)}
            />
            {/* Signal packet — not a static dot. It travels through the nerve
                itself, like a short electrical pulse moving source → target. */}
            {signalActive && (
              <g opacity={signalOpacity}>
                <animateMotion
                  dur={`${signalDuration}s`}
                  repeatCount={active ? "indefinite" : "1"}
                  rotate="auto"
                  path={path}
                  calcMode="spline"
                  keyTimes="0;1"
                  keySplines="0.28 0 0.16 1"
                />
                <animate
                  attributeName="opacity"
                  dur={`${signalDuration}s`}
                  repeatCount={active ? "indefinite" : "1"}
                  values="0;1;1;0"
                  keyTimes="0;0.16;0.78;1"
                  fill="freeze"
                />
                <ellipse
                  cx={isTrunk ? -8 : -5}
                  cy="0"
                  rx={isTrunk ? 10 : 6.5}
                  ry={isTrunk ? 3.4 : 2.25}
                  fill={pulseColor}
                  opacity={0.24}
                  style={{ filter: "blur(4px)" }}
                />
                <ellipse
                  cx={isTrunk ? -4 : -2.7}
                  cy="0"
                  rx={isTrunk ? 5.5 : 3.5}
                  ry={isTrunk ? 1.9 : 1.35}
                  fill={pulseColor}
                  opacity={0.58}
                  style={{ filter: "blur(1.2px)" }}
                />
                <circle
                  cx="0"
                  cy="0"
                  r={isTrunk ? 4.4 : 3.0}
                  fill={pulseColor}
                  opacity={0.96}
                />
                <circle
                  cx="0"
                  cy="0"
                  r={isTrunk ? 1.75 : 1.15}
                  fill="#ffffff"
                  opacity={0.96}
                />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
