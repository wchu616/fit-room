create or replace function public.enforce_team_member_limit()
returns trigger
language plpgsql
security definer
as $$
begin
  if (select count(1) from public.team_members where team_id = new.team_id) >= 3 then
    raise exception '队伍人数已满，最多 3 人';
  end if;

  return new;
end;
$$;

drop trigger if exists team_members_enforce_limit on public.team_members;
create trigger team_members_enforce_limit
  before insert on public.team_members
  for each row
  execute function public.enforce_team_member_limit();
