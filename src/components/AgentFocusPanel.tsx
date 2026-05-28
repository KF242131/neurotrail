import { motion, AnimatePresence } from "framer-motion";
import type { NeuroSignal, PositionedNeuroNode } from "../types";
import { ROLE_LABELS, inferAgentRole, roleColor } from "../lib/agentRoles";
import { ACTION_LABEL, actionColor } from "../lib/signalStyles";

type Props = {
  signal?: NeuroSignal;
  isCurrent: boolean;
  nodes: PositionedNeuroNode[];
  evidenceCount: number;
};

function compactTopic(signal: NeuroSignal | undefined, targetLabel: string) {
  if (!signal) return "Waiting for agent activity";
  if (signal.topic) return signal.topic;
  const reason = signal.reason.replace(/\.$/, "");
  if (reason.length <= 42) return reason;
  return targetLabel || "Current reasoning step";
}

// A quiet "current reasoning" readout rather than a telemetry readout.
export function AgentFocusPanel({
  signal,
  isCurrent,
  nodes,
  evidenceCount,
}: Props) {
  const role = signal ? signal.role ?? inferAgentRole(signal) : undefined;
  const color = role
    ? roleColor(role)
    : signal
      ? actionColor(signal.action)
      : "#6a6760";
  const actionWord = signal ? ACTION_LABEL[signal.action] : "still";
  const nodeLabel = (id?: string) =>
    id ? (nodes.find((n) => n.id === id)?.label ?? id) : "";
  const targetLabel = nodeLabel(signal?.target);
  const confidence = signal?.confidence ?? (signal?.category === "waste" ? 0.62 : 0.86);
  const topic = compactTopic(signal, targetLabel);

  return (
    <div className="pl-10 pr-2 pt-10 pb-6 w-full max-w-[300px]">
      <div className="text-[10.5px] tracking-[0.18em] text-nt-faint">
        Now
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
              {evidenceCount} evidence node{evidenceCount === 1 ? "" : "s"}
            </div>
            {role && (
              <div className="text-[10px] tracking-[0.14em] text-nt-faint">
                {ROLE_LABELS[role]}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-[0.16em] text-nt-faint">
                Conf
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
