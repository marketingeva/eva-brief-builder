import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3, Search, PenTool, Bot, Send, RefreshCw, Clock, Sparkles, MessageSquare,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface Props {
  clientId: string;
  clientName: string;
}

type AgentType = 'analyst' | 'trend_scout' | 'copywriter';

interface AgentReport {
  id: string;
  agent_type: string;
  report_type: string;
  content: any;
  created_at: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const AGENTS: { key: AgentType; label: string; description: string; icon: typeof BarChart3 }[] = [
  {
    key: 'analyst',
    label: 'Ads Analyst',
    description: 'Analyseert campagneresultaten en geeft strategische aanbevelingen',
    icon: BarChart3,
  },
  {
    key: 'trend_scout',
    label: 'Trend Scout',
    description: 'Scant de Facebook Ads Library op trends in de zorgsector',
    icon: Search,
  },
  {
    key: 'copywriter',
    label: 'Copywriter',
    description: 'Schrijft ad copy op basis van creative uploads en learnings',
    icon: PenTool,
  },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-chat`;

export default function AITeamTab({ clientId, clientName }: Props) {
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [runningAgent, setRunningAgent] = useState<AgentType | null>(null);

  // Chat state
  const [chatAgent, setChatAgent] = useState<AgentType>('analyst');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadReports();
  }, [clientId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const loadReports = async () => {
    setLoadingReports(true);
    const { data } = await supabase
      .from('agent_reports')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10);
    setReports((data as AgentReport[]) || []);
    setLoadingReports(false);
  };

  const runAgent = async (agentType: AgentType) => {
    setRunningAgent(agentType);
    const functionName = agentType === 'analyst' ? 'agent-analyst' : 'agent-trend-scout';

    try {
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { client_id: clientId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`${AGENTS.find(a => a.key === agentType)?.label} rapport gegenereerd`);
      loadReports();
    } catch (e: any) {
      toast.error(e.message || 'Agent mislukt');
    } finally {
      setRunningAgent(null);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || isStreaming) return;

    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setIsStreaming(true);

    let assistantSoFar = '';

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          client_id: clientId,
          agent_type: chatAgent,
          messages: updatedMessages,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }

      if (!resp.body) throw new Error('No stream body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantSoFar += content;
              setChatMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
                }
                return [...prev, { role: 'assistant', content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Chat mislukt');
      // Remove the user message if no response came
      if (!assistantSoFar) {
        setChatMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const getLatestReport = (agentType: AgentType) =>
    reports.find(r => r.agent_type === agentType);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-6 space-y-6">
      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {AGENTS.map(({ key, label, description, icon: Icon }) => {
          const latest = getLatestReport(key);
          const isRunning = runningAgent === key;
          const canRun = key !== 'copywriter'; // Copywriter runs via creative upload

          return (
            <Card key={key} className="relative overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-semibold">{label}</CardTitle>
                  </div>
                  {latest && (
                    <Badge variant="outline" className="text-[10px]">
                      <Clock className="h-2.5 w-2.5 mr-1" />
                      {formatDate(latest.created_at)}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
              </CardHeader>
              <CardContent className="pt-0">
                {loadingReports ? (
                  <Skeleton className="h-16 w-full" />
                ) : latest ? (
                  <div className="text-xs text-muted-foreground line-clamp-3">
                    {typeof latest.content?.analysis === 'string'
                      ? latest.content.analysis.substring(0, 150) + '...'
                      : latest.content?.summary || 'Rapport beschikbaar'}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Nog geen rapport</p>
                )}
                {canRun && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full text-xs"
                    onClick={() => runAgent(key)}
                    disabled={isRunning || runningAgent !== null}
                  >
                    {isRunning ? (
                      <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Bezig...</>
                    ) : (
                      <><Sparkles className="h-3 w-3 mr-1" /> {latest ? 'Opnieuw analyseren' : 'Analyse starten'}</>
                    )}
                  </Button>
                )}
                {key === 'copywriter' && (
                  <p className="mt-3 text-[10px] text-muted-foreground text-center">
                    Draait automatisch bij creative uploads
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Latest report detail */}
      {reports.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Laatste rapport</CardTitle>
              <Badge variant="secondary" className="text-[10px]">
                {AGENTS.find(a => a.key === reports[0].agent_type)?.label || reports[0].agent_type}
              </Badge>
              <span className="text-[10px] text-muted-foreground ml-auto">
                {formatDate(reports[0].created_at)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-sm">
              <ReactMarkdown>
                {reports[0].content?.analysis || reports[0].content?.summary || 'Geen inhoud'}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Chat Interface */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Chat met agents</CardTitle>
            </div>
            <div className="flex gap-1">
              {AGENTS.map(({ key, label, icon: Icon }) => (
                <Button
                  key={key}
                  size="sm"
                  variant={chatAgent === key ? 'default' : 'ghost'}
                  className="text-xs h-7 px-2"
                  onClick={() => {
                    setChatAgent(key);
                    setChatMessages([]);
                  }}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Messages */}
          <div className="border rounded-lg bg-muted/30 p-4 h-[360px] overflow-y-auto space-y-3 mb-3">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                <Bot className="h-8 w-8 mb-2 opacity-40" />
                <p>Stel een vraag aan de {AGENTS.find(a => a.key === chatAgent)?.label}</p>
                <p className="text-xs mt-1 opacity-60">
                  Bijv. "Welke hooks werken het best?" of "Schrijf 3 headlines voor een VIG-vacature"
                </p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            {isStreaming && chatMessages[chatMessages.length - 1]?.role !== 'assistant' && (
              <div className="flex justify-start">
                <div className="bg-card border rounded-lg px-3 py-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder={`Vraag iets aan de ${AGENTS.find(a => a.key === chatAgent)?.label}...`}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
              disabled={isStreaming}
            />
            <Button
              size="sm"
              onClick={sendChatMessage}
              disabled={!chatInput.trim() || isStreaming}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
