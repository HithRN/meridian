"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "@/components/layout/nav";

const OPEN_EVENT = "meridian:command-palette";
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));

const SUGGESTED = ["Is SOL in a real uptrend over the last 30 days?", "How risky is JTO right now?", "Does Solana MEV rise when SOL gets more volatile?"];

interface Option {
  key: string;
  title: string;
  detail: string;
  href: string;
  ask: boolean;
}

const researchHref = (q: string) => `/research?q=${encodeURIComponent(q)}`;

/** Go anywhere, or send a question straight to live market research. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);

  const show = React.useCallback(() => {
    setQuery("");
    setCursor(0);
    setOpen(true);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => {
          if (!v) {
            setQuery("");
            setCursor(0);
          }
          return !v;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [show]);

  const options = React.useMemo<Option[]>(() => {
    const q = query.trim();
    const needle = q.toLowerCase();
    const pages = NAV_ITEMS.filter((i) => !needle || `${i.label} ${i.description}`.toLowerCase().includes(needle)).map((i) => ({ key: i.href, title: i.label, detail: i.description, href: i.href, ask: false }));
    const asks = q.length >= 4 ? [{ key: "ask", title: q, detail: "Research this against the live market", href: researchHref(q), ask: true }] : !q ? SUGGESTED.map((s) => ({ key: s, title: s, detail: "Research against the live market", href: researchHref(s), ask: true })) : [];
    // A sentence is a question; a word or two is probably a page.
    return q.split(/\s+/).length >= 3 ? [...asks, ...pages] : [...pages, ...asks];
  }, [query]);

  const go = (o: Option | undefined) => {
    if (!o) return;
    setOpen(false);
    router.push(o.href);
  };

  if (!open) return null;

  return (
    <div className="palette-backdrop fixed inset-0 z-50 flex items-start justify-center bg-[rgba(24,54,80,0.28)] px-4 pt-[12vh] print:hidden" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search pages or ask a question"
        className="palette-panel w-full max-w-xl overflow-hidden rounded-xl border border-line bg-paper shadow-[0_18px_50px_rgba(24,54,80,0.22)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search size={17} className="text-faint" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(options.length - 1, c + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              }
              if (e.key === "Enter") go(options[cursor]);
            }}
            placeholder="Go to a page, or ask about the market"
            aria-label="Search pages or ask a question"
            className="w-full bg-transparent text-[1.05rem] text-ink outline-none placeholder:text-faint"
          />
        </div>
        <ul role="listbox" aria-label="Results" className="max-h-[52vh] overflow-y-auto py-1">
          {options.map((o, i) => (
            <li key={o.key} role="option" aria-selected={i === cursor}>
              <button
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(o)}
                className={cn("flex w-full items-center gap-3 px-4 py-2 text-left", i === cursor ? "bg-selected" : "")}
              >
                {o.ask ? <Sparkles size={15} className="shrink-0 text-accent" aria-hidden /> : <ArrowRight size={15} className="shrink-0 text-faint" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.98rem] text-heading">{o.title}</span>
                  <span className="block truncate text-[0.84rem] text-muted">{o.detail}</span>
                </span>
              </button>
            </li>
          ))}
          {options.length === 0 ? <li className="px-4 py-6 text-center text-muted">Nothing matches. Type a few words to ask it as a question.</li> : null}
        </ul>
      </div>
    </div>
  );
}
