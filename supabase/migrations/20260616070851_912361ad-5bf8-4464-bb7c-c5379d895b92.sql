
CREATE POLICY "selfies user upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'selfies' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "selfies user read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'selfies' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())));
