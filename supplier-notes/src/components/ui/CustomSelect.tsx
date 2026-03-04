import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Classes applied to the trigger button (controls size, width, text size, etc.) */
  className?: string;
  label?: string;
}

export function CustomSelect({ value, onChange, options, className = '', label }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {label && <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg hover:border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 text-left transition-colors ${className}`}
      >
        <span className="flex-1 truncate">{selected?.label ?? value}</span>
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[60] min-w-full">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`w-full flex items-center px-3 py-1.5 text-sm text-left hover:bg-gray-50 transition-colors whitespace-nowrap ${
                o.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
              }`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
