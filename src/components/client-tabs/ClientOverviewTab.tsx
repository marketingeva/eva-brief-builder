import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  client: { id: string; name: string; description: string | null; care_type: string | null };
}

export default function ClientOverviewTab({ client }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Organization</CardTitle></CardHeader>
        <CardContent>
          <p className="font-medium text-foreground">{client.name}</p>
          {client.care_type && <p className="mt-1 text-sm text-muted-foreground">{client.care_type}</p>}
          {client.description && <p className="mt-2 text-sm text-muted-foreground">{client.description}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Quick stats</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Briefings: 0</p>
          <p>Learnings: 0</p>
          <p>Locations: 0</p>
        </CardContent>
      </Card>
    </div>
  );
}
