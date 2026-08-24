/// <reference lib="webworker" />
/**
 * Deterministic research worker.
 *
 * Runs the full orchestration off the main thread so the UI stays responsive
 * and the agent trace can stream in live (§4: heavy work in Web Workers). Only
 * the deterministic reasoner runs here; the WebLLM path runs on the main thread
 * where the model engine lives.
 */

import { runResearch } from "@/core/orchestrator/orchestrator";
import { DeterministicReasoner } from "@/core/llm/deterministic";
import type { TraceEvent } from "@/core/orchestrator/types";

export interface RunRequest {
  question: string;
  seed: number;
  maxModels?: number;
}

export type WorkerOut =
  | { type: "event"; event: TraceEvent }
  | { type: "done"; result: unknown }
  | { type: "error"; error: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<RunRequest>) => {
  const { question, seed, maxModels } = e.data;
  try {
    const result = await runResearch({
      question,
      seed,
      maxModels,
      reasoner: new DeterministicReasoner(),
      onEvent: (event) => ctx.postMessage({ type: "event", event } satisfies WorkerOut),
    });
    ctx.postMessage({ type: "done", result } satisfies WorkerOut);
  } catch (err) {
    ctx.postMessage({
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerOut);
  }
};
