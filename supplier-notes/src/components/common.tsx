import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Priority, TaskStatus } from '../types';

/** Icon-only button with a tooltip that can show a keyboard shortcut. */
export const IconButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<typeof Button> & { label: string; shortcut?: string; side?: 'top' | 'bottom' | 'left' | 'right' }
>(({ label, shortcut, side = 'bottom', size = 'icon-sm', variant = 'ghost', className, children, ...props }, ref) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size={size}
        aria-label={label}
        className={cn('text-muted-foreground hover:text-foreground', className)}
        {...props}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent side={side} className="flex items-center gap-2">
      {label}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </TooltipContent>
  </Tooltip>
));
IconButton.displayName = 'IconButton';

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />;
}

/** Small square avatar with the first letter of a name. */
export function Monogram({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={cn('flex size-7 shrink-0 items-center justify-center rounded-md text-ui font-semibold text-white', className)}
      style={{ backgroundColor: color }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function OwnerAvatar({ name, className }: { name: string; className?: string }) {
  if (!name) return null;
  return (
    <span
      title={name}
      className={cn('inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-2xs font-semibold text-subtle-foreground', className)}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

const PILL = 'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-2xs font-medium whitespace-nowrap';

export const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
export const STATUS_LABEL: Record<TaskStatus, string> = { open: 'Open', doing: 'In progress', done: 'Done' };

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const tone =
    priority === 'high' ? 'bg-recording-soft text-recording' : priority === 'medium' ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground';
  return <span className={cn(PILL, tone, className)}>{PRIORITY_LABEL[priority]}</span>;
}

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const tone =
    status === 'doing' ? 'bg-brand-soft text-brand-soft-foreground' : status === 'done' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground';
  return <span className={cn(PILL, tone, className)}>{STATUS_LABEL[status]}</span>;
}

/** Outlined chip with a color dot — used for projects and suppliers. */
export function EntityChip({ color, children, className, ...props }: React.ComponentProps<'span'> & { color: string }) {
  return (
    <span
      className={cn('inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-2xs font-medium text-subtle-foreground', className)}
      {...props}
    >
      <ColorDot color={color} className="size-1.5" />
      {children}
    </span>
  );
}

export function SectionLabel({ children, count, className }: { children: React.ReactNode; count?: number; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between px-1 pb-1.5 text-xs font-medium text-muted-foreground', className)}>
      <span>{children}</span>
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </div>
  );
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
