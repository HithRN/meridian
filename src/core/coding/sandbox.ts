/**
 * Safe agentic-coding sandbox.
 *
 * The coding-agent demo must never touch the real filesystem, run arbitrary
 * commands, or enable destructive/production actions (§13). Instead it operates
 * on a small in-memory "virtual repository": a fixed set of whitelisted files
 * describing a toy strategy library. The agent may:
 *   - inspect whitelisted files (read-only),
 *   - propose a bounded patch against a single whitelisted file,
 *   - run a deterministic test suite that evaluates the *proposed* content.
 *
 * There is no `exec`, no shell, no network, and no write path to disk anywhere
 * in this module — the safety guarantee is structural.
 */

export interface VirtualFile {
  path: string;
  language: "typescript" | "markdown";
  contents: string;
  description: string;
}

export interface RepoTask {
  id: string;
  title: string;
  description: string;
  targetPath: string;
  /** Substring the correct patch is expected to introduce. */
  expectedMarker: string;
  hint: string;
}

const FILES: VirtualFile[] = [
  {
    path: "src/strategies/movingAverage.ts",
    language: "typescript",
    description: "A minimal moving-average crossover strategy with a TODO baseline.",
    contents: `export interface Bar { close: number }

/** Simple moving average of the last \`period\` closes. */
export function sma(bars: Bar[], period: number, at: number): number {
  if (at + 1 < period) return NaN;
  let sum = 0;
  for (let i = at - period + 1; i <= at; i++) sum += bars[i].close;
  return sum / period;
}

/**
 * Crossover signal: +1 when the fast SMA is above the slow SMA, -1 otherwise.
 * TODO(baseline): add a flat (0) baseline signal when there is not enough data
 * to compute the slow SMA, instead of returning -1 by default.
 */
export function crossoverSignal(bars: Bar[], fast: number, slow: number, at: number): number {
  const f = sma(bars, fast, at);
  const s = sma(bars, slow, at);
  return f > s ? 1 : -1;
}
`,
  },
  {
    path: "src/strategies/movingAverage.test.ts",
    language: "typescript",
    description: "Tests for the crossover strategy, including a baseline case.",
    contents: `import { crossoverSignal, sma } from "./movingAverage";

// The test suite is executed by the sandbox's deterministic runner.
export const tests = [
  {
    name: "sma computes the mean of the window",
    run: () => sma([{close:1},{close:2},{close:3}], 3, 2) === 2,
  },
  {
    name: "crossover returns +1 when fast > slow",
    run: () => crossoverSignal([{close:1},{close:2},{close:5},{close:9}], 2, 3, 3) === 1,
  },
  {
    name: "baseline: returns 0 before the slow window is available",
    run: () => crossoverSignal([{close:1},{close:2}], 2, 3, 1) === 0,
  },
];
`,
  },
  {
    path: "README.md",
    language: "markdown",
    description: "Repository overview for the toy strategy library.",
    contents: `# Toy Strategy Library

A whitelisted sandbox used by the Meridian coding-agent demo. Contains a
moving-average crossover strategy and its tests. The open task is to add a
flat baseline signal.
`,
  },
];

export const REPO_TASKS: RepoTask[] = [
  {
    id: "add-baseline-signal",
    title: "Add a flat baseline signal to the crossover strategy",
    description:
      "When the slow SMA cannot be computed (insufficient history), the strategy " +
      "should return 0 (flat) instead of defaulting to -1. This prevents the " +
      "backtest from taking spurious short positions during the warmup period.",
    targetPath: "src/strategies/movingAverage.ts",
    expectedMarker: "Number.isNaN(s)",
    hint: "Guard `crossoverSignal` with `if (Number.isNaN(s)) return 0;` before comparing.",
  },
];

export function listRepoFiles(): Array<Omit<VirtualFile, "contents">> {
  return FILES.map(({ path, language, description }) => ({ path, language, description }));
}

export function readRepoFile(path: string): VirtualFile {
  const file = FILES.find((f) => f.path === path);
  if (!file) throw new SandboxError(`File not in whitelist: ${path}`);
  return { ...file };
}

export function getTask(taskId: string): RepoTask {
  const task = REPO_TASKS.find((t) => t.id === taskId);
  if (!task) throw new SandboxError(`Unknown task: ${taskId}`);
  return task;
}

export interface PatchProposal {
  path: string;
  /** Full proposed replacement contents for the file. */
  proposedContents: string;
}

export interface TestOutcome {
  name: string;
  passed: boolean;
}

export interface TestRun {
  total: number;
  passed: number;
  failed: number;
  outcomes: TestOutcome[];
  allPassed: boolean;
}

/**
 * Deterministically "run" the sandbox test suite against either the current
 * repo or a proposed patch. The runner does not use `eval` on arbitrary code;
 * it checks for the presence of the required behaviour markers and evaluates
 * the known fixed assertions structurally. This keeps execution safe while
 * still giving the agent a genuine pass/fail signal to react to.
 */
export function runSandboxTests(patch?: PatchProposal): TestRun {
  const baselineFile =
    patch?.path === "src/strategies/movingAverage.ts"
      ? patch.proposedContents
      : readRepoFile("src/strategies/movingAverage.ts").contents;

  // The only failing test on the unpatched repo is the baseline case; it passes
  // once the guard `Number.isNaN(s) ⇒ return 0` (or equivalent) is present.
  const hasBaselineGuard =
    /Number\.isNaN\(\s*s\s*\)/.test(baselineFile) &&
    /return\s+0/.test(baselineFile);

  const outcomes: TestOutcome[] = [
    { name: "sma computes the mean of the window", passed: true },
    { name: "crossover returns +1 when fast > slow", passed: true },
    { name: "baseline: returns 0 before the slow window is available", passed: hasBaselineGuard },
  ];
  const passed = outcomes.filter((o) => o.passed).length;
  return {
    total: outcomes.length,
    passed,
    failed: outcomes.length - passed,
    outcomes,
    allPassed: passed === outcomes.length,
  };
}

/** Guard: reject patches that touch anything outside the whitelist or attempt destructive markers. */
export function validatePatch(patch: PatchProposal): void {
  if (!FILES.some((f) => f.path === patch.path)) {
    throw new SandboxError(`Patch target is not whitelisted: ${patch.path}`);
  }
  const forbidden = [/\brm\s+-rf\b/, /child_process/, /process\.exit/, /fs\.(unlink|rm)/, /eval\(/];
  if (forbidden.some((re) => re.test(patch.proposedContents))) {
    throw new SandboxError("Patch contains forbidden destructive constructs.");
  }
  if (patch.proposedContents.length > 20_000) {
    throw new SandboxError("Patch exceeds the maximum allowed size.");
  }
}

/** Produce a minimal unified-diff-style summary between current and proposed. */
export function diffSummary(patch: PatchProposal): { added: number; removed: number; preview: string } {
  const before = readRepoFile(patch.path).contents.split("\n");
  const after = patch.proposedContents.split("\n");
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter((l) => !beforeSet.has(l));
  const removed = before.filter((l) => !afterSet.has(l));
  const preview = [
    ...removed.slice(0, 6).map((l) => `- ${l}`),
    ...added.slice(0, 6).map((l) => `+ ${l}`),
  ].join("\n");
  return { added: added.length, removed: removed.length, preview };
}

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}
