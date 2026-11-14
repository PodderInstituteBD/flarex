import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: 'div' | 'section' | 'article' | 'aside';
  children: React.ReactNode;
}

const PADDING_MAP = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6 sm:p-8',
};

export function Card({
  elevated = false,
  padding = 'md',
  as: Component = 'div',
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <Component
      className={`rounded-[12px] border border-[var(--border-subtle)] ${
        elevated ? 'bg-[var(--bg-elevated)]' : 'bg-[var(--bg-card)]'
      } shadow-[var(--shadow-card)] ${PADDING_MAP[padding]} ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
}

export function Panel({
  className = '',
  children,
  as: Component = 'section',
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'header' }) {
  return (
    <Component
      className={`rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] shadow-[var(--shadow-card)] ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
}
