import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  collapsed?: boolean;
}

export default function ThemeToggle({ collapsed }: Props) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options = [
    { value: 'light', icon: Sun, label: 'Licht' },
    { value: 'dark', icon: Moon, label: 'Donker' },
    { value: 'system', icon: Monitor, label: 'Systeem' },
  ] as const;

  if (collapsed) {
    const current = mounted ? theme : 'system';
    const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
    const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;
    return (
      <button
        onClick={() => setTheme(next)}
        title={`Thema: ${current}`}
        className="flex w-full items-center justify-center rounded-xl p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 p-1 rounded-full bg-sidebar-accent/60 mb-1.5">
      {options.map(({ value, icon: Icon, label }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            onClick={() => setTheme(value)}
            title={label}
            className={cn(
              'flex flex-1 items-center justify-center h-7 rounded-full text-xs transition-all',
              active
                ? 'bg-sidebar text-sidebar-foreground shadow-soft'
                : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
