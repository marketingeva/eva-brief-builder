
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo_url TEXT,
  description TEXT,
  care_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update clients" ON public.clients FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete clients" ON public.clients FOR DELETE TO authenticated USING (true);
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Client brand profiles
CREATE TABLE public.client_brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tone_of_voice TEXT,
  words_to_use TEXT[],
  words_to_avoid TEXT[],
  employer_branding TEXT,
  why_work_here TEXT,
  visual_style_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);
ALTER TABLE public.client_brand_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view brand profiles" ON public.client_brand_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert brand profiles" ON public.client_brand_profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update brand profiles" ON public.client_brand_profiles FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_brand_profiles_updated_at BEFORE UPDATE ON public.client_brand_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Client locations
CREATE TABLE public.client_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region TEXT,
  city TEXT,
  is_commute_friendly BOOLEAN NOT NULL DEFAULT false,
  notes TEXT
);
ALTER TABLE public.client_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view locations" ON public.client_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert locations" ON public.client_locations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete locations" ON public.client_locations FOR DELETE TO authenticated USING (true);

-- Client roles
CREATE TABLE public.client_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  care_domain TEXT,
  description TEXT,
  qualifications TEXT[],
  audience_objections TEXT[],
  audience_triggers TEXT[]
);
ALTER TABLE public.client_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view roles" ON public.client_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert roles" ON public.client_roles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete roles" ON public.client_roles FOR DELETE TO authenticated USING (true);

-- Client audience insights
CREATE TABLE public.client_audience_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  segment_name TEXT NOT NULL,
  description TEXT,
  triggers TEXT[],
  objections TEXT[],
  platform_notes TEXT
);
ALTER TABLE public.client_audience_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view insights" ON public.client_audience_insights FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert insights" ON public.client_audience_insights FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete insights" ON public.client_audience_insights FOR DELETE TO authenticated USING (true);

-- Client learnings
CREATE TABLE public.client_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_date DATE,
  hook_used TEXT,
  concept TEXT,
  result TEXT,
  what_worked TEXT,
  what_failed TEXT,
  recruiter_feedback TEXT,
  client_feedback TEXT,
  audience_resonance TEXT,
  visual_notes TEXT,
  tags TEXT[],
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view learnings" ON public.client_learnings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert learnings" ON public.client_learnings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete learnings" ON public.client_learnings FOR DELETE TO authenticated USING (true);

-- Campaign requests (structure for Phase 2)
CREATE TABLE public.campaign_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  role_title TEXT,
  region TEXT,
  channel TEXT,
  objective TEXT,
  creative_type TEXT,
  priority_audience TEXT,
  campaign_focus TEXT,
  angle_preference TEXT CHECK (angle_preference IN ('new', 'proven', 'mix')),
  internal_notes TEXT,
  urgency TEXT CHECK (urgency IN ('low', 'normal', 'high', 'urgent')) DEFAULT 'normal',
  status TEXT CHECK (status IN ('draft', 'pending', 'generating', 'completed')) DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view requests" ON public.campaign_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert requests" ON public.campaign_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated users can update requests" ON public.campaign_requests FOR UPDATE TO authenticated USING (true);

-- Generated briefings (structure for Phase 2)
CREATE TABLE public.generated_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_request_id UUID NOT NULL REFERENCES public.campaign_requests(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  content JSONB NOT NULL DEFAULT '{}',
  status TEXT CHECK (status IN ('draft', 'review', 'approved', 'archived')) DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ
);
ALTER TABLE public.generated_briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view briefings" ON public.generated_briefings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert briefings" ON public.generated_briefings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update briefings" ON public.generated_briefings FOR UPDATE TO authenticated USING (true);
