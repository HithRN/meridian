"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_PRIMARY, NAV_SECTIONS, type NavGroup, type NavItem } from "@/components/layout/nav";
import { openCommandPalette } from "@/components/layout/CommandPalette";
import { SITE } from "@/lib/site";

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Mobile bar */}
      <div className="flex items-center justify-between border-b border-line bg-sidebar px-4 py-3 print:hidden md:hidden">
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
          "flex-col justify-between border-r border-line bg-sidebar print:hidden md:sticky md:top-0 md:flex md:h-screen md:w-[236px]",
          open ? "flex" : "hidden md:flex",
        )}
      >
        <div className="min-h-0 overflow-y-auto">
          <div className="hidden px-6 pb-3 pt-6 md:block">
            <Wordmark />
          </div>

          <div className="px-4 pb-2 pt-3 md:pt-0">
            <button
              onClick={openCommandPalette}
              className="flex w-full items-center gap-2 rounded-md border border-line bg-paper px-3 py-[6px] text-left text-[0.9rem] text-faint transition-colors hover:border-accent hover:text-muted"
            >
              <Search size={14} aria-hidden />
              <span className="flex-1">Search or ask</span>
              <kbd className="hidden rounded border border-line px-1 text-[0.72rem] md:inline">Ctrl K</kbd>
            </button>
          </div>

          <nav className="pb-4" aria-label="Primary">
            {NAV_PRIMARY.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={() => setOpen(false)} />
            ))}
            <div className="mt-3 border-t border-divider pt-2">
              {NAV_SECTIONS.map((group) => (
                <SlidingSection key={group.label} group={group} isActive={isActive} onNavigate={() => setOpen(false)} />
              ))}
            </div>
          </nav>
        </div>

        <div className="border-t border-line px-6 py-4 text-[0.82rem] text-faint">Created by {SITE.author}</div>
      </aside>
    </>
  );
}

function NavLink({ item, active, nested, onNavigate }: { item: NavItem; active: boolean; nested?: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      title={item.description}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block border-l-2 py-[7px] pr-4 text-[0.98rem] transition-[color,padding,background-color] duration-150",
        nested ? "pl-[34px] text-[0.94rem]" : "pl-[22px]",
        active ? "border-accent bg-selected font-semibold text-accent" : "border-transparent text-muted hover:bg-subtle hover:pl-[26px] hover:text-heading",
        active && nested && "pl-[34px]",
        !active && nested && "hover:pl-[38px]",
      )}
    >
      {item.label}
    </Link>
  );
}

/** A heading that slides its pages open in place. Opens by itself when you are on one of them. */
function SlidingSection({ group, isActive, onNavigate }: { group: NavGroup; isActive: (href: string) => boolean; onNavigate: () => void }) {
  const inside = group.items.some((i) => isActive(i.href));
  const [choice, setChoice] = useState<boolean | null>(null);
  const expanded = choice ?? inside;
  const panel = `nav-${group.label.toLowerCase()}`;

  return (
    <div>
      <button
        onClick={() => setChoice(!expanded)}
        aria-expanded={expanded}
        aria-controls={panel}
        className={cn(
          "flex w-full items-center justify-between border-l-2 border-transparent py-[7px] pl-[22px] pr-4 text-left text-[0.98rem] transition-colors hover:bg-subtle hover:text-heading",
          inside ? "font-semibold text-heading" : "text-muted",
        )}
      >
        {group.label}
        <ChevronRight size={15} aria-hidden className={cn("transition-transform duration-200", expanded && "rotate-90")} />
      </button>
      <div id={panel} className={cn("grid transition-[grid-template-rows] duration-200 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className={cn("min-h-0 overflow-hidden", !expanded && "invisible")}>
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} nested active={isActive(item.href)} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </div>
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
