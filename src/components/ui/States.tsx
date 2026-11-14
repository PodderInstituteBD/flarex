import React from 'react';
import { AlertCircle, AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { Card } from './Card';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Card className="p-8 sm:p-10 text-center space-y-3">
      {icon && (
        <div className="w-10 h-10 mx-auto rounded-[8px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-blue)]">
          {icon}
        </div>
      )}
      <p className="font-display text-[17px] font-semibold text-[var(--text-primary)]">
        {title}
      </p>
      <p className="text-[14px] text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
        {description}
      </p>
      {action && <div className="pt-2 flex justify-center">{action}</div>}
    </Card>
  );
}

interface LoadingSkeletonProps {
  rows?: number;
}

export function LoadingSkeleton({ rows = 3 }: LoadingSkeletonProps) {
  return (
    <div aria-busy="true" aria-label="Loading content" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-[12px] bg-[var(--bg-card)] border border-[var(--border-subtle)] opacity-75 animate-pulse"
        />
      ))}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  action?: React.ReactNode;
}

export function ErrorState({
  title = 'Request Failed',
  message,
  action,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-[12px] border border-[var(--status-danger)]/35 bg-[var(--status-danger)]/10 p-4 flex items-start gap-3"
    >
      <AlertCircle
        className="w-5 h-5 text-[var(--status-danger)] shrink-0 mt-0.5"
        aria-hidden="true"
      />
      <div className="space-y-1 flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
          {message}
        </p>
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

interface NoticeBannerProps {
  tone?: 'info' | 'warning';
  title?: string;
  children: React.ReactNode;
}

export function NoticeBanner({
  tone = 'info',
  title,
  children,
}: NoticeBannerProps) {
  const isWarning = tone === 'warning';
  const Icon = isWarning ? AlertTriangle : Info;
  return (
    <div
      role="note"
      className={`rounded-[12px] p-4 border flex items-start gap-3 ${
        isWarning
          ? 'bg-[var(--status-warning)]/10 border-[var(--status-warning)]/35'
          : 'bg-[var(--bg-secondary)] border-[var(--border-subtle)]'
      }`}
    >
      <Icon
        className={`w-4 h-4 shrink-0 mt-0.5 ${
          isWarning ? 'text-[var(--status-warning)]' : 'text-[var(--accent-blue)]'
        }`}
        aria-hidden="true"
      />
      <div className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed space-y-1">
        {title && (
          <p className="font-semibold text-[var(--text-primary)]">{title}</p>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
}

interface SourceReferenceProps {
  label: string;
  url: string;
  docId?: string | null;
}

export function SourceReference({ label, url, docId }: SourceReferenceProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
      <span className="truncate">
        Source: <strong className="font-medium text-[var(--text-primary)]">{label}</strong>
        {docId ? <span className="font-mono-tabular ml-1.5 text-[var(--text-muted)]">({docId})</span> : null}
      </span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-medium text-[var(--accent-blue)] hover:underline shrink-0"
      >
        <span>Open Source</span>
        <ExternalLink className="w-3 h-3" aria-hidden="true" />
      </a>
    </div>
  );
}
