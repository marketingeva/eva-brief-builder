import { useEffect, useRef, useState } from 'react';
import { X, Send, Sparkles, Trash2 } from 'lucide-react';
import { useEva } from '@/contexts/EvaContext';
import EvaOrb from '@/components/eva/EvaOrb';
import EvaMessage from '@/components/eva/EvaMessage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Hoe presteren onze campagnes deze week?',
  'Welke klant heeft de hoogste CTR?',
  'Geef een overzicht van Wijdezorg.',
  'Welke campagnes zijn nu actief?',
];

export default function EvaPanel() {
  const { open, setOpen, messages, state, toolStatus, suggestions, sendMessage, clearConversation } = useEva();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, toolStatus]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    if (!input.trim() || state !== 'idle') return;
    const text = input;
    setInput('');
    sendMessage(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <aside
      className={cn(
        'z-40 flex flex-col glass-dark text-sidebar-foreground animate-fade-in',
        // Mobile: floating panel
        'fixed inset-y-3 right-3 left-3 rounded-3xl',
        // Desktop: floating, takes the full remaining width next to the sidebar
        'lg:relative lg:inset-auto lg:my-3 lg:mx-3 lg:rounded-3xl lg:flex-1 lg:min-w-0'
      )}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border/40 shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Eva</span>
          <span className="text-[10px] text-sidebar-foreground/50 font-normal ml-1 uppercase tracking-wider">AI assistant</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearConversation}
              className="h-7 text-[11px] text-sidebar-foreground/60 hover:text-sidebar-foreground"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Nieuw
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Sluiten"
            className="h-7 w-7 text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Orb */}
      <div className="flex flex-col items-center pt-6 pb-3 shrink-0">
        <EvaOrb
          state={state}
          size={messages.length === 0 ? 220 : 120}
          className="transition-all duration-500"
        />
        {toolStatus && (
          <p className="mt-3 text-xs text-sidebar-foreground/60 animate-fade-in px-3 text-center">{toolStatus}</p>
        )}
        {!toolStatus && state === 'thinking' && (
          <p className="mt-3 text-xs text-sidebar-foreground/60">Eva denkt na…</p>
        )}
      </div>

      {/* Chat */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto py-4 space-y-4 w-full">
          {messages.length === 0 ? (
            <div className="text-center pt-2 animate-fade-in px-2">
              <h2 className="text-2xl font-bold tracking-tight mb-2 text-sidebar-foreground">Hoi, ik ben Eva</h2>
              <p className="text-sm text-sidebar-foreground/60 mb-6 max-w-md mx-auto">
                Vraag iets over klanten, campagnes of Live Ads.
              </p>
              <div className="grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-sm px-4 py-3 rounded-2xl bg-sidebar-accent/40 hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground transition-all hover:-translate-y-0.5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => <EvaMessage key={i} role={m.role} content={m.content} />)
          )}
        </div>
      </div>

      {/* Input */}
      <div className="px-4 sm:px-6 pb-4 pt-2 shrink-0">
        <div className="max-w-2xl mx-auto">
          {suggestions.length > 0 && state === 'idle' && (
            <div className="flex flex-wrap gap-1.5 mb-2 animate-fade-in">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-sidebar-accent/40 hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground transition-all border border-sidebar-border/40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div
            className={cn(
              'relative flex items-end gap-2 rounded-2xl bg-sidebar-accent/50 ring-1 ring-sidebar-border/50 p-1.5 transition-all',
              state !== 'idle' && 'opacity-70'
            )}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Vraag Eva iets…"
              rows={1}
              disabled={state !== 'idle'}
              className="flex-1 bg-transparent border-0 outline-none resize-none px-2 py-1.5 text-sm placeholder:text-sidebar-foreground/40 text-sidebar-foreground max-h-32"
              style={{ minHeight: 32 }}
            />
            <Button
              size="icon"
              onClick={submit}
              disabled={!input.trim() || state !== 'idle'}
              className="rounded-full h-8 w-8 shrink-0"
              aria-label="Verstuur"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-sidebar-foreground/40 text-center mt-2">
            Eva kan fouten maken. Controleer belangrijke info.
          </p>
        </div>
      </div>
    </aside>
  );
}
