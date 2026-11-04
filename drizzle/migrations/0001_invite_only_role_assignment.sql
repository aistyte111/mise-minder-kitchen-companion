CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'staff');
  RETURN new;
END;
$$;
COMMENT ON FUNCTION public.handle_new_user() IS 'New accounts start view-only. Existing managers grant editing access through authorized server actions; no self-selected roles or first-user promotion.';