import { motion, AnimatePresence } from "framer-motion";
import type { NeuroSignal, PositionedNeuroNode } from "../types";
import { inferAgentRole, roleColor } from "../lib/agentRoles";
import { actionColor } from "../lib/signalStyles";
import { actionLabel, roleLabel } from "../lib/i18n";
import { useI18n } from "../i18nContext";

type Props = {
  signal?: NeuroSignal;
  isCurrent: boolean;
  nodes: PositionedNeuroNode[];
  evidenceCount: number;
};

function compactTopic(
  signal: NeuroSignal | undefined,
  targetLabel: string,
  t: ReturnType<typeof useI18n>["t"]
) {
  if (!signal) return t("focus.waiting");
  if (signal.topic) return signal.topic;
  const reason = signal.reason.replace(/\.$/, "");
  if (reason.length <= 42) return reason;
  return targetLabel || t("focus.currentStep");
}

// A quiet "current reasoning" readout rather than a telemetry readout.
export function AgentFocusPanel({
  signal,
  isCurrent,
  nodes,
  evidenceCount,
}: Props) {
  const { t } = useI18n();
  const role = signal ? signal.role ?? inferAgentRole(signal) : undefined;
  const color = role
    ? roleColor(role)
    : signal
      ? actionColor(signal.action)
      : "#6a6760";
  const actionWord = signal ? actionLabel(t, signal.action) : t("status.idle");
  const nodeLabel = (id?: string) =>
    id ? (nodes.find((n) => n.id === id)?.label ?? id) : "";
  const targetLabel = nodeLabel(signal?.target);
  const confidence = signal?.confidence ?? (signal?.category === "waste" ? 0.62 : 0.86);
  const topic = compactTopic(signal, targetLabel, t);

  return (
    <div className="pl-10 pr-2 pt-10 pb-6 w-full max-w-[300px]">
      <div className="text-[10.5px] tracking-[0.18em] text-nt-faint">
        {t("focus.now")}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={signal?.id ?? "idle"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="mt-3.5 space-y-2"
        >
          <div className="flex items-baseline gap-2.5">
            <span
              className="inline-block h-1 w-1 rounded-full shrink-0 translate-y-[-2px]"
              style={{
                background: color,
                boxShadow: isCurrent ? `0 0 6px ${color}` : "none",
                opacity: isCurrent ? 1 : 0.5,
              }}
            />
            <span
              className="text-[13px] text-nt-bright"
              style={{ letterSpacing: "-0.01em", fontWeight: 500 }}
            >
              {actionWord}
            </span>
          </div>
          {targetLabel && (
            <div className="text-[12px] text-nt-mid pl-[14px] leading-snug">
              {topic}
            </div>
          )}
          {signal?.reason && signal.reason !== topic && (
            <div className="text-[11px] text-nt-dim pl-[14px] leading-relaxed mt-1.5 break-words font-normal">
              {signal.reason}
            </div>
          )}

          <div className="pl-[14px] pt-1.5 space-y-1">
            <div className="nt-mono-num text-[10.5px] text-nt-dim">
              {t(
                evidenceCount === 1
                  ? "focus.evidenceNode"
                  : "focus.evidenceNodes",
                { count: evidenceCount }
              )}
            </div>
            {role && (
              <div className="text-[10px] tracking-[0.14em] text-nt-faint">
                {roleLabel(t, role)}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-[0.16em] text-nt-faint">
                {t("focus.confidence")}
              </span>
              <span className="nt-mono-num text-[11px] text-nt-mid">
                {(confidence * 100).toFixed(0)}
              </span>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
