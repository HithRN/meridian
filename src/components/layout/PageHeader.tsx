import * as React from "react";
import { Eyebrow } from "@/components/ui/primitives";

/** Standard editorial page header: index eyebrow, title, lede, optional actions. */
export function PageHeader({
  index,
  title,
  lede,
  actions,
}: {
  index: string;
  title: string;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-ink px-6 pb-6 pt-8 md:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <Eyebrow>{index} — Meridian</Eyebrow>
            <h1 className="mt-2 text-4xl leading-none tracking-tight md:text-5xl">{title}</h1>
            {lede ? <p className="mt-4 text-lg text-muted">{lede}</p> : null}
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
        <div className="mb-4 flex items-end justify-between gap-4 border-b border-line pb-2">
          <div>
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            {title ? <h2 className="mt-1 text-2xl leading-none">{title}</h2> : null}
          </div>
          {right ? <div className="text-sm text-muted">{right}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
