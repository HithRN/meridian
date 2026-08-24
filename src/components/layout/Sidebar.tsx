"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "@/components/layout/nav";
import { ReasonerBadge } from "@/components/layout/ReasonerBadge";

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile bar */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
        <Wordmark />
        <button
          aria-label="Toggle navigation"
          className="border border-ink px-3 py-1 text-sm"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      <aside
        className={cn(
          "flex-col justify-between border-r border-line bg-paper md:flex md:h-screen md:w-[264px] md:sticky md:top-0",
          open ? "flex" : "hidden md:flex",
        )}
      >
        <div>
          <div className="hidden border-b border-line px-6 py-6 md:block">
            <Wordmark />
          </div>

          <nav className="px-3 py-4">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "group flex items-baseline gap-3 px-3 py-2 transition-colors",
                    active ? "bg-ink text-paper" : "text-ink hover:bg-subtle",
                  )}
                >
                  <span
                    className={cn(
                      "tnum text-[0.68rem] tracking-widest",
                      active ? "text-paper/70" : "text-faint",
                    )}
                  >
                    {item.index}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[0.95rem] leading-tight">{item.label}</span>
                    <span
                      className={cn(
                        "block text-[0.72rem] leading-tight",
                        active ? "text-paper/70" : "text-faint",
                      )}
                    >
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-line px-6 py-5 text-[0.72rem] leading-relaxed text-muted">
          <ReasonerBadge />
          <p className="mt-3">
            Public demo · <span className="tnum">$0</span> stack. No paid model or
            market-data APIs. Results are computed on synthetic data.
          </p>
          <p className="mt-3 border-t border-line pt-3 uppercase tracking-[0.14em] text-[0.62rem] text-faint">
            Created by Sanyam
          </p>
        </div>
      </aside>
    </>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="block">
      <div className="text-[1.35rem] uppercase tracking-[0.34em] leading-none">Meridian</div>
      <div className="mt-2 text-[0.66rem] uppercase tracking-[0.2em] text-faint">
        Quant Research · ML Ops
      </div>
    </Link>
  );
}
