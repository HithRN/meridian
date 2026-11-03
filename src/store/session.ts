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
    // `navigator.gpu` can exist without a usable adapter (blocklisted GPU,
    // insufficient memory, disabled flag), so request one — with a timeout so
    // the UI never stays on "checking…".
    const gpu =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
        : undefined;
    if (!gpu) {
      set({ webgpuSupported: false });
      return;
    }
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
    Promise.race([gpu.requestAdapter().catch(() => null), timeout]).then((adapter) =>
      set({ webgpuSupported: Boolean(adapter) }),
    );
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
