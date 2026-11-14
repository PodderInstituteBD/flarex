import React from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[var(--border-subtle)]">
      <div className="space-y-1.5 max-w-3xl">
        {eyebrow && (
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-blue)]">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-[30px] sm:text-[34px] font-bold tracking-[-0.02em] leading-[1.18] text-[var(--text-primary)] text-balance">
          {title}
        </h1>
        {description && (
          <p className="text-[14px] sm:text-[15px] leading-[1.6] text-[var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>

      {(actions || meta) && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {meta}
          {actions}
        </div>
      )}
    </header>
  );
}
