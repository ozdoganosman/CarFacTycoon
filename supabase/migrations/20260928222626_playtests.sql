-- Games that players of the public build agree to share.
-- Nobody reads or writes the table directly from the browser: the game calls
-- submit_playtest(), which checks the shape and size and keeps one copy per game.
create table public.playtests (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{1,80}$'),
  player text not null check (player ~ '^[A-Za-z0-9_-]{1,40}$'),
  auto boolean not null default false,
  note text not null default '',
  save_version integer,
  encoding text not null check (encoding in ('gzip-base64', 'json')),
  data text not null,
  summary jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  received_at timestamptz not null default now(),
  updates integer not null default 0
);

comment on table public.playtests is 'CarFacTycoon games shared by players (opt-in). data = the whole save, gzip + base64 unless encoding = json.';

alter table public.playtests enable row level security;
revoke all on table public.playtests from anon, authenticated;

create index playtests_received_at on public.playtests (received_at desc);
create index playtests_player on public.playtests (player);

create or replace function public.submit_playtest(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data text := p->>'data';
  v_note text := left(coalesce(p->>'note', ''), 4000);
  v_summary jsonb := coalesce(p->'summary', '{}'::jsonb);
begin
  if v_data is null or length(v_data) > 3000000 then
    raise exception 'playtest data missing or too large' using errcode = '22023';
  end if;
  if length(v_summary::text) > 100000 then
    raise exception 'summary too large' using errcode = '22023';
  end if;
  insert into public.playtests as t (id, player, auto, note, save_version, encoding, data, summary, sent_at)
  values (
    p->>'id',
    p->>'player',
    coalesce((p->>'auto')::boolean, false),
    v_note,
    (p->>'saveVersion')::integer,
    p->>'encoding',
    v_data,
    v_summary,
    coalesce((p->>'sentAt')::timestamptz, now())
  )
  on conflict (id) do update set
    auto = excluded.auto,
    note = excluded.note,
    save_version = excluded.save_version,
    encoding = excluded.encoding,
    data = excluded.data,
    summary = excluded.summary,
    sent_at = excluded.sent_at,
    received_at = now(),
    updates = t.updates + 1
  -- A game's copy is replaced only by the player who sent it.
  where t.player = excluded.player;
end;
$$;

revoke all on function public.submit_playtest(jsonb) from public;
grant execute on function public.submit_playtest(jsonb) to anon, authenticated;
