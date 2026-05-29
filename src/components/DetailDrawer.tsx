import type {
  AgentTelemetry,
  NeuroEdgeData,
  NeuroSignal,
  PositionedNeuroNode,
} from "../types";
import { inferAgentRole, roleColor } from "../lib/agentRoles";
import { actionLabel, roleLabel } from "../lib/i18n";
import { agentTokenSource } from "../lib/agentRegistry.js";
import { useI18n } from "../i18nContext";

export type DetailSelection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "signal"; id: string };

type Props = {
  selection?: DetailSelection;
  nodes: PositionedNeuroNode[];
  edges: NeuroEdgeData[];
  signals: NeuroSignal[];
  agents: AgentTelemetry[];
  onClose: () => void;
};

function nodeLabel(nodes: PositionedNeuroNode[], id: string | undefined) {
  if (!id) return undefined;
  return nodes.find((node) => node.id === id)?.label ?? id.replace(/^(file|dir|cmd|decision):/, "");
}

function nodePath(nodes: PositionedNeuroNode[], id: string | undefined) {
  if (!id) return undefined;
  const node = nodes.find((item) => item.id === id);
  if (node?.path && node.path !== ".") return node.path;
  if (id.startsWith("file:")) return id.slice(5);
  return undefined;
}

function signalRole(signal?: NeuroSignal) {
  return signal?.role ?? (signal ? inferAgentRole(signal) : undefined);
}

function latestSignalForNode(signals: NeuroSignal[], nodeId: string) {
  return [...signals]
    .reverse()
    .find(
      (signal) =>
        signal.target === nodeId ||
        signal.source === nodeId ||
        signal.evidence?.includes(nodeId)
    );
}

function latestSignalForEdge(signals: NeuroSignal[], edge: NeuroEdgeData) {
  return [...signals]
    .reverse()
    .find(
      (signal) =>
        (signal.source === edge.source && signal.target === edge.target) ||
        (signal.source === edge.target && signal.target === edge.source)
    );
}

function tokenSource(agent: AgentTelemetry | undefined, unavailable: string) {
  return agent ? agentTokenSource(agent.id) : unavailable;
}

function formatTokens(value: number | undefined, unavailable: string) {
  if (!value) return unavailable;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return value.toLocaleString();
}

function resultFor(signal: NeuroSignal | undefined, t: ReturnType<typeof useI18n>["t"]) {
  if (!signal) return t("common.unknown");
  if (signal.action === "test_passed") return t("detail.resultPass");
  if (signal.action === "test_failed") return t("detail.resultFail");
  if (signal.category === "evidence") return t("detail.resultEvidence");
  if (signal.category === "waste") return t("detail.resultCompressed");
  return t("common.unknown");
}

function laneForSelection(agent?: AgentTelemetry, signal?: NeuroSignal) {
  if (!agent) return undefined;
  if (signal?.laneId) {
    for (const run of agent.tokenRuns ?? []) {
      const lane = run.lanes.find((item) => item.id === signal.laneId);
      if (lane) return lane;
    }
  }
  return agent.tokenRuns?.find((run) => run.lanes.length > 0)?.lanes[0];
}

function row(label: string, value: string | number | undefined) {
  if (value === undefined || value === "") return null;
  return (
    <div className="grid grid-cols-[76px_1fr] gap-2 text-[10.5px] leading-snug">
      <span className="text-nt-faint uppercase tracking-[0.12em]">{label}</span>
      <span className="text-nt-mid break-words">{value}</span>
    </div>
  );
}

export function DetailDrawer({
  selection,
  nodes,
  edges,
  signals,
  agents,
  onClose,
}: Props) {
  const { t } = useI18n();
  if (!selection) return null;

  const node = selection.kind === "node"
    ? nodes.find((item) => item.id === selection.id)
    : undefined;
  const edge = selection.kind === "edge"
    ? edges.find((item) => item.id === selection.id)
    : undefined;
  const directSignal = selection.kind === "signal"
    ? signals.find((item) => item.id === selection.id)
    : undefined;
  const signal =
    directSignal ??
    (node ? latestSignalForNode(signals, node.id) : undefined) ??
    (edge ? latestSignalForEdge(signals, edge) : undefined);
  const agent = agents.find((item) => item.id === signal?.agentId || item.id === edge?.agentId || item.id === node?.agentId);
  const role = signalRole(signal) ?? edge?.role ?? node?.roles?.[0];
  const lane = laneForSelection(agent, signal);
  const title =
    node?.label ??
    (edge ? `${nodeLabel(nodes, edge.source)} → ${nodeLabel(nodes, edge.target)}` : undefined) ??
    signal?.topic ??
    t("detail.title");

  return (
    <div className="mt-4 rounded-sm border border-nt-bright/[0.08] bg-black/35 p-3 text-left shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-md">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.18em] text-nt-faint">
            {t("detail.kind", { kind: selection.kind })}
          </div>
          <div className="mt-1 truncate text-[13px] text-nt-bright">
            {title}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] uppercase tracking-[0.14em] text-nt-dim transition-colors hover:text-nt-bright"
        >
          {t("common.close")}
        </button>
      </div>
      <div className="space-y-1.5">
        {row(t("detail.agent"), agent?.name ?? signal?.agentId ?? edge?.agentId ?? node?.agentId)}
        {role &&
          row(
            t("detail.role"),
            `${roleLabel(t, role)}`
          )}
        {role && (
          <div className="h-px w-full" style={{ background: roleColor(role), opacity: 0.18 }} />
        )}
        {row(t("detail.action"), signal ? actionLabel(t, signal.action) : edge?.type)}
        {row(t("detail.source"), nodeLabel(nodes, signal?.source ?? edge?.source))}
        {row(t("detail.target"), nodeLabel(nodes, signal?.target ?? edge?.target ?? node?.id))}
        {row(t("detail.path"), nodePath(nodes, signal?.target ?? node?.id))}
        {row(t("detail.time"), signal?.timestamp)}
        {row(t("detail.result"), resultFor(signal, t))}
        {row(t("detail.tokens"), formatTokens(agent?.tokenUsage?.last?.totalTokens, t("common.unavailable")))}
        {row(t("detail.tokenSource"), tokenSource(agent, t("common.unavailable")))}
        {row(t("detail.lane"), lane ? `${lane.id} · ${lane.label}` : t("common.unavailable"))}
      </div>
      <div className="mt-3 border-t border-nt-bright/[0.06] pt-2 text-[10px] leading-snug text-nt-faint">
        {t("detail.signalLine", { role: role ? roleLabel(t, role) : t("detail.role") })}
      </div>
    </div>
  );
}
