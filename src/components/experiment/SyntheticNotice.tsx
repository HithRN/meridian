import * as React from "react";

/**
 * Inline disclosure shown next to research results (not only in the footer):
 * the three levels of evidence, and which one these numbers are.
 */
export function SyntheticNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={
        "mb-8 flex flex-wrap items-start gap-x-6 gap-y-2 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-[0.85rem] " +
        (className ?? "")
      }
    >
      <span className="font-medium text-warning">Synthetic benchmark data</span>
      <span className="text-muted">
        These results come from seeded synthetic series. They validate the method, reproducibility and leakage controls. They are not
        evidence about historical markets, and not an out-of-sample test on real data.
      </span>
    </div>
  );
}
