import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ leadingIcon, className = '', ...rest }, ref) => {
    if (leadingIcon) {
      return (
        <div className="relative w-full">
          <span
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none flex items-center"
          >
            {leadingIcon}
          </span>
          <input
            ref={ref}
            className={`w-full pl-9 pr-3 py-2 text-sm rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] transition-colors ${className}`}
            {...rest}
          />
        </div>
      );
    }

    return (
      <input
        ref={ref}
        className={`w-full px-3 py-2 text-sm rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-blue)] transition-colors ${className}`}
        {...rest}
      />
    );
  }
);

Input.displayName = 'Input';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', children, ...rest }, ref) => {
    return (
      <select
        ref={ref}
        className={`w-full px-3 py-2 text-[13px] rounded-[8px] bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-[var(--accent-blue)] transition-colors ${className}`}
        {...rest}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';
