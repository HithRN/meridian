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
    <Tag className={cn("rounded-lg border border-line bg-paper shadow-[0_1px_2px_rgba(24,54,80,0.04)]", className)}>{children}</Tag>
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
        <h3 className="text-[1.05rem] font-semibold leading-tight tracking-tight">{title}</h3>
      </div>
      {right ? <div className="shrink-0 text-sm text-muted">{right}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

/* -------------------------------------------------------------------- Badge */
type BadgeVariant = "outline" | "solid" | "muted" | "success" | "running" | "warning" | "danger" | "info" | "neutral";
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
        "inline-flex items-center gap-1 rounded px-2 py-[3px] text-[0.82rem] font-semibold leading-none",
        variant === "outline" && "border border-line-strong text-heading",
        variant === "solid" && "bg-accent-soft text-heading",
        variant === "muted" && "border border-line bg-panel text-muted",
        variant === "success" && "bg-positive-bg text-positive",
        variant === "running" && "bg-running-bg text-running",
        variant === "warning" && "bg-warning-bg text-warning",
        variant === "danger" && "bg-negative-bg text-negative",
        variant === "info" && "bg-info-bg text-info",
        variant === "neutral" && "bg-neutral-bg text-neutral",
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
      <div className="tnum text-[1.6rem] font-semibold leading-none tracking-tight text-heading">{value}</div>
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
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "border border-accent bg-accent text-on-accent hover:border-accent-strong hover:bg-accent-strong",
        variant === "secondary" && "border border-line bg-subtle text-heading hover:border-line-strong hover:bg-selected",
        variant === "ghost" && "border border-transparent text-ink hover:bg-subtle",
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
const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  high: "danger",
  significant: "danger",
  medium: "warning",
  moderate: "warning",
  low: "info",
  none: "success",
  stable: "success",
};

/** Severity as a muted status pill: pale background, dark label. */
export function Severity({ level }: { level: string }) {
  return <Badge variant={SEVERITY_VARIANT[level] ?? "neutral"}>{level}</Badge>;
}

/* --------------------------------------------------------------- Signed text */
/** Colour a signed quantity: positive / negative tones, neutral near zero. */
export function signedTone(v: number, eps = 1e-9): string {
  return v > eps ? "text-positive" : v < -eps ? "text-negative" : "text-muted";
}
