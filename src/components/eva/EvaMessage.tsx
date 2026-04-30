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
    <div className={cn('flex gap-3 animate-fade-in w-full', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5',
        isUser ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary'
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div className={cn(
        'rounded-2xl px-4 py-3 text-sm leading-relaxed min-w-0 break-words overflow-hidden',
        isUser
          ? 'bg-primary text-primary-foreground rounded-tr-md max-w-[85%]'
          : 'glass text-foreground rounded-tl-md max-w-[92%] flex-1'
      )}>
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : (
          <div className={cn(
            'prose prose-sm dark:prose-invert max-w-none break-words',
            'prose-p:my-2 prose-p:leading-relaxed',
            'prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-li:marker:text-primary/60',
            'prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold',
            'prose-h1:text-base prose-h2:text-base prose-h3:text-sm',
            'prose-strong:text-foreground prose-strong:font-semibold',
            'prose-hr:my-3 prose-hr:border-border/50',
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
