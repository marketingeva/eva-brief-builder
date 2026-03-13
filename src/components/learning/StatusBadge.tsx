import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Sparkles, Check, AlertCircle } from 'lucide-react';

export type FieldStatus = 'suggested' | 'needs_review' | 'confirmed';

interface Props {
  status: FieldStatus;
  onStatusChange?: (status: FieldStatus) => void;
  compact?: boolean;
}

const statusConfig: Record<FieldStatus, { label: string; className: string; icon: typeof Sparkles }> = {
  suggested: {
    label: 'Suggested',
    className: 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/20',
    icon: Sparkles,
  },
  needs_review: {
    label: 'Review',
    className: 'bg-warning/10 text-warning border-warning/30 hover:bg-warning/20',
    icon: AlertCircle,
  },
  confirmed: {
    label: 'Bevestigd',
    className: 'bg-success/10 text-success border-success/30 hover:bg-success/20',
    icon: Check,
  },
};

const nextStatus: Record<FieldStatus, FieldStatus> = {
  suggested: 'confirmed',
  needs_review: 'confirmed',
  confirmed: 'needs_review',
};

export default function StatusBadge({ status, onStatusChange, compact }: Props) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] gap-1 cursor-pointer transition-colors border',
        config.className,
        compact && 'px-1.5 py-0'
      )}
      onClick={e => {
        e.stopPropagation();
        onStatusChange?.(nextStatus[status]);
      }}
    >
      <Icon className="h-2.5 w-2.5" />
      {!compact && config.label}
    </Badge>
  );
}
