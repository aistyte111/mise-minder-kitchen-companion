ALTER TABLE public.notes ADD COLUMN kind text NOT NULL DEFAULT 'note';
ALTER TABLE public.notes ADD CONSTRAINT notes_kind_check CHECK (kind IN ('note','prep','event'));
ALTER TABLE public.misa_tasks ADD COLUMN dish text NOT NULL DEFAULT '';
ALTER TABLE public.misa_tasks ADD COLUMN allergens text[] NOT NULL DEFAULT '{}';

DROP POLICY "Team manages Misa projects" ON public.misa_projects;
CREATE POLICY "Team reads Misa projects" ON public.misa_projects FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Managers write Misa projects" ON public.misa_projects FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY "Team manages Misa tasks" ON public.misa_tasks;
CREATE POLICY "Team reads Misa tasks" ON public.misa_tasks FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Team updates Misa task status" ON public.misa_tasks FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "Managers insert Misa tasks" ON public.misa_tasks FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Managers delete Misa tasks" ON public.misa_tasks FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP POLICY "Team manages Misa sources" ON public.misa_sources;
CREATE POLICY "Team reads Misa sources" ON public.misa_sources FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "Managers write Misa sources" ON public.misa_sources FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin') AND split_part(storage_path,'/',1) = project_id::text);

CREATE FUNCTION public.misa_tasks_staff_status_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND
     (NEW.title, NEW.details, NEW.dish, NEW.allergens, NEW.project_id)
     IS DISTINCT FROM (OLD.title, OLD.details, OLD.dish, OLD.allergens, OLD.project_id) THEN
    RAISE EXCEPTION 'Only managers can edit prep tasks';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER misa_tasks_staff_status_only BEFORE UPDATE ON public.misa_tasks
  FOR EACH ROW EXECUTE FUNCTION public.misa_tasks_staff_status_only();