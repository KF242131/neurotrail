// Canonical, dependency-free waste-classification core. This is the single
// source of truth shared by the TypeScript app (src/lib/costModel.ts) and the
// Node CLI (bin/neurotrail.mjs) so the live viewer and exported reports agree.
// Pure functions only — no token/cost weighting here; each caller applies its
// own token model on top of these per-signal verdicts.

export const WASTE_LABELS = {
  dead_trail: "Dead trails",
  thrash: "Thrash",
  tool_error: "Tool errors",
  failed_iteration: "Failed iterations",
  explicit_waste: "Explicit waste",
  churn: "Churn",
  loop: "Loops",
  redundant_retry: "Redundant retries",
};

// Per-reason prior confidence. Starting points — calibrate against the labeled
// fixtures in eval/ (see eval/wasteEval.test.ts) rather than guessing.
export const WASTE_CONFIDENCE = {
  dead_trail: 0.58,
  thrash: 0.82,
  tool_error: 0.78,
  failed_iteration: 0.7,
  explicit_waste: 0.62,
  churn: 0.66,
  loop: 0.72,
  redundant_retry: 0.74,
};

/** Verdict confidence band the LLM audit scaffold treats as "ambiguous". */
export const LOW_CONFIDENCE_BAND = [0.5, 0.7];

const READ_ACTIONS = new Set(["read_file", "open_symbol", "search"]);
const EDIT_ACTIONS = new Set(["edit_file", "write_text"]);
const PROGRESS_ACTIONS = new Set([
  "edit_file",
  "write_text",
  "run_command",
  "test_failed",
  "test_passed",
  "decision",
  "final_answer",
]);
const TRANSITION_ACTIONS = new Set([
  "read_file",
  "open_symbol",
  "search",
  "run_command",
]);
const RELATIONSHIP_EDGE_TYPES = new Set(["imports", "calls", "tests"]);

const THRASH_WINDOW_SECONDS = 30;
const THRASH_READ_THRESHOLD = 3;
const EPISODE_GAP_SECONDS = 120;
const VERIFY_WINDOW_SECONDS = 45;
const OBSERVE_DOWNSTREAM_WINDOW_SECONDS = 30;
const CHURN_EDIT_THRESHOLD = 3;
const LOOP_BIGRAM_THRESHOLD = 3;

export function isLiveSummarySignal(signal) {
  return signal.id.endsWith("-live-summary");
}

export function labelForNode(nodes, id) {
  const node = nodes.find((item) => item.id === id);
  if (node?.path && node.path !== ".") return node.path;
  return node?.label ?? id.replace(/^(file|dir|cmd|decision|agent):/, "");
}

function pathForNode(nodes, id) {
  const node = nodes.find((item) => item.id === id);
  if (node?.path && node.path !== ".") return node.path;
  return id.replace(/^(file|dir):/, "");
}

function dirname(value) {
  const index = value.lastIndexOf("/");
  return index <= 0 ? "" : value.slice(0, index);
}

function basename(value) {
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

function looksLikeContextFile(filePath) {
  const name = basename(filePath).toLowerCase();
  return (
    name.endsWith(".d.ts") ||
    name.includes("type") ||
    name.includes("schema") ||
    name.includes("interface") ||
    name.includes("config") ||
    name.includes("constant") ||
    name.includes(".test.") ||
    name.includes(".spec.") ||
    name === "package.json" ||
    name.endsWith("config.json") ||
    name.endsWith("config.ts") ||
    name.endsWith("config.js")
  );
}

function explicitWasteReason(signal) {
  const text = `${signal.action} ${signal.reason ?? ""}`.toLowerCase();
  if (text.includes("error") || text.includes("failed") || text.includes("failure")) {
    return "tool_error";
  }
  return "explicit_waste";
}

function agentKeyOf(signal) {
  return signal.agentId && signal.agentId.length > 0
    ? signal.agentId
    : "__unassigned";
}

function sortSignals(signals) {
  return signals
    .filter((signal) => !isLiveSummarySignal(signal))
    .slice()
    .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

function pushTime(map, key, time) {
  const list = map.get(key);
  if (list) list.push(time);
  else map.set(key, [time]);
}

function maxTime(map, key) {
  const list = map.get(key);
  if (!list || list.length === 0) return -Infinity;
  let max = -Infinity;
  for (const value of list) if (value > max) max = value;
  return max;
}

function pushTo(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Split a signal stream into per-agent episodes. An episode is a contiguous run
 * of one agent's signals; a gap larger than EPISODE_GAP_SECONDS (or a switch to
 * another agent) starts a new one. Episodes scope the revert/loop/TDD reasoning.
 */
export function segmentEpisodes(signals) {
  const sorted = sortSignals(signals);
  const episodes = [];
  const open = new Map();
  let counter = 0;
  for (const signal of sorted) {
    const key = agentKeyOf(signal);
    const current = open.get(key);
    if (!current || signal.time - current.endTime > EPISODE_GAP_SECONDS) {
      const episode = {
        id: `ep-${counter++}`,
        agentKey: key,
        signalIds: [signal.id],
        startTime: signal.time,
        endTime: signal.time,
      };
      episodes.push(episode);
      open.set(key, episode);
    } else {
      current.signalIds.push(signal.id);
      current.endTime = signal.time;
    }
  }
  return episodes;
}

/**
 * Per-signal waste classification. Pure and deterministic so it can be scored
 * against labeled fixtures (eval/) and so the LLM audit can override only the
 * low-confidence segments. Returns one verdict per (non-live-summary) signal.
 */
export function classifyWasteSignals(signals, nodes, edges = [], audit) {
  const realSignals = sortSignals(signals);
  const episodes = segmentEpisodes(realSignals);
  const episodeOf = new Map();
  for (const episode of episodes) {
    for (const id of episode.signalIds) episodeOf.set(id, episode.id);
  }

  // ---- First pass: ordered "useful" timelines per target ----
  const editTimesByTarget = new Map();
  const usefulTimesByTarget = new Map();
  const progressTimesByAgent = new Map();
  const testPassedTimesByEpisode = new Map();

  for (const signal of realSignals) {
    const episodeId = episodeOf.get(signal.id) ?? "";
    if (EDIT_ACTIONS.has(signal.action)) {
      pushTime(editTimesByTarget, signal.target, signal.time);
      pushTime(usefulTimesByTarget, signal.target, signal.time);
    }
    if (signal.action === "decision" || signal.action === "final_answer") {
      for (const id of signal.evidence ?? [])
        pushTime(usefulTimesByTarget, id, signal.time);
    }
    if (signal.category === "evidence" || signal.category === "handoff") {
      pushTime(usefulTimesByTarget, signal.target, signal.time);
    }
    if (PROGRESS_ACTIONS.has(signal.action)) {
      pushTime(progressTimesByAgent, agentKeyOf(signal), signal.time);
    }
    if (signal.action === "test_passed") {
      pushTime(testPassedTimesByEpisode, episodeId, signal.time);
    }
  }

  const editedTargets = new Set(editTimesByTarget.keys());
  const editedPathTimes = new Map();
  for (const [target, times] of editTimesByTarget) {
    const filePath = pathForNode(nodes, target);
    editedPathTimes.set(
      filePath,
      Math.max(editedPathTimes.get(filePath) ?? -Infinity, ...times)
    );
  }

  // A read at time t is "necessary" only when it can plausibly have informed
  // later work (ordered causality) or is verification shortly after an edit.
  const isNecessaryContext = (target, time) => {
    if (maxTime(usefulTimesByTarget, target) >= time) return true;
    const edits = editTimesByTarget.get(target);
    if (edits?.some((edit) => edit <= time && time - edit <= VERIFY_WINDOW_SECONDS)) {
      return true;
    }
    const graphRelated = edges.some((edge) => {
      if (!RELATIONSHIP_EDGE_TYPES.has(edge.type)) return false;
      const other =
        edge.source === target
          ? edge.target
          : edge.target === target
            ? edge.source
            : null;
      return (
        other !== null &&
        editedTargets.has(other) &&
        maxTime(editTimesByTarget, other) >= time
      );
    });
    if (graphRelated) return true;
    const targetPath = pathForNode(nodes, target);
    if (targetPath && looksLikeContextFile(targetPath)) {
      const targetDir = dirname(targetPath);
      for (const [editedPath, editTime] of editedPathTimes) {
        if (dirname(editedPath) === targetDir && editTime >= time) return true;
      }
    }
    return false;
  };

  // ---- Second pass: assign a verdict to every signal ----
  const verdicts = new Map();
  const setVerdict = (id, reason) => {
    verdicts.set(id, {
      wasted: reason !== null,
      reason,
      confidence: reason ? WASTE_CONFIDENCE[reason] : 0,
    });
  };

  const readCounts = new Map();
  const readWindows = new Map();
  const lastRunByAgentTarget = new Map();
  const lastEditTimeByAgent = new Map();
  const churnByEpisodeTarget = new Map();
  const necessaryReadIds = new Set();

  for (const signal of realSignals) {
    const episodeId = episodeOf.get(signal.id) ?? "";
    const agentKey = agentKeyOf(signal);

    // B3: a failing test is only waste when nothing later passes in its episode.
    if (signal.action === "test_failed") {
      const passes = testPassedTimesByEpisode.get(episodeId);
      const productive = !!passes && passes.some((time) => time > signal.time);
      setVerdict(signal.id, productive ? null : "failed_iteration");
      readWindows.clear();
      continue;
    }

    // A passing test / decision resets churn accounting for the episode.
    if (
      signal.action === "test_passed" ||
      signal.action === "decision" ||
      signal.action === "final_answer"
    ) {
      for (const key of [...churnByEpisodeTarget.keys()]) {
        if (key.startsWith(`${episodeId}|`)) churnByEpisodeTarget.delete(key);
      }
      setVerdict(signal.id, null);
      readWindows.clear();
      continue;
    }

    // C2: repeated edits to one target without an intervening pass/decision.
    if (EDIT_ACTIONS.has(signal.action)) {
      const churnKey = `${episodeId}|${signal.target}`;
      const count = (churnByEpisodeTarget.get(churnKey) ?? 0) + 1;
      churnByEpisodeTarget.set(churnKey, count);
      setVerdict(signal.id, count > CHURN_EDIT_THRESHOLD ? "churn" : null);
      lastEditTimeByAgent.set(agentKey, signal.time);
      readWindows.clear();
      continue;
    }

    // B4: the same command re-run with no edit since the previous run.
    if (signal.action === "run_command") {
      const runKey = `${agentKey}|${signal.target}`;
      const previousRun = lastRunByAgentTarget.get(runKey);
      const lastEdit = lastEditTimeByAgent.get(agentKey) ?? -Infinity;
      const redundant = previousRun !== undefined && lastEdit <= previousRun;
      setVerdict(signal.id, redundant ? "redundant_retry" : null);
      lastRunByAgentTarget.set(runKey, signal.time);
      readWindows.clear();
      continue;
    }

    // B2: trust the server's waste hint, but rescue output-inspection that fed
    // a downstream fix/decision (the feedback loop is the point, not waste).
    if (signal.category === "waste") {
      if (signal.action === "observe_output") {
        const progress = progressTimesByAgent.get(agentKey);
        const downstream =
          !!progress &&
          progress.some(
            (time) =>
              time > signal.time &&
              time - signal.time <= OBSERVE_DOWNSTREAM_WINDOW_SECONDS
          );
        setVerdict(signal.id, downstream ? null : explicitWasteReason(signal));
      } else {
        setVerdict(signal.id, explicitWasteReason(signal));
      }
      continue;
    }

    if (!READ_ACTIONS.has(signal.action)) {
      setVerdict(signal.id, null);
      continue;
    }

    // Reads: dead trails and thrash, with the ordered rescue above.
    const prior = readCounts.get(signal.target) ?? 0;
    readCounts.set(signal.target, prior + 1);
    const recentReads = (readWindows.get(signal.target) ?? []).filter(
      (time) => signal.time - time <= THRASH_WINDOW_SECONDS
    );
    recentReads.push(signal.time);
    readWindows.set(signal.target, recentReads);

    if (isNecessaryContext(signal.target, signal.time)) {
      necessaryReadIds.add(signal.id);
      setVerdict(signal.id, null);
    } else if (recentReads.length >= THRASH_READ_THRESHOLD) {
      setVerdict(signal.id, "thrash");
    } else if (prior === 0) {
      setVerdict(signal.id, "dead_trail");
    } else {
      setVerdict(signal.id, null);
    }
  }

  // ---- C3: cross-target loops. Additive only over otherwise-clean signals so
  // it catches oscillation the per-target thrash check misses without inflating
  // already-counted waste. ----
  const bigramHits = new Map();
  const lastTargetByAgent = new Map();
  for (const signal of realSignals) {
    if (!TRANSITION_ACTIONS.has(signal.action)) continue;
    const agentKey = agentKeyOf(signal);
    const previous = lastTargetByAgent.get(agentKey);
    if (previous !== undefined && previous !== signal.target) {
      pushTo(bigramHits, `${agentKey}|${previous}=>${signal.target}`, signal.id);
    }
    lastTargetByAgent.set(agentKey, signal.target);
  }
  for (const ids of bigramHits.values()) {
    if (ids.length < LOOP_BIGRAM_THRESHOLD) continue;
    for (const id of ids) {
      // Don't relabel a read that genuinely informed later work (necessary
      // context) as a loop — legit cross-file refactors bounce between files
      // they actually edit, and flagging that would cry wolf.
      if (necessaryReadIds.has(id)) continue;
      const current = verdicts.get(id);
      if (!current || !current.wasted) setVerdict(id, "loop");
    }
  }

  // ---- LLM audit override (scaffold). Off by default: with no verdicts
  // supplied this is a no-op, so deterministic behavior is unchanged. ----
  if (audit && audit.length > 0) {
    const [low, high] = LOW_CONFIDENCE_BAND;
    const byEpisode = new Map();
    for (const entry of audit) byEpisode.set(entry.episodeId, entry);
    for (const signal of realSignals) {
      const episodeId = episodeOf.get(signal.id) ?? "";
      const decision = byEpisode.get(episodeId);
      if (!decision || decision.verdict === "uncertain") continue;
      const current = verdicts.get(signal.id);
      const confidence = current?.confidence ?? 0;
      if (confidence < low || confidence > high) continue;
      if (decision.verdict === "useful") {
        verdicts.set(signal.id, { wasted: false, reason: null, confidence: decision.confidence });
      } else {
        verdicts.set(signal.id, {
          wasted: true,
          reason: current?.reason ?? "explicit_waste",
          confidence: decision.confidence,
        });
      }
    }
  }

  return realSignals.map((signal) => {
    const verdict = verdicts.get(signal.id);
    return {
      signalId: signal.id,
      wasted: verdict?.wasted ?? false,
      reason: verdict?.reason ?? null,
      confidence: verdict?.confidence ?? 0,
      episodeId: episodeOf.get(signal.id) ?? "",
    };
  });
}
