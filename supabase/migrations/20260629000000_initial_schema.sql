-- Enable PostGIS for geospatial venue queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE profiles (
  id                           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name                 text NOT NULL,
  photo_url                    text,
  city                         text NOT NULL DEFAULT '',
  region                       text NOT NULL DEFAULT '',
  preferred_formats            text[] NOT NULL DEFAULT '{}',
  play_style                   text NOT NULL DEFAULT 'social',
  privacy_level                text NOT NULL DEFAULT 'private',
  internal_score               numeric(5,2) NOT NULL DEFAULT 3.0,
  verified_tier                integer,
  rating_floor                 numeric(5,2),
  reliability_score            numeric(5,2) NOT NULL DEFAULT 100,
  placement_sessions_remaining integer NOT NULL DEFAULT 3,
  session_count                integer NOT NULL DEFAULT 0,
  deleted_at                   timestamptz,
  created_at                   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- admins
-- ============================================================
CREATE TABLE admins (
  user_id    uuid PRIMARY KEY REFERENCES profiles(id),
  role       text NOT NULL DEFAULT 'admin',
  granted_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- venues
-- ============================================================
CREATE TABLE venues (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  type                  text NOT NULL,
  address               text NOT NULL,
  city                  text NOT NULL,
  region                text NOT NULL,
  location              geography(Point, 4326) NOT NULL,
  court_count           integer NOT NULL,
  surface_type          text NOT NULL,
  shuttle_type          text NOT NULL,
  drop_in_available     boolean NOT NULL DEFAULT false,
  reservation_required  boolean NOT NULL DEFAULT false,
  contact_phone         text,
  contact_website       text,
  booking_url           text,
  claimed_by_account_id uuid REFERENCES profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- venue_hours
-- ============================================================
CREATE TABLE venue_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time   time NOT NULL,
  close_time  time NOT NULL
);

-- ============================================================
-- venue_date_exceptions
-- ============================================================
CREATE TABLE venue_date_exceptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  date       date NOT NULL,
  open_time  time,
  close_time time,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, date)
);

-- ============================================================
-- venue_edit_suggestions
-- ============================================================
CREATE TABLE venue_edit_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id        uuid NOT NULL REFERENCES venues(id),
  submitted_by    uuid NOT NULL REFERENCES profiles(id),
  field_name      text NOT NULL,
  suggested_value text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- sessions
-- ============================================================
CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id        uuid NOT NULL REFERENCES profiles(id),
  venue_id            uuid REFERENCES venues(id),
  venue_name          text NOT NULL,
  type                text NOT NULL,
  format              text NOT NULL,
  visibility          text NOT NULL DEFAULT 'public',
  skill_min           numeric(4,2) NOT NULL,
  skill_max           numeric(4,2) NOT NULL,
  strict_range        boolean NOT NULL DEFAULT false,
  court_count         integer NOT NULL,
  max_players         integer NOT NULL,
  starts_at           timestamptz NOT NULL,
  duration_minutes    integer NOT NULL,
  shuttle_policy      text NOT NULL,
  shuttle_tube_price  numeric(6,2),
  notes               text,
  status              text NOT NULL DEFAULT 'upcoming',
  is_recurring        boolean NOT NULL DEFAULT false,
  recurring_cron_expr text,
  parent_session_id   uuid REFERENCES sessions(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- session_rsvps
-- ============================================================
CREATE TABLE session_rsvps (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id),
  status     text NOT NULL DEFAULT 'going',
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

-- ============================================================
-- session_rating_submissions
-- ============================================================
CREATE TABLE session_rating_submissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id),
  rater_id   uuid NOT NULL REFERENCES profiles(id),
  ratee_id   uuid NOT NULL REFERENCES profiles(id),
  vote       text NOT NULL,
  flagged    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, rater_id, ratee_id)
);

-- ============================================================
-- rating_history
-- ============================================================
CREATE TABLE rating_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id),
  session_id   uuid NOT NULL REFERENCES sessions(id),
  score_before numeric(5,2) NOT NULL,
  score_after  numeric(5,2) NOT NULL,
  delta        numeric(5,2) NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- rater_familiarity
-- ============================================================
CREATE TABLE rater_familiarity (
  rater_id      uuid NOT NULL REFERENCES profiles(id),
  ratee_id      uuid NOT NULL REFERENCES profiles(id),
  pair_count    integer NOT NULL DEFAULT 1,
  last_rated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rater_id, ratee_id)
);

-- ============================================================
-- verification_requests
-- ============================================================
CREATE TABLE verification_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id),
  requested_tier integer NOT NULL,
  evidence_urls  text[] NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'pending',
  reviewed_by    uuid REFERENCES admins(user_id),
  reviewer_notes text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);

-- ============================================================
-- indexes
-- ============================================================
CREATE INDEX ON venues USING GIST (location);
CREATE INDEX ON sessions (status, starts_at);
CREATE INDEX ON session_rsvps (session_id, status);
CREATE INDEX ON rating_history (user_id, created_at DESC);
CREATE INDEX ON rater_familiarity (rater_id, ratee_id);
CREATE INDEX ON session_rating_submissions (flagged) WHERE flagged = true;

-- ============================================================
-- trigger: create profile row when a new auth user signs up
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
