-- handle_new_user previously only read raw_user_meta_data->>'display_name',
-- relying on the client to PATCH city/first_name/last_name onto the profile
-- right after signUp() using the freshly-issued session's access token. That
-- breaks once email confirmation is required (prod's Supabase dashboard
-- setting, now mirrored locally via [auth.email] enable_confirmations) —
-- signUp() returns no session until the user clicks the emailed link, so
-- there's no token to PATCH with and those fields were silently lost. Folding
-- them into the same trigger that already fires unconditionally on
-- auth.users insert (regardless of confirmation status) fixes this at the
-- source instead of adding a retry path — see technical-notes.md "Auth".
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, city, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'city', ''),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  RETURN NEW;
END;
$$;
