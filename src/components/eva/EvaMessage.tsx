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
    <div className={cn('flex gap-3 animate-fade-in', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        isUser ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary'
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
      </div>
      <div className={cn(
        'rounded-2xl px-4 py-2.5 max-w-[78%] text-sm leading-relaxed',
        isUser
          ? 'bg-primary text-primary-foreground rounded-tr-sm'
          : 'glass text-foreground rounded-tl-sm'
      )}>
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-headings:mt-3 prose-headings:mb-1 prose-pre:my-2 prose-pre:bg-muted prose-pre:text-foreground">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '…'}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
