import { getBezierPath, type EdgeProps } from "@xyflow/react";

type SynapseEdgeProps = EdgeProps & {
  data?: {
    active?: boolean;
    visited?: boolean;
    age?: number;
    glowColor?: string;
    visualMode?: "minimal" | "cinematic";
    weight?: number;
    isJump?: boolean;
    isStructuralNerve?: boolean;
  };
};

// Quiet dendrite. Thin, monochrome by default, soft when active.
export function SynapseEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: SynapseEdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.38,
  });

  const active = !!data?.active;
  const visited = !!data?.visited;
  const color = data?.glowColor ?? "#ECE6D7";
  const weight = Math.max(0.16, Math.min(1.2, data?.weight ?? 0.42));
  const isTrunk = weight >= 0.72;
  const isJump = !!data?.isJump;
  const isStructuralNerve = !!data?.isStructuralNerve;

  const idleWidth = isTrunk
    ? 1.6
    : isStructuralNerve
      ? 0.9
      : 0.4 + weight * 0.5;
  const activeWidth = isTrunk ? 2.2 : isJump ? 1.6 : 0.9 + weight * 0.7;

  const trailOpacity = Math.max(0, 0.22 - (data?.age ?? 4.2) * 0.05);
  const idleStroke = visited
    ? `rgba(236, 230, 215, ${Math.max(isTrunk ? 0.3 : isStructuralNerve ? 0.18 : 0.09, trailOpacity).toFixed(3)})`
    : isTrunk
      ? "rgba(236, 230, 215, 0.22)"
      : isStructuralNerve
        ? "rgba(236, 230, 215, 0.13)"
        : isJump
          ? "rgba(236, 230, 215, 0.08)"
          : "rgba(236, 230, 215, 0.05)";

  return (
    <g>
      {/* Bloom layer when active — extremely soft */}
      {active && (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={activeWidth + 2.5}
          strokeOpacity={0.08}
          style={{ filter: `blur(2px)` }}
        />
      )}
      {/* Memory trail when visited (lingers) */}
      {visited && !active && (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={activeWidth + 0.6}
          strokeOpacity={trailOpacity * 0.6}
          style={{ filter: `blur(1.4px)` }}
        />
      )}
      {/* Base line */}
      <path
        d={path}
        fill="none"
        stroke={active ? color : idleStroke}
        strokeWidth={active ? activeWidth : visited ? idleWidth + 0.25 : idleWidth}
        strokeLinecap="round"
        strokeDasharray={isJump && !active ? "2 6" : undefined}
        style={{
          opacity: active ? 0.85 : 1,
          transition: "stroke 240ms ease, stroke-width 240ms ease",
          ...style,
        }}
      />
      {/* Traveling pulse */}
      {active && (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={activeWidth}
          strokeLinecap="round"
          strokeDasharray={isJump ? "12 36" : isTrunk ? "16 240" : "10 240"}
          className="animate-synapse-pulse"
          style={{ opacity: 0.62 }}
        />
      )}
    </g>
  );
}
