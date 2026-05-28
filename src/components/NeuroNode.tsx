import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { Brain, AlertCircle } from "lucide-react";
import type { NeuroNodeData, NeuroNodeType } from "../types";
import { roleColor } from "../lib/agentRoles";
import { agentColor } from "../lib/agentColors";
import { actionColor, nodeBaseColor, statusColor } from "../lib/signalStyles";

function sizeFor(
  type: NeuroNodeType,
  prominence: NeuroNodeData["prominence"]
) {
  if (prominence === "micro") return 7;
  if (type === "agent") return 44;
  if (type === "decision") return 26;
  // Directories are clearly larger than files — they read as containers
  if (type === "directory") return prominence === "core" ? 26 : 20;
  if (prominence === "branch") return 12;
  return 9;
}

export function NeuroNode({ data }: NodeProps) {
  const d = data as unknown as NeuroNodeData;
  const base = nodeBaseColor(d.type);
  const activation = Math.max(0, Math.min(1, d.activation ?? 0));
  const prominence = d.prominence ?? "core";
  const size = sizeFor(d.type, prominence);
  const isMicro = prominence === "micro";

  const isCurrent = !!d.isCurrent;
  const isAgent = d.type === "agent";
  const isDecision = d.type === "decision" || d.status === "decision";
  const isError = d.status === "error";
  const isEdited = d.status === "edited";
  const isPassed = d.status === "passed";
  const isSelected = !!d.isSelected;
  const isDirectory = d.type === "directory";
  const hasActiveChild = !!d.hasActiveChild;
  const childColor = d.childAction ? actionColor(d.childAction) : "#ECE6D7";
  const roles = (d.roles ?? []).slice(0, 3);
  const primaryRoleColor = roles[0] ? roleColor(roles[0]) : undefined;
  const agentAccent = isAgent ? agentColor(d.agentId ?? d.id.replace(/^agent:/, "")) : undefined;
  const isAgentAwake =
    isAgent && (isCurrent || activation > 0.08 || (d.visitCount ?? 0) > 0);

  // A node uses status color when something has happened to it,
  // otherwise it stays a quiet bone/dim dot of its type.
  const colorWhenActive =
    d.status && d.status !== "idle" ? statusColor(d.status) : base;
  const dotColor = isAgent ? agentAccent ?? "#FFF8E8" : colorWhenActive;

  // Show icon only for agent + decision + error states
  const showIcon = isAgent || isDecision || isError;
  const IconComp = isError ? AlertCircle : isAgent ? null : Brain;

  // Halo softness — restrained, with active agents kept visibly awake.
  const haloSize = isMicro
    ? 2 + activation * 6
    : isAgent
      ? isAgentAwake
        ? 42 + activation * 42
        : 24 + activation * 20
      : 4 + activation * 14;
  const haloOpacity = isCurrent
    ? 0.82
    : isSelected
      ? 0.5
    : isAgent
      ? isAgentAwake
        ? 0.78
        : 0.48
      : 0.1 + activation * 0.4;

  // Label visibility — quiet by default, but a clicked/current endpoint must
  // always identify itself even when it is normally rendered as a micro dot.
  const isVisited = (d.visitCount ?? 0) > 0 || activation > 0.05 || hasActiveChild;
  const labelRequested =
    isAgent ||
    isDecision ||
    isSelected ||
    isCurrent ||
    prominence === "core" ||
    prominence === "branch" ||
    isVisited ||
    !!d.showLabel;
  const showLabel = labelRequested && (!isMicro || isSelected || isCurrent || isVisited);
  const labelTop = `calc(50% + ${size / 2 + 6}px)`;
  const frameWidth = isMicro ? size : isAgent ? 180 : 140;
  const labelDetail =
    isSelected && d.path && d.path !== d.label
      ? d.path
      : isSelected && d.lastAction
        ? d.lastAction.replaceAll("_", " ")
        : undefined;
  const showRoleResidue =
    !!primaryRoleColor && !isMicro && !isAgent && (isCurrent || isSelected || hasActiveChild);
  const nodeScale = isAgent
    ? isAgentAwake
      ? [1.02, 1.13, 1.02]
      : [1, 1.045, 1]
    : isCurrent || isSelected
      ? 1.18
      : 1;
  const nodeScaleDuration = isAgent ? (isAgentAwake ? 2.7 : 6.6) : 0.6;
  const nodeScaleRepeat = isAgent ? Infinity : 0;

  return (
    <div
      className="relative select-none overflow-visible"
      style={{ width: frameWidth, height: size }}
    >
      <Handle type="target" position={Position.Bottom} />
      <Handle type="source" position={Position.Top} />

      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: size,
          height: size,
          transform: "translate(-50%, -50%)",
        }}
      >
        <motion.div
          animate={{
            scale: nodeScale,
          }}
          transition={{
            duration: nodeScaleDuration,
            repeat: nodeScaleRepeat,
            ease: "easeInOut",
          }}
          className="relative"
          style={{ width: size, height: size }}
        >
          {isAgent && (
            <motion.div
              aria-hidden
              className="absolute rounded-full pointer-events-none"
              style={{
                inset: -18,
                border: `1px solid ${dotColor}${isAgentAwake ? "bb" : "60"}`,
                background: isAgentAwake
                  ? `radial-gradient(circle, ${dotColor}3f, transparent 68%)`
                  : `radial-gradient(circle, ${dotColor}18, transparent 70%)`,
                boxShadow: isAgentAwake
                  ? `0 0 54px -8px ${dotColor}`
                  : `0 0 28px -14px ${dotColor}`,
              }}
              animate={{
                opacity: isAgentAwake ? [0.58, 0.98, 0.58] : [0.24, 0.45, 0.24],
                scale: isAgentAwake ? [1, 1.16, 1] : [1, 1.07, 1],
              }}
              transition={{
                duration: isAgentAwake ? 2.7 : 6.6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          {/* Halo — barely there */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              boxShadow: `0 0 ${haloSize}px ${dotColor}`,
              opacity: haloOpacity,
              transition: "box-shadow 320ms ease-out, opacity 320ms ease-out",
            }}
          />

          {/* Cluster halo — a soft expanding "island is awake" aura when an
              agent is touching a file inside this directory. Larger and
              warmer than the standard halo so the layer is unmistakable. */}
          {isDirectory && hasActiveChild && !isMicro && (
            <>
              <motion.div
                aria-hidden
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: -22,
                  border: `1px solid ${childColor}72`,
                  boxShadow: `0 0 54px -8px ${childColor}`,
                }}
                animate={{
                  opacity: [0.62, 1, 0.62],
                  scale: [1, 1.2, 1],
                }}
                transition={{ duration: 2.05, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                aria-hidden
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: -10,
                  background: `radial-gradient(circle, ${childColor}34, transparent 72%)`,
                }}
                animate={{
                  opacity: [0.46, 0.86, 0.46],
                  scale: [0.98, 1.28, 0.98],
                }}
                transition={{ duration: 2.05, repeat: Infinity, ease: "easeInOut" }}
              />
            </>
          )}

          {/* Aurora ring — only on decision, ultra-soft */}
          {isDecision && !isMicro && (
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-[6px] rounded-full"
              style={{
                border: `1px solid ${dotColor}38`,
                boxShadow: `0 0 18px -8px ${dotColor}`,
              }}
            />
          )}

          {/* Role residue — tiny and local, never a full-node repaint. */}
          {showRoleResidue && (
            <div
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                inset: -4,
                border: `1px solid ${primaryRoleColor}${isCurrent || isSelected ? "66" : "28"}`,
                boxShadow:
                  isCurrent || isSelected
                    ? `0 0 14px -8px ${primaryRoleColor}`
                    : "none",
              }}
            />
          )}

          {/* Error spike — slow flicker, never harsh */}
          {isError && !isMicro && (
            <div
              aria-hidden
              className="absolute -inset-[3px] rounded-full pointer-events-none animate-flicker"
              style={{
                boxShadow: `0 0 0 1px ${dotColor}40, 0 0 14px -4px ${dotColor}`,
              }}
            />
          )}

          {/* Edited glow — restrained memory emphasis */}
          {isEdited && !isMicro && (
            <div
              aria-hidden
              className="absolute -inset-[3px] rounded-full pointer-events-none"
              style={{
                boxShadow: `0 0 0 1px ${dotColor}32, 0 0 12px -4px ${dotColor}`,
              }}
            />
          )}

          {/* Passed halo — quiet verification residue */}
          {isPassed && !isMicro && (
            <div
              aria-hidden
              className="absolute -inset-[3px] rounded-full pointer-events-none"
              style={{
                boxShadow: `0 0 0 1px ${dotColor}32, 0 0 14px -4px ${dotColor}`,
              }}
            />
          )}

          {/* The dot itself — directories are hollow rings (containers),
              files are filled dots (leaves), agents are bright orbs. */}
          <div
            className="relative w-full h-full rounded-full flex items-center justify-center"
            style={{
              background: isAgent
                ? isAgentAwake
                  ? `radial-gradient(circle at 35% 28%, rgba(255,255,250,1), ${dotColor}f0 34%, rgba(92,88,78,0.66) 72%, rgba(14,14,17,0.94) 100%)`
                  : `radial-gradient(circle at 35% 28%, rgba(255,253,247,0.95), ${dotColor}aa 38%, rgba(58,56,51,0.6) 78%, rgba(14,14,17,0.95) 100%)`
                : isDirectory
                  ? // Hollow ring — clearly a "container"
                    `radial-gradient(circle, rgba(10,10,12,0.95) 0%, rgba(10,10,12,0.95) 55%, ${dotColor}${hasActiveChild ? "55" : "22"} 70%, transparent 80%)`
                  : isMicro
                    ? `radial-gradient(circle at 35% 30%, ${dotColor}aa, ${dotColor}55 60%, rgba(14,14,17,0.85) 100%)`
                    : showIcon || isCurrent
                      ? `radial-gradient(circle at 36% 28%, ${dotColor}aa, rgba(14,14,17,0.92) 72%)`
                      : `radial-gradient(circle at 36% 28%, ${dotColor}66, rgba(14,14,17,0.9) 78%)`,
              border: isDirectory
                ? `1.5px solid ${dotColor}${hasActiveChild ? "c0" : isCurrent || isSelected ? "90" : "60"}`
                : isMicro
                  ? `0.5px solid ${dotColor}${isCurrent ? "a0" : "55"}`
                  : `1px solid ${dotColor}${
                      isAgentAwake || isCurrent || isSelected ? "c8" : "50"
                    }`,
              boxShadow: isAgentAwake
                ? `0 0 18px ${dotColor}, inset 0 0 10px rgba(255,255,255,0.22)`
                : undefined,
            }}
          >
            {/* Inner dot for directories — small bone speck to confirm
                connection point and indicate "this is a node" */}
            {isDirectory && (
              <div
                aria-hidden
                className="rounded-full"
                style={{
                  width: Math.max(3, size * 0.22),
                  height: Math.max(3, size * 0.22),
                  background: hasActiveChild
                    ? childColor
                    : `${dotColor}88`,
                  boxShadow: hasActiveChild
                    ? `0 0 6px ${childColor}`
                    : "none",
                }}
              />
            )}
            {showIcon && IconComp && !isMicro && (
              <IconComp
                style={{
                  width: size * 0.5,
                  height: size * 0.5,
                  color: dotColor,
                  opacity: 0.78,
                }}
                strokeWidth={1.3}
              />
            )}
          </div>

          {roles.length > 0 && showRoleResidue && (
            <div
              aria-hidden
              className="pointer-events-none absolute -right-1 -top-1 flex gap-[2px]"
            >
              {roles.map((role) => (
                <span
                  key={role}
                  className="block h-1.5 w-1.5 rounded-full"
                  style={{
                    background: roleColor(role),
                    opacity: isCurrent || isSelected ? 0.95 : 0.72,
                    boxShadow:
                      isCurrent || isSelected ? `0 0 5px ${roleColor(role)}` : "none",
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {showLabel && (
        <div
          className="pointer-events-none absolute left-1/2 flex max-w-[180px] -translate-x-1/2 flex-col items-center"
          style={{ top: labelTop }}
        >
          <div
            className={`text-center text-[10.5px] leading-tight ${
              isCurrent || isSelected ? "text-nt-bright" : "text-nt-mid"
            }`}
            style={{
              fontWeight: isAgent || isDecision ? 500 : 400,
              letterSpacing: "0.01em",
              textShadow:
                "0 1px 2px rgba(0,0,0,0.92), 0 0 8px rgba(7,7,6,0.95)",
            }}
          >
            {d.label || d.path}
          </div>
          {labelDetail && (
            <div
              className="mt-1 max-w-[180px] truncate text-center text-[8.5px] leading-none text-nt-dim"
              style={{
                letterSpacing: "0.01em",
                textShadow:
                  "0 1px 2px rgba(0,0,0,0.94), 0 0 8px rgba(7,7,6,0.95)",
              }}
            >
              {labelDetail}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
