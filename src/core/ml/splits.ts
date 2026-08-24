/**
 * Chronological and walk-forward validation splits.
 *
 * Random k-fold cross-validation is invalid for time series — it lets the model
 * train on the future and test on the past. Every split here preserves temporal
 * order and inserts an `embargo` gap between train and test so that the forward
 * label of the last training row cannot overlap the first test row (a classic
 * source of subtle leakage).
 */

export interface WindowConfig {
  /** Number of walk-forward folds. */
  folds: number;
  /** Fraction of each fold's data used for the test window (0..1). */
  testFraction: number;
  /**
   * Bars to purge between train and test to prevent label overlap. Should be
   * >= the feature horizon. Defaults are chosen by the tool from the horizon.
   */
  embargo: number;
  /**
   * "expanding" — training window grows each fold (anchored start).
   * "rolling"   — training window is a fixed-size sliding block.
   */
  mode: "expanding" | "rolling";
}

export const DEFAULT_WINDOW_CONFIG: WindowConfig = {
  folds: 4,
  testFraction: 0.2,
  embargo: 1,
  mode: "expanding",
};

export interface SplitWindow {
  fold: number;
  trainStart: number;
  trainEnd: number; // exclusive
  testStart: number;
  testEnd: number; // exclusive
}

export interface SplitPlan {
  windows: SplitWindow[];
  config: WindowConfig;
  /** Total number of eligible rows the plan was computed against. */
  totalRows: number;
}

/**
 * Build ordered walk-forward windows. The series is divided into `folds`
 * sequential test blocks after an initial training warmup; each test block is
 * preceded by its training data (expanding or rolling) with an embargo gap.
 */
export function walkForwardSplit(
  totalRows: number,
  config: WindowConfig,
): SplitPlan {
  const windows: SplitWindow[] = [];
  if (totalRows < config.folds * 4) {
    throw new InsufficientDataError(totalRows, config.folds * 4);
  }

  // Reserve the first ~40% as the minimum training anchor, then carve the
  // remaining tail into `folds` contiguous test blocks.
  const anchor = Math.floor(totalRows * 0.4);
  const testable = totalRows - anchor;
  const blockSize = Math.floor(testable / config.folds);

  for (let f = 0; f < config.folds; f++) {
    const testStart = anchor + f * blockSize;
    const rawTestEnd =
      f === config.folds - 1 ? totalRows : anchor + (f + 1) * blockSize;
    // Honour testFraction: use the tail of the block as the test window.
    const blockLen = rawTestEnd - testStart;
    const testLen = Math.max(1, Math.floor(blockLen * config.testFraction * 5));
    const effTestStart = rawTestEnd - Math.min(blockLen, testLen);
    const trainEnd = Math.max(0, effTestStart - config.embargo);
    const trainStart = config.mode === "rolling" ? Math.max(0, trainEnd - anchor) : 0;

    windows.push({
      fold: f,
      trainStart,
      trainEnd,
      testStart: effTestStart,
      testEnd: rawTestEnd,
    });
  }

  return { windows, config, totalRows };
}

/** Simple chronological train/validation/test partition (no folds). */
export function chronologicalSplit(
  totalRows: number,
  trainFrac = 0.6,
  valFrac = 0.2,
): { train: [number, number]; validation: [number, number]; test: [number, number] } {
  const trainEnd = Math.floor(totalRows * trainFrac);
  const valEnd = Math.floor(totalRows * (trainFrac + valFrac));
  return {
    train: [0, trainEnd],
    validation: [trainEnd, valEnd],
    test: [valEnd, totalRows],
  };
}

export class InsufficientDataError extends Error {
  constructor(have: number, need: number) {
    super(`Insufficient rows for split: have ${have}, need at least ${need}`);
    this.name = "InsufficientDataError";
  }
}
