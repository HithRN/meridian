/**
 * Canonical seed experiments.
 *
 * Runs a small, fixed set of research sessions once per process (memoised) so
 * the /experiments, /experiment/[id], /models and /monitoring pages have real,
 * reproducible content on first load — without shipping stale hand-written
 * fixtures. Because the pipeline is deterministic, these records are identical
 * on every machine.
 */

import { runResearch } from "@/core/orchestrator/orchestrator";
import { DeterministicReasoner } from "@/core/llm/deterministic";
import type { OrchestrationResult } from "@/core/orchestrator/types";
import {
  InMemoryExperimentStore,
  type ExperimentStore,
} from "@/core/experiments/store";

const CANONICAL_QUESTIONS: Array<{ q: string; seed: number }> = [
  {
    q: "Test whether a 20-period momentum signal has predictive value on the hourly equity dataset, compare three models, use walk-forward validation, include transaction costs, and produce an evidence report.",
    seed: 42,
  },
  {
    q: "Evaluate a 30-period momentum strategy on the FX dataset using rolling walk-forward validation with transaction costs.",
    seed: 7,
  },
  {
    q: "Compare a logistic and a gradient-boosted model on the equity dataset with 6-fold walk-forward validation and costs.",
    seed: 123,
  },
];

let cache: Promise<OrchestrationResult[]> | null = null;

export function getSeedResults(): Promise<OrchestrationResult[]> {
  if (!cache) {
    const reasoner = new DeterministicReasoner();
    cache = Promise.all(
      CANONICAL_QUESTIONS.map(({ q, seed }) =>
        runResearch({ question: q, seed, reasoner }),
      ),
    ).then((results) =>
      // Stabilise createdAt so ordering is deterministic across the seed set.
      results.map((r, i) => ({
        ...r,
        record: { ...r.record, createdAt: 1_700_000_000_000 + i * 60_000 },
      })),
    );
  }
  return cache;
}

/**
 * Process-wide store used by serverless route handlers. It is seeded with the
 * canonical experiments and accepts posted records within a single warm
 * instance (ephemeral by design — see store.ts docstring).
 */
let storePromise: Promise<ExperimentStore> | null = null;

export function getServerStore(): Promise<ExperimentStore> {
  if (!storePromise) {
    storePromise = getSeedResults().then(
      (results) => new InMemoryExperimentStore(results.map((r) => r.record)),
    );
  }
  return storePromise;
}

/** Retrieve a seed result (with trace + equity curves) by experiment id. */
export async function getSeedResultById(
  id: string,
): Promise<OrchestrationResult | undefined> {
  const results = await getSeedResults();
  return results.find((r) => r.record.id === id);
}
