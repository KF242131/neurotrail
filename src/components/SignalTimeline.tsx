import { Pause, Play, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import type { NeuroSignal } from "../types";
import { actionColor } from "../lib/signalStyles";

type Props = {
  signals: NeuroSignal[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  speed: number;
  onPlayToggle: () => void;
  onReset: () => void;
  onSeek: (t: number) => void;
  onSpeedChange: (s: number) => void;
};

const SPEEDS = [0.5, 1, 1.5, 2];

function fmtTime(t: number) {
  const total = Math.max(0, t);
  const s = Math.floor(total);
  const ms = Math.floor((total - s) * 10);
  return `${s.toString().padStart(2, "0")}.${ms}s`;
}

export function SignalTimeline({
  signals,
  currentTime,
  duration,
  isPlaying,
  speed,
  onPlayToggle,
  onReset,
  onSeek,
  onSpeedChange,
}: Props) {
  const markers = useMemo(
    () =>
      signals.map((s) => ({
        id: s.id,
        time: s.time,
        action: s.action,
        color: actionColor(s.action),
      })),
    [signals]
  );

  const progress = Math.min(1, currentTime / duration);

  const onScrub = (ev: React.MouseEvent<HTMLDivElement>) => {
    const bar = ev.currentTarget;
    const rect = bar.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div className="relative z-30 border-t border-white/[0.06] bg-nt-deep/70 px-7 py-4 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <button
          onClick={onPlayToggle}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="group relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-200 to-violet-300 shadow-[0_14px_30px_rgba(0,0,0,0.28),0_0_18px_rgba(34,211,238,0.16)] transition-transform hover:scale-[1.02]"
        >
          {isPlaying ? (
            <Pause className="h-[18px] w-[18px] text-nt-deep" fill="currentColor" />
          ) : (
            <Play
              className="h-[18px] w-[18px] translate-x-0.5 text-nt-deep"
              fill="currentColor"
            />
          )}
        </button>

        <button
          onClick={onReset}
          aria-label="Reset"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.04] text-nt-dim transition-colors hover:bg-white/[0.08] hover:text-nt-bright"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.8} />
        </button>

        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-nt-dim">
            <span>Signal Timeline</span>
            <span className="font-mono text-nt-bright tabular-nums">
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>
          </div>
          <div
            className="relative h-2 cursor-pointer overflow-visible rounded-full bg-white/[0.055]"
            onClick={onScrub}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400/80 via-violet-400/80 to-cyan-300/80"
              style={{
                width: `${progress * 100}%`,
                boxShadow: "0 0 10px rgba(34,211,238,0.18)",
              }}
            />
            {markers.map((m) => {
              const left = (m.time / duration) * 100;
              return (
                <div
                  key={m.id}
                  className="absolute top-1/2 h-3 w-1 -translate-y-1/2 rounded-sm"
                  style={{
                    left: `calc(${left}% - 2px)`,
                    background: m.color,
                    boxShadow: `0 0 5px ${m.color}`,
                    opacity: 0.72,
                  }}
                  title={m.action}
                />
              );
            })}
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white"
              style={{
                left: `calc(${progress * 100}% - 6px)`,
                boxShadow:
                  "0 0 0 2px rgba(8,17,31,0.92), 0 0 10px rgba(255,255,255,0.34)",
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-white/[0.09] bg-white/[0.04] p-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`h-7 rounded-full px-2.5 font-mono text-[11px] font-medium transition-colors ${
                speed === s
                  ? "bg-white/[0.13] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                  : "text-nt-dim hover:text-nt-bright"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
