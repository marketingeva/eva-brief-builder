import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { EvaState } from '@/components/eva/EvaOrb';

export interface EvaMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface EvaContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
  messages: EvaMessage[];
  state: EvaState;
  toolStatus: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearConversation: () => Promise<void>;
}

const EvaContext = createContext<EvaContextValue | null>(null);

export function useEva() {
  const ctx = useContext(EvaContext);
  if (!ctx) throw new Error('useEva must be used inside EvaProvider');
  return ctx;
}

export function EvaProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<EvaMessage[]>([]);
  const [state, setState] = useState<EvaState>('idle');
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const loadedRef = useRef(false);

  // Load saved conversation once
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('eva_conversations')
        .select('messages')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.messages && Array.isArray(data.messages)) {
        setMessages(data.messages as unknown as EvaMessage[]);
      }
    })();
  }, []);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || state !== 'idle') return;

    const userMsg: EvaMessage = { role: 'user', content: trimmed };
    const baseHistory = [...messages, userMsg];
    setMessages([...baseHistory, { role: 'assistant', content: '' }]);
    setState('thinking');
    setToolStatus(null);

    let assistantSoFar = '';
    const updateAssistant = (full: string) => {
      assistantSoFar = full;
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: full };
        return copy;
      });
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Niet ingelogd');

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/eva-chat`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: baseHistory }),
      });

      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Eva error ${resp.status}: ${errText.slice(0, 200)}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Parse SSE events: blocks separated by \n\n
        let sep;
        while ((sep = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          let event = 'message';
          let data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) event = line.slice(7).trim();
            else if (line.startsWith('data: ')) data += line.slice(6);
          }
          if (!data) continue;
          let payload: any;
          try { payload = JSON.parse(data); } catch { continue; }

          if (event === 'token') {
            updateAssistant(assistantSoFar + (payload.text || ''));
            setState('speaking');
          } else if (event === 'tool_start') {
            setState('thinking');
            setToolStatus(translateToolName(payload.name));
          } else if (event === 'tool_done') {
            setToolStatus(null);
          } else if (event === 'done') {
            // final flush — payload.text is the canonical full text
            if (payload.text) updateAssistant(payload.text);
          } else if (event === 'error') {
            throw new Error(payload.message || 'Onbekende fout');
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      // remove empty assistant placeholder if nothing came back
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setState('idle');
      setToolStatus(null);
    }
  }, [messages, state]);

  const clearConversation = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('eva_conversations').upsert(
        { user_id: user.id, messages: [], updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
    }
    setMessages([]);
  }, []);

  return (
    <EvaContext.Provider value={{ open, setOpen, messages, state, toolStatus, sendMessage, clearConversation }}>
      {children}
    </EvaContext.Provider>
  );
}

function translateToolName(name: string): string {
  const map: Record<string, string> = {
    list_clients: 'Klanten ophalen…',
    get_client_summary: 'Klantprofiel ophalen…',
    get_live_ads_metrics: 'Live Ads metrics ophalen…',
    list_active_campaigns: 'Actieve campagnes ophalen…',
    toggle_campaign_status: 'Campagne-status aanpassen…',
    search_briefings: 'Briefings doorzoeken…',
  };
  return map[name] || `${name}…`;
}
