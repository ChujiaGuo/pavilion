-- As of recent Supabase CLI/platform versions, newly created tables are no
-- longer auto-exposed to Data API roles (see config.toml's
-- `auto_expose_new_tables`, which now defaults to off, matching the cloud
-- default, and is being removed entirely). Without explicit GRANTs, even
-- service_role — which lib/supabase.ts uses for all DB access — gets
-- "permission denied" against every table in this schema.
--
-- Only service_role is granted: the client only talks to Supabase Auth
-- directly (anon key); all table access goes through the server's
-- service-role client, so anon/authenticated need no public-schema grants.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;