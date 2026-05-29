import type { WasteLabel } from "./fixtures";

export type Confusion = { tp: number; fp: number; fn: number; tn: number };

export type Scores = Confusion & {
  precision: number;
  recall: number;
  f1: number;
  support: number;
};

export function confusion(
  predictedWasted: Map<string, boolean>,
  labels: Record<string, WasteLabel>
): Confusion {
  const result: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const [id, label] of Object.entries(labels)) {
    const predicted = predictedWasted.get(id) ?? false;
    const truth = label === "wasted";
    if (predicted && truth) result.tp += 1;
    else if (predicted && !truth) result.fp += 1;
    else if (!predicted && truth) result.fn += 1;
    else result.tn += 1;
  }
  return result;
}

export function scoreFromConfusion(c: Confusion): Scores {
  const precision = c.tp + c.fp > 0 ? c.tp / (c.tp + c.fp) : 1;
  const recall = c.tp + c.fn > 0 ? c.tp / (c.tp + c.fn) : 1;
  const f1 =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { ...c, precision, recall, f1, support: c.tp + c.fp + c.fn + c.tn };
}

export function precisionRecallF1(
  predictedWasted: Map<string, boolean>,
  labels: Record<string, WasteLabel>
): Scores {
  return scoreFromConfusion(confusion(predictedWasted, labels));
}

export function formatScores(label: string, s: Scores): string {
  const pct = (value: number) => `${(value * 100).toFixed(1).padStart(5)}%`;
  return `${label.padEnd(22)} P=${pct(s.precision)}  R=${pct(s.recall)}  F1=${pct(
    s.f1
  )}  (tp=${s.tp} fp=${s.fp} fn=${s.fn} tn=${s.tn})`;
}
