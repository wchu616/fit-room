create extension if not exists "pgcrypto";

-- Users table
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  timezone text not null default 'America/New_York',
  display_name text,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create index if not exists users_username_idx on public.users (username);

-- Rooms table
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  owner_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists rooms_owner_idx on public.rooms (owner_id);

-- Room members
create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz default timezone('utc', now()),
  unique (room_id, user_id)
);

create index if not exists room_members_room_idx on public.room_members (room_id);
create index if not exists room_members_user_idx on public.room_members (user_id);

-- Teams table
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists teams_room_idx on public.teams (room_id);
create index if not exists teams_created_by_idx on public.teams (created_by);

-- Team members
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz default timezone('utc', now()),
  unique (team_id, user_id)
);

create index if not exists team_members_team_idx on public.team_members (team_id);
create index if not exists team_members_user_idx on public.team_members (user_id);

-- Plans
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  details jsonb,
  start_date date not null,
  end_date date,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create index if not exists plans_user_idx on public.plans (user_id);
create index if not exists plans_start_date_idx on public.plans (start_date);

-- Plan overrides
create table if not exists public.plan_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  for_date date not null,
  reason text not null check (reason in ('period','weather','other')),
  note text,
  created_at timestamptz default timezone('utc', now())
);

create index if not exists plan_overrides_user_idx on public.plan_overrides (user_id);
create index if not exists plan_overrides_plan_idx on public.plan_overrides (plan_id);

-- Checkins
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  photo_url text,
  taken_at timestamptz not null default timezone('utc', now()),
  for_date date not null,
  unique (user_id, room_id, for_date)
);

create index if not exists checkins_user_room_date_idx on public.checkins (user_id, room_id, for_date);
create index if not exists checkins_taken_at_idx on public.checkins (taken_at);

-- Daily stats
create table if not exists public.daily_stats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  stat_date date not null,
  did_checkin boolean not null,
  created_at timestamptz default timezone('utc', now()),
  unique (room_id, user_id, stat_date)
);

create index if not exists daily_stats_room_date_idx on public.daily_stats (room_id, stat_date);
create index if not exists daily_stats_team_date_idx on public.daily_stats (team_id, stat_date);

-- Team scores
create table if not exists public.team_scores (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  score_date date not null,
  points integer not null,
  reason text not null check (reason in ('all_members','streak_3plus','single_member')),
  created_at timestamptz default timezone('utc', now())
);

create index if not exists team_scores_team_date_idx on public.team_scores (team_id, score_date);
create index if not exists team_scores_room_date_idx on public.team_scores (room_id, score_date);

-- Team streaks
create table if not exists public.team_streaks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  length integer not null
);

create index if not exists team_streaks_team_idx on public.team_streaks (team_id);
create index if not exists team_streaks_length_idx on public.team_streaks (length);

-- Leaderboards
create table if not exists public.leaderboards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  snapshot_date date not null,
  ranking jsonb not null,
  created_at timestamptz default timezone('utc', now()),
  unique (room_id, snapshot_date)
);

create index if not exists leaderboards_room_date_idx on public.leaderboards (room_id, snapshot_date);

-- Updated timestamps triggers
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger users_set_updated_at
  before update on public.users
  for each row
  execute function public.set_updated_at();

create trigger plans_set_updated_at
  before update on public.plans
  for each row
  execute function public.set_updated_at();

-- Additional helpful indexes
create index if not exists plans_user_date_idx on public.plans (user_id, start_date);
create index if not exists plan_overrides_user_date_idx on public.plan_overrides (user_id, for_date);
create index if not exists checkins_room_date_idx on public.checkins (room_id, for_date);
