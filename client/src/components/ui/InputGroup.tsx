import React from 'react';
import { cn } from '@/lib/utils';

export interface InputGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {label && (
          <label className="block text-sm font-medium mb-2 text-foreground">{label}</label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {leftIcon}
            </div>
          )}
          <div className={cn(leftIcon && 'pl-10', rightIcon && 'pr-10')}>{children}</div>
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        {hint && !error && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
    );
  }
);

InputGroup.displayName = 'InputGroup';

