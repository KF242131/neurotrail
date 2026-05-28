import { Cpu, Radio, ShieldCheck } from "lucide-react";
import type { AgentTelemetry } from "../types";

type Props = {
  agents: AgentTelemetry[];
  variant?: "rail" | "bar";
};

const statusLabel: Record<AgentTelemetry["status"], string> = {
  active: "Live",
  ready: "Ready",
  planned: "Planned",
};

function fmtTokens(tokens: number) {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return tokens.toString();
}

export function AgentTelemetryPanel({ agents, variant = "rail" }: Props) {
  const totalUsed = agents.reduce((sum, agent) => sum + agent.tokensUsed, 0);

  if (variant === "bar") {
    return (
      <section className="mx-5 mt-3 shrink-0 rounded-lg border border-white/[0.08] bg-nt-panel/42 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl md:mx-7">
        <div className="grid items-center gap-3 xl:grid-cols-[190px_1fr]">
          <div className="flex items-center justify-between gap-4 xl:block">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-nt-dim">
              <Radio className="h-3 w-3" strokeWidth={1.8} />
              Role Token Telemetry
            </div>
            <div className="mt-0 xl:mt-2">
              <span className="font-mono text-[20px] font-medium text-white">
                {fmtTokens(totalUsed)}
              </span>
              <span className="ml-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-cyan-100/75">
                NSP
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {agents.map((agent) => {
              const usage = Math.min(1, agent.tokensUsed / agent.tokenBudget);
              return (
                <div
                  key={agent.id}
                  className="min-w-0 rounded-md border border-white/[0.07] bg-white/[0.03] px-2.5 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            background: agent.accent,
                            boxShadow: `0 0 8px ${agent.accent}`,
                          }}
                        />
                        <div className="truncate text-[11px] font-medium text-nt-bright">
                          {agent.name}
                        </div>
                      </div>
                      <div className="mt-1 truncate text-[9px] uppercase tracking-[0.14em] text-nt-dim">
                        {agent.role}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-mono text-[11px] text-white">
                        {fmtTokens(agent.tokensUsed)}
                      </div>
                      <div className="text-[8px] uppercase tracking-[0.12em] text-nt-dim">
                        {statusLabel[agent.status]}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${usage * 100}%`,
                        background: `linear-gradient(90deg, ${agent.accent}, rgba(255,255,255,0.58))`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex flex-col gap-2.5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-nt-dim">
        <Radio className="h-3 w-3" strokeWidth={1.8} />
        Role Token Telemetry
      </div>

      <div className="rounded-lg border border-white/[0.09] bg-nt-panel/50 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="mb-2.5 flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-nt-dim">
              Total Tokens
            </div>
            <div className="mt-0.5 font-mono text-[18px] font-medium text-white">
              {fmtTokens(totalUsed)}
            </div>
          </div>
          <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-100/80">
            NSP
          </div>
        </div>

        <div className="space-y-2">
          {agents.map((agent) => {
            const usage = Math.min(1, agent.tokensUsed / agent.tokenBudget);
            return (
              <div
                key={agent.id}
                className="rounded-md border border-white/[0.07] bg-white/[0.035] px-2.5 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: agent.accent,
                          boxShadow: `0 0 8px ${agent.accent}`,
                        }}
                      />
                      <div className="truncate text-[12px] font-medium text-nt-bright">
                        {agent.name}
                      </div>
                    </div>
                    <div className="mt-1 truncate text-[10px] uppercase tracking-[0.16em] text-nt-dim">
                      {agent.role}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[12px] text-white">
                      {fmtTokens(agent.tokensUsed)}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.14em] text-nt-dim">
                      {statusLabel[agent.status]}
                    </div>
                  </div>
                </div>

                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${usage * 100}%`,
                      background: `linear-gradient(90deg, ${agent.accent}, rgba(255,255,255,0.62))`,
                      boxShadow: `0 0 8px ${agent.accent}`,
                    }}
                  />
                </div>

                <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-2 text-[9px] text-nt-dim">
                  <span className="truncate font-mono">{agent.adapter}</span>
                  <span className="flex items-center gap-1">
                    {agent.status === "active" ? (
                      <Cpu className="h-3 w-3" strokeWidth={1.7} />
                    ) : (
                      <ShieldCheck className="h-3 w-3" strokeWidth={1.7} />
                    )}
                    {agent.model}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
