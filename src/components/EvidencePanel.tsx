import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { generateReplayHtmlReport } from "../lib/exportHtml";
import {
  generateHandoffPacket,
  type NextAgentTarget,
} from "../lib/handoffPacket";
import type {
  AgentRole,
  AgentTelemetry,
  NeuroEdgeData,
  NeuroSignal,
  PositionedNeuroNode,
} from "../types";
import { ROLE_LABELS, inferAgentRole, roleColor } from "../lib/agentRoles";

type Tab = "trail" | "steps" | "evidence" | "handoff" | "waste" | "context";

type Props = {
  evidence: string[];
  finalAnswer: boolean;
  nodes: PositionedNeuroNode[];
  edges: NeuroEdgeData[];
  signals: NeuroSignal[];
  agents: AgentTelemetry[];
  currentTime: number;
  graphName: string;
  sessionId?: string;
  selectedAgentId?: string;
  selectedRole?: AgentRole;
  selectedSignalId?: string;
  reviewMode?: boolean;
  onStepSelected?: (signalId: string) => void;
  onResumeLive?: () => void;
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "trail", label: "Trail" },
  { id: "steps", label: "Steps" },
  { id: "evidence", label: "Evidence" },
  { id: "handoff", label: "Handoff" },
  { id: "waste", label: "Waste" },
  { id: "context", label: "Context" },
];

const HANDOFF_GROUPS: Array<{ role: AgentRole; label: string }> = [
  { role: "orchestrator", label: "Decisions" },
  { role: "research", label: "Research done" },
  { role: "coding", label: "Coding done" },
  { role: "writing", label: "Writing done" },
  { role: "verification", label: "Verification" },
  { role: "review", label: "Review / Waste" },
];
const TARGET_AGENTS: NextAgentTarget[] = ["codex", "claude", "cursor"];

function cleanSignalText(signal: NeuroSignal) {
  const raw = signal.reason.replace(/\.$/, "").trim();
  if (/nodeRepl|write_stdin|tab\.screenshot|function_call/i.test(raw)) {
    return "compressed internal tool noise";
  }
  return raw || signal.topic || "agent step";
}

function nodeLabel(nodes: PositionedNeuroNode[], id: string) {
  const node = nodes.find((item) => item.id === id);
  return node?.label ?? id.replace(/^(file|dir|cmd|decision):/, "");
}

function signalRole(signal: NeuroSignal) {
  return signal.role ?? inferAgentRole(signal);
}

function isLiveSummarySignal(signal: NeuroSignal) {
  return signal.id.endsWith("-live-summary");
}

function latestByRole(signals: NeuroSignal[], role: AgentRole) {
  return [...signals].reverse().find((signal) => signalRole(signal) === role);
}

function nextRecommendedRole(signals: NeuroSignal[]): AgentRole {
  const latestVerification = latestByRole(signals, "verification");
  if (latestVerification?.action === "test_failed") return "coding";

  const latestCoding = latestByRole(signals, "coding");
  if (
    latestCoding &&
    (!latestVerification || latestVerification.time < latestCoding.time)
  ) {
    return "verification";
  }

  if (latestVerification?.action === "test_passed") {
    const latestReview = latestByRole(signals, "review");
    if (!latestReview || latestReview.time < latestVerification.time) {
      return "review";
    }
  }

  const roles = new Set(signals.map(signalRole));
  if (
    roles.has("research") &&
    !roles.has("coding") &&
    !roles.has("verification") &&
    !roles.has("review")
  ) {
    return "coding";
  }
  return "research";
}

export function EvidencePanel({
  evidence,
  finalAnswer,
  nodes,
  edges,
  signals,
  agents,
  currentTime,
  graphName,
  sessionId,
  selectedAgentId,
  selectedRole,
  selectedSignalId,
  reviewMode,
  onStepSelected,
  onResumeLive,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("trail");
  const [targetAgent, setTargetAgent] = useState<NextAgentTarget>("codex");
  const [copyState, setCopyState] = useState<"idle" | "handoff" | "html">("idle");
  const [redactExport, setRedactExport] = useState(false);
  const [exportState, setExportState] = useState<
    | { status: "idle" }
    | { status: "exporting" }
    | { status: "done"; htmlReportPath: string; handoffPath: string }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const visibleSignals = useMemo(
    () => signals.filter((signal) => signal.time <= currentTime + 0.001),
    [currentTime, signals]
  );

  const trailSignals = useMemo(
    () => {
      const seen = new Set<string>();
      const compact: NeuroSignal[] = [];
      for (const signal of [...visibleSignals].reverse()) {
        if (isLiveSummarySignal(signal)) continue;
        if (signal.category === "waste") continue;
        const key = cleanSignalText(signal).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        compact.push(signal);
        if (compact.length === 5) break;
      }
      return compact;
    },
    [visibleSignals]
  );

  const wasteSignals = useMemo(
    () =>
      visibleSignals
        .filter((signal) => signal.category === "waste")
        .slice(-4)
        .reverse(),
    [visibleSignals]
  );
  const stepSignals = useMemo(
    () => {
      const seen = new Set<string>();
      const steps: NeuroSignal[] = [];
      for (const signal of [...visibleSignals].reverse()) {
        if (isLiveSummarySignal(signal) || signal.category === "waste") continue;
        const key = `${signal.action}:${signal.target}:${cleanSignalText(signal).toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        steps.push(signal);
        if (steps.length === 10) break;
      }
      return steps.reverse();
    },
    [visibleSignals]
  );

  const evidenceNodes = evidence.slice(-6).reverse();
  const wasteCount = visibleSignals.filter(
    (signal) => signal.category === "waste"
  ).length;
  const contextSignals = useMemo(
    () =>
      visibleSignals
        .filter(
          (signal) =>
            signal.category === "evidence" ||
            signal.category === "handoff" ||
            signal.category === "context" ||
            signal.action === "edit_file" ||
            signal.action === "test_passed" ||
            signal.action === "test_failed"
        )
        .slice(-5)
        .reverse(),
    [visibleSignals]
  );
  const handoffGroups = useMemo(
    () =>
      HANDOFF_GROUPS.map((group) => ({
        ...group,
        signals: visibleSignals
          .filter((signal) => signalRole(signal) === group.role)
          .slice(-2)
          .reverse(),
      })).filter((group) => group.signals.length > 0),
    [visibleSignals]
  );
  const nextRole = useMemo(
    () => nextRecommendedRole(visibleSignals),
    [visibleSignals]
  );
  const handoffPacket = useMemo(
    () =>
      generateHandoffPacket({
        nodes,
        edges,
        signals: visibleSignals,
        agents,
        selectedAgentId,
        selectedRole,
        targetAgent,
      }),
    [agents, edges, nodes, selectedAgentId, selectedRole, targetAgent, visibleSignals]
  );
  const exportHtml = useMemo(
    () =>
      generateReplayHtmlReport({
        title: graphName,
        agents,
        nodes,
        edges,
        signals: visibleSignals,
        handoff: handoffPacket,
      }),
    [agents, edges, graphName, handoffPacket, nodes, visibleSignals]
  );

  const fallbackCopy = (text: string) => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
  };

  const copyText = async (kind: "handoff" | "html", text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      setCopyState(kind);
      window.setTimeout(() => setCopyState("idle"), 7000);
    } catch {
      fallbackCopy(text);
      setCopyState(kind);
      window.setTimeout(() => setCopyState("idle"), 7000);
    }
  };

  const downloadReplay = () => {
    const blob = new Blob([exportHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const safe = (graphName || "replay")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .toLowerCase();
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `neurotrail-${safe || "replay"}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportReport = async () => {
    setExportState({ status: "exporting" });
    try {
      const response = await fetch("/api/report/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetAgent,
          redact: redactExport,
          graph: {
            id: sessionId ?? graphName,
            name: graphName,
            sessionId,
            nodes,
            edges,
            signals: visibleSignals,
            agents,
          },
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? "Failed to export report");
      }
      setExportState({
        status: "done",
        htmlReportPath: body.htmlReportPath,
        handoffPath: body.handoffPath,
      });
    } catch (error) {
      setExportState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to export report",
      });
    }
  };

  return (
    <div className="nt-side-readability pr-10 pl-2 pt-10 pb-6 w-full max-w-[300px] ml-auto text-right">
      <div className="flex items-center justify-end gap-2 text-[11px] tracking-[0.04em] text-nt-mid">
        <span>{finalAnswer ? "Done" : "Trail"}</span>
        <span className="nt-mono-num text-nt-mid">{trailSignals.length}</span>
      </div>

      <div className="mt-2.5 flex items-center justify-end gap-3">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`text-[10.5px] transition-colors ${
                active ? "text-nt-bright" : "text-nt-dim hover:text-nt-mid"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 min-h-[112px]">
        {activeTab === "trail" && (
          <div className="space-y-1.5">
            {trailSignals.length === 0 ? (
              <div className="text-[11px] text-nt-dim">waiting for agent steps</div>
            ) : (
              trailSignals.map((signal, index) => (
                <motion.div
                  key={signal.id}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.035 }}
                  className="flex items-center justify-end gap-2"
                >
                  <span className="text-[11.5px] leading-snug text-nt-bright/85 max-w-[230px]">
                    {cleanSignalText(signal)}
                  </span>
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                    style={{
                      background:
                        index === 0
                          ? roleColor(signalRole(signal))
                          : "rgba(236,230,215,0.36)",
                      boxShadow:
                        index === 0
                          ? `0 0 5px ${roleColor(signalRole(signal))}`
                          : "none",
                    }}
                  />
                </motion.div>
              ))
            )}
          </div>
        )}

        {activeTab === "evidence" && (
          <div className="space-y-1.5">
            {evidenceNodes.length === 0 ? (
              <div className="text-[11px] text-nt-dim">no evidence pinned yet</div>
            ) : (
              evidenceNodes.map((id, index) => (
                <motion.div
                  key={`${id}-${index}`}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.035 }}
                  className="text-[11.5px] leading-snug text-nt-bright/85"
                >
                  {nodeLabel(nodes, id)}
                </motion.div>
              ))
            )}
          </div>
        )}

        {activeTab === "steps" && (
          <div className="space-y-1.5">
            {reviewMode && (
              <button
                type="button"
                onClick={onResumeLive}
                className="mb-1 text-[10px] uppercase tracking-[0.14em] text-nt-bright transition-colors hover:text-nt-mid"
              >
                Resume live
              </button>
            )}
            {stepSignals.length === 0 ? (
              <div className="text-[11px] text-nt-dim">no replay steps yet</div>
            ) : (
              stepSignals.map((signal, index) => {
                const selected = signal.id === selectedSignalId;
                return (
                  <button
                    key={signal.id}
                    type="button"
                    onClick={() => onStepSelected?.(signal.id)}
                    className={`flex w-full items-center justify-end gap-2 text-right transition-colors ${
                      selected ? "text-nt-bright" : "text-nt-mid hover:text-nt-bright"
                    }`}
                  >
                    <span className="nt-mono-num text-[9.5px] text-nt-faint">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="max-w-[230px] truncate text-[11px]">
                      {cleanSignalText(signal)}
                    </span>
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                      style={{
                        background: roleColor(signalRole(signal)),
                        boxShadow: selected ? `0 0 5px ${roleColor(signalRole(signal))}` : "none",
                      }}
                    />
                  </button>
                );
              })
            )}
          </div>
        )}

        {activeTab === "handoff" && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-end gap-2">
              {TARGET_AGENTS.map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setTargetAgent(target)}
                  className={`text-[10px] uppercase tracking-[0.14em] transition-colors ${
                    targetAgent === target
                      ? "text-nt-bright"
                      : "text-nt-dim hover:text-nt-mid"
                  }`}
                >
                  {target}
                </button>
              ))}
            </div>
            {handoffGroups.length === 0 ? (
              <div className="text-[11px] text-nt-dim">No handoff yet</div>
            ) : (
              handoffGroups.map((group) => (
                <div key={group.role} className="space-y-1">
                  <div className="flex items-center justify-end gap-1.5 text-[10px] uppercase tracking-[0.14em] text-nt-dim">
                    <span>{group.label}</span>
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: roleColor(group.role) }}
                    />
                  </div>
                  {group.signals.map((signal) => (
                    <div
                      key={signal.id}
                      className="text-[11px] leading-snug text-nt-bright/85"
                    >
                      {signal.topic ?? cleanSignalText(signal)}
                    </div>
                  ))}
                </div>
              ))
            )}
            <div className="pt-1.5 text-[10.5px] text-nt-mid">
              Next{" "}
              <span
                className="text-nt-mid"
                style={{ color: roleColor(selectedRole ?? handoffPacket.nextRecommendedRole ?? nextRole) }}
              >
                {ROLE_LABELS[selectedRole ?? handoffPacket.nextRecommendedRole ?? nextRole]}
              </span>
            </div>
            <div className="space-y-1 pt-1 text-[11px] text-nt-mid">
              <div>{handoffPacket.summary}</div>
              {handoffPacket.nextRecommendedFiles.slice(0, 3).map((file) => (
                <div key={file} className="text-nt-mid">
                  {file}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={downloadReplay}
                className="text-[10px] uppercase tracking-[0.14em] text-nt-bright transition-colors hover:text-nt-sand"
              >
                Share replay ↓
              </button>
              <button
                type="button"
                onClick={() => void copyText("handoff", handoffPacket.promptForNextAgent)}
                className="text-[10px] uppercase tracking-[0.14em] text-nt-dim transition-colors hover:text-nt-bright"
              >
                {copyState === "handoff" ? "Copied" : "Copy Handoff"}
              </button>
              <button
                type="button"
                onClick={() => void copyText("html", exportHtml)}
                className="text-[10px] uppercase tracking-[0.14em] text-nt-dim transition-colors hover:text-nt-bright"
              >
                {copyState === "html" ? "Copied" : "Copy HTML"}
              </button>
            </div>
            <label className="flex items-center justify-end gap-2 pt-1 text-[10px] uppercase tracking-[0.12em] text-nt-dim">
              <input
                type="checkbox"
                checked={redactExport}
                onChange={(event) => setRedactExport(event.target.checked)}
                className="h-3 w-3 accent-stone-300"
              />
              Redact sensitive data
            </label>
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => void exportReport()}
                disabled={exportState.status === "exporting"}
                className="text-[10px] uppercase tracking-[0.14em] text-nt-dim transition-colors hover:text-nt-bright disabled:opacity-40"
              >
                {exportState.status === "exporting" ? "Exporting" : "Export Report"}
              </button>
            </div>
            {exportState.status === "done" && (
              <div className="space-y-0.5 pt-1 nt-mono-num text-[9px] text-nt-faint">
                <div>{exportState.htmlReportPath}</div>
                <div>{exportState.handoffPath}</div>
              </div>
            )}
            {exportState.status === "error" && (
              <div className="pt-1 text-[10px] text-red-200/70">
                {exportState.message}
              </div>
            )}
          </div>
        )}

        {activeTab === "waste" && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-nt-dim">
              {wasteCount} minor event{wasteCount === 1 ? "" : "s"} compressed
            </div>
            {wasteSignals.map((signal, index) => (
              <motion.div
                key={signal.id}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: index * 0.035 }}
                className="text-[11px] leading-snug text-nt-dim"
              >
                {cleanSignalText(signal)}
              </motion.div>
            ))}
          </div>
        )}

        {activeTab === "context" && (
          <div className="space-y-1.5">
            {contextSignals.length === 0 ? (
              <div className="text-[11px] text-nt-dim">context still dormant</div>
            ) : (
              contextSignals.map((signal, index) => (
                <motion.div
                  key={signal.id}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.035 }}
                  className="flex items-center justify-end gap-2"
                >
                  <span className="text-[11.5px] leading-snug text-nt-bright/85 max-w-[230px]">
                    {signal.topic ?? cleanSignalText(signal)}
                  </span>
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ background: roleColor(signalRole(signal)) }}
                  />
                </motion.div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
