import type { AgentRole, NeuroSignalCategory, SignalAction } from "../../types";

// The built-in sample replay: three AI agents collaborate on one pull request so
// a first-time viewer can SEE NeuroTrail's cross-agent angle at a glance.
//   • Claude  writes the code        (purple)
//   • Codex   runs the test suite     (cyan)
//   • Gemini  reviews the change      (green)
// The story is healthy on purpose — tests go red then green, and there is exactly
// one honest "attention flag" (Gemini skims an unrelated legacy file) so the
// waste metric reads like a real, trustworthy run rather than noise.

export type DemoAgentId = "claude" | "codex" | "gemini";

export type DemoAgent = {
  id: DemoAgentId;
  name: string;
  role: string;
  model: string;
  adapter: string;
  tokens: number;
};

export type DemoStep = {
  t: number; // seconds into the replay
  agent: DemoAgentId;
  action: SignalAction;
  target: string; // "file:<path>" | "cmd:<name>"
  role: AgentRole;
  reason: string;
  category?: NeuroSignalCategory;
  evidence?: string[];
};

export const DEMO_AGENTS: DemoAgent[] = [
  { id: "claude", name: "Claude", role: "Writes the rate limiter", model: "claude", adapter: "Claude Code · local session", tokens: 52000 },
  { id: "codex", name: "Codex", role: "Runs the test suite", model: "codex", adapter: "Codex · local session", tokens: 18000 },
  { id: "gemini", name: "Gemini", role: "Reviews the change", model: "gemini", adapter: "Gemini · local session", tokens: 13000 },
];

const FILE = {
  mw: "file:src/server/middleware.ts",
  limits: "file:src/config/limits.ts",
  rate: "file:src/server/rateLimiter.ts",
  tests: "cmd:npm test",
  throttle: "file:src/legacy/throttle.ts",
};

export const TOTAL_DURATION = 35;

export const DEMO_STEPS: DemoStep[] = [
  { t: 0, agent: "claude", action: "read_file", target: FILE.mw, role: "research", reason: "Read middleware.ts to find the request pipeline" },
  { t: 2, agent: "claude", action: "read_file", target: FILE.limits, role: "research", reason: "Read config/limits.ts for the default thresholds" },
  { t: 4, agent: "claude", action: "edit_file", target: FILE.rate, role: "coding", reason: "Implement a token-bucket rate limiter" },
  { t: 7, agent: "codex", action: "run_command", target: FILE.tests, role: "verification", reason: "Run the test suite" },
  { t: 9, agent: "codex", action: "test_failed", target: FILE.tests, role: "verification", reason: "rateLimiter: burst window off by one" },
  { t: 12, agent: "claude", action: "edit_file", target: FILE.rate, role: "coding", reason: "Fix the burst-window boundary" },
  { t: 15, agent: "codex", action: "run_command", target: FILE.tests, role: "verification", reason: "Re-run the suite" },
  { t: 17, agent: "codex", action: "test_passed", target: FILE.tests, role: "verification", reason: "All 14 tests pass" },
  { t: 20, agent: "claude", action: "edit_file", target: FILE.limits, role: "coding", reason: "Raise the default limit to 100 req/min" },
  { t: 23, agent: "claude", action: "edit_file", target: FILE.mw, role: "coding", reason: "Wire the limiter into the middleware chain" },
  { t: 26, agent: "gemini", action: "read_file", target: FILE.rate, role: "review", reason: "Review the limiter implementation", evidence: [FILE.rate] },
  { t: 29, agent: "gemini", action: "read_file", target: FILE.throttle, role: "review", reason: "Skim the old throttle util — turns out unrelated" },
  { t: 32, agent: "gemini", action: "decision", target: FILE.rate, role: "review", reason: "Looks correct — approve", evidence: [FILE.rate, FILE.mw] },
];
