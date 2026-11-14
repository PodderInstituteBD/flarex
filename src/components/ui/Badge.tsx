import React from 'react';

export type BadgeTone =
  | 'neutral'
  | 'blue'
  | 'cyan'
  | 'violet'
  | 'success'
  | 'warning'
  | 'danger';

interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

const TONE_MAP: Record<BadgeTone, string> = {
  neutral:
    'text-[var(--text-secondary)] border-[var(--border-subtle)] bg-[var(--bg-elevated)]/65',
  blue:
    'text-[var(--accent-blue)] border-[var(--accent-blue)]/30 bg-[var(--accent-blue)]/10',
  cyan:
    'text-[var(--accent-cyan)] border-[var(--accent-cyan)]/30 bg-[var(--accent-cyan)]/10',
  violet:
    'text-[var(--accent-violet)] border-[var(--accent-violet)]/30 bg-[var(--accent-violet)]/10',
  success:
    'text-[var(--status-success)] border-[var(--status-success)]/30 bg-[var(--status-success)]/10',
  warning:
    'text-[var(--status-warning)] border-[var(--status-warning)]/35 bg-[var(--status-warning)]/10',
  danger:
    'text-[var(--status-danger)] border-[var(--status-danger)]/35 bg-[var(--status-danger)]/10',
};

export function Badge({ tone = 'neutral', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium tracking-wide border rounded-[6px] whitespace-nowrap ${TONE_MAP[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
