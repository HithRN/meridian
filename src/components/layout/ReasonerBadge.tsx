"use client";

import { useEffect } from "react";
import { useSession } from "@/store/session";

/** Compact reasoning-mode indicator shown in the sidebar footer. */
export function ReasonerBadge() {
  const { webgpuSupported, mode, modelStatus, detectWebGpu } = useSession();

  useEffect(() => {
    detectWebGpu();
  }, [detectWebGpu]);

  const gpu =
    webgpuSupported === null ? "checking…" : webgpuSupported ? "available" : "unavailable";

  const reasoner =
    mode === "webllm"
      ? modelStatus === "ready"
        ? "WebLLM · ready"
        : modelStatus === "loading"
          ? "WebLLM · loading"
          : "WebLLM"
      : "Deterministic";

  return (
    <div className="border border-line px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Reasoner</span>
        <span className="text-[0.72rem]">{reasoner}</span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="eyebrow">WebGPU</span>
        <span className="text-[0.72rem]">{gpu}</span>
      </div>
    </div>
  );
}
