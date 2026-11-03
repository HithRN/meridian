"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { NAV_GROUPS } from "@/components/layout/nav";
import { ReasonerBadge } from "@/components/layout/ReasonerBadge";
import { SITE } from "@/lib/site";

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Mobile bar */}
      <div className="flex items-center justify-between border-b border-line bg-sidebar px-4 py-3 md:hidden">
        <Wordmark />
        <button
          aria-label="Toggle navigation"
          aria-expanded={open}
          className="rounded-md border border-line-strong px-3 py-1 text-sm"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <aside
        className={cn(
          "flex-col justify-between border-r border-line bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:w-[248px]",
          open ? "flex" : "hidden md:flex",
        )}
      >
        <div className="min-h-0 overflow-y-auto">
          <div className="hidden px-5 py-5 md:block">
            <Wordmark />
          </div>

          <nav className="px-3 pb-3" aria-label="Primary">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-3">
                <div className="px-2 pb-1 pt-2 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-faint">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.description}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-[6px] text-[0.9rem] transition-colors",
                        active
                          ? "bg-paper font-medium text-heading shadow-[0_1px_2px_rgba(24,54,80,0.06)] ring-1 ring-line"
                          : "text-muted hover:bg-subtle hover:text-heading",
                      )}
                    >
                      <span
                        aria-hidden
                        className="h-[7px] w-[7px] rounded-full"
                        style={{ background: item.accent, opacity: active ? 1 : 0.55 }}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="space-y-3 border-t border-line px-5 py-4 text-[0.72rem] leading-relaxed text-muted">
          <ReasonerBadge />
          <p>Synthetic-data demonstration. No real-money execution.</p>
          <p className="text-faint">
            Built by {SITE.author} ·{" "}
            <a href={SITE.repoUrl} className="underline underline-offset-2 hover:text-ink">
              source
            </a>
          </p>
        </div>
      </aside>
    </>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <rect x="0.5" y="0.5" width="21" height="21" rx="6" fill="var(--color-brand)" />
        <path d="M5 15.5V6.5l6 6 6-6v9" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="17" cy="15.5" r="1.6" fill="var(--color-teal)" />
      </svg>
      <div>
        <div className="text-[1rem] font-semibold leading-none tracking-[0.14em] text-heading">{SITE.name.toUpperCase()}</div>
        <div className="mt-1 text-[0.6rem] uppercase tracking-[0.14em] text-faint">Research platform</div>
      </div>
    </Link>
  );
}
