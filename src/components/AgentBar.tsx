import { motion } from "framer-motion";
import type { AgentTelemetry, AgentTokenRun, AgentTokenUsage } from "../types";
import { roleColor, topRoleEntries } from "../lib/agentRoles";
import { agentColor } from "../lib/agentColors";
import { roleShortLabel } from "../lib/i18n";
import { useI18n } from "../i18nContext";

type Props = {
  agents: AgentTelemetry[];
  selectedAgentId?: string;
  onAgentSelected?: (agentId: string | undefined) => void;
};

function formatTokenCount(value: number | undefined) {
  if (!value || value <= 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 100_000) return `${Math.round(value / 1000)}k`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
}

function usageSummary(usage: AgentTokenUsage | undefined, t: ReturnType<typeof useI18n>["t"]) {
  if (!usage) return undefined;
  const parts = [
    `${t("agentBar.total")} ${formatTokenCount(usage.totalTokens)}`,
    `${t("agentBar.output")} ${formatTokenCount(usage.outputTokens)}`,
  ];
  if (usage.cachedInputTokens > 0) {
    parts.push(`${t("agentBar.cached")} ${formatTokenCount(usage.cachedInputTokens)}`);
  }
  if (usage.reasoningOutputTokens && usage.reasoningOutputTokens > 0) {
    parts.push(`${t("agentBar.reasoning")} ${formatTokenCount(usage.reasoningOutputTokens)}`);
  }
  return parts.join(" · ");
}

function latestRun(agent: AgentTelemetry) {
  return agent.tokenRuns?.find((run) => run.usage || run.lanes.length > 0);
}

function latestParallelRun(agent: AgentTelemetry) {
  return agent.tokenRuns?.find((run) => run.laneCount > 1);
}

function runSummary(run: AgentTokenRun | undefined, t: ReturnType<typeof useI18n>["t"]) {
  if (!run) return undefined;
  const turn = run.usage?.totalTokens
    ? `${t("agentBar.turn")} ${formatTokenCount(run.usage.totalTokens)}`
    : undefined;
  const lanes =
    run.laneCount > 1
      ? `${run.laneCount} ${t("agentBar.lanes")}`
      : run.lanes[0]
        ? `1 ${t("agentBar.lane")}`
        : undefined;
  return [lanes, turn].filter(Boolean).join(" · ");
}

function laneSummary(run: AgentTokenRun | undefined) {
  if (!run || run.lanes.length === 0) return undefined;
  const visible = run.lanes.slice(0, 3).map((lane) => {
    const tokens = lane.tokenCount ? ` ${formatTokenCount(lane.tokenCount)}` : "";
    return `${lane.label}${tokens}`;
  });
  const remaining = run.lanes.length - visible.length;
  return `${visible.join(" · ")}${remaining > 0 ? ` · +${remaining}` : ""}`;
}

// A horizontal strip — one tile per agent. Layout auto-fits any agent count.
// Each tile: status dot · name · current focus · token meter.
export function AgentBar({ agents, selectedAgentId, onAgentSelected }: Props) {
  const { t } = useI18n();
  const activeCount = agents.filter((a) => a.status === "active").length;

  return (
    <div className="px-10 pt-3 pb-5">
      <div className="flex items-baseline gap-3 mb-3 text-[10.5px] uppercase tracking-[0.22em] text-nt-dim">
        <span>{t("agentBar.title")}</span>
        <span className="nt-mono-num text-nt-mid">
          {agents.length}
          {activeCount > 0 && (
            <span className="text-nt-bright"> · {activeCount} {t("agentBar.working")}</span>
          )}
        </span>
        {agents.length > 1 && (
          <button
            type="button"
            onClick={() => onAgentSelected?.(undefined)}
            className={`ml-auto text-[10px] tracking-[0.16em] transition-colors ${
              selectedAgentId
                ? "text-nt-dim hover:text-nt-mid"
                : "text-nt-bright"
            }`}
          >
            {t("common.all")}
          </button>
        )}
      </div>

      {/* Auto-fit grid: tiles never narrower than ~190px, no fixed column count */}
      <div
        className="grid gap-x-7 gap-y-3"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        }}
      >
        {agents.map((a) => (
          <AgentRow
            key={a.id}
            agent={a}
            selected={selectedAgentId === a.id}
            t={t}
            onClick={
              onAgentSelected
                ? () => onAgentSelected(selectedAgentId === a.id ? undefined : a.id)
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function AgentRow({
  agent,
  selected,
  t,
  onClick,
}: {
  agent: AgentTelemetry;
  selected?: boolean;
  t: ReturnType<typeof useI18n>["t"];
  onClick?: () => void;
}) {
  const isActive = agent.status === "active";
  const isIdle = agent.status === "ready";
  const accent = agent.accent ?? agentColor(agent.id);
  const roleEntries = topRoleEntries(agent.roleCounts);
  const tokenUsage = agent.tokenUsage;
  const lastUsage = tokenUsage?.last;
  const totalUsage = tokenUsage?.total;
  const contextWindow = tokenUsage?.contextWindow ?? agent.tokenBudget;
  const tokensUsed = lastUsage?.totalTokens ?? agent.tokensUsed;
  const tokenRun = latestRun(agent);
  const parallelRun = latestParallelRun(agent);
  const recentParallelRun =
    parallelRun && parallelRun.id !== tokenRun?.id ? parallelRun : undefined;
  const latestRunSummary = runSummary(tokenRun, t);
  const latestLaneSummary = laneSummary(tokenRun);
  const recentParallelSummary = runSummary(recentParallelRun, t);
  const recentParallelLaneSummary = laneSummary(recentParallelRun);
  const totalSummary = usageSummary(totalUsage, t);
  const statusLabel: Record<AgentTelemetry["status"], string> = {
    active: t("agentBar.statusActive"),
    ready: t("agentBar.statusReady"),
    planned: t("agentBar.statusPlanned"),
  };
  const pct = Math.max(0, Math.min(1, tokensUsed / Math.max(1, contextWindow)));

  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-0 flex flex-col gap-1.5 text-left transition-opacity ${
        selected ? "opacity-100" : "opacity-[0.92] hover:opacity-100"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
            isActive && !agent.currentRole
              ? "bg-nt-bright/85 animate-slow-blink"
              : isIdle && !agent.currentRole
                ? "bg-nt-mid/55"
                : !agent.currentRole
                  ? "bg-nt-faint"
                  : ""
          }`}
          style={
            agent.currentRole || agent.id
              ? {
                  background: accent,
                  boxShadow: isActive ? `0 0 7px ${accent}` : "none",
                }
              : undefined
          }
        />
        <span
          className={`text-[12px] truncate ${
            isActive ? "text-nt-bright" : "text-nt-mid"
          }`}
          style={{ letterSpacing: "-0.01em", fontWeight: 500 }}
        >
          {agent.name}
        </span>
      </div>

      <div className="text-[10.5px] text-nt-mid truncate pl-3">
        {agent.currentFocus ??
          (isActive ? agent.role.toLowerCase() : statusLabel[agent.status])}
      </div>

      <div className="flex items-center gap-2 pl-3">
        <div className="relative h-px flex-1 bg-nt-bright/[0.16] overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct * 100}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={`absolute inset-y-[-1px] left-0 ${
              isActive ? "bg-nt-bright/85" : "bg-nt-mid/62"
            }`}
            style={{ height: 2, background: isActive ? accent : undefined }}
          />
        </div>
        <span className="nt-mono-num text-[10px] text-nt-bright/90 tabular-nums shrink-0 whitespace-nowrap">
          {t("agentBar.last")} {formatTokenCount(tokensUsed)}
          <span className="text-nt-dim">
            /{formatTokenCount(contextWindow)}
          </span>
        </span>
      </div>
      {totalSummary && (
        <div className="pl-3 nt-mono-num text-[9.5px] text-nt-dim truncate">
          {totalSummary}
        </div>
      )}
      {latestRunSummary && (
        <div className="pl-3 nt-mono-num text-[9.5px] text-nt-dim truncate">
          {latestRunSummary}
          {latestLaneSummary && (
            <span className="text-nt-dim"> · {latestLaneSummary}</span>
          )}
        </div>
      )}
      {recentParallelSummary && (
        <div className="pl-3 nt-mono-num text-[9.5px] text-nt-dim truncate">
          {t("agentBar.recentParallel")} {recentParallelSummary}
          {recentParallelLaneSummary && (
            <span className="text-nt-dim"> · {recentParallelLaneSummary}</span>
          )}
        </div>
      )}
      {(agent.touchedCount !== undefined || agent.evidenceCount !== undefined) && (
        <div className="pl-3 nt-mono-num text-[9.5px] text-nt-dim">
          {(agent.touchedCount ?? 0).toLocaleString()} {t("agentBar.touched")}
          <span className="text-nt-mid">
            {" "}
            · {(agent.evidenceCount ?? 0).toLocaleString()} {t("agentBar.evidence")}
          </span>
        </div>
      )}
      {roleEntries.length > 0 && (
        <div className="pl-3 flex items-center gap-2 text-[9.5px] text-nt-dim">
          {roleEntries.map(([role, count]) => (
            <span key={role} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background:
                    role === agent.currentRole
                      ? roleColor(role)
                      : "rgba(236,230,215,0.42)",
                  boxShadow:
                    role === agent.currentRole && isActive
                      ? `0 0 5px ${roleColor(role)}`
                      : "none",
                }}
              />
              <span className="nt-mono-num">
                {roleShortLabel(t, role)} {count.toLocaleString()}
              </span>
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
