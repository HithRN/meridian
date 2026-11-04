"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { MarketResearch } from "@/components/research/MarketResearch";
import { HypothesisLab } from "@/components/research/HypothesisLab";

const MODES = [
  { id: "market", label: "Live market", detail: "Ask about the market as it is now" },
  { id: "lab", label: "Hypothesis lab", detail: "Test an idea on bundled datasets with agents and a critic" },
] as const;

type Mode = (typeof MODES)[number]["id"];

/** Both stay mounted, so switching away never loses a run in progress. */
export function ResearchModes() {
  const [mode, setMode] = React.useState<Mode>("market");

  React.useEffect(() => {
    if (window.location.hash !== "#lab") return;
    const timer = setTimeout(() => setMode("lab"), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      <div role="tablist" aria-label="Kind of research" className="mb-6 grid grid-cols-1 gap-2 print:hidden sm:grid-cols-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => {
              setMode(m.id);
              window.history.replaceState(null, "", m.id === "lab" ? "/research#lab" : "/research");
            }}
            className={cn("rounded-lg border px-5 py-3 text-left transition-[border-color,background-color,box-shadow] duration-150", mode === m.id ? "border-accent bg-selected ring-1 ring-accent" : "border-line bg-paper hover:border-line-strong hover:bg-panel")}
          >
            <div className={cn("text-[1.05rem] font-semibold", mode === m.id ? "text-accent" : "text-heading")}>{m.label}</div>
            <div className="text-[0.92rem] text-muted">{m.detail}</div>
          </button>
        ))}
      </div>
      <div hidden={mode !== "market"}><MarketResearch /></div>
      <div hidden={mode !== "lab"}><HypothesisLab /></div>
    </div>
  );
}
