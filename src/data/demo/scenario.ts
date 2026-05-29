import type {
  AgentRole,
  NeuroNodeProminence,
  NeuroNodeType,
  NeuroSignalCategory,
  SignalAction,
} from "../../types";

export type DemoAgentId = "claude" | "codex" | "gemini";

export type DemoAgent = {
  id: DemoAgentId;
  name: string;
  role: string;
  model: string;
  adapter: string;
  tokens: number;
};

export type DemoTarget = {
  id: string;
  label: string;
  type: NeuroNodeType;
  owner: DemoAgentId;
  description: string;
  path?: string;
  depth?: number;
  prominence?: NeuroNodeProminence;
};

export type DemoStep = {
  t: number;
  agent: DemoAgentId;
  action: SignalAction;
  target: string;
  role: AgentRole;
  reason: string;
  category?: NeuroSignalCategory;
  evidence?: string[];
};

const file = (path: string) => `file:${path}`;
const cmd = (name: string) => `cmd:${name}`;
const artifact = (name: string) => `artifact:${name}`;

export const ROOT_ID = "dir:project-root";
export const BRANCH_ID = "branch:pr-428";
export const TRANSCRIPT_ID = "artifact:multi-agent-session-log";

export const DEMO_AGENTS: DemoAgent[] = [
  {
    id: "claude",
    name: "Claude",
    role: "Implements the rate-limit PR",
    model: "claude",
    adapter: "Claude Code - local session",
    tokens: 64000,
  },
  {
    id: "codex",
    name: "Codex",
    role: "Verifies red-to-green tests",
    model: "codex",
    adapter: "Codex - local session",
    tokens: 41000,
  },
  {
    id: "gemini",
    name: "Gemini",
    role: "Reviews policy and blast radius",
    model: "gemini",
    adapter: "Gemini - local session",
    tokens: 29000,
  },
];

export const DEMO_TARGETS: DemoTarget[] = [
  {
    id: file("src/server/rateLimiter.ts"),
    label: "rateLimiter.ts",
    type: "file",
    owner: "claude",
    path: "src/server/rateLimiter.ts",
    description: "The new tenant-aware token-bucket limiter.",
  },
  {
    id: file("src/server/middleware.ts"),
    label: "middleware.ts",
    type: "file",
    owner: "claude",
    path: "src/server/middleware.ts",
    description: "The request pipeline entrypoint that calls the limiter.",
  },
  {
    id: file("src/server/requestContext.ts"),
    label: "requestContext.ts",
    type: "file",
    owner: "claude",
    path: "src/server/requestContext.ts",
    description: "Tenant and plan metadata for the request pipeline.",
  },
  {
    id: file("src/config/limits.ts"),
    label: "limits.ts",
    type: "config",
    owner: "claude",
    path: "src/config/limits.ts",
    description: "Plan defaults shared by server and tests.",
  },
  {
    id: file("src/api/rateLimitResponse.ts"),
    label: "rateLimitResponse.ts",
    type: "file",
    owner: "claude",
    path: "src/api/rateLimitResponse.ts",
    description: "Public response shape for throttled requests.",
  },
  {
    id: file("tests/rateLimiter.test.ts"),
    label: "rateLimiter.test.ts",
    type: "test",
    owner: "codex",
    path: "tests/rateLimiter.test.ts",
    description: "The failing and then passing verification path.",
  },
  {
    id: file("tests/fixtures/tenantPlans.json"),
    label: "tenantPlans.json",
    type: "test",
    owner: "codex",
    path: "tests/fixtures/tenantPlans.json",
    description: "Fixture plans that exercise each limit tier.",
  },
  {
    id: file("src/legacy/throttle.ts"),
    label: "throttle.ts",
    type: "file",
    owner: "gemini",
    path: "src/legacy/throttle.ts",
    prominence: "micro",
    description: "A real attention flag: inspected, but not part of the final path.",
  },
  {
    id: file("docs/rate-limits.md"),
    label: "rate-limits.md",
    type: "artifact",
    owner: "claude",
    path: "docs/rate-limits.md",
    description: "Reviewer-facing behavior notes.",
  },
  {
    id: file(".github/workflows/neurotrail-review.yml"),
    label: "neurotrail-review.yml",
    type: "config",
    owner: "gemini",
    path: ".github/workflows/neurotrail-review.yml",
    description: "PR automation that attaches the replay artifact.",
  },
  {
    id: file("package.json"),
    label: "package.json",
    type: "config",
    owner: "codex",
    path: "package.json",
    depth: 2,
    prominence: "micro",
    description: "Package metadata inspected during review.",
  },
  {
    id: cmd("npm run typecheck"),
    label: "typecheck",
    type: "command",
    owner: "codex",
    depth: 2,
    prominence: "branch",
    description: "TypeScript build gate.",
  },
  {
    id: cmd("npm test"),
    label: "npm test",
    type: "command",
    owner: "codex",
    depth: 2,
    prominence: "branch",
    description: "Unit and integration test suite.",
  },
  {
    id: cmd("npm run lint"),
    label: "lint",
    type: "command",
    owner: "codex",
    depth: 2,
    prominence: "branch",
    description: "Lint gate before the PR comment.",
  },
  {
    id: artifact("PR #428 trust summary"),
    label: "PR trust summary",
    type: "decision",
    owner: "gemini",
    depth: 1,
    prominence: "core",
    description: "Reviewer-facing process summary with evidence links.",
  },
];

export const TOTAL_DURATION = 58;

export const DEMO_STEPS: DemoStep[] = [
  {
    t: 0,
    agent: "claude",
    action: "read_file",
    target: file("src/server/middleware.ts"),
    role: "research",
    reason: "Trace the request pipeline before adding the limiter",
  },
  {
    t: 3,
    agent: "claude",
    action: "open_symbol",
    target: file("src/config/limits.ts"),
    role: "research",
    reason: "Find existing tenant plan limits",
  },
  {
    t: 6,
    agent: "claude",
    action: "edit_file",
    target: file("src/server/rateLimiter.ts"),
    role: "coding",
    reason: "Add a tenant-aware token bucket",
  },
  {
    t: 9,
    agent: "claude",
    action: "edit_file",
    target: file("src/server/requestContext.ts"),
    role: "coding",
    reason: "Expose plan metadata to middleware",
  },
  {
    t: 12,
    agent: "codex",
    action: "run_command",
    target: cmd("npm run typecheck"),
    role: "verification",
    reason: "Run TypeScript before widening the change",
  },
  {
    t: 14,
    agent: "codex",
    action: "test_failed",
    target: cmd("npm run typecheck"),
    role: "verification",
    reason: "Missing RateLimitDecision export",
  },
  {
    t: 17,
    agent: "claude",
    action: "edit_file",
    target: file("src/server/rateLimiter.ts"),
    role: "coding",
    reason: "Export the decision type and normalize retryAfter",
  },
  {
    t: 20,
    agent: "claude",
    action: "edit_file",
    target: file("src/config/limits.ts"),
    role: "coding",
    reason: "Set free, pro, and enterprise defaults",
  },
  {
    t: 23,
    agent: "codex",
    action: "run_command",
    target: cmd("npm test"),
    role: "verification",
    reason: "Run the suite after the type fix",
  },
  {
    t: 25,
    agent: "codex",
    action: "test_failed",
    target: cmd("npm test"),
    role: "verification",
    reason: "Integration fixture still expects the old 429 body",
  },
  {
    t: 28,
    agent: "codex",
    action: "read_file",
    target: file("tests/rateLimiter.test.ts"),
    role: "verification",
    reason: "Open the failing assertion",
  },
  {
    t: 31,
    agent: "claude",
    action: "edit_file",
    target: file("src/api/rateLimitResponse.ts"),
    role: "coding",
    reason: "Keep the API body backwards-compatible",
  },
  {
    t: 34,
    agent: "codex",
    action: "edit_file",
    target: file("tests/fixtures/tenantPlans.json"),
    role: "verification",
    reason: "Add fixture plans for each limit tier",
  },
  {
    t: 37,
    agent: "codex",
    action: "run_command",
    target: cmd("npm test"),
    role: "verification",
    reason: "Re-run unit and integration tests",
  },
  {
    t: 39,
    agent: "codex",
    action: "test_passed",
    target: cmd("npm test"),
    role: "verification",
    reason: "All rate-limit tests pass",
    evidence: [cmd("npm test"), file("tests/rateLimiter.test.ts")],
  },
  {
    t: 42,
    agent: "gemini",
    action: "read_file",
    target: file("src/server/rateLimiter.ts"),
    role: "review",
    reason: "Review limiter math and failure modes",
  },
  {
    t: 44,
    agent: "gemini",
    action: "read_file",
    target: file(".github/workflows/neurotrail-review.yml"),
    role: "review",
    reason: "Confirm PR comment automation can attach the replay artifact",
  },
  {
    t: 46,
    agent: "gemini",
    action: "read_file",
    target: file("src/legacy/throttle.ts"),
    role: "review",
    category: "waste",
    reason: "Skim an old throttle helper; it does not feed the final change",
  },
  {
    t: 49,
    agent: "codex",
    action: "run_command",
    target: cmd("npm run lint"),
    role: "verification",
    reason: "Lint the widened PR surface",
  },
  {
    t: 51,
    agent: "claude",
    action: "write_text",
    target: file("docs/rate-limits.md"),
    role: "writing",
    reason: "Document behavior for reviewers and operators",
  },
  {
    t: 54,
    agent: "gemini",
    action: "decision",
    target: artifact("PR #428 trust summary"),
    role: "review",
    reason: "Approve with one evidence-linked attention flag",
    evidence: [
      file("src/server/rateLimiter.ts"),
      file("src/server/middleware.ts"),
      file("tests/rateLimiter.test.ts"),
      cmd("npm test"),
      file("src/legacy/throttle.ts"),
    ],
  },
  {
    t: 57,
    agent: "claude",
    action: "final_answer",
    target: artifact("PR #428 trust summary"),
    role: "orchestrator",
    reason: "Handoff is ready: changed files, green tests, and evidence-linked review trail",
    evidence: [
      file("src/server/rateLimiter.ts"),
      file("src/config/limits.ts"),
      file("docs/rate-limits.md"),
      cmd("npm test"),
    ],
  },
];
