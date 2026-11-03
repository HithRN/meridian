"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  content: React.ReactNode;
}

/**
 * Editorial tab strip. Keeps long pages to one topic at a time; the active tab
 * is mirrored to the URL hash so a tab can be linked to directly.
 */
export function Tabs({ tabs, className }: { tabs: TabItem[]; className?: string }) {
  const [active, setActive] = React.useState(tabs[0]?.id);
  const ids = tabs.map((t) => t.id).join("|");

  React.useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (ids.split("|").includes(id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [ids]);

  const select = (id: string) => {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
  };

  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div className={className}>
      <div role="tablist" className="mb-8 flex gap-x-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => {
          const on = t.id === current?.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => select(t.id)}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-[0.92rem] font-medium transition-colors",
                on ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
