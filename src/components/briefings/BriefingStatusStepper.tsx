import { Check, Pencil, Eye, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  status: string;
}

const steps = [
  { key: 'draft', label: 'Concept', icon: Pencil },
  { key: 'in_review', label: 'In Review', icon: Eye },
  { key: 'approved', label: 'Goedgekeurd', icon: CheckCircle2 },
];

const statusOrder: Record<string, number> = {
  draft: 0,
  generated: 0,
  in_review: 1,
  approved: 2,
};

export default function BriefingStatusStepper({ status }: Props) {
  const currentIdx = statusOrder[status] ?? 0;

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const Icon = step.icon;

        return (
          <div key={step.key} className="flex items-center">
            {idx > 0 && (
              <div className={cn(
                'w-8 h-0.5 mx-1',
                isCompleted ? 'bg-primary' : 'bg-border'
              )} />
            )}
            <div className="flex items-center gap-1.5">
              <div className={cn(
                'flex items-center justify-center w-6 h-6 rounded-full text-[10px] transition-colors',
                isCompleted && 'bg-primary text-primary-foreground',
                isCurrent && 'bg-primary/15 text-primary ring-1 ring-primary/30',
                !isCompleted && !isCurrent && 'bg-muted text-muted-foreground',
              )}>
                {isCompleted ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
              </div>
              <span className={cn(
                'text-[11px] font-medium',
                isCurrent ? 'text-foreground' : 'text-muted-foreground',
              )}>
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
