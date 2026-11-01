import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Single-line inline editor used for decisions and follow-ups.
 * Enter or leaving the field saves; Escape cancels. (Separate editors used to save on the blur
 * that follows Escape, so "cancel" kept the edit.) Empty text is never saved.
 */
export function InlineEditInput({
  initialValue,
  onCommit,
  onDone,
  label,
  className,
}: {
  initialValue: string;
  onCommit: (value: string) => void;
  onDone: () => void;
  label: string;
  className?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const finished = useRef(false);
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const text = value.trim();
    if (save && text && text !== initialValue.trim()) onCommit(text);
    onDone();
  };
  return (
    <Input
      autoFocus
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          // Handled here: keep dialogs/views from also reacting to this Escape.
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className={cn('h-8 text-ui', className)}
    />
  );
}
