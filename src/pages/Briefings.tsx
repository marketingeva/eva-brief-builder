import { Card, CardContent } from '@/components/ui/card';
import { FileText } from 'lucide-react';

export default function Briefings() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-6">Briefings</h1>
      <Card>
        <CardContent className="p-12 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No briefings yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">Briefings will appear here after Phase 2</p>
        </CardContent>
      </Card>
    </div>
  );
}
