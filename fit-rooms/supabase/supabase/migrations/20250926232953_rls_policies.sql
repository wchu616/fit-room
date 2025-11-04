-- Create optional read-only role if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon_reader') THEN
    CREATE ROLE anon_reader NOLOGIN;
  END IF;
END $$;

-- Ensure schema permissions (optional role usage)
GRANT USAGE ON SCHEMA public TO anon_reader;

-- Helper to check membership in a room
CREATE OR REPLACE FUNCTION public.is_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_members rm
    WHERE rm.room_id = p_room_id
      AND rm.user_id = auth.uid()
  );
$$;

-- Rooms
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rooms_select_members ON public.rooms;
CREATE POLICY rooms_select_members ON public.rooms
FOR SELECT USING (
  auth.uid() = owner_id
  OR public.is_room_member(id)
);

DROP POLICY IF EXISTS rooms_insert_owner ON public.rooms;
CREATE POLICY rooms_insert_owner ON public.rooms
FOR INSERT WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS rooms_update_owner ON public.rooms;
CREATE POLICY rooms_update_owner ON public.rooms
FOR UPDATE USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS rooms_delete_owner ON public.rooms;
CREATE POLICY rooms_delete_owner ON public.rooms
FOR DELETE USING (auth.uid() = owner_id);

-- Room members
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS room_members_select_room_members ON public.room_members;
CREATE POLICY room_members_select_room_members ON public.room_members
FOR SELECT USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS room_members_insert_self ON public.room_members;
CREATE POLICY room_members_insert_self ON public.room_members
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = room_id
      AND (r.owner_id = auth.uid() OR public.is_room_member(room_id))
  )
);

DROP POLICY IF EXISTS room_members_update_self ON public.room_members;
CREATE POLICY room_members_update_self ON public.room_members
FOR UPDATE USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS room_members_delete_self_or_owner ON public.room_members;
CREATE POLICY room_members_delete_self_or_owner ON public.room_members
FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = room_members.room_id
      AND r.owner_id = auth.uid()
  )
);

-- Teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teams_select_room_members ON public.teams;
CREATE POLICY teams_select_room_members ON public.teams
FOR SELECT USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS teams_insert_room_members ON public.teams;
CREATE POLICY teams_insert_room_members ON public.teams
FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND public.is_room_member(room_id)
);

DROP POLICY IF EXISTS teams_update_owner ON public.teams;
CREATE POLICY teams_update_owner ON public.teams
FOR UPDATE USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS teams_delete_owner ON public.teams;
CREATE POLICY teams_delete_owner ON public.teams
FOR DELETE USING (created_by = auth.uid());

-- Team members
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_members_select_room_members ON public.team_members;
CREATE POLICY team_members_select_room_members ON public.team_members
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = team_members.team_id
      AND public.is_room_member(t.room_id)
  )
);

DROP POLICY IF EXISTS team_members_insert_self ON public.team_members;
CREATE POLICY team_members_insert_self ON public.team_members
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = team_members.team_id
      AND public.is_room_member(t.room_id)
  )
);

DROP POLICY IF EXISTS team_members_delete_self_or_creator ON public.team_members;
CREATE POLICY team_members_delete_self_or_creator ON public.team_members
FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = team_members.team_id
      AND t.created_by = auth.uid()
  )
);

-- Checkins
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS checkins_select_room_members ON public.checkins;
CREATE POLICY checkins_select_room_members ON public.checkins
FOR SELECT USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS checkins_insert_self ON public.checkins;
CREATE POLICY checkins_insert_self ON public.checkins
FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND public.is_room_member(room_id)
);

DROP POLICY IF EXISTS checkins_update_self ON public.checkins;
CREATE POLICY checkins_update_self ON public.checkins
FOR UPDATE USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS checkins_delete_self ON public.checkins;
CREATE POLICY checkins_delete_self ON public.checkins
FOR DELETE USING (user_id = auth.uid());

-- Daily stats
ALTER TABLE public.daily_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_stats_select_room_members ON public.daily_stats;
CREATE POLICY daily_stats_select_room_members ON public.daily_stats
FOR SELECT USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS daily_stats_write_self_or_service ON public.daily_stats;
CREATE POLICY daily_stats_write_self_or_service ON public.daily_stats
FOR INSERT WITH CHECK (
  auth.role() = 'service_role'
  OR (
    user_id = auth.uid()
    AND public.is_room_member(room_id)
  )
);

-- Team scores
ALTER TABLE public.team_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_scores_select_room_members ON public.team_scores;
CREATE POLICY team_scores_select_room_members ON public.team_scores
FOR SELECT USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS team_scores_write_service_only ON public.team_scores;
CREATE POLICY team_scores_write_service_only ON public.team_scores
FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Team streaks
ALTER TABLE public.team_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_streaks_select_room_members ON public.team_streaks;
CREATE POLICY team_streaks_select_room_members ON public.team_streaks
FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM public.teams t
    WHERE t.id = team_streaks.team_id
      AND public.is_room_member(t.room_id)
  )
);

DROP POLICY IF EXISTS team_streaks_write_service_only ON public.team_streaks;
CREATE POLICY team_streaks_write_service_only ON public.team_streaks
FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Leaderboards
ALTER TABLE public.leaderboards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leaderboards_select_room_members ON public.leaderboards;
CREATE POLICY leaderboards_select_room_members ON public.leaderboards
FOR SELECT USING (public.is_room_member(room_id));

DROP POLICY IF EXISTS leaderboards_write_service_only ON public.leaderboards;
CREATE POLICY leaderboards_write_service_only ON public.leaderboards
FOR INSERT WITH CHECK (auth.role() = 'service_role');
