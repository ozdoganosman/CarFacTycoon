-- Keep playtests at most 24 months, as the privacy policy says (public/privacy.html).
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'purge-old-playtests',
  '17 3 * * *',
  $$delete from public.playtests where received_at < now() - interval '24 months'$$
);
