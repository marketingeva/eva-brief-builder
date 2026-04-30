CREATE TABLE public.eva_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.eva_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Eva conversation"
  ON public.eva_conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Eva conversation"
  ON public.eva_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Eva conversation"
  ON public.eva_conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Eva conversation"
  ON public.eva_conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_eva_conversations_updated_at
  BEFORE UPDATE ON public.eva_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();