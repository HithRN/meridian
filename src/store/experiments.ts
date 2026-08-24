"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OrchestrationResult } from "@/core/orchestrator/types";

/**
 * Durable, browser-local history of the user's own research runs (§5: no paid
 * database for the demo). Persisted to localStorage and capped to keep the
 * store small. This is the client-side half of the experiment store; the
 * serverless half is seeded and ephemeral.
 */
const MAX_RESULTS = 12;

interface ExperimentsState {
  results: OrchestrationResult[];
  add: (result: OrchestrationResult) => void;
  get: (id: string) => OrchestrationResult | undefined;
  clear: () => void;
}

export const useExperiments = create<ExperimentsState>()(
  persist(
    (set, getState) => ({
      results: [],
      add: (result) =>
        set((s) => {
          const deduped = s.results.filter((r) => r.record.id !== result.record.id);
          return { results: [result, ...deduped].slice(0, MAX_RESULTS) };
        }),
      get: (id) => getState().results.find((r) => r.record.id === id),
      clear: () => set({ results: [] }),
    }),
    { name: "meridian.experiments.v1" },
  ),
);
