import { useEffect, useRef, useState } from 'react';
import { X, Send, Sparkles, Trash2 } from 'lucide-react';
import { useEva } from '@/contexts/EvaContext';
import EvaOrb from '@/components/eva/EvaOrb';
import EvaMessage from '@/components/eva/EvaMessage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'Hoe presteren onze campagnes deze week?',
  'Welke klant heeft de hoogste CTR de afgelopen 7 dagen?',
  'Geef een overzicht van Wijdezorg.',
  'Welke campagnes zijn nu actief?',
];

export default function EvaOverlay() {
  const { open, setOpen, messages, state, toolStatus, sendMessage, clearConversation } = useEva();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Autoscroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, toolStatus]);

  // Focus input when opened
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
    <div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-xl animate-fade-in">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-border/50">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Eva</span>
          <span className="text-xs text-muted-foreground font-normal ml-1">AI assistant</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearConversation} className="text-muted-foreground hover:text-foreground">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Nieuwe chat
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Sluiten">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Orb */}
      <div className="flex flex-col items-center pt-6 pb-2 shrink-0">
        <EvaOrb state={state} size={messages.length === 0 ? 280 : 160} className="transition-all duration-500" />
        {toolStatus && (
          <p className="mt-3 text-xs text-muted-foreground animate-fade-in">{toolStatus}</p>
        )}
        {!toolStatus && state === 'thinking' && (
          <p className="mt-3 text-xs text-muted-foreground">Eva denkt na…</p>
        )}
      </div>

      {/* Chat */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="max-w-3xl mx-auto py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center pt-4 animate-fade-in">
              <h2 className="text-2xl font-bold tracking-tight mb-2">Hoi, ik ben Eva</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Vraag me iets over je klanten, campagnes of Live Ads. Ik kan ook advertenties pauzeren of nieuwe ad sets aanmaken.
              </p>
              <div className="grid sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left text-sm px-4 py-3 rounded-2xl glass glass-hover transition-all hover:-translate-y-0.5"
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
      <div className="px-4 sm:px-6 pb-5 pt-3 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className={cn(
            'relative flex items-end gap-2 rounded-3xl glass-strong p-2 pr-2 transition-all',
            state !== 'idle' && 'opacity-70'
          )}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Vraag Eva iets…"
              rows={1}
              disabled={state !== 'idle'}
              className="flex-1 bg-transparent border-0 outline-none resize-none px-3 py-2 text-sm placeholder:text-muted-foreground/60 max-h-40"
              style={{ minHeight: 36 }}
            />
            <Button
              size="icon"
              onClick={submit}
              disabled={!input.trim() || state !== 'idle'}
              className="rounded-full h-9 w-9 shrink-0"
              aria-label="Verstuur"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
            Eva kan fouten maken. Controleer belangrijke informatie.
          </p>
        </div>
      </div>
    </div>
  );
}
