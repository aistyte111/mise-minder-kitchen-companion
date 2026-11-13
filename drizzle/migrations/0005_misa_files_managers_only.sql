DROP POLICY "Team uploads Misa files" ON storage.objects;
CREATE POLICY "Managers upload Misa files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'misa-files' AND public.has_role(auth.uid(), 'admin')
    AND EXISTS (SELECT 1 FROM public.misa_projects p WHERE p.id::text = (storage.foldername(name))[1]));
DROP POLICY "Team removes Misa files" ON storage.objects;
CREATE POLICY "Managers remove Misa files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'misa-files' AND public.has_role(auth.uid(), 'admin'));