import { Card, CardContent } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

interface Props {
  clientId: string;
}

export default function CopySuggestionsTab({ clientId }: Props) {
  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-foreground">Copy Suggesties</h2>
        <p className="text-xs text-muted-foreground">Upload een static en laat de AI passende ad copy voorstellen</p>
      </div>

      <Card>
        <CardContent className="p-12 text-center">
          <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
          <p className="text-sm font-medium text-muted-foreground">AI Copy Analyse</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Upload eerst creatives in het Uploads tabblad, dan kan de AI hier matchende ad copy voorstellen.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">Wordt gebouwd in de volgende fase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
