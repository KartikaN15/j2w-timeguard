
-- Enums
CREATE TYPE public.app_role AS ENUM ('super_admin','hr_admin','account_manager','reporting_manager','employee');
CREATE TYPE public.punch_event_type AS ENUM ('punch_in','punch_out');
CREATE TYPE public.geofence_status AS ENUM ('inside_office','inside_home','outside','no_config');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles self read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- admin helper
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','hr_admin'))
$$;

-- Admin policies for profiles / user_roles
CREATE POLICY "profiles admin read" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "user_roles admin all" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- employee_config
CREATE TABLE public.employee_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  office_lat DOUBLE PRECISION,
  office_lng DOUBLE PRECISION,
  office_radius_m INTEGER NOT NULL DEFAULT 150,
  home_lat DOUBLE PRECISION,
  home_lng DOUBLE PRECISION,
  home_radius_m INTEGER NOT NULL DEFAULT 200,
  weekly_schedule JSONB NOT NULL DEFAULT '{"mon":"WFO","tue":"WFO","wed":"WFO","thu":"WFO","fri":"WFO","sat":"OFF","sun":"OFF"}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.employee_config TO authenticated;
GRANT ALL ON public.employee_config TO service_role;
ALTER TABLE public.employee_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ec self read" ON public.employee_config FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "ec admin write" ON public.employee_config FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_devices (approved)
CREATE TABLE public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  label TEXT,
  user_agent TEXT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, fingerprint)
);
GRANT SELECT ON public.user_devices TO authenticated;
GRANT ALL ON public.user_devices TO service_role;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ud self read" ON public.user_devices FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "ud admin all" ON public.user_devices FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- pending_devices
CREATE TABLE public.pending_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  user_agent TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, fingerprint)
);
GRANT SELECT, INSERT, DELETE ON public.pending_devices TO authenticated;
GRANT ALL ON public.pending_devices TO service_role;
ALTER TABLE public.pending_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pd self read" ON public.pending_devices FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "pd self insert" ON public.pending_devices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pd admin all" ON public.pending_devices FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- attendance_events: APPEND-ONLY (SELECT + INSERT only)
CREATE TABLE public.attendance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  device_fingerprint TEXT,
  event_type public.punch_event_type NOT NULL,
  ts_utc TIMESTAMPTZ NOT NULL DEFAULT now(),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  geofence_status public.geofence_status,
  ip_address TEXT,
  mock_flag BOOLEAN NOT NULL DEFAULT false,
  selfie_path TEXT,
  anomaly_flags JSONB NOT NULL DEFAULT '[]'::jsonb
);
-- Append-only: no UPDATE, no DELETE
GRANT SELECT, INSERT ON public.attendance_events TO authenticated;
GRANT SELECT, INSERT ON public.attendance_events TO service_role;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ae self read" ON public.attendance_events FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "ae self insert" ON public.attendance_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- audit_events: APPEND-ONLY
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit admin read" ON public.audit_events FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "audit self insert" ON public.audit_events FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

-- Profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    -- first user gets super_admin
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'hr_admin');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee') ON CONFLICT DO NOTHING;

  INSERT INTO public.employee_config (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
