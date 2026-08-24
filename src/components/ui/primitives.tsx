import * as React from "react";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ Eyebrow */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}

/* --------------------------------------------------------------------- Card */
export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}) {
  return (
    <Tag className={cn("border border-line bg-paper", className)}>{children}</Tag>
  );
}

export function CardHeader({
  title,
  eyebrow,
  right,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div>
        {eyebrow ? <Eyebrow className="mb-1">{eyebrow}</Eyebrow> : null}
        <h3 className="text-lg leading-tight">{title}</h3>
      </div>
      {right ? <div className="shrink-0 text-sm text-muted">{right}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

/* -------------------------------------------------------------------- Badge */
type BadgeVariant = "outline" | "solid" | "muted";
export function Badge({
  children,
  variant = "outline",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-[2px] text-[0.68rem] uppercase tracking-[0.12em] leading-none",
        variant === "outline" && "border border-ink text-ink",
        variant === "solid" && "bg-ink text-paper",
        variant === "muted" && "border border-line text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------------- Stat */
export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Eyebrow>{label}</Eyebrow>
      <div className="tnum text-3xl leading-none">{value}</div>
      {sub ? <div className="text-sm text-muted">{sub}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- Button */
type ButtonVariant = "primary" | "secondary" | "ghost";
export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
>(function Button({ variant = "primary", className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-ink text-paper hover:bg-paper hover:text-ink border border-ink",
        variant === "secondary" && "border border-ink text-ink hover:bg-ink hover:text-paper",
        variant === "ghost" && "border border-transparent text-ink hover:border-line",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/* --------------------------------------------------------------------- Rule */
export function Rule({ strong, className }: { strong?: boolean; className?: string }) {
  return <hr className={cn(strong ? "border-t-2 border-ink" : "border-t border-line", "my-0", className)} />;
}

/* ----------------------------------------------------------------- KeyValue */
export function KeyValue({ k, v, mono }: { k: React.ReactNode; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <span className="text-sm text-muted">{k}</span>
      <span className={cn("text-sm text-ink", mono && "tnum")}>{v}</span>
    </div>
  );
}

/* ------------------------------------------------------------- Severity mark */
/** Monochrome severity indicator — glyph + label, never colour. */
export function Severity({ level }: { level: string }) {
  const glyph =
    level === "high"
      ? "▲▲▲"
      : level === "medium"
        ? "▲▲"
        : level === "low"
          ? "▲"
          : level === "significant"
            ? "▲▲▲"
            : level === "moderate"
              ? "▲▲"
              : "—";
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="text-[0.6rem] leading-none tracking-tight">{glyph}</span>
      <span className="uppercase tracking-[0.12em] text-[0.68rem]">{level}</span>
    </span>
  );
}
