-- A player asks for their data to be deleted, from inside the game.
-- Their playtests go at once; the request is kept (without any game data) so the
-- developer can also delete the same player id from the analytics service.
create table public.deletion_requests (
  player text primary key check (player ~ '^[A-Za-z0-9_-]{1,40}$'),
  requested_at timestamptz not null default now(),
  playtests_deleted integer not null default 0,
  analytics_deleted_at timestamptz
);

comment on table public.deletion_requests is 'Players who deleted their data in the game. analytics_deleted_at: when the same id was removed from PostHog.';

alter table public.deletion_requests enable row level security;
revoke all on table public.deletion_requests from anon, authenticated;

create or replace function public.forget_player(p_player text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_player is null or p_player !~ '^[A-Za-z0-9_-]{1,40}$' then
    raise exception 'bad player id' using errcode = '22023';
  end if;
  delete from public.playtests where player = p_player;
  get diagnostics n = row_count;
  insert into public.deletion_requests as r (player, playtests_deleted)
  values (p_player, n)
  on conflict (player) do update set
    requested_at = now(),
    playtests_deleted = r.playtests_deleted + excluded.playtests_deleted,
    analytics_deleted_at = null;
  return n;
end;
$$;

revoke all on function public.forget_player(text) from public;
grant execute on function public.forget_player(text) to anon, authenticated;
