import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, hover = false, children, ...props }, ref) => {
    const Component: React.ElementType = hover ? motion.div : 'div';
    const motionProps = hover
      ? {
          whileHover: { scale: 1.02, y: -2 },
          transition: { duration: 0.2 },
        }
      : {};

    return (
      <Component
        ref={ref}
        className={cn(
          'rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm',
          'shadow-lg shadow-black/5',
          hover && 'cursor-pointer',
          className
        )}
        {...motionProps}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

GlassCard.displayName = 'GlassCard';

