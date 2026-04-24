import { useState } from 'react';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  allowCustom?: boolean;
}

export default function MultiSelectCombobox({ options, value, onChange, placeholder = 'Kies...', allowCustom = true }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const allOptions = Array.from(new Set([...options, ...value]));
  const filtered = allOptions.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  const toggle = (opt: string) => {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else onChange([...value, opt]);
  };

  const addCustom = () => {
    const v = search.trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full min-h-[34px] items-center justify-between gap-1 rounded-md border border-input bg-background px-2 py-1 text-left text-xs hover:bg-accent/30 transition-colors"
        >
          <div className="flex flex-wrap gap-1 flex-1">
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              value.map(v => (
                <Badge key={v} variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 font-normal">
                  {v}
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); onChange(value.filter(x => x !== v)); }}
                    className="hover:text-destructive cursor-pointer"
                  >
                    <X className="h-2.5 w-2.5" />
                  </span>
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="flex gap-1 mb-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek of typ nieuw..."
            className="h-7 text-xs"
            onKeyDown={(e) => { if (e.key === 'Enter' && allowCustom) { e.preventDefault(); addCustom(); } }}
          />
          {allowCustom && search.trim() && !allOptions.includes(search.trim()) && (
            <Button size="sm" variant="outline" className="h-7 px-2" onClick={addCustom}>
              <Plus className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className="max-h-56 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 px-2 text-center">Geen opties</p>
          ) : (
            filtered.map(opt => {
              const checked = value.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-left hover:bg-accent transition-colors',
                    checked && 'bg-accent/50'
                  )}
                >
                  <div className={cn('flex h-3.5 w-3.5 items-center justify-center rounded border', checked ? 'bg-primary border-primary' : 'border-input')}>
                    {checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <span className="flex-1 truncate">{opt}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
