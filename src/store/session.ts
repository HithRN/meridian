"use client";

import { create } from "zustand";

export type ReasonerMode = "deterministic" | "webllm";
export type ModelStatus = "idle" | "loading" | "ready" | "error";

interface SessionState {
  webgpuSupported: boolean | null;
  mode: ReasonerMode;
  modelStatus: ModelStatus;
  modelProgress: number;
  modelLabel: string;
  modelError: string | null;
  detectWebGpu: () => void;
  setMode: (mode: ReasonerMode) => void;
  setModelStatus: (status: ModelStatus, progress?: number, error?: string | null) => void;
  setModelProgress: (progress: number, label?: string) => void;
}

export const useSession = create<SessionState>((set) => ({
  webgpuSupported: null,
  mode: "deterministic",
  modelStatus: "idle",
  modelProgress: 0,
  modelLabel: "",
  modelError: null,
  detectWebGpu: () => {
    const supported =
      typeof navigator !== "undefined" && "gpu" in navigator && Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
    set({ webgpuSupported: supported });
  },
  setMode: (mode) => set({ mode }),
  setModelStatus: (status, progress, error) =>
    set((s) => ({
      modelStatus: status,
      modelProgress: progress ?? s.modelProgress,
      modelError: error ?? (status === "error" ? s.modelError : null),
    })),
  setModelProgress: (progress, label) =>
    set((s) => ({ modelProgress: progress, modelLabel: label ?? s.modelLabel })),
}));
