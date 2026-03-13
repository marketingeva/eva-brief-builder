import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';

const schema = z.object({
  client_id: z.string().min(1, 'Select a client'),
  role_title: z.string().min(1, 'Enter the role or vacancy'),
  region: z.string().optional(),
  channel: z.string().optional(),
  objective: z.string().optional(),
  creative_type: z.string().optional(),
  priority_audience: z.string().optional(),
  campaign_focus: z.string().optional(),
  angle_preference: z.string().optional(),
  urgency: z.string().optional(),
  internal_notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Client {
  id: string;
  name: string;
}

const channels = ['Meta (Facebook/Instagram)', 'LinkedIn', 'Google Ads', 'TikTok', 'Display', 'Programmatic', 'Other'];
const objectives = ['Sollicitaties genereren', 'Naamsbekendheid employer brand', 'Leads verzamelen', 'Event promotie', 'Retargeting eerder geïnteresseerden'];
const creativeTypes = ['Static image', 'Carousel', 'Video (kort)', 'Video (lang)', 'Story / Reel', 'Mix'];
const urgencies = ['Low', 'Normal', 'High', 'Urgent'];
const anglePrefs = ['New angles — try something fresh', 'Proven angles — use what worked before', 'Mix of both'];

export default function CampaignRequestNew() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const preselectedClient = searchParams.get('client');

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id: preselectedClient || '',
      role_title: '',
      region: '',
      channel: 'Meta (Facebook/Instagram)',
      objective: 'Sollicitaties genereren',
      creative_type: 'Static image',
      priority_audience: '',
      campaign_focus: '',
      angle_preference: 'Mix of both',
      urgency: 'Normal',
      internal_notes: '',
    },
  });

  useEffect(() => {
    supabase.from('clients').select('id, name').order('name').then(({ data }) => {
      setClients(data || []);
    });
  }, []);

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    setSubmitting(true);

    const { data, error } = await supabase
      .from('campaign_requests')
      .insert([{
        client_id: values.client_id,
        role_title: values.role_title,
        region: values.region || null,
        channel: values.channel || null,
        objective: values.objective || null,
        creative_type: values.creative_type || null,
        priority_audience: values.priority_audience || null,
        campaign_focus: values.campaign_focus || null,
        angle_preference: values.angle_preference || null,
        urgency: values.urgency || null,
        internal_notes: values.internal_notes || null,
        created_by: user.id,
        status: 'pending',
      }])
      .select('id')
      .single();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    toast({ title: 'Campaign request created', description: 'Generating briefing...' });
    navigate(`/briefings/generate/${data.id}`);
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto animate-fade-in">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" />Back
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">New Campaign Request</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fill in the campaign details. The AI will generate a structured briefing based on client knowledge.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Client & Role */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Campaign basics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="client_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Client *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="role_title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role / vacancy *</FormLabel>
                  <FormControl><Input placeholder="e.g. Verzorgende IG" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="region" render={({ field }) => (
                <FormItem>
                  <FormLabel>Region / location</FormLabel>
                  <FormControl><Input placeholder="e.g. Regio Leiden" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Campaign details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Campaign details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField control={form.control} name="channel" render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {channels.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="objective" render={({ field }) => (
                <FormItem>
                  <FormLabel>Objective</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {objectives.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="creative_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Creative type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {creativeTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="urgency" render={({ field }) => (
                <FormItem>
                  <FormLabel>Urgency</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {urgencies.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Targeting & angles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Targeting & angles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="priority_audience" render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority audience</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Ervaren verzorgenden die overwegen te switchen" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="campaign_focus" render={({ field }) => (
                <FormItem>
                  <FormLabel>Campaign focus</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What is the specific focus of this campaign? e.g. 'Highlight flexible scheduling and small teams'" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="angle_preference" render={({ field }) => (
                <FormItem>
                  <FormLabel>Angle preference</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {anglePrefs.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Internal notes</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField control={form.control} name="internal_notes" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea placeholder="Any additional context for the AI or your team..." rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Create & Generate Briefing
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
