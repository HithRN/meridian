"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { NAV_GROUPS } from "@/components/layout/nav";
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
          className="rounded-md border border-line-strong px-3 py-1 text-sm text-heading"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <aside
        className={cn(
          "flex-col justify-between border-r border-line bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:w-[236px]",
          open ? "flex" : "hidden md:flex",
        )}
      >
        <div className="min-h-0 overflow-y-auto">
          <div className="hidden px-6 pb-4 pt-6 md:block">
            <Wordmark />
          </div>

          <nav className="pb-4" aria-label="Primary">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mt-3">
                <div className="px-6 pb-1 text-[0.8rem] font-semibold text-faint">{group.label}</div>
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
                        "block border-l-2 py-[7px] pl-[22px] pr-4 text-[0.98rem] transition-colors",
                        active
                          ? "border-accent font-semibold text-accent"
                          : "border-transparent text-muted hover:text-heading",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-line px-6 py-4 text-[0.82rem] text-faint">
          Created by {SITE.author}
          <a href={SITE.repoUrl} className="mt-1 block text-link underline-offset-2 hover:underline">
            Source on GitHub
          </a>
        </div>
      </aside>
    </>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-[10px]">
      <svg width="24" height="24" viewBox="0 0 22 22" aria-hidden>
        <rect x="0.5" y="0.5" width="21" height="21" rx="6" fill="var(--color-brand)" />
        <path d="M5 15.5V6.5l6 6 6-6v9" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
      <div>
        <div className="text-[1.15rem] font-semibold leading-none tracking-[0.06em] text-heading">{SITE.name}</div>
        <div className="mt-1 text-[0.75rem] text-faint">Research platform</div>
      </div>
    </Link>
  );
}
