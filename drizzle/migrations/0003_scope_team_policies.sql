CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','staff')) $$;

DROP POLICY "Team reads notes" ON public.notes;
CREATE POLICY "Team reads notes" ON public.notes FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
DROP POLICY "Team reads guest allergies" ON public.guest_allergies;
CREATE POLICY "Team reads guest allergies" ON public.guest_allergies FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
DROP POLICY "Team reads recipes" ON public.recipes;
CREATE POLICY "Team reads recipes" ON public.recipes FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
DROP POLICY "Team reads schedule" ON public.schedule_items;
CREATE POLICY "Team reads schedule" ON public.schedule_items FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
DROP POLICY "Team can view profiles" ON public.profiles;
CREATE POLICY "Team can view profiles" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_team_member(auth.uid()));

DROP POLICY "Team manages Misa projects" ON public.misa_projects;
CREATE POLICY "Team manages Misa projects" ON public.misa_projects FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
DROP POLICY "Team manages Misa tasks" ON public.misa_tasks;
CREATE POLICY "Team manages Misa tasks" ON public.misa_tasks FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
DROP POLICY "Team manages Misa sources" ON public.misa_sources;
CREATE POLICY "Team manages Misa sources" ON public.misa_sources FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid()))
  WITH CHECK (public.is_team_member(auth.uid()) AND split_part(storage_path, '/', 1) = project_id::text);

DROP POLICY "Team reads Misa files" ON storage.objects;
CREATE POLICY "Team reads Misa files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'misa-files' AND public.is_team_member(auth.uid())
    AND EXISTS (SELECT 1 FROM public.misa_projects p WHERE p.id::text = (storage.foldername(name))[1]));
DROP POLICY "Team uploads Misa files" ON storage.objects;
CREATE POLICY "Team uploads Misa files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'misa-files' AND public.is_team_member(auth.uid())
    AND EXISTS (SELECT 1 FROM public.misa_projects p WHERE p.id::text = (storage.foldername(name))[1]));
DROP POLICY "Team removes Misa files" ON storage.objects;
CREATE POLICY "Team removes Misa files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'misa-files' AND (owner_id = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
DROP POLICY "Team views recipe photos" ON storage.objects;
CREATE POLICY "Team views recipe photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recipe-photos' AND public.is_team_member(auth.uid())
    AND EXISTS (SELECT 1 FROM public.recipes r WHERE r.photo_path = name));