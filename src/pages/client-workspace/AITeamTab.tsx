import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3, Search, PenTool, Bot, Send, RefreshCw, Clock, Sparkles, MessageSquare,
  FileText, Download, Calendar, Filter, ChevronRight, Library,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

interface Props {
  clientId: string;
  clientName: string;
}

type AgentType = 'analyst' | 'trend_scout' | 'copywriter';
type ViewMode = 'overview' | 'reports' | 'chat';

interface AgentReport {
  id: string;
  agent_type: string;
  report_type: string | null;
  report_source: string;
  title: string | null;
  content: any;
  created_at: string;
  pdf_path: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const AGENTS: { key: AgentType; label: string; description: string; icon: typeof BarChart3; color: string }[] = [
  {
    key: 'analyst',
    label: 'Ads Analyst',
    description: 'Analyseert campagneresultaten en geeft strategische aanbevelingen',
    icon: BarChart3,
    color: 'hsl(272 56% 38%)',
  },
  {
    key: 'trend_scout',
    label: 'Trend Scout',
    description: 'Scant de Facebook Ads Library op trends in de zorgsector',
    icon: Search,
    color: 'hsl(38 92% 55%)',
  },
  {
    key: 'copywriter',
    label: 'Copywriter',
    description: 'Schrijft ad copy op basis van creative uploads en learnings',
    icon: PenTool,
    color: 'hsl(152 60% 40%)',
  },
];

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-chat`;

export default function AITeamTab({ clientId, clientName }: Props) {
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [runningAgent, setRunningAgent] = useState<AgentType | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [reportFilter, setReportFilter] = useState<AgentType | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'weekly'>('all');
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

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
      .order('created_at', { ascending: false });
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

  const downloadPdf = async (reportId: string) => {
    setGeneratingPdf(reportId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-report-pdf', {
        body: { report_id: reportId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Open HTML in new window for print-to-PDF
      const blob = new Blob([data.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 500);
        };
      }
      toast.success('PDF wordt geopend voor download');
    } catch (e: any) {
      toast.error(e.message || 'PDF genereren mislukt');
    } finally {
      setGeneratingPdf(null);
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
      if (!assistantSoFar) {
        setChatMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setIsStreaming(false);
    }
  };

  const getLatestReport = (agentType: AgentType) =>
    reports.find(r => r.agent_type === agentType);

  const filteredReports = reports.filter(r => {
    if (reportFilter !== 'all' && r.agent_type !== reportFilter) return false;
    if (sourceFilter !== 'all' && r.report_source !== sourceFilter) return false;
    return true;
  });

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const formatDateShort = (d: string) =>
    new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });

  const getAgentMeta = (type: string) => AGENTS.find(a => a.key === type);

  const reportCounts = {
    total: reports.length,
    weekly: reports.filter(r => r.report_source === 'weekly').length,
    manual: reports.filter(r => r.report_source === 'manual').length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Top nav */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">AI Team</h2>
          <p className="text-sm text-muted-foreground">Drie gespecialiseerde agents voor {clientName}</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {([
            { key: 'overview' as ViewMode, label: 'Overzicht', icon: Sparkles },
            { key: 'reports' as ViewMode, label: 'Rapporten', icon: Library },
            { key: 'chat' as ViewMode, label: 'Chat', icon: MessageSquare },
          ]).map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              size="sm"
              variant={viewMode === key ? 'default' : 'ghost'}
              className="text-xs h-8 px-3"
              onClick={() => setViewMode(key)}
            >
              <Icon className="h-3.5 w-3.5 mr-1.5" />
              {label}
              {key === 'reports' && reportCounts.total > 0 && (
                <span className="ml-1.5 bg-primary-foreground/20 text-[10px] px-1.5 py-0.5 rounded-full">
                  {reportCounts.total}
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Overview Mode */}
      {viewMode === 'overview' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {AGENTS.map(({ key, label, description, icon: Icon }) => {
              const latest = getLatestReport(key);
              const isRunning = runningAgent === key;
              const canRun = key !== 'copywriter';
              const agentReports = reports.filter(r => r.agent_type === key);

              return (
                <Card key={key} className="relative overflow-hidden group hover:shadow-md transition-shadow">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-primary opacity-60" />
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                          <Icon className="h-4.5 w-4.5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-semibold">{label}</CardTitle>
                          <p className="text-[10px] text-muted-foreground">{agentReports.length} rapporten</p>
                        </div>
                      </div>
                      {latest && (
                        <Badge variant="outline" className="text-[10px]">
                          <Clock className="h-2.5 w-2.5 mr-1" />
                          {formatDate(latest.created_at)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{description}</p>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {loadingReports ? (
                      <Skeleton className="h-16 w-full" />
                    ) : latest ? (
                      <div className="text-xs text-muted-foreground line-clamp-3 bg-muted/40 rounded-md p-2.5">
                        {typeof latest.content?.analysis === 'string'
                          ? latest.content.analysis.substring(0, 150) + '...'
                          : latest.content?.summary || 'Rapport beschikbaar'}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic bg-muted/40 rounded-md p-2.5 text-center">
                        Nog geen rapport gegenereerd
                      </div>
                    )}

                    <div className="flex gap-2">
                      {canRun && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs"
                          onClick={() => runAgent(key)}
                          disabled={isRunning || runningAgent !== null}
                        >
                          {isRunning ? (
                            <><RefreshCw className="h-3 w-3 mr-1 animate-spin" /> Bezig...</>
                          ) : (
                            <><Sparkles className="h-3 w-3 mr-1" /> {latest ? 'Opnieuw' : 'Starten'}</>
                          )}
                        </Button>
                      )}
                      {agentReports.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs"
                          onClick={() => {
                            setReportFilter(key);
                            setViewMode('reports');
                          }}
                        >
                          <Library className="h-3 w-3 mr-1" /> Rapporten
                          <ChevronRight className="h-3 w-3 ml-0.5" />
                        </Button>
                      )}
                    </div>

                    {key === 'copywriter' && (
                      <p className="text-[10px] text-muted-foreground text-center">
                        Draait automatisch bij creative uploads
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{reportCounts.total}</p>
                  <p className="text-xs text-muted-foreground">Totaal rapporten</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <Calendar className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{reportCounts.weekly}</p>
                  <p className="text-xs text-muted-foreground">Wekelijkse rapporten</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <Sparkles className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{reportCounts.manual}</p>
                  <p className="text-xs text-muted-foreground">Handmatige rapporten</p>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* Reports Library Mode */}
      {viewMode === 'reports' && (
        <div className="space-y-4">
          {/* Filter bar */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Filter:</span>
                <div className="flex gap-1">
                  {([{ key: 'all' as const, label: 'Alle' }, ...AGENTS.map(a => ({ key: a.key, label: a.label }))]).map(({ key, label }) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={reportFilter === key ? 'default' : 'outline'}
                      className="text-xs h-7 px-2.5"
                      onClick={() => setReportFilter(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                {([
                  { key: 'all' as const, label: 'Alle types' },
                  { key: 'weekly' as const, label: '📅 Wekelijks' },
                  { key: 'manual' as const, label: '✋ Handmatig' },
                ]).map(({ key, label }) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={sourceFilter === key ? 'secondary' : 'ghost'}
                    className="text-xs h-7 px-2.5"
                    onClick={() => setSourceFilter(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          {/* Reports list */}
          {loadingReports ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
            </div>
          ) : filteredReports.length === 0 ? (
            <Card className="p-12 text-center">
              <Library className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Geen rapporten gevonden</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Pas de filters aan of genereer een nieuw rapport</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredReports.map(report => {
                const agent = getAgentMeta(report.agent_type);
                const isExpanded = expandedReport === report.id;
                const AgentIcon = agent?.icon || FileText;

                return (
                  <Card
                    key={report.id}
                    className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'ring-1 ring-primary/30' : 'hover:shadow-sm'}`}
                  >
                    <div
                      className="flex items-center gap-4 p-4 cursor-pointer"
                      onClick={() => setExpandedReport(isExpanded ? null : report.id)}
                    >
                      {/* Agent icon */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <AgentIcon className="h-5 w-5 text-primary" />
                      </div>

                      {/* Title & meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-foreground truncate">
                            {report.title || `${agent?.label || report.agent_type} Rapport`}
                          </h4>
                          <Badge
                            variant={report.report_source === 'weekly' ? 'default' : 'outline'}
                            className="text-[10px] shrink-0"
                          >
                            {report.report_source === 'weekly' ? '📅 Wekelijks' : '✋ Handmatig'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">{agent?.label}</span>
                          <span className="text-[10px] text-muted-foreground/60">•</span>
                          <span className="text-xs text-muted-foreground">{formatDateShort(report.created_at)}</span>
                          {report.report_type && (
                            <>
                              <span className="text-[10px] text-muted-foreground/60">•</span>
                              <span className="text-xs text-muted-foreground capitalize">{report.report_type.replace(/_/g, ' ')}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadPdf(report.id);
                          }}
                          disabled={generatingPdf === report.id}
                        >
                          {generatingPdf === report.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          PDF
                        </Button>
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t">
                        <div className="pt-4 prose prose-sm max-w-none text-sm">
                          <ReactMarkdown>
                            {report.content?.analysis || report.content?.summary || 'Geen inhoud beschikbaar'}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Chat Mode */}
      {viewMode === 'chat' && (
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
            <div className="border rounded-lg bg-muted/30 p-4 h-[400px] overflow-y-auto space-y-3 mb-3">
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
      )}
    </div>
  );
}
