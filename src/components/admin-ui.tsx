import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

type Tone = "neutral" | "active" | "inactive" | "warning" | "info";

const toneClassNames: Record<Tone, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-950",
  inactive: "border-slate-200 bg-slate-50 text-slate-700",
  info: "border-sky-200 bg-sky-50 text-sky-950",
  neutral: "border-slate-200 bg-slate-50 text-slate-800",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
};

const messageClassNames: Record<ActionMessageVariant, string> = {
  error: "border-rose-200 bg-rose-50 text-rose-950",
  info: "border-sky-200 bg-sky-50 text-sky-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
};

type PageHeaderProps = {
  actions?: ReactNode;
  description?: ReactNode;
  metadata?: ReactNode;
  title: ReactNode;
};

export function PageHeader({ actions, description, metadata, title }: PageHeaderProps) {
  return (
    <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
        {metadata ? <div className="mt-2 flex flex-wrap gap-2">{metadata}</div> : null}
      </div>
      {actions ? (
        <ActionGroup className="sm:justify-end">
          {actions}
        </ActionGroup>
      ) : null}
    </header>
  );
}

type SummaryCardProps = {
  actions?: ReactNode;
  badges?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  metadata?: Array<{ label: string; value: ReactNode }>;
  title: ReactNode;
};

export function SummaryCard({
  actions,
  badges,
  description,
  icon,
  metadata = [],
  title,
}: SummaryCardProps) {
  return (
    <article className="grid min-w-0 gap-4 rounded-md border border-border bg-card p-4 text-card-foreground shadow-sm" data-summary-card="true">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3" data-summary-card-header="true">
        <div className="flex min-w-0 flex-1 gap-3">
          {icon ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-sky-100 bg-sky-50 text-sky-900">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold" title={typeof title === "string" ? title : undefined}>
              {title}
            </h2>
            {description ? (
              <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>
            ) : null}
            {badges ? <div className="mt-2 flex flex-wrap gap-2">{badges}</div> : null}
          </div>
        </div>
        {actions ? (
          <ActionGroup data-summary-card-actions="true">
            {actions}
          </ActionGroup>
        ) : null}
      </div>
      {metadata.length > 0 ? (
        <dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          {metadata.map((item) => (
            <div className="min-w-0" key={item.label}>
              <dt className="text-xs font-medium text-foreground">{item.label}</dt>
              <dd className="mt-0.5 break-words">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

export function StatusBadge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: Tone;
}) {
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium", toneClassNames[variant])} data-status-badge={variant}>
      <span className="truncate">{children}</span>
    </span>
  );
}

export function ActionGroup({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-2", className)} data-action-group="true" {...props}>
      {children}
    </div>
  );
}

type ActionMessageVariant = "error" | "info" | "success" | "warning";

export function ActionMessage({
  children,
  variant = "info",
}: {
  children?: ReactNode;
  variant?: ActionMessageVariant;
}) {
  if (!children) {
    return null;
  }

  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm", messageClassNames[variant])} role={variant === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className="grid gap-3 rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-sm" data-empty-state="true">
      <div className="min-w-0">
        <h2 className="font-medium">{title}</h2>
        {description ? (
          <p className="mt-1 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <ActionGroup>{action}</ActionGroup> : null}
    </section>
  );
}
