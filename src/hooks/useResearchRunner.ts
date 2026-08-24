"use client";

import { useCallback, useRef, useState } from "react";
import type { OrchestrationResult, TraceEvent } from "@/core/orchestrator/types";
import type { WorkerOut } from "@/workers/research.worker";
import type { Reasoner } from "@/core/llm/types";
import { useSession, type ReasonerMode } from "@/store/session";
import { useExperiments } from "@/store/experiments";

export type RunStatus = "idle" | "loading-model" | "running" | "done" | "error";

export interface RunnerState {
  status: RunStatus;
  trace: TraceEvent[];
  result: OrchestrationResult | null;
  error: string | null;
}

let cachedReasoner: Reasoner | null = null;

export function useResearchRunner() {
  const [state, setState] = useState<RunnerState>({
    status: "idle",
    trace: [],
    result: null,
    error: null,
  });
  const workerRef = useRef<Worker | null>(null);
  const addResult = useExperiments((s) => s.add);
  const setModelStatus = useSession((s) => s.setModelStatus);
  const setModelProgress = useSession((s) => s.setModelProgress);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setState({ status: "idle", trace: [], result: null, error: null });
  }, []);

  const run = useCallback(
    async (question: string, seed: number, mode: ReasonerMode, maxModels?: number) => {
      setState({ status: "running", trace: [], result: null, error: null });

      if (mode === "deterministic") {
        runInWorker(question, seed, maxModels, workerRef, setState, addResult);
        return;
      }

      // WebLLM path (main thread).
      try {
        if (!cachedReasoner) {
          setState((s) => ({ ...s, status: "loading-model" }));
          setModelStatus("loading", 0);
          const { createWebLlmReasoner } = await import("@/core/llm/webllm");
          cachedReasoner = await createWebLlmReasoner((p) => {
            setModelProgress(p.progress, p.text);
          });
          setModelStatus("ready", 1);
        }
        setState((s) => ({ ...s, status: "running" }));
        const { runResearch } = await import("@/core/orchestrator/orchestrator");
        const result = await runResearch({
          question,
          seed,
          maxModels,
          reasoner: cachedReasoner,
          onEvent: (event) =>
            setState((s) => ({ ...s, trace: [...s.trace, event] })),
        });
        addResult(result);
        setState((s) => ({ ...s, status: "done", result }));
      } catch (err) {
        setModelStatus("error", 0, err instanceof Error ? err.message : String(err));
        setState((s) => ({
          ...s,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [addResult, setModelStatus, setModelProgress],
  );

  return { ...state, run, reset };
}

function runInWorker(
  question: string,
  seed: number,
  maxModels: number | undefined,
  workerRef: React.MutableRefObject<Worker | null>,
  setState: React.Dispatch<React.SetStateAction<RunnerState>>,
  addResult: (r: OrchestrationResult) => void,
) {
  workerRef.current?.terminate();
  const worker = new Worker(new URL("../workers/research.worker.ts", import.meta.url), {
    type: "module",
  });
  workerRef.current = worker;

  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data;
    if (msg.type === "event") {
      setState((s) => ({ ...s, trace: [...s.trace, msg.event] }));
    } else if (msg.type === "done") {
      const result = msg.result as OrchestrationResult;
      addResult(result);
      setState((s) => ({ ...s, status: "done", result }));
      worker.terminate();
      workerRef.current = null;
    } else if (msg.type === "error") {
      setState((s) => ({ ...s, status: "error", error: msg.error }));
      worker.terminate();
      workerRef.current = null;
    }
  };
  worker.onerror = (e) => {
    setState((s) => ({ ...s, status: "error", error: e.message || "Worker failed." }));
  };
  worker.postMessage({ question, seed, maxModels });
}
