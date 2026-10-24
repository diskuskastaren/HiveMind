import { useState } from 'react';
import { format, parse, isValid, addDays } from 'date-fns';
import { CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Due-date picker. Value and onChange use the stored 'yyyy-MM-dd' string ('' = no date). */
export function DatePicker({
  value,
  onChange,
  placeholder = 'No due date',
  className,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const date = parsed && isValid(parsed) ? parsed : undefined;

  const pick = (d: Date | undefined) => {
    onChange(d ? format(d, 'yyyy-MM-dd') : '');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn('h-9 justify-start gap-2 px-3 font-normal', !date && 'text-muted-foreground', className)}
        >
          <CalendarDays className="text-muted-foreground" />
          <span className="flex-1 truncate text-left">{date ? format(date, 'EEE, MMM d, yyyy') : placeholder}</span>
          {date && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
              className="-mr-1 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
            >
              <X className="size-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} defaultMonth={date} onSelect={pick} autoFocus />
        <div className="flex gap-1.5 border-t p-2">
          <Button variant="outline" size="xs" className="flex-1" onClick={() => pick(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="xs" className="flex-1" onClick={() => pick(addDays(new Date(), 7))}>
            Next week
          </Button>
          <Button variant="ghost" size="xs" className="flex-1" onClick={() => pick(undefined)}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
