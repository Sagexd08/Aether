import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
          {
            'border-transparent bg-primary text-primary-foreground': variant === 'default',
            'border-transparent bg-secondary text-secondary-foreground': variant === 'secondary',
            'border-border bg-transparent': variant === 'outline',
            'border-transparent bg-green-500/20 text-green-500': variant === 'success',
            'border-transparent bg-yellow-500/20 text-yellow-500': variant === 'warning',
            'border-transparent bg-destructive text-destructive-foreground': variant === 'destructive',
          },
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

