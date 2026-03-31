
CREATE TABLE public.agent_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  report_type TEXT,
  content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_agent_reports" ON public.agent_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_agent_reports" ON public.agent_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_delete_agent_reports" ON public.agent_reports FOR DELETE TO authenticated USING (true);

CREATE TABLE public.agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  agent_type TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_agent_conversations" ON public.agent_conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_agent_conversations" ON public.agent_conversations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_agent_conversations" ON public.agent_conversations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_agent_conversations" ON public.agent_conversations FOR DELETE TO authenticated USING (true);
