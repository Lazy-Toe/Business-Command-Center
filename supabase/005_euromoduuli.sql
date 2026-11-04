-- Aja kerran Supabasen SQL Editorissa ennen koodin julkaisua. Turvallista ajaa uudelleen.
-- Euromoduuli: henkilön euro-tiedot (palkka ym.), henkilön kenttien ja laskentasääntöjen määrittelyt sekä muutosloki.
-- Tiedot ovat arkaluontoisia: ne ovat vain palvelimen (service_role) luettavissa, ja jokainen muutos kirjataan lokiin tekijän kanssa.

alter table public.bcc_people add column if not exists pay jsonb not null default '{}'::jsonb;

create table if not exists public.bcc_settings (
  key text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.bcc_pay_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  by_email text not null,
  action text not null,
  target text,
  before jsonb,
  after jsonb
);

alter table public.bcc_settings enable row level security;
alter table public.bcc_pay_log enable row level security;
revoke all on public.bcc_settings, public.bcc_pay_log from anon, authenticated;
grant all on public.bcc_settings, public.bcc_pay_log to service_role;

-- Kentät, säännöt ja henkilöiden euro-tiedot yhtenä vastauksena.
create or replace function public.bcc_pay_get() returns jsonb
language sql stable set search_path = public as $fn$
  select jsonb_build_object(
    'fields', coalesce((select data from bcc_settings where key = 'pay_fields'), '[]'::jsonb),
    'rules', coalesce((select data from bcc_settings where key = 'pay_rules'), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'pay', pay) order by lower(name)) from bcc_people), '[]'::jsonb))
$fn$;

-- Tallentaa kenttien tai sääntöjen määrittelyn ja kirjaa vanhan ja uuden arvon lokiin samassa transaktiossa.
create or replace function public.bcc_pay_set_def(p_key text, p_data jsonb, p_by text) returns void
language plpgsql set search_path = public as $fn$
declare old jsonb;
begin
  if p_key not in ('pay_fields', 'pay_rules') then raise exception 'bad_key' using errcode = '22023'; end if;
  select data into old from bcc_settings where key = p_key;
  insert into bcc_settings (key, data) values (p_key, p_data)
    on conflict (key) do update set data = excluded.data, updated_at = now();
  insert into bcc_pay_log (by_email, action, target, before, after) values (coalesce(p_by, ''), p_key, null, old, p_data);
end $fn$;

-- Tallentaa henkilön euro-tiedot ja kirjaa vanhan ja uuden arvon lokiin samassa transaktiossa.
create or replace function public.bcc_pay_set_person(p_name text, p_pay jsonb, p_by text) returns void
language plpgsql set search_path = public as $fn$
declare old jsonb; nm text := bcc_clean_name(p_name);
begin
  select pay into old from bcc_people where lower(name) = lower(nm) for update;
  if not found then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  update bcc_people set pay = p_pay where lower(name) = lower(nm);
  insert into bcc_pay_log (by_email, action, target, before, after) values (coalesce(p_by, ''), 'person', nm, old, p_pay);
end $fn$;

create or replace function public.bcc_pay_log_list(p_limit int) returns jsonb
language sql stable set search_path = public as $fn$
  select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc), '[]'::jsonb)
  from (select id, at, by_email, action, target, before, after from bcc_pay_log order by id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) l
$fn$;

revoke all on function public.bcc_pay_get(), public.bcc_pay_set_def(text, jsonb, text), public.bcc_pay_set_person(text, jsonb, text), public.bcc_pay_log_list(int) from public, anon, authenticated;
grant execute on function public.bcc_pay_get(), public.bcc_pay_set_def(text, jsonb, text), public.bcc_pay_set_person(text, jsonb, text), public.bcc_pay_log_list(int) to service_role;
