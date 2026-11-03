import * as React from "react";

/** Readable long-form column for policy and documentation pages. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="prose-serif max-w-3xl space-y-4 text-[0.98rem] leading-relaxed text-muted [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink [&_ul]:space-y-2">
      {children}
    </div>
  );
}
