import * as React from "react";
import { Eyebrow } from "@/components/ui/primitives";

/** Standard page header: section eyebrow, title, lede, optional actions. */
export function PageHeader({
  eyebrow,
  accent = "var(--color-mod-overview)",
  title,
  lede,
  actions,
}: {
  eyebrow: string;
  /** Module identity colour, e.g. "var(--color-mod-research)". */
  accent?: string;
  title: string;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line bg-paper px-6 pb-6 pt-8 md:px-10" style={{ boxShadow: `inset 0 3px 0 ${accent}` }}>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <Eyebrow className="flex items-center gap-2"><span aria-hidden className="h-[7px] w-[7px] rounded-full" style={{ background: accent }} />{eyebrow}</Eyebrow>
            <h1 className="mt-2 text-[2.1rem] font-semibold leading-tight tracking-tight md:text-[2.5rem]">{title}</h1>
            {lede ? <p className="mt-3 text-[1.02rem] leading-relaxed text-muted">{lede}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
        </div>
      </div>
    </header>
  );
}

/** Constrained content container matching the header width. */
export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={"px-6 py-8 md:px-10 " + (className ?? "")}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </div>
  );
}

/** A titled section with an eyebrow and rule. */
export function Section({
  eyebrow,
  title,
  children,
  right,
}: {
  eyebrow?: string;
  title?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      {(eyebrow || title) && (
        <div className="mb-4 flex items-end justify-between gap-4 border-b border-divider pb-2">
          <div>
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            {title ? <h2 className="mt-1 text-[1.65rem] font-semibold leading-tight tracking-tight">{title}</h2> : null}
          </div>
          {right ? <div className="text-sm text-muted">{right}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
