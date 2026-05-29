import { describe, it, expect } from "vitest";
import { classifyWasteSignals } from "../src/lib/costModel";
import { fixtures } from "./fixtures";
import { confusion, formatScores, scoreFromConfusion, type Confusion } from "./score";

// Regression floors. The measured baseline (53 labeled signals across 9 fixtures)
// sits at P~94% / R~89% / F1~91%; these floors guard against silent regression
// with a few points of headroom. Tighten them as the classifier improves — this
// is what turns "trust me" into a number we can defend.
const FLOOR_F1 = 0.88;
const FLOOR_PRECISION = 0.88;
const FLOOR_RECALL = 0.85;

function classify(name: string) {
  const fixture = fixtures.find((f) => f.name === name);
  if (!fixture) throw new Error(`fixture not found: ${name}`);
  return classifyWasteSignals(fixture.signals, fixture.nodes, fixture.edges);
}

describe("waste classifier accuracy", () => {
  it("meets the regression floor and prints a scorecard", () => {
    const overall: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
    const reasonTally = new Map<string, number>();
    const lines: string[] = [];

    for (const fixture of fixtures) {
      const verdicts = classifyWasteSignals(
        fixture.signals,
        fixture.nodes,
        fixture.edges
      );
      for (const v of verdicts) {
        if (v.reason) reasonTally.set(v.reason, (reasonTally.get(v.reason) ?? 0) + 1);
      }
      const predicted = new Map(verdicts.map((v) => [v.signalId, v.wasted]));
      const c = confusion(predicted, fixture.labels);
      overall.tp += c.tp;
      overall.fp += c.fp;
      overall.fn += c.fn;
      overall.tn += c.tn;
      lines.push(formatScores(fixture.name, scoreFromConfusion(c)));
    }

    const scores = scoreFromConfusion(overall);
    lines.push("-".repeat(72));
    lines.push(formatScores("OVERALL", scores));
    const reasons = [...reasonTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => `${reason}=${n}`)
      .join("  ");
    lines.push(`flags by reason: ${reasons || "(none)"}`);
    console.log(`\nWaste classifier scorecard\n${lines.join("\n")}\n`);

    expect(scores.f1).toBeGreaterThanOrEqual(FLOOR_F1);
    expect(scores.precision).toBeGreaterThanOrEqual(FLOOR_PRECISION);
    expect(scores.recall).toBeGreaterThanOrEqual(FLOOR_RECALL);
  });

  it("does not flag a clean sequential read pattern as a loop", () => {
    // Guard against C3 loop false-positives on ordinary distinct reads.
    expect(classify("read-edit-tdd").some((v) => v.reason === "loop")).toBe(false);
  });

  it("does not flag a legit cross-file refactor as waste", () => {
    // refactor-bounce reads two files it then edits; bouncing between necessary
    // context is not a loop and not waste — the trust layer must not cry wolf.
    expect(classify("refactor-bounce").some((v) => v.wasted)).toBe(false);
  });

  it("still detects a genuine loop between unedited files", () => {
    // The necessary-context exemption must not disable real loop detection.
    expect(classify("true-loop").some((v) => v.reason === "loop")).toBe(true);
  });
});
