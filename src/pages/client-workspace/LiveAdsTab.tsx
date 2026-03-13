import { Card, CardContent } from '@/components/ui/card';
import { Radio } from 'lucide-react';

export default function LiveAdsTab() {
  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-foreground">Live Ads</h2>
        <p className="text-xs text-muted-foreground">Monitor live campagnes en prestaties</p>
      </div>

      <Card>
        <CardContent className="p-12 text-center">
          <Radio className="mx-auto mb-3 h-10 w-10 text-muted-foreground/20" />
          <p className="text-sm font-medium text-muted-foreground">Binnenkort beschikbaar</p>
          <p className="text-xs text-muted-foreground/70 mt-1 max-w-md mx-auto">
            In een toekomstige versie kun je hier live Meta-campagnes monitoren: 
            welke ads draaien, kosten per lead, en automatische waarschuwingen bij hoge CPL.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {['Live campagnes', 'CPL monitoring', 'Performance alerts', 'Rode status waarschuwingen'].map(f => (
              <span key={f} className="rounded-full border border-dashed px-3 py-1 text-[10px] text-muted-foreground">
                {f}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
