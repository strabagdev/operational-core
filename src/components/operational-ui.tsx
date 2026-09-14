import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function OperationalPageHeader({
  actions,
  children,
  className,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("sticky top-0 z-40 -mx-4 shrink-0 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6", className)} data-operational-header="true">
      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
        <div className="min-w-0 flex-1">{children}</div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5" data-operational-actions="true">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function FilterBar({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-sky-100 bg-sky-50/60 p-2" data-filter-bar="true" data-filter-active={active ? "true" : "false"}>
      {children}
    </div>
  );
}

export function DataTableShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-sm", className)} data-table-shell="true">
      <div className="flex h-full min-h-0 flex-col p-3 sm:p-4">
        {children}
      </div>
    </div>
  );
}

export function TableScrollArea({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto" data-table-scroll-area="true">
      {children}
    </div>
  );
}

export function PaginationBar({
  children,
  summary,
}: {
  children: ReactNode;
  summary: ReactNode;
}) {
  return (
    <div className="mt-4 flex shrink-0 flex-col gap-3 border-t border-border pt-4 text-sm sm:flex-row sm:items-center sm:justify-between" data-pagination-bar="true">
      <p className="text-muted-foreground">{summary}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
