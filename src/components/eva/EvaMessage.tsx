import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { User, Sparkles } from 'lucide-react';

interface Props {
  role: 'user' | 'assistant';
  content: string;
}

export default function EvaMessage({ role, content }: Props) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex gap-3 animate-fade-in w-full items-start', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5',
        isUser ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary'
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div className={cn(
        'min-w-0 break-words text-sm leading-relaxed shadow-soft',
        isUser
          ? 'max-w-[78%] rounded-[1.4rem] rounded-tr-lg bg-primary px-5 py-3.5 text-primary-foreground'
          : 'max-w-[94%] flex-1 rounded-[1.4rem] rounded-tl-lg border border-sidebar-border/45 bg-sidebar-accent/35 px-5 py-4 text-sidebar-foreground'
      )}>
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : (
          <div className={cn(
            'prose prose-sm dark:prose-invert max-w-none overflow-visible break-words text-sidebar-foreground',
            'prose-p:my-3 prose-p:leading-7 prose-p:text-sidebar-foreground/90',
            'prose-ul:my-3 prose-ol:my-3 prose-li:my-1.5 prose-li:leading-7 prose-li:marker:text-primary/70',
            'prose-headings:mt-5 prose-headings:mb-2.5 prose-headings:font-semibold prose-headings:text-sidebar-foreground',
            'prose-h1:text-base prose-h2:text-base prose-h3:text-sm',
            'prose-strong:text-sidebar-foreground prose-strong:font-semibold',
            'prose-hr:my-4 prose-hr:border-sidebar-border/50',
            'prose-pre:my-2 prose-pre:bg-muted prose-pre:text-foreground prose-pre:overflow-x-auto prose-pre:rounded-xl',
            'prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none',
            'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
            'prose-table:text-xs prose-th:bg-muted/50',
            '[&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
            '[&_ul:first-child]:mt-0 [&_ol:first-child]:mt-0',
            '[&_h1:first-child]:mt-0 [&_h2:first-child]:mt-0 [&_h3:first-child]:mt-0'
          )}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '…'}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
