import { Film, Minimize2 } from "lucide-react";
import type { GraphVisualMode } from "../types";

type Props = {
  value: GraphVisualMode;
  onChange: (value: GraphVisualMode) => void;
};

const modes: Array<{
  value: GraphVisualMode;
  label: string;
  Icon: typeof Minimize2;
}> = [
  { value: "minimal", label: "Minimal", Icon: Minimize2 },
  { value: "cinematic", label: "Cinematic", Icon: Film },
];

export function ModeToggle({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/[0.035] p-1">
      {modes.map(({ value: mode, label, Icon }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(mode)}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors ${
              active
                ? "bg-white/[0.11] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]"
                : "text-nt-dim hover:bg-white/[0.06] hover:text-nt-bright"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
