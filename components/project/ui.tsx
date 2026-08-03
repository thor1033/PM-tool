"use client";

import { cn } from "@/lib/utils";

export function ModuleHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4 border-b pb-6">
      <div>
        {eyebrow ? <p className="eyebrow mb-2 text-[11.5px]">{eyebrow}</p> : null}
        <h1 className="font-serif-display text-[34px] leading-tight font-medium tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground mt-2 text-[15px]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed p-10 text-center",
        className,
      )}
    >
      <h3 className="font-medium">{title}</h3>
      {body ? (
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card shadow-xs rounded-2xl border p-5", className)}>
      {title ? (
        <h3 className="mb-3 text-[13px] font-bold tracking-tight">{title}</h3>
      ) : null}
      {children}
    </div>
  );
}
