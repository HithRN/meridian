/**
 * Central version registry.
 *
 * Every deterministic tool output, experiment record, and audit entry carries
 * the versions that produced it. This is the backbone of reproducibility: two
 * runs with identical inputs and identical versions must produce identical
 * outputs. Bump the relevant constant whenever a computation changes.
 */

export const PLATFORM_VERSION = "1.0.0" as const;

/** Version of the deterministic tool execution semantics. */
export const TOOL_RUNTIME_VERSION = "1.0.0" as const;

/** Version of the experiment-record schema. */
export const EXPERIMENT_SCHEMA_VERSION = "1.0.0" as const;

/** Version of the ML/backtest numerical kernels. */
export const KERNEL_VERSION = "1.0.0" as const;

/**
 * Build provenance. Populated at build time from the environment when
 * available (e.g. Vercel's `VERCEL_GIT_COMMIT_SHA`), otherwise `"local"`.
 */
export const GIT_COMMIT: string =
  process.env.NEXT_PUBLIC_GIT_COMMIT ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  "local";

export interface VersionManifest {
  platform: string;
  toolRuntime: string;
  experimentSchema: string;
  kernel: string;
  gitCommit: string;
}

export function versionManifest(): VersionManifest {
  return {
    platform: PLATFORM_VERSION,
    toolRuntime: TOOL_RUNTIME_VERSION,
    experimentSchema: EXPERIMENT_SCHEMA_VERSION,
    kernel: KERNEL_VERSION,
    gitCommit: GIT_COMMIT,
  };
}
